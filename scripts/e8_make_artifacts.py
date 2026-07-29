#!/usr/bin/env python3
"""E8 — артефакты аудит-лога: реальные операции на dev-БД через API.

Сценарий (по брифу E8): создать рецепт с heat_time_sec=90 → publish v1.0.0 →
изменить heat_time_sec 90→100 → publish v1.0.1 → собрать:
  docs/e8/recipes_diff.json      — GET /api/recipes/{id}/diff
  docs/e8/audit_log_api.json     — GET /api/audit-log?entity_type=recipe&entity_id=...
  docs/e8/audit_log_select.txt   — SELECT по audit_log
Запуск: .venv/bin/python scripts/e8_make_artifacts.py
"""
from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

import psycopg
import requests

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.app.auth import create_access_token  # noqa: E402

BASE = "http://127.0.0.1:18011"
DB_URL = "postgresql://fpc:fpc@localhost:5432/processmap"
TEMPLATE_ID = "4b5b0f75-8bc2-4f5a-8346-5212687cc0d5"  # Супы РТК v1 (E7), published 1.0.1
OUT = ROOT / "docs" / "e8"
OUT.mkdir(parents=True, exist_ok=True)

PARAMS_V1 = {"heat_time_sec": 90, "heating_power": "medium", "target_temp_c": 75}
PARAMS_V2 = {**PARAMS_V1, "heat_time_sec": 100}


def main() -> None:
    # временный analyst (как в e7_screenshots.mjs)
    uid = uuid.uuid4().hex
    email = f"e8_art_{uid[:6]}@local"
    con = psycopg.connect(DB_URL)
    con.execute(
        "INSERT INTO users (id, email, password_hash, is_active, is_admin, role,"
        " created_at, updated_at) VALUES (%s, %s, '', 1, 0, 'analyst', 0, 0)",
        (uid, email),
    )
    con.commit()
    token = create_access_token(uid)
    H = {"Authorization": f"Bearer {token}"}

    try:
        # 1. создать рецепт (draft) с heat_time_sec=90
        r = requests.post(
            f"{BASE}/api/recipes",
            json={
                "sku_id": "e8_audit_soup",
                "template_id": TEMPLATE_ID,
                "template_version": "1.0.1",
                "parameters_json": PARAMS_V1,
            },
            headers=H,
            timeout=15,
        )
        assert r.status_code == 201, r.text
        recipe_id = r.json()["id"]
        print("[e8] recipe created:", recipe_id)

        # 2. publish v1.0.0
        r = requests.post(f"{BASE}/api/recipes/{recipe_id}/publish", headers=H, timeout=15)
        assert r.status_code == 200, r.text
        print("[e8] published v", r.json()["version"]["version"])

        # 3. изменить heat_time_sec 90 → 100.
        # NB: published-рецепт не редактируется через API (PUT → 409, правило E5/E7).
        # Как и в backend/tests/test_audit_log_e8.py, правку параметра выполняем
        # прямым UPDATE (имитация служебной корректировки) — это зафиксировано
        # в заголовке audit_log_select.txt.
        r = requests.put(
            f"{BASE}/api/recipes/{recipe_id}",
            json={"parameters_json": PARAMS_V2},
            headers=H,
            timeout=15,
        )
        assert r.status_code == 409, f"ожидали 409 на PUT published, got {r.status_code}: {r.text}"
        con.execute(
            "UPDATE recipe SET parameters_json = %s WHERE id = %s",
            (json.dumps(PARAMS_V2), recipe_id),
        )
        con.commit()
        print("[e8] PUT published -> 409 (ожидаемо); heat_time_sec 90 -> 100 через служебный UPDATE")

        # 4. publish v1.0.1
        r = requests.post(f"{BASE}/api/recipes/{recipe_id}/publish", headers=H, timeout=15)
        assert r.status_code == 200, r.text
        print("[e8] published v", r.json()["version"]["version"])

        # 5. diff v1.0.0 → v1.0.1
        r = requests.get(
            f"{BASE}/api/recipes/{recipe_id}/diff?from=1.0.0&to=1.0.1",
            headers=H,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        diff = r.json()
        (OUT / "recipes_diff.json").write_text(
            json.dumps(diff, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print("[e8] recipes_diff.json:", diff.get("lines"))

        # 6. GET /api/audit-log (фильтр по рецепту)
        r = requests.get(
            f"{BASE}/api/audit-log?entity_type=recipe&entity_id={recipe_id}",
            headers=H,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        api_payload = r.json()
        (OUT / "audit_log_api.json").write_text(
            json.dumps(api_payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        items = api_payload.get("items", api_payload if isinstance(api_payload, list) else [])
        print("[e8] audit_log_api.json:", len(items), "events")

        # 7. SELECT по audit_log
        cur = con.execute(
            "SELECT id, ts, actor_user_id, org_id, action, entity_type, entity_id,"
            " status, meta_json FROM audit_log WHERE entity_id = %s ORDER BY ts, id",
            (recipe_id,),
        )
        col_names = [d.name for d in cur.description]
        rows = [dict(zip(col_names, row)) for row in cur.fetchall()]
        with open(OUT / "audit_log_select.txt", "w", encoding="utf-8") as f:
            f.write(
                "-- SELECT id, ts, actor_user_id, org_id, action, entity_type, entity_id,\n"
                "--        status, meta_json FROM audit_log\n"
                f"-- WHERE entity_id = '{recipe_id}' ORDER BY ts, id;\n"
                f"-- actor: {email} (id={uid}); сценарий: create → publish v1.0.0 →\n"
                "-- PUT published → 409 (правило E5/E7), параметр изменён служебным\n"
                "-- UPDATE (как в test_audit_log_e8.py) 90→100 → publish v1.0.1\n\n"
            )
            for row in rows:
                f.write(json.dumps(dict(row), ensure_ascii=False, default=str) + "\n")
        print("[e8] audit_log_select.txt:", len(rows), "rows")

        # сохранить recipe_id для скриншот-скрипта
        (OUT / "artifact_context.json").write_text(
            json.dumps({"recipe_id": recipe_id, "actor_email": email, "actor_id": uid}),
            encoding="utf-8",
        )
        print("[e8] OK")
    finally:
        # пользователя НЕ удаляем: он нужен как читаемый автор в UI-скриншотах
        # истории (E8.3). Дев-база, пользователь вида e8_art_*@local.
        con.close()


if __name__ == "__main__":
    main()
