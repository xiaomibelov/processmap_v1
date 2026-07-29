"""E6.3 — тесты реестра кухонь (/api/kitchens).

DB-backed (real dev Postgres, паттерн _pg_env как в test_role_403.py).
CRUD + RBAC: technologist → 403 на POST/PUT, analyst → 200/201.
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
    """These tests need the real dev Postgres (миграция 005 применена)."""
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
    email = f"e6_kitchen_{role}_{user_id[:8]}@local"
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


def _delete_kitchen(kitchen_id: str) -> None:
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM kitchen WHERE id = %s", (kitchen_id,))
        conn.commit()


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

def test_create_list_and_replace_equipment(client, analyst_token):
    payload = {
        "name": f"Тестовая кухня {uuid.uuid4().hex[:6]}",
        "location": "Цех Т",
        "equipment": [
            {"equipment_type_id": "storage_unit", "capabilities_json": {}},
            {"equipment_type_id": "temperature_sensor", "capabilities_json": {"capabilities": ["temperature_measurement"]}},
        ],
    }
    r = client.post("/api/kitchens", json=payload, headers=_auth(analyst_token))
    assert r.status_code == 201, r.text
    kitchen = r.json()
    kitchen_id = kitchen["id"]
    try:
        assert kitchen["name"] == payload["name"]
        assert kitchen["status"] == "active"
        assert {e["equipment_type_id"] for e in kitchen["equipment"]} == {"storage_unit", "temperature_sensor"}

        r = client.get("/api/kitchens", headers=_auth(analyst_token))
        assert r.status_code == 200, r.text
        listed = [k for k in r.json() if k["id"] == kitchen_id]
        assert listed and listed[0]["location"] == "Цех Т"

        # PUT equipment — полная замена
        r = client.put(
            f"/api/kitchens/{kitchen_id}/equipment",
            json={"equipment": [{"equipment_type_id": "transport_system", "capabilities_json": {}}]},
            headers=_auth(analyst_token),
        )
        assert r.status_code == 200, r.text
        assert [e["equipment_type_id"] for e in r.json()["equipment"]] == ["transport_system"]
    finally:
        _delete_kitchen(kitchen_id)


def test_replace_equipment_unknown_kitchen_404(client, analyst_token):
    r = client.put(
        f"/api/kitchens/{uuid.uuid4()}/equipment",
        json={"equipment": []},
        headers=_auth(analyst_token),
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# RBAC
# ---------------------------------------------------------------------------

def test_technologist_403_on_create(client, technologist_token):
    r = client.post("/api/kitchens", json={"name": "X"}, headers=_auth(technologist_token))
    assert r.status_code == 403
    assert r.json()["detail"]["error"] == "insufficient_permissions"


def test_technologist_403_on_put_equipment(client, analyst_token, technologist_token):
    r = client.post("/api/kitchens", json={"name": f"RBAC {uuid.uuid4().hex[:6]}"}, headers=_auth(analyst_token))
    kitchen_id = r.json()["id"]
    try:
        r = client.put(
            f"/api/kitchens/{kitchen_id}/equipment",
            json={"equipment": [{"equipment_type_id": "storage_unit"}]},
            headers=_auth(technologist_token),
        )
        assert r.status_code == 403, r.text
        detail = r.json()["detail"]
        assert detail["error"] == "insufficient_permissions"
        assert detail["actual"] == "technologist"
    finally:
        _delete_kitchen(kitchen_id)


def test_analyst_200_on_put_equipment(client, analyst_token):
    r = client.post("/api/kitchens", json={"name": f"RBAC {uuid.uuid4().hex[:6]}"}, headers=_auth(analyst_token))
    kitchen_id = r.json()["id"]
    try:
        r = client.put(
            f"/api/kitchens/{kitchen_id}/equipment",
            json={"equipment": [{"equipment_type_id": "storage_unit"}]},
            headers=_auth(analyst_token),
        )
        assert r.status_code == 200, r.text
    finally:
        _delete_kitchen(kitchen_id)


def test_technologist_can_read_kitchens(client, technologist_token):
    r = client.get("/api/kitchens", headers=_auth(technologist_token))
    assert r.status_code == 200
    assert isinstance(r.json(), list)
