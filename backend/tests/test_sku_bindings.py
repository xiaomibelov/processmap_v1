"""E9 — тесты пилотного контура SKU-привязок (/api/sku-bindings).

DB-backed (real dev Postgres, паттерн _pg_env как в test_role_403.py).
Покрытие:
  * create + start pilot ровно на 1 кухне (E9.2/E9.3)
  * pilot на 2 кухнях → 422 (E9.3)
  * невалидные критерии → 422 (E9.3)
  * rollout при 14/20 → 409 с причиной «min_orders не выполнен: 14/20» (E9.5)
  * метрики до 20/0 → rollout OK, kitchen_ids расширен, версии шаблона/рецепта
    НЕ изменились, audit event rollout записан (E9.4/E9.5)
  * retire (E9.2)
  * RBAC: technologist → 403 на write
"""
import os
import sys
import uuid

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

DATABASE_URL = os.environ.get("E2_TEST_DATABASE_URL", "postgresql://fpc:fpc@localhost:5432/processmap")

from backend.app.main import app
from backend.app.auth import create_access_token


@pytest.fixture(autouse=True)
def _pg_env():
    """These tests need the real dev Postgres (миграция 007 применена)."""
    old_env = {k: os.environ.get(k) for k in ("DATABASE_URL", "FPC_DB_BACKEND")}
    os.environ["DATABASE_URL"] = DATABASE_URL
    os.environ["FPC_DB_BACKEND"] = "postgres"
    import backend.app.storage as _st
    from backend.app.db.config import get_db_runtime_config

    get_db_runtime_config.cache_clear()
    old_pool = _st._PG_POOL
    _st._PG_POOL = None
    yield
    _st._PG_POOL = old_pool
    get_db_runtime_config.cache_clear()
    for key, value in old_env.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value


def _insert_user(role: str) -> str:
    import psycopg

    user_id = uuid.uuid4().hex
    email = f"e9_binding_{role}_{user_id[:8]}@local"
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


@pytest.fixture
def analyst_token():
    uid = _insert_user("analyst")
    yield create_access_token(uid)
    _delete_user(uid)


@pytest.fixture
def technologist_token():
    uid = _insert_user("technologist")
    yield create_access_token(uid)
    _delete_user(uid)


@pytest.fixture
def client():
    return TestClient(app)


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _recipe_id() -> str:
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        row = conn.execute(
            "SELECT id FROM recipe WHERE sku_id = 'borsch_classic' LIMIT 1"
        ).fetchone()
    assert row, "seeded recipe borsch_classic not found"
    return str(row[0])


def _kitchen_ids() -> list:
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        rows = conn.execute("SELECT id FROM kitchen ORDER BY name LIMIT 3").fetchall()
    assert len(rows) >= 2, "need at least 2 seeded kitchens"
    return [str(r[0]) for r in rows]


def _version_counts(recipe_id: str) -> tuple:
    """(recipe_version count, process_template_version count) — E9.5: rollout не трогает версии."""
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        rv = conn.execute(
            "SELECT count(*) FROM recipe_version WHERE recipe_id = %s", (recipe_id,)
        ).fetchone()[0]
        ptv = conn.execute(
            "SELECT count(*) FROM process_template_version WHERE template_id = "
            "(SELECT template_id FROM recipe WHERE id = %s)",
            (recipe_id,),
        ).fetchone()[0]
    return rv, ptv


def _audit_rollout_rows(binding_id: str) -> list:
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        rows = conn.execute(
            "SELECT action, entity_type, entity_id, status FROM audit_log "
            "WHERE entity_type = 'sku_binding' AND entity_id = %s",
            (binding_id,),
        ).fetchall()
    return [list(r) for r in rows]


def _cleanup(binding_id: str) -> None:
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM audit_log WHERE entity_type = 'sku_binding' AND entity_id = %s",
                (binding_id,),
            )
            cur.execute("DELETE FROM sku_binding WHERE id = %s", (binding_id,))
        conn.commit()


