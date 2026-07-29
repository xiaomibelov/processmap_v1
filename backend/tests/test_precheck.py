"""E6.4 — тесты feasibility pre-check.

DB-backed (real dev Postgres, паттерн _pg_env). Свои тестовые кухни создаются
через API и удаляются после теста; seeded-кухни не трогаем.

Кейсы:
  - strict → verdict 'blocked' на кухне без temperature-сенсора (measure_temperature);
  - warning (default) → verdict 'warning' на той же кухне;
  - ok на полностью укомплектованной кухне;
  - mode по умолчанию = warning (поле mode не передаём);
  - body-variant (несохранённый ui_model) для конструктора;
  - /{id}/validate — dry-run сохранённого шаблона, 0 ошибок на валидной модели.
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
    email = f"e6_precheck_{role}_{user_id[:8]}@local"
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


def _ui_model_with_measure():
    """Валидная модель: start -> measure_temperature -> end (measure_temperature
    требует equipment 'temperature_sensor' или capability 'temperature_measurement')."""
    return {
        "process_template_id": "precheck_test",
        "recipe_context": {},
        "process_entities": {"containers": {"c1": {}}, "equipment": {}, "zones": {}},
        "nodes": [
            {"id": "E1", "bpmn_type": "startEvent", "name": "s"},
            {
                "id": "T1",
                "bpmn_type": "task",
                "name": "Замер температуры",
                "operation_code": "measure_temperature",
                "params": {"container_ref": "c1", "target_temp_c": "85"},
                "outputs": {"temperature_ok": "temperature_ok"},
            },
            {"id": "E2", "bpmn_type": "endEvent", "name": "e"},
        ],
        "flows": [
            {"id": "F1", "source_ref": "E1", "target_ref": "T1", "name": "", "condition": ""},
            {"id": "F2", "source_ref": "T1", "target_ref": "E2", "name": "", "condition": ""},
        ],
    }


@pytest.fixture
def kitchens(client, analyst_token):
    """Две тестовые кухни: укомплектованная и без датчиков температуры."""
    suffix = uuid.uuid4().hex[:6]
    equipped = client.post(
        "/api/kitchens",
        json={
            "name": f"E6 equipped {suffix}",
            "equipment": [
                {"equipment_type_id": "measurement_device", "capabilities_json": {"capabilities": ["temperature_measurement"]}},
            ],
        },
        headers=_auth(analyst_token),
    ).json()
    sensorless = client.post(
        "/api/kitchens",
        json={
            "name": f"E6 sensorless {suffix}",
            "equipment": [{"equipment_type_id": "storage_unit", "capabilities_json": {}}],
        },
        headers=_auth(analyst_token),
    ).json()
    yield {"equipped": equipped, "sensorless": sensorless}
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            for k in (equipped, sensorless):
                cur.execute("DELETE FROM kitchen WHERE id = %s", (k["id"],))
        conn.commit()


def _precheck(client, token, body, template_id=None):
    url = "/api/process-templates/precheck" if template_id is None else f"/api/process-templates/{template_id}/precheck"
    return client.post(url, json=body, headers=_auth(token))


def _verdict(result, kitchen_id):
    for k in result["kitchens"]:
        if k["kitchen_id"] == kitchen_id:
            return k
    raise AssertionError(f"kitchen {kitchen_id} not in result: {result}")


def test_strict_blocks_sensorless_kitchen(client, analyst_token, kitchens):
    r = _precheck(
        client,
        analyst_token,
        {
            "ui_model": _ui_model_with_measure(),
            "kitchen_ids": [kitchens["equipped"]["id"], kitchens["sensorless"]["id"]],
            "mode": "strict",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["mode"] == "strict"
    assert _verdict(body, kitchens["equipped"]["id"])["verdict"] == "ok"
    blocked = _verdict(body, kitchens["sensorless"]["id"])
    assert blocked["verdict"] == "blocked"
    assert blocked["unmet"]
    unmet = blocked["unmet"][0]
    assert unmet["operation_code"] == "measure_temperature"
    assert unmet["requirement"] == "temperature_sensor"
    assert unmet["detail_ru"]  # RU-детализация


def test_warning_mode_gives_warning(client, analyst_token, kitchens):
    r = _precheck(
        client,
        analyst_token,
        {
            "ui_model": _ui_model_with_measure(),
            "kitchen_ids": [kitchens["sensorless"]["id"]],
            "mode": "warning",
        },
    )
    assert r.status_code == 200, r.text
    assert _verdict(r.json(), kitchens["sensorless"]["id"])["verdict"] == "warning"


def test_default_mode_is_warning(client, analyst_token, kitchens):
    r = _precheck(
        client,
        analyst_token,
        {"ui_model": _ui_model_with_measure(), "kitchen_ids": [kitchens["sensorless"]["id"]]},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["mode"] == "warning"
    assert _verdict(body, kitchens["sensorless"]["id"])["verdict"] == "warning"


def test_capability_alias_covers_temperature_sensor(client, analyst_token, kitchens):
    # на equipped-кухне нет temperature_sensor как типа, но есть capability
    # temperature_measurement -> ok (покрытие через алиас)
    r = _precheck(
        client,
        analyst_token,
        {"ui_model": _ui_model_with_measure(), "kitchen_ids": [kitchens["equipped"]["id"]], "mode": "strict"},
    )
    assert r.status_code == 200, r.text
    assert _verdict(r.json(), kitchens["equipped"]["id"])["verdict"] == "ok"


def test_invalid_mode_422(client, analyst_token):
    r = _precheck(client, analyst_token, {"ui_model": _ui_model_with_measure(), "mode": "hard"})
    assert r.status_code == 422


def test_precheck_saved_template(client, analyst_token, kitchens):
    ui_model = _ui_model_with_measure()
    r = client.post(
        "/api/process-templates",
        json={"name": f"E6 precheck {uuid.uuid4().hex[:6]}", "version": "0.1.0", "status": "draft", "ui_model": ui_model, "created_by": ""},
        headers=_auth(analyst_token),
    )
    assert r.status_code in (200, 201), r.text
    template_id = r.json()["id"]
    try:
        r = _precheck(
            client,
            analyst_token,
            {"kitchen_ids": [kitchens["sensorless"]["id"]], "mode": "strict"},
            template_id=template_id,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["template_id"] == template_id
        assert _verdict(body, kitchens["sensorless"]["id"])["verdict"] == "blocked"
    finally:
        import psycopg

        with psycopg.connect(DATABASE_URL) as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM process_template WHERE id = %s", (template_id,))
            conn.commit()


def test_validate_saved_template(client, analyst_token):
    ui_model = _ui_model_with_measure()
    r = client.post(
        "/api/process-templates",
        json={"name": f"E6 validate {uuid.uuid4().hex[:6]}", "version": "0.1.0", "status": "draft", "ui_model": ui_model, "created_by": ""},
        headers=_auth(analyst_token),
    )
    template_id = r.json()["id"]
    try:
        r = client.post(f"/api/process-templates/{template_id}/validate", headers=_auth(analyst_token))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["valid"] is True
        assert body["summary"]["errors"] == 0
        assert body["template_id"] == template_id
        for finding in body["findings"]:
            assert finding["code"] and "element_id" in finding and finding["message"]
    finally:
        import psycopg

        with psycopg.connect(DATABASE_URL) as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM process_template WHERE id = %s", (template_id,))
            conn.commit()


def test_validate_draft_body_variant(client, analyst_token):
    bad_model = _ui_model_with_measure()
    bad_model["nodes"].append({"id": "T_bad", "bpmn_type": "task", "name": "bad", "operation_code": "teleport", "params": {}, "outputs": {}})
    r = client.post("/api/process-templates/validate", json={"ui_model": bad_model}, headers=_auth(analyst_token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["valid"] is False
    codes = {f["code"] for f in body["findings"]}
    assert "UNKNOWN_OPERATION_CODE" in codes
    assert "UNREACHABLE_NODE" in codes  # R6 включена по умолчанию


def test_validate_unknown_template_404(client, analyst_token):
    r = client.post(f"/api/process-templates/{uuid.uuid4()}/validate", headers=_auth(analyst_token))
    assert r.status_code == 404
