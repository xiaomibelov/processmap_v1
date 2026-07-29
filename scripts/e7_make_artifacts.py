#!/usr/bin/env python3
"""E7 — генерация артефактов docs/e7 против живого backend (scratch :18091).

Сценарии: publish супового шаблона (bump major → 1.0.0, затем patch → 1.0.1),
dry-run error → 422, publish с warning pre-check, versions list, audit SELECT.
"""
import json
import os
import sys
import uuid

import psycopg
import requests

BASE = os.environ.get("E7_BASE", "http://127.0.0.1:18091")
DB_URL = os.environ.get("DATABASE_URL", "postgresql://fpc:fpc@localhost:5432/processmap")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "e7")
FIXTURE = os.path.join(ROOT, "backend", "tests", "fixtures", "tobe_razogrev_supa_rtk_v03.bpmn")

sys.path.insert(0, ROOT)
from backend.app.auth import create_access_token  # noqa: E402

os.makedirs(OUT, exist_ok=True)


def dump(name: str, payload) -> None:
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8") as fh:
        if isinstance(payload, str):
            fh.write(payload)
        else:
            json.dump(payload, fh, ensure_ascii=False, indent=2)
    print(f"[artifact] {name}")


def main() -> None:
    # временный analyst для токена
    user_id = uuid.uuid4().hex
    with psycopg.connect(DB_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO users (id, email, password_hash, is_active, is_admin, role, created_at, updated_at) "
                "VALUES (%s, %s, '', 1, 0, 'analyst', 0, 0)",
                (user_id, f"e7_artifacts_{user_id[:8]}@local"),
            )
        conn.commit()
    auth = {"Authorization": f"Bearer {create_access_token(user_id)}"}
    created_templates = []
    created_kitchens = []
    created_recipes = []
    try:
        # --- soup template через import-bpmn → draft → publish major 1.0.0 ---
        xml_text = open(FIXTURE, encoding="utf-8").read()
        r = requests.post(f"{BASE}/api/process-templates/import-bpmn", data=xml_text.encode("utf-8"),
                          headers={**auth, "Content-Type": "text/xml"}, timeout=60)
        r.raise_for_status()
        ui_model = r.json()["ui_model"]

        r = requests.post(f"{BASE}/api/process-templates", json={
            "name": "Супы РТК v1 (E7)", "version": "0.1.0", "status": "draft",
            "ui_model": ui_model, "created_by": "e7-artifacts",
        }, headers=auth, timeout=60)
        r.raise_for_status()
        soup = r.json()
        created_templates.append(soup["id"])

        r = requests.post(f"{BASE}/api/process-templates/{soup['id']}/publish",
                          json={"bump": "major"}, headers=auth, timeout=60)
        assert r.status_code == 200, r.text
        publish_major = r.json()
        assert publish_major["version"] == "1.0.0", publish_major

        r = requests.get(f"{BASE}/api/process-templates/{soup['id']}/versions/1.0.0/bpmn",
                         headers=auth, timeout=60)
        r.raise_for_status()
        dump("soups_v1.0.0.bpmn", r.text)

        # второй publish (patch) → 1.0.1, 1.0.0 уходит в retired
        r = requests.post(f"{BASE}/api/process-templates/{soup['id']}/new-draft", headers=auth, timeout=60)
        r.raise_for_status()
        r = requests.post(f"{BASE}/api/process-templates/{soup['id']}/publish",
                          json={"bump": "patch"}, headers=auth, timeout=60)
        assert r.status_code == 200, r.text
        assert r.json()["version"] == "1.0.1", r.text

        r = requests.get(f"{BASE}/api/process-templates/{soup['id']}/versions", headers=auth, timeout=60)
        r.raise_for_status()
        versions_slim = [
            {k: v.get(k) for k in ("id", "template_id", "version", "status", "created_by", "created_at")}
            for v in r.json()
        ]
        dump("versions_list.json", versions_slim)

        # --- dry-run error → 422 ------------------------------------------------
        bad_model = json.loads(json.dumps(ui_model))
        task_idx = next(i for i, n in enumerate(bad_model["nodes"]) if n.get("operation_code"))
        bad_model["nodes"][task_idx]["operation_code"] = "nonexistent_operation"
        r = requests.post(f"{BASE}/api/process-templates", json={
            "name": "E7 broken template", "version": "0.1.0", "status": "draft",
            "ui_model": bad_model, "created_by": "e7-artifacts",
        }, headers=auth, timeout=60)
        r.raise_for_status()
        bad_tpl = r.json()
        created_templates.append(bad_tpl["id"])
        r = requests.post(f"{BASE}/api/process-templates/{bad_tpl['id']}/publish",
                          json={}, headers=auth, timeout=60)
        assert r.status_code == 422, r.text
        dump("publish_dryrun_error_422.json", r.json())

        # --- publish with warning pre-check --------------------------------------
        r = requests.post(f"{BASE}/api/kitchens", json={
            "name": f"E7 пустая кухня {uuid.uuid4().hex[:6]}", "location": "test",
        }, headers=auth, timeout=60)
        r.raise_for_status()
        kitchen = r.json()
        created_kitchens.append(kitchen["id"])

        measure_model = {
            "process_entities": {"containers": {"container_1": {"type_id": "food_container"}},
                                 "equipment": {}, "zones": {}},
            "recipe_context": {},
            "nodes": [
                {"id": "Start_1", "bpmn_type": "startEvent", "name": "Старт", "x": 100, "y": 100},
                {"id": "Task_measure", "bpmn_type": "task", "name": "Замер температуры",
                 "operation_code": "measure_temperature",
                 "params": {"container_ref": "container_1", "target_temp_c": "75"},
                 "outputs": {"temperature_measured": "temperature_measured"},
                 "recipe_params": [], "x": 260, "y": 90, "width": 140, "height": 70},
                {"id": "End_1", "bpmn_type": "endEvent", "name": "Финиш", "x": 460, "y": 100},
            ],
            "flows": [
                {"id": "Flow_1", "source_ref": "Start_1", "target_ref": "Task_measure"},
                {"id": "Flow_2", "source_ref": "Task_measure", "target_ref": "End_1"},
            ],
        }
        r = requests.post(f"{BASE}/api/process-templates", json={
            "name": "E7 warning template", "version": "0.1.0", "status": "draft",
            "ui_model": measure_model, "created_by": "e7-artifacts",
        }, headers=auth, timeout=60)
        r.raise_for_status()
        warn_tpl = r.json()
        created_templates.append(warn_tpl["id"])
        r = requests.post(f"{BASE}/api/process-templates/{warn_tpl['id']}/publish",
                          json={"target_kitchen_ids": [kitchen["id"]], "mode": "warning"},
                          headers=auth, timeout=60)
        assert r.status_code == 200, r.text
        assert r.json()["precheck"]["summary"]["warning"] >= 1, r.text
        dump("publish_with_warning.json", r.json())

        # --- audit SELECT ----------------------------------------------------------
        ids = list(created_templates)
        with psycopg.connect(DB_URL) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, ts, actor_user_id, org_id, action, entity_type, entity_id, status, meta_json "
                    "FROM audit_log WHERE action = 'publish' AND entity_id = ANY(%s) ORDER BY ts",
                    (ids,),
                )
                rows = cur.fetchall()
                cols = [d.name for d in cur.description]
        lines = ["\t".join(cols)]
        for row in rows:
            lines.append("\t".join(str(v) for v in row))
        dump("audit_publish_select.txt", "\n".join(lines) + "\n")
        print(json.dumps({
            "soup_template_id": soup["id"],
            "warn_template_id": warn_tpl["id"],
            "bad_template_id": bad_tpl["id"],
            "kitchen_id": kitchen["id"],
            "audit_rows": len(rows),
        }))
    finally:
        with psycopg.connect(DB_URL) as conn:
            with conn.cursor() as cur:
                for rid in created_recipes:
                    cur.execute("DELETE FROM recipe WHERE id = %s", (rid,))
                for kid in created_kitchens:
                    cur.execute("DELETE FROM kitchen WHERE id = %s", (kid,))
                # soup-шаблон оставляем в dev-БД (UI-скриншоты + демо);
                # broken/warning шаблоны удаляем
                for tid in created_templates:
                    if tid != soup["id"]:
                        cur.execute("DELETE FROM process_template WHERE id = %s", (tid,))
                cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
            conn.commit()


if __name__ == "__main__":
    main()
