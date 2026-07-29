"""E9 — генератор evidence-артефактов docs/e9/ (pilot contour).

Прогоняет живой flow через TestClient на реальной dev PG
(рецепт borsch_classic, сидированные кухни) и складывает JSON/текст в docs/e9/.

Запуск:  .venv/bin/python backend/scripts/e9_make_artifacts.py
Все созданные данные (binding, samples, audit rows, user) удаляются в finally.
"""
import json
import os
import sys
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

os.environ.setdefault("DATABASE_URL", "postgresql://fpc:fpc@localhost:5432/processmap")
os.environ.setdefault("FPC_DB_BACKEND", "postgres")

from fastapi.testclient import TestClient  # noqa: E402

from backend.app.main import app  # noqa: E402
from backend.app.auth import create_access_token  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "docs", "e9")
DATABASE_URL = os.environ["DATABASE_URL"]


def _write(name: str, payload) -> None:
    path = os.path.join(OUT_DIR, name)
    with open(path, "w", encoding="utf-8") as fh:
        if isinstance(payload, str):
            fh.write(payload)
        else:
            json.dump(payload, fh, ensure_ascii=False, indent=2)
    print(f"[artifact] {path}")


def _insert_user(role: str) -> str:
    import psycopg

    user_id = uuid.uuid4().hex
    email = f"e9_artifacts_{role}_{user_id[:8]}@local"
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO users (id, email, password_hash, is_active, is_admin, role, created_at, updated_at) "
                "VALUES (%s, %s, '', 1, 0, %s, 0, 0)",
                (user_id, email, role),
            )
        conn.commit()
    return user_id


def _delete_user(user_id: str) -> None:
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
        conn.commit()


def _recipe_id() -> str:
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        row = conn.execute("SELECT id FROM recipe WHERE sku_id = 'borsch_classic' LIMIT 1").fetchone()
    assert row, "seeded recipe borsch_classic not found"
    return str(row[0])


def _kitchen_ids() -> list:
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        rows = conn.execute("SELECT id FROM kitchen ORDER BY name LIMIT 3").fetchall()
    return [str(r[0]) for r in rows]


def _cleanup_binding(binding_id: str) -> None:
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM audit_log WHERE entity_type = 'sku_binding' AND entity_id = %s",
                (binding_id,),
            )
            cur.execute("DELETE FROM sku_binding WHERE id = %s", (binding_id,))
        conn.commit()


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    uid = _insert_user("analyst")
    token = create_access_token(uid)
    headers = {"Authorization": f"Bearer {token}"}
    client = TestClient(app)
    recipe_id = _recipe_id()
    kitchens = _kitchen_ids()
    binding_id = None
    bad_binding_id = None
    try:
        # 1. create draft binding
        create_req = {"recipe_id": recipe_id, "recipe_version": "1.0.0"}
        r = client.post("/api/sku-bindings", json=create_req, headers=headers)
        _write("pilot_create.json", {
            "endpoint": "POST /api/sku-bindings", "request": create_req,
            "status": r.status_code, "response": r.json(),
        })
        assert r.status_code == 201, r.text
        binding_id = r.json()["id"]

        # 2. start pilot on 2 kitchens → 422 (отдельный binding)
        r = client.post("/api/sku-bindings", json=create_req, headers=headers)
        bad_binding_id = r.json()["id"]
        two_req = {
            "pilot_kitchen_id": [kitchens[0], kitchens[1]],
            "criteria": {"min_orders": 20, "max_critical_errors": 0},
        }
        r = client.post(f"/api/sku-bindings/{bad_binding_id}/start-pilot", json=two_req, headers=headers)
        _write("pilot_on_two_kitchens_422.json", {
            "endpoint": f"POST /api/sku-bindings/{bad_binding_id}/start-pilot",
            "request": two_req, "status": r.status_code, "response": r.json(),
        })
        assert r.status_code == 422, r.text

        # 3. start pilot on 1 kitchen
        start_req = {
            "pilot_kitchen_id": kitchens[0],
            "criteria": {"min_orders": 20, "max_critical_errors": 0, "max_defect_rate_pct": 2},
        }
        r = client.post(f"/api/sku-bindings/{binding_id}/start-pilot", json=start_req, headers=headers)
        assert r.status_code == 200, r.text

        # 4. metrics to 14/20 → rollout blocked 409
        r = client.post(
            f"/api/sku-bindings/{binding_id}/metrics",
            json={"orders_count": 14, "critical_errors": 0, "defect_count": 0},
            headers=headers,
        )
        assert r.status_code == 201, r.text
        rollout_req = {"kitchen_ids": [kitchens[1]]}
        r = client.post(f"/api/sku-bindings/{binding_id}/rollout", json=rollout_req, headers=headers)
        _write("rollout_blocked_409.json", {
            "endpoint": f"POST /api/sku-bindings/{binding_id}/rollout",
            "request": rollout_req, "status": r.status_code, "response": r.json(),
            "note": "orders 14/20 → min_orders не выполнен",
        })
        assert r.status_code == 409, r.text

        # 5. metrics to 20/0 → rollout OK
        r = client.post(
            f"/api/sku-bindings/{binding_id}/metrics",
            json={"orders_count": 6, "critical_errors": 0, "defect_count": 0},
            headers=headers,
        )
        assert r.status_code == 201, r.text
        r = client.post(f"/api/sku-bindings/{binding_id}/rollout", json=rollout_req, headers=headers)
        _write("rollout_ok.json", {
            "endpoint": f"POST /api/sku-bindings/{binding_id}/rollout",
            "request": rollout_req, "status": r.status_code, "response": r.json(),
        })
        assert r.status_code == 200, r.text

        # 6. audit evidence
        import psycopg

        with psycopg.connect(DATABASE_URL) as conn:
            rows = conn.execute(
                "SELECT id, ts, actor_user_id, org_id, action, entity_type, entity_id, status, meta_json "
                "FROM audit_log WHERE entity_type = 'sku_binding' AND entity_id = %s ORDER BY ts",
                (binding_id,),
            ).fetchall()
        lines = [
            "SELECT id, ts, actor_user_id, org_id, action, entity_type, entity_id, status, meta_json",
            f"FROM audit_log WHERE entity_type = 'sku_binding' AND entity_id = '{binding_id}' ORDER BY ts;",
            "",
        ]
        for row in rows:
            lines.append(" | ".join(str(c) for c in row))
        _write("audit_rollout_select.txt", "\n".join(lines) + "\n")
        assert any(row[4] == "rollout" for row in rows), "rollout audit row missing"
    finally:
        if binding_id:
            _cleanup_binding(binding_id)
        if bad_binding_id:
            _cleanup_binding(bad_binding_id)
        _delete_user(uid)


if __name__ == "__main__":
    main()