def _create_binding(client, token, **overrides) -> dict:
    payload = {"recipe_id": _recipe_id(), "recipe_version": "1.0.0"}
    payload.update(overrides)
    r = client.post("/api/sku-bindings", json=payload, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


# ---------------------------------------------------------------------------
# happy path: create → pilot → metrics → rollout → retire
# ---------------------------------------------------------------------------

def test_full_pilot_contour(client, analyst_token):
    binding = _create_binding(client, analyst_token)
    binding_id = binding["id"]
    kitchens = _kitchen_ids()
    try:
        assert binding["status"] == "draft"
        assert binding["recipe_version"] == "1.0.0"

        # start pilot ровно на 1 кухне
        r = client.post(
            f"/api/sku-bindings/{binding_id}/start-pilot",
            json={
                "pilot_kitchen_id": kitchens[0],
                "criteria": {"min_orders": 20, "max_critical_errors": 0, "max_defect_rate_pct": 2},
            },
            headers=_auth(analyst_token),
        )
        assert r.status_code == 200, r.text
        binding = r.json()
        assert binding["status"] == "pilot"
        assert binding["pilot_kitchen_id"] == kitchens[0]
        assert binding["kitchen_ids"] == [kitchens[0]]
        assert binding["pilot_exit_criteria_json"]["min_orders"] == 20

        # метрики: 14/20 заказов → rollout заблокирован
        r = client.post(
            f"/api/sku-bindings/{binding_id}/metrics",
            json={"orders_count": 14, "critical_errors": 0, "defect_count": 0},
            headers=_auth(analyst_token),
        )
        assert r.status_code == 201, r.text

        versions_before = _version_counts(binding["recipe_id"])

        r = client.post(
            f"/api/sku-bindings/{binding_id}/rollout",
            json={"kitchen_ids": [kitchens[1]]},
            headers=_auth(analyst_token),
        )
        assert r.status_code == 409, r.text
        detail = r.json()["detail"]
        assert detail["error"] == "pilot_criteria_not_met"
        assert "min_orders не выполнен: 14/20" in detail["unmet"]

        # досыпаем метрики до 20/0
        r = client.post(
            f"/api/sku-bindings/{binding_id}/metrics",
            json={"orders_count": 6, "critical_errors": 0, "defect_count": 0},
            headers=_auth(analyst_token),
        )
        assert r.status_code == 201, r.text

        # прогресс: все критерии выполнены
        r = client.get(f"/api/sku-bindings/{binding_id}/pilot-metrics", headers=_auth(analyst_token))
        assert r.status_code == 200, r.text
        metrics = r.json()
        assert metrics["totals"]["orders"] == 20
        assert metrics["all_met"] is True
        assert metrics["unmet"] == []
        assert len(metrics["samples"]) == 2

        # rollout OK: kitchen_ids расширен, версии не изменились, audit записан
        r = client.post(
            f"/api/sku-bindings/{binding_id}/rollout",
            json={"kitchen_ids": [kitchens[1]]},
            headers=_auth(analyst_token),
        )
        assert r.status_code == 200, r.text
        rolled = r.json()
        assert rolled["status"] == "active"
        assert set(rolled["kitchen_ids"]) == {kitchens[0], kitchens[1]}
        assert _version_counts(binding["recipe_id"]) == versions_before

        audit_rows = _audit_rollout_rows(binding_id)
        assert ["rollout", "sku_binding", binding_id, "ok"] in audit_rows

        # retire
        r = client.post(f"/api/sku-bindings/{binding_id}/retire", headers=_auth(analyst_token))
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "retired"
        assert r.json()["valid_to"]

        # повторный retire → 409
        r = client.post(f"/api/sku-bindings/{binding_id}/retire", headers=_auth(analyst_token))
        assert r.status_code == 409, r.text

        # list показывает статусы
        r = client.get("/api/sku-bindings?status=retired", headers=_auth(analyst_token))
        assert r.status_code == 200, r.text
        assert any(b["id"] == binding_id for b in r.json())
    finally:
        _cleanup(binding_id)


# ---------------------------------------------------------------------------
# E9.3 — валидация
# ---------------------------------------------------------------------------

def test_start_pilot_two_kitchens_422(client, analyst_token):
    binding = _create_binding(client, analyst_token)
    kitchens = _kitchen_ids()
    try:
        r = client.post(
            f"/api/sku-bindings/{binding['id']}/start-pilot",
            json={
                "pilot_kitchen_id": [kitchens[0], kitchens[1]],
                "criteria": {"min_orders": 20},
            },
            headers=_auth(analyst_token),
        )
        assert r.status_code == 422, r.text
        assert r.json()["detail"]["error"] == "pilot_requires_exactly_one_kitchen"
    finally:
        _cleanup(binding["id"])


def test_start_pilot_invalid_criteria_422(client, analyst_token):
    binding = _create_binding(client, analyst_token)
    kitchens = _kitchen_ids()
    try:
        # пустые критерии
        r = client.post(
            f"/api/sku-bindings/{binding['id']}/start-pilot",
            json={"pilot_kitchen_id": kitchens[0], "criteria": {}},
            headers=_auth(analyst_token),
        )
        assert r.status_code == 422, r.text
        # отрицательное значение
        r = client.post(
            f"/api/sku-bindings/{binding['id']}/start-pilot",
            json={"pilot_kitchen_id": kitchens[0], "criteria": {"min_orders": -1}},
            headers=_auth(analyst_token),
        )
        assert r.status_code == 422, r.text
        # неизвестный ключ
        r = client.post(
            f"/api/sku-bindings/{binding['id']}/start-pilot",
            json={"pilot_kitchen_id": kitchens[0], "criteria": {"max_errors": 1}},
            headers=_auth(analyst_token),
        )
        assert r.status_code == 422, r.text
    finally:
        _cleanup(binding["id"])


def test_start_pilot_on_non_draft_409(client, analyst_token):
    binding = _create_binding(client, analyst_token)
    kitchens = _kitchen_ids()
    try:
        payload = {"pilot_kitchen_id": kitchens[0], "criteria": {"min_orders": 5}}
        r = client.post(f"/api/sku-bindings/{binding['id']}/start-pilot", json=payload, headers=_auth(analyst_token))
        assert r.status_code == 200, r.text
        r = client.post(f"/api/sku-bindings/{binding['id']}/start-pilot", json=payload, headers=_auth(analyst_token))
        assert r.status_code == 409, r.text
    finally:
        _cleanup(binding["id"])


# ---------------------------------------------------------------------------
# RBAC
# ---------------------------------------------------------------------------

def test_technologist_can_write_bindings(client, technologist_token, analyst_token):
    """U5: technologist допущен к записям пилотного контура (воркфлоу)."""
    r = client.post(
        "/api/sku-bindings",
        json={"recipe_id": _recipe_id()},
        headers=_auth(technologist_token),
    )
    assert r.status_code == 201, r.text

    # чтение доступно любой авторизованной роли
    binding = _create_binding(client, analyst_token)
    try:
        r = client.get("/api/sku-bindings", headers=_auth(technologist_token))
        assert r.status_code == 200, r.text
        r = client.get(f"/api/sku-bindings/{binding['id']}/pilot-metrics", headers=_auth(technologist_token))
        assert r.status_code == 200, r.text
        # и метрики пилота technologist писать может (воркфлоу); 409 — статус-гейт, не роль
        binding2 = _create_binding(client, analyst_token)
        r = client.post(
            f"/api/sku-bindings/{binding2['id']}/start-pilot",
            json={"pilot_kitchen_id": _kitchen_ids()[0], "criteria": {"min_orders": 1}},
            headers=_auth(technologist_token),
        )
        assert r.status_code == 200, r.text
        r = client.post(
            f"/api/sku-bindings/{binding2['id']}/metrics",
            json={"orders_count": 1},
            headers=_auth(technologist_token),
        )
        assert r.status_code == 201, r.text
        _cleanup(binding2["id"])
    finally:
        _cleanup(binding["id"])


def test_unauthenticated_401(client):
    r = client.get("/api/sku-bindings")
    assert r.status_code == 401, r.text
