"""E2.0b — автотест 403-by-role на реальном admin-only методе.

Два токена (analyst и technologist) против POST /api/process-templates/import-bpmn:
technologist получает 403, analyst — 200.
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
    """These tests need the real dev Postgres (seeded roles); restore env/pool after."""
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

BPMN_MIN = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
                  id="D1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="P1" isExecutable="false">
    <bpmn:startEvent id="E1" name="s"/>
    <bpmn:task id="T1" name="t">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="operation_code" value="move"/>
          <camunda:property name="params.object_ref" value="c1"/>
          <camunda:property name="params.target_ref" value="z1"/>
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
    <bpmn:endEvent id="E2" name="e"/>
    <bpmn:sequenceFlow id="F1" sourceRef="E1" targetRef="T1"/>
    <bpmn:sequenceFlow id="F2" sourceRef="T1" targetRef="E2"/>
  </bpmn:process>
</bpmn:definitions>
"""


def _insert_user(role: str) -> str:
    import psycopg

    user_id = uuid.uuid4().hex
    email = f"e2_0b_{role}_{user_id[:8]}@local"
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


def _post_import(token: str):
    client = TestClient(app)
    return client.post(
        "/api/process-templates/import-bpmn",
        content=BPMN_MIN.encode("utf-8"),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "text/xml"},
    )


def test_technologist_can_import_bpmn(technologist_token):
    """U5: technologist допущен к воркфлоу-импорту AS IS (без admin-функций)."""
    response = _post_import(technologist_token)
    assert response.status_code == 200, response.text
    assert response.json()["report"]["summary"]["nodes"] == 3


def test_technologist_gets_403_on_admin_only(technologist_token):
    """U5: admin-only остаётся 403 для technologist (кухни, словари, правила)."""
    client = TestClient(app)
    headers = {"Authorization": f"Bearer {technologist_token}"}
    # кухни — реестр (analyst/admin)
    r = client.post("/api/kitchens", json={"name": "x"}, headers=headers)
    assert r.status_code == 403, r.text
    # словарь параметров рецепта (analyst/admin)
    r = client.put("/api/recipe-params/heat_time_sec", json={"min": 1}, headers=headers)
    assert r.status_code == 403, r.text
    # сид правил трансформации (admin)
    r = client.post("/api/process-templates/transformation-rules/seed", headers=headers)
    assert r.status_code == 403, r.text


def test_analyst_gets_200_on_import_bpmn(analyst_token):
    response = _post_import(analyst_token)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["report"]["summary"]["nodes"] == 3
