"""E7.2/E7.4/E7.6 — publish flow шаблона против реального dev-Postgres.

Сценарии: happy path (patch автоинкремент), dry-run errors → 422,
strict pre-check → 422, warning pre-check → publish с warnings в артефакте,
PUT published → 409, new-draft → bump patch, versions list (draft/published/
retired), BPMN download, audit_log записи.
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
    email = f"e7_{role}_{user_id[:8]}@local"
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
def client():
    return TestClient(app)


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _valid_ui_model():
    """ui_model, проходящий dry-run (каталогные operation_code + reachable)."""
    return {
        "process_entities": {
            "containers": {"container_1": {"type_id": "food_container"}},
            "equipment": {},
            "zones": {"zone_1": {"type_id": "work_zone"}},
        },
        "recipe_context": {},
        "nodes": [
            {"id": "Start_1", "bpmn_type": "startEvent", "name": "Старт", "x": 100, "y": 100},
            {
                "id": "Task_move",
                "bpmn_type": "task",
                "name": "Перенести",
                "operation_code": "move",
                "params": {"object_ref": "container_1", "target_ref": "zone_1"},
                "outputs": {"move_completed": "move_completed"},
                "recipe_params": [],
                "x": 260,
                "y": 90,
                "width": 140,
                "height": 70,
            },
            {"id": "End_1", "bpmn_type": "endEvent", "name": "Финиш", "x": 460, "y": 100},
        ],
        "flows": [
            {"id": "Flow_1", "source_ref": "Start_1", "target_ref": "Task_move"},
            {"id": "Flow_2", "source_ref": "Task_move", "target_ref": "End_1"},
        ],
    }


def _invalid_ui_model():
    model = _valid_ui_model()
    model["nodes"][1]["operation_code"] = "nonexistent_op"
    return model


def _measure_ui_model():
    """Шаблон с measure_temperature (требует temperature_sensor на кухне)."""
    return {
        "process_entities": {
            "containers": {"container_1": {"type_id": "food_container"}},
            "equipment": {},
            "zones": {},
        },
        "recipe_context": {},
        "nodes": [
            {"id": "Start_1", "bpmn_type": "startEvent", "name": "Старт", "x": 100, "y": 100},
            {
                "id": "Task_measure",
                "bpmn_type": "task",
                "name": "Замер температуры",
                "operation_code": "measure_temperature",
                "params": {"container_ref": "container_1", "target_temp_c": "75"},
                "outputs": {"temperature_measured": "temperature_measured"},
                "recipe_params": [],
                "x": 260,
                "y": 90,
                "width": 140,
                "height": 70,
            },
            {"id": "End_1", "bpmn_type": "endEvent", "name": "Финиш", "x": 460, "y": 100},
        ],
        "flows": [
            {"id": "Flow_1", "source_ref": "Start_1", "target_ref": "Task_measure"},
            {"id": "Flow_2", "source_ref": "Task_measure", "target_ref": "End_1"},
        ],
    }


@pytest.fixture
def template_factory(client, analyst_token):
    created = []

    def _make(ui_model=None, version="0.1.0"):
        payload = {
            "name": f"e7_template_{uuid.uuid4().hex[:8]}",
            "version": version,
            "status": "draft",
            "ui_model": ui_model or _valid_ui_model(),
            "created_by": "",
        }
        r = client.post("/api/process-templates", json=payload, headers=_auth(analyst_token))
        assert r.status_code in (200, 201), r.text
        tpl = r.json()
        created.append(tpl["id"])
        return tpl

    yield _make
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            for tid in created:
                cur.execute("DELETE FROM process_template WHERE id = %s", (tid,))
        conn.commit()


@pytest.fixture
def empty_kitchen(client, analyst_token):
    """Кухня без оборудования (precheck даст warning/blocked)."""
    r = client.post(
        "/api/kitchens",
        json={"name": f"e7_empty_kitchen_{uuid.uuid4().hex[:8]}", "location": "test"},
        headers=_auth(analyst_token),
    )
    assert r.status_code in (200, 201), r.text
    kitchen = r.json()
    yield kitchen
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM kitchen WHERE id = %s", (kitchen["id"],))
        conn.commit()


def _audit_rows(entity_id: str):
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT action, entity_type, entity_id, status, meta_json FROM audit_log "
                "WHERE entity_id = %s AND action = 'publish' ORDER BY ts",
                (entity_id,),
            )
            return cur.fetchall()


def test_publish_happy_path_patch_autoincrement(client, analyst_token, template_factory):
    tpl = template_factory(version="0.1.0")

    r = client.post(f"/api/process-templates/{tpl['id']}/publish", json={}, headers=_auth(analyst_token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "published"
    assert body["version"] == "0.1.0"
    assert body["dry_run"]["summary"]["errors"] == 0

    # шаблон перешёл в published, версия проставлена
    r = client.get(f"/api/process-templates/{tpl['id']}", headers=_auth(analyst_token))
    assert r.json()["status"] == "published"
    assert r.json()["version"] == "0.1.0"
    assert r.json()["published_at"]

    # повторный publish без new-draft → 409
    r = client.post(f"/api/process-templates/{tpl['id']}/publish", json={}, headers=_auth(analyst_token))
    assert r.status_code == 409, r.text

    # PUT published → 409 (E7.4)
    r = client.put(
        f"/api/process-templates/{tpl['id']}",
        json={"name": "rename attempt"},
        headers=_auth(analyst_token),
    )
    assert r.status_code == 409, r.text

    # new-draft → draft с next patch candidate
    r = client.post(f"/api/process-templates/{tpl['id']}/new-draft", headers=_auth(analyst_token))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "draft"
    assert r.json()["version"] == "0.1.1"

    # второй publish → patch bump 0.1.1
    r = client.post(f"/api/process-templates/{tpl['id']}/publish", json={}, headers=_auth(analyst_token))
    assert r.status_code == 200, r.text
    assert r.json()["version"] == "0.1.1"

    # versions list: первая версия retired, вторая published
    r = client.get(f"/api/process-templates/{tpl['id']}/versions", headers=_auth(analyst_token))
    assert r.status_code == 200, r.text
    versions = {v["version"]: v["status"] for v in r.json()}
    assert versions == {"0.1.0": "retired", "0.1.1": "published"}

    # BPMN download опубликованной версии
    r = client.get(
        f"/api/process-templates/{tpl['id']}/versions/0.1.0/bpmn",
        headers=_auth(analyst_token),
    )
    assert r.status_code == 200, r.text
    assert "camunda:property" in r.text
    assert "bpmndi:BPMNDiagram" in r.text

    # audit_log: две записи publish
    rows = _audit_rows(tpl["id"])
    assert len(rows) == 2
    for action, entity_type, entity_id, status, meta_json in rows:
        assert entity_type == "process_template"
        assert status == "ok"
        assert "version" in str(meta_json)


def test_publish_minor_and_major_bump(client, analyst_token, template_factory):
    tpl = template_factory(version="0.1.0")
    r = client.post(
        f"/api/process-templates/{tpl['id']}/publish",
        json={"bump": "minor"},
        headers=_auth(analyst_token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["version"] == "0.2.0"

    client.post(f"/api/process-templates/{tpl['id']}/new-draft", headers=_auth(analyst_token))
    r = client.post(
        f"/api/process-templates/{tpl['id']}/publish",
        json={"bump": "major"},
        headers=_auth(analyst_token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["version"] == "1.0.0"

    r = client.get(f"/api/process-templates/{tpl['id']}/versions", headers=_auth(analyst_token))
    versions = {v["version"]: v["status"] for v in r.json()}
    assert versions == {"0.2.0": "retired", "1.0.0": "published"}


def test_publish_dry_run_errors_422(client, analyst_token, template_factory):
    tpl = template_factory(ui_model=_invalid_ui_model())
    r = client.post(f"/api/process-templates/{tpl['id']}/publish", json={}, headers=_auth(analyst_token))
    assert r.status_code == 422, r.text
    detail = r.json()["detail"]
    assert detail["stage"] == "dry_run"
    assert any(f["code"] == "UNKNOWN_OPERATION_CODE" for f in detail["findings"])
    # шаблон остался черновиком
    r = client.get(f"/api/process-templates/{tpl['id']}", headers=_auth(analyst_token))
    assert r.json()["status"] == "draft"


def test_publish_strict_precheck_blocked_422(client, analyst_token, template_factory, empty_kitchen):
    tpl = template_factory(ui_model=_measure_ui_model())
    r = client.post(
        f"/api/process-templates/{tpl['id']}/publish",
        json={"target_kitchen_ids": [empty_kitchen["id"]], "mode": "strict"},
        headers=_auth(analyst_token),
    )
    assert r.status_code == 422, r.text
    detail = r.json()["detail"]
    assert detail["stage"] == "precheck"
    assert detail["precheck"]["summary"]["blocked"] == 1
    r = client.get(f"/api/process-templates/{tpl['id']}", headers=_auth(analyst_token))
    assert r.json()["status"] == "draft"


def test_publish_with_warning_recorded(client, analyst_token, template_factory, empty_kitchen):
    tpl = template_factory(ui_model=_measure_ui_model())
    r = client.post(
        f"/api/process-templates/{tpl['id']}/publish",
        json={"target_kitchen_ids": [empty_kitchen["id"]], "mode": "warning"},
        headers=_auth(analyst_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["precheck"]["summary"]["warning"] == 1
    assert body["warnings_count"] >= 1

    # warning записан в version artifact (precheck_report)
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT precheck_report, bpmn_xml, dry_run_report FROM process_template_version "
                "WHERE template_id = %s AND version = %s",
                (tpl["id"], body["version"]),
            )
            row = cur.fetchone()
    assert row is not None
    precheck_report = row[0]
    assert precheck_report["summary"]["warning"] == 1
    assert precheck_report["kitchens"][0]["verdict"] == "warning"
    assert "camunda:property" in (row[1] or "")
    assert row[2]["summary"]["errors"] == 0


def test_publish_unknown_template_404(client, analyst_token):
    r = client.post(
        f"/api/process-templates/{uuid.uuid4()}/publish",
        json={},
        headers=_auth(analyst_token),
    )
    assert r.status_code == 404, r.text
