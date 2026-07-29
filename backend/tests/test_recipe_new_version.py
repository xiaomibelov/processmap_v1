"""E8-gap1 — POST /api/recipes/{id}/new-version.

Покрытие критериев приёмки:
(1) new-version от published → draft с наследованием параметров/sku/template;
(2) new-version от draft → 409 (негативный тест);
(3) событие new_version в audit_log с привязкой к версии-источнику;
(4) сквозной чистый API: publish v1.0.0 → new-version → PUT 90→100 →
    publish v1.0.1 → цепочка new_version → recipe.update → publish в журнале,
    diff поимённо, без служебных UPDATE.

Фикстуры/паттерн — как в test_audit_log_e8.py (_pg_env, реальная dev-БД).
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
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO users (id, email, password_hash, is_active, is_admin, role, created_at, updated_at) "
                "VALUES (%s, %s, '', 1, 0, %s, 0, 0)",
                (user_id, f"gap1_{role}_{user_id[:8]}@local", role),
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
    yield create_access_token(uid), uid
    _delete_user(uid)


@pytest.fixture
def client():
    return TestClient(app)


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_ui_model(recipe_params_per_task):
    nodes = [
        {"id": "StartEvent_1", "bpmn_type": "startEvent", "name": "s", "recipe_params": []},
    ]
    for idx, params in enumerate(recipe_params_per_task or []):
        nodes.append(
            {
                "id": f"Task_{idx + 1}",
                "bpmn_type": "task",
                "name": f"Шаг {idx + 1}",
                "operation_code": "heat",
                "recipe_params": list(params),
            }
        )
    return {"nodes": nodes, "flows": [], "recipe_context": {}}


@pytest.fixture
def template(client, analyst_token):
    """Draft template + published-снапшот версии 1.0.0 (как в test_audit_log_e8)."""
    token, _ = analyst_token
    payload = {
        "name": f"gap1_template_{uuid.uuid4().hex[:8]}",
        "version": "1.0.0",
        "status": "draft",
        "ui_model": _make_ui_model([["heat_time_sec"], ["target_temp_c", "heat_time_sec"]]),
        "created_by": "",
    }
    r = client.post("/api/process-templates", json=payload, headers=_auth(token))
    assert r.status_code in (200, 201), r.text
    tpl = r.json()
    from backend.app.process_template.version_repository import ProcessTemplateVersionRepository

    ProcessTemplateVersionRepository().create(
        {
            "template_id": tpl["id"],
            "version": "1.0.0",
            "status": "published",
            "ui_model": tpl["ui_model"],
            "bpmn_xml": "",
            "precheck_report": {},
            "dry_run_report": {},
            "created_by": "gap1_test",
        }
    )
    yield tpl
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM recipe_version WHERE recipe_id IN (SELECT id FROM recipe WHERE template_id = %s)",
                (tpl["id"],),
            )
            cur.execute("DELETE FROM recipe WHERE template_id = %s", (tpl["id"],))
            cur.execute("DELETE FROM process_template_version WHERE template_id = %s", (tpl["id"],))
            cur.execute("DELETE FROM process_template WHERE id = %s", (tpl["id"],))
        conn.commit()


def _create_recipe(client, token, template, **overrides):
    payload = {
        "sku_id": f"gap1_sku_{uuid.uuid4().hex[:8]}",
        "template_id": template["id"],
        "template_version": "1.0.0",
        "parameters_json": {"heat_time_sec": 90, "target_temp_c": 85},
    }
    payload.update(overrides)
    r = client.post("/api/recipes", json=payload, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


def _publish(client, token, recipe_id):
    r = client.post(f"/api/recipes/{recipe_id}/publish", headers=_auth(token))
    assert r.status_code == 200, r.text
    return r.json()


def _journal(client, token, recipe_id):
    r = client.get(
        "/api/audit-log",
        params={"entity_type": "recipe", "entity_id": recipe_id},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    return r.json()["items"]


# (1) new-version от published → draft-копия с наследованием -------------------
def test_new_version_from_published_creates_draft(client, analyst_token, template):
    token, _ = analyst_token
    recipe = _create_recipe(client, token, template)
    _publish(client, token, recipe["id"])

    r = client.post(f"/api/recipes/{recipe['id']}/new-version", headers=_auth(token))
    assert r.status_code == 200, r.text
    draft = r.json()
    assert draft["status"] == "draft"
    # наследование: те же sku_id/template/parameters
    assert draft["sku_id"] == recipe["sku_id"]
    assert draft["template_id"] == recipe["template_id"]
    assert draft["parameters_json"] == recipe["parameters_json"]
    # patch-автоинкремент: следующая версия 1.0.1
    assert draft["source_version"] == "1.0.0"
    assert draft["next_version"] == "1.0.1"
    # черновик снова редактируется
    r = client.put(
        f"/api/recipes/{recipe['id']}",
        json={"parameters_json": {"heat_time_sec": 100, "target_temp_c": 85}},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text


# (2) new-version от draft → 409 (негативный тест) ------------------------------
def test_new_version_from_draft_409(client, analyst_token, template):
    token, _ = analyst_token
    recipe = _create_recipe(client, token, template)
    r = client.post(f"/api/recipes/{recipe['id']}/new-version", headers=_auth(token))
    assert r.status_code == 409, r.text
    assert "черновик" in r.text


# (3) событие new_version в audit_log с привязкой к версии-источнику ------------
def test_new_version_audit_event(client, analyst_token, template):
    token, uid = analyst_token
    recipe = _create_recipe(client, token, template)
    _publish(client, token, recipe["id"])
    client.post(f"/api/recipes/{recipe['id']}/new-version", headers=_auth(token))

    items = _journal(client, token, recipe["id"])
    events = [e for e in items if e["action"] == "new_version"]
    assert len(events) == 1, f"new_version event missing: {[e['action'] for e in items]}"
    meta = events[0]["meta"]
    assert meta["source_version"] == "1.0.0"
    assert meta["next_version"] == "1.0.1"
    assert "создано из v1.0.0" in meta["diff_summary"]
    assert events[0]["actor_user_id"] == uid


# (4) сквозной чистый API: 90→100 без служебных UPDATE ---------------------------
def test_full_cycle_clean_api(client, analyst_token, template):
    token, _ = analyst_token
    recipe = _create_recipe(client, token, template)
    _publish(client, token, recipe["id"])  # v1.0.0

    r = client.post(f"/api/recipes/{recipe['id']}/new-version", headers=_auth(token))
    assert r.status_code == 200, r.text

    r = client.put(
        f"/api/recipes/{recipe['id']}",
        json={"parameters_json": {"heat_time_sec": 100, "target_temp_c": 85}},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text

    published = _publish(client, token, recipe["id"])  # v1.0.1
    assert published["version"]["version"] == "1.0.1"

    # цепочка в журнале: new_version → recipe.update → publish (поимённый diff)
    items = _journal(client, token, recipe["id"])
    actions = [e["action"] for e in items]
    for expected in ("new_version", "recipe.update", "publish"):
        assert expected in actions, f"{expected} missing in {actions}"
    updates = [e for e in items if e["action"] == "recipe.update"]
    assert updates[0]["meta"]["diff_json"]["heat_time_sec"] == {"old": 90, "new": 100}
    # diff endpoint: v1.0.0 → v1.0.1
    r = client.get(
        f"/api/recipes/{recipe['id']}/diff?from=1.0.0&to=1.0.1", headers=_auth(token)
    )
    assert r.status_code == 200, r.text
    assert r.json()["diff"]["heat_time_sec"] == {"old": 90, "new": 100}
