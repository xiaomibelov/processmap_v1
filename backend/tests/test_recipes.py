"""E5 — DB-backed tests for /api/recipes + /api/recipe-params.

Uses the real dev Postgres (same _pg_env pattern as test_role_403.py):
env + get_db_runtime_config.cache_clear() + _PG_POOL reset.
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
    """These tests need the real dev Postgres (seeded roles + recipe_param_def)."""
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
    email = f"e5_{role}_{user_id[:8]}@local"
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


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client():
    return TestClient(app)


def _make_ui_model(recipe_params_per_task=None):
    """Minimal ui_model with task nodes referencing recipe_params."""
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
    """A draft process template whose blocks require heat_time_sec + target_temp_c."""
    created = []
    payload = {
        "name": f"e5test_template_{uuid.uuid4().hex[:8]}",
        "version": "1.0.0",
        "status": "draft",
        "ui_model": _make_ui_model([["heat_time_sec"], ["target_temp_c", "heat_time_sec"]]),
        "created_by": "",
    }
    r = client.post("/api/process-templates", json=payload, headers=_auth(analyst_token))
    assert r.status_code in (200, 201), r.text
    tpl = r.json()
    created.append(tpl["id"])
    yield tpl
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            for tid in created:
                cur.execute("DELETE FROM recipe WHERE template_id = %s", (tid,))
                cur.execute("DELETE FROM process_template WHERE id = %s", (tid,))
        conn.commit()


def _create_recipe(client, token, template, **overrides):
    payload = {
        "sku_id": f"e5test_sku_{uuid.uuid4().hex[:8]}",
        "template_id": template["id"],
        "parameters_json": {
            "heat_time_sec": 90,
            "target_temp_c": 85,
            "heating_power": "medium",
        },
    }
    payload.update(overrides)
    return client.post("/api/recipes", json=payload, headers=_auth(token))


def test_crud_roundtrip(client, analyst_token, template):
    # create
    r = _create_recipe(client, analyst_token, template)
    assert r.status_code == 201, r.text
    recipe = r.json()
    assert recipe["status"] == "draft"
    assert recipe["sku_id"].startswith("e5test_sku_")
    assert recipe["template_version"] == "1.0.0"
    assert recipe["parameters_json"]["heat_time_sec"] == 90
    assert "blocks_analysis" in recipe
    rid = recipe["id"]

    # list
    r = client.get("/api/recipes", headers=_auth(analyst_token))
    assert r.status_code == 200, r.text
    assert any(item["id"] == rid for item in r.json())

    # get one
    r = client.get(f"/api/recipes/{rid}", headers=_auth(analyst_token))
    assert r.status_code == 200, r.text
    assert r.json()["id"] == rid

    # update
    r = client.put(
        f"/api/recipes/{rid}",
        json={"parameters_json": {"heat_time_sec": 120, "target_temp_c": 85, "heating_power": "high"}},
        headers=_auth(analyst_token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["parameters_json"]["heat_time_sec"] == 120

    r = client.get(f"/api/recipes/{rid}", headers=_auth(analyst_token))
    assert r.json()["parameters_json"]["heat_time_sec"] == 120


def test_out_of_range_param_returns_422(client, analyst_token, template):
    r = _create_recipe(
        client,
        analyst_token,
        template,
        parameters_json={"heat_time_sec": 1000, "target_temp_c": 85},
    )
    assert r.status_code == 422, r.text
    text = r.text
    assert "heat_time_sec" in text
    assert "вне диапазона 10–600 сек" in text


def test_enum_param_validation(client, analyst_token, template):
    r = _create_recipe(
        client,
        analyst_token,
        template,
        parameters_json={"heat_time_sec": 90, "target_temp_c": 85, "heating_power": "turbo"},
    )
    assert r.status_code == 422, r.text
    assert "heating_power" in r.text
    assert "low, medium, high" in r.text


def test_publish_blocked_when_template_param_missing(client, analyst_token, template):
    # recipe misses target_temp_c, which the template blocks require
    r = _create_recipe(
        client,
        analyst_token,
        template,
        parameters_json={"heat_time_sec": 90},
    )
    assert r.status_code == 201, r.text
    rid = r.json()["id"]

    r = client.post(f"/api/recipes/{rid}/publish", headers=_auth(analyst_token))
    assert r.status_code == 422, r.text
    payload = r.json()
    assert "target_temp_c" in str(payload["detail"])
    assert payload["detail"]["missing_params"] == ["target_temp_c"]

    # after adding the missing param, publish succeeds
    r = client.put(
        f"/api/recipes/{rid}",
        json={"parameters_json": {"heat_time_sec": 90, "target_temp_c": 85}},
        headers=_auth(analyst_token),
    )
    assert r.status_code == 200, r.text
    r = client.post(f"/api/recipes/{rid}/publish", headers=_auth(analyst_token))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "published"


def test_publish_requires_analyst_or_admin(client, technologist_token, analyst_token, template):
    r = _create_recipe(client, analyst_token, template)
    rid = r.json()["id"]
    r = client.post(f"/api/recipes/{rid}/publish", headers=_auth(technologist_token))
    assert r.status_code == 403, r.text
    detail = r.json().get("detail")
    assert isinstance(detail, dict)
    assert detail.get("error") == "insufficient_permissions"


def test_clone_to_new_sku(client, analyst_token, template):
    r = _create_recipe(client, analyst_token, template)
    rid = r.json()["id"]
    new_sku = f"e5test_sku_clone_{uuid.uuid4().hex[:8]}"
    r = client.post(f"/api/recipes/{rid}/clone", json={"sku_id": new_sku}, headers=_auth(analyst_token))
    assert r.status_code == 201, r.text
    clone = r.json()
    assert clone["id"] != rid
    assert clone["sku_id"] == new_sku
    assert clone["status"] == "draft"
    assert clone["parameters_json"]["heat_time_sec"] == 90
    assert clone["template_id"] == template["id"]


def test_blocks_analysis_marks_missing_params(client, analyst_token, template):
    # E5.3: recipe without target_temp_c → analysis flags the block that needs it
    r = _create_recipe(client, analyst_token, template, parameters_json={"heat_time_sec": 90})
    rid = r.json()["id"]
    r = client.get(f"/api/recipes/{rid}", headers=_auth(analyst_token))
    assert r.status_code == 200, r.text
    analysis = r.json()["blocks_analysis"]
    assert analysis["missing_params"] == ["target_temp_c"]
    task2 = [b for b in analysis["blocks"] if b["node_id"] == "Task_2"][0]
    assert task2["missing_params"] == ["target_temp_c"]


def test_param_def_dictionary_api(client, analyst_token, technologist_token):
    r = client.get("/api/recipe-params", headers=_auth(analyst_token))
    assert r.status_code == 200, r.text
    defs = {d["name"]: d for d in r.json()}
    assert defs["heat_time_sec"]["min"] == 10
    assert defs["heat_time_sec"]["max"] == 600
    assert defs["heating_power"]["enum_json"] == ["low", "medium", "high"]
    assert defs["source_container_type"]["dict_ref"] == "container-types"

    # technologist cannot edit the dictionary
    r = client.put(
        "/api/recipe-params/heat_time_sec",
        json={"max": 900},
        headers=_auth(technologist_token),
    )
    assert r.status_code == 403, r.text

    # analyst edits; restore afterwards (shared dev DB)
    try:
        r = client.put(
            "/api/recipe-params/heat_time_sec",
            json={"max": 900},
            headers=_auth(analyst_token),
        )
        assert r.status_code == 200, r.text
        assert r.json()["max"] == 900

        # invalid: min > max → 422
        r = client.put(
            "/api/recipe-params/heat_time_sec",
            json={"min": 1000},
            headers=_auth(analyst_token),
        )
        assert r.status_code == 422, r.text

        # unknown dict_ref → 422
        r = client.put(
            "/api/recipe-params/source_container_type",
            json={"dict_ref": "no-such-dict"},
            headers=_auth(analyst_token),
        )
        assert r.status_code == 422, r.text

        # unknown param name → 404
        r = client.put(
            "/api/recipe-params/no_such_param",
            json={"unit": "x"},
            headers=_auth(analyst_token),
        )
        assert r.status_code == 404, r.text
    finally:
        client.put(
            "/api/recipe-params/heat_time_sec",
            json={"min": 10, "max": 600},
            headers=_auth(analyst_token),
        )


def test_unauthenticated_gets_401(client):
    assert client.get("/api/recipes").status_code == 401
    assert client.get("/api/recipe-params").status_code == 401
