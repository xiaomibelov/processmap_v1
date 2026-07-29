"""E7.3 — recipe publish: требует published-версии шаблона + recipe_version.

Позитив: в process_template_version есть published-версия, на которую
указывает recipe.template_version → publish 200 + snapshot в recipe_version
+ audit_log. Негатив: published-версии нет → 422.
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
    email = f"e7r_{role}_{user_id[:8]}@local"
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


def _ui_model_with_recipe_params():
    return {
        "process_entities": {
            "containers": {},
            "equipment": {"heating_equipment": {"type_id": "microwave"}},
            "zones": {},
        },
        "recipe_context": {},
        "nodes": [
            {"id": "Start_1", "bpmn_type": "startEvent", "name": "s"},
            {
                "id": "Task_heat",
                "bpmn_type": "task",
                "name": "Разогрев",
                "operation_code": "set_equipment",
                "params": {"equipment_ref": "heating_equipment"},
                "outputs": {},
                "recipe_params": ["heat_time_sec", "target_temp_c"],
            },
            {"id": "End_1", "bpmn_type": "endEvent", "name": "e"},
        ],
        "flows": [
            {"id": "F1", "source_ref": "Start_1", "target_ref": "Task_heat"},
            {"id": "F2", "source_ref": "Task_heat", "target_ref": "End_1"},
        ],
    }


@pytest.fixture
def recipe_setup(client, analyst_token):
    """Шаблон (draft v1.0.0) + полный рецепт на него."""
    r = client.post(
        "/api/process-templates",
        json={
            "name": f"e7r_template_{uuid.uuid4().hex[:8]}",
            "version": "1.0.0",
            "status": "draft",
            "ui_model": _ui_model_with_recipe_params(),
            "created_by": "",
        },
        headers=_auth(analyst_token),
    )
    assert r.status_code in (200, 201), r.text
    tpl = r.json()
    r = client.post(
        "/api/recipes",
        json={
            "sku_id": f"e7r_sku_{uuid.uuid4().hex[:8]}",
            "template_id": tpl["id"],
            "parameters_json": {
                "heat_time_sec": 90,
                "target_temp_c": 85,
                "heating_power": "medium",
            },
        },
        headers=_auth(analyst_token),
    )
    assert r.status_code == 201, r.text
    recipe = r.json()
    yield tpl, recipe
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM recipe WHERE template_id = %s", (tpl["id"],))
            cur.execute("DELETE FROM process_template WHERE id = %s", (tpl["id"],))
        conn.commit()


def test_recipe_publish_requires_published_template_version(client, analyst_token, recipe_setup):
    tpl, recipe = recipe_setup
    r = client.post(f"/api/recipes/{recipe['id']}/publish", headers=_auth(analyst_token))
    assert r.status_code == 422, r.text
    detail = r.json()["detail"]
    assert "template_version" in detail
    # рецепт остался черновиком
    r = client.get(f"/api/recipes/{recipe['id']}", headers=_auth(analyst_token))
    assert r.json()["status"] == "draft"


def test_recipe_publish_happy_path(client, analyst_token, recipe_setup):
    tpl, recipe = recipe_setup
    # публикуем шаблон через E7.2 flow (dry-run + precheck + версия)
    r = client.post(
        f"/api/process-templates/{tpl['id']}/publish",
        json={"target_kitchen_ids": []},
        headers=_auth(analyst_token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["version"] == "1.0.0"

    r = client.post(f"/api/recipes/{recipe['id']}/publish", headers=_auth(analyst_token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "published"
    assert body["version"]["version"] == "1.0.0"
    assert body["version"]["template_version"] == "1.0.0"
    assert body["version"]["parameters_json"]["heat_time_sec"] == 90

    # GET /api/recipes/{id}/versions — snapshot в истории
    r = client.get(f"/api/recipes/{recipe['id']}/versions", headers=_auth(analyst_token))
    assert r.status_code == 200, r.text
    versions = r.json()
    assert len(versions) == 1
    assert versions[0]["status"] == "published"

    # PUT published → 409 (E7.4, уже было в E5)
    r = client.put(
        f"/api/recipes/{recipe['id']}",
        json={"parameters_json": {"heat_time_sec": 100, "target_temp_c": 85}},
        headers=_auth(analyst_token),
    )
    assert r.status_code == 409, r.text

    # audit_log: запись publish для recipe
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT entity_type, status, meta_json FROM audit_log "
                "WHERE entity_id = %s AND action = 'publish'",
                (recipe["id"],),
            )
            rows = cur.fetchall()
    assert len(rows) == 1
    assert rows[0][0] == "recipe"
    assert rows[0][1] == "ok"
    assert "template_version=1.0.0" in str(rows[0][2])
