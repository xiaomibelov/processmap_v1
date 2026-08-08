"""Тесты доступа к /api/docs, /api/redoc, /api/openapi.json (право уровня админки).

Паттерн: реальная dev-БД (_pg_env) + TestClient, как test_llm_status_api.py.

Покрытие:
- без токена → 401 на всех трёх;
- viewer (без admin-ролей) → 403 на всех трёх;
- org_owner / org_admin / auditor → 200 (HTML swagger/redoc, валидный JSON openapi);
- platform admin (is_admin, без org-ролей) → 200;
- контракт: /api/docs, /api/redoc, /api/openapi.json отсутствуют в paths спеки
  (include_in_schema=False — /api/openapi.json-контракт не изменился).

Запуск — из корня репо: python -m pytest backend/tests/test_api_docs_access.py -q
"""
import os
import sys
import uuid

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

DATABASE_URL = os.environ.get("E2_TEST_DATABASE_URL", "postgresql://fpc:fpc@localhost:5432/processmap")

from backend.app.main import app  # noqa: E402
from backend.app.auth import create_access_token  # noqa: E402
from backend.app.storage import create_org_record, upsert_org_membership  # noqa: E402

DOCS_PATHS = ("/api/docs", "/api/redoc", "/api/openapi.json")


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


def _insert_user(email: str, *, is_admin: bool = False) -> str:
    import psycopg

    uid = uuid.uuid4().hex
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO users (id, email, password_hash, is_active, is_admin, role, created_at, updated_at) "
                "VALUES (%s, %s, '', 1, %s, 'analyst', 0, 0)",
                (uid, email, 1 if is_admin else 0),
            )
        conn.commit()
    return uid


def _delete_user(uid: str, oid: str = "") -> None:
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            if oid:
                cur.execute("DELETE FROM org_memberships WHERE org_id = %s", (oid,))
                cur.execute("DELETE FROM orgs WHERE id = %s", (oid,))
            cur.execute("DELETE FROM users WHERE id = %s", (uid,))
        conn.commit()


@pytest.fixture
def viewer_user():
    """Член org с ролью viewer (без права уровня админки)."""
    marker = uuid.uuid4().hex[:10]
    uid = _insert_user(f"apidocs_viewer_{marker}@local")
    org = create_org_record(f"ApiDocs Org {marker}", created_by=uid)
    oid = str(org.get("id") or "")
    upsert_org_membership(oid, uid, "viewer")
    token = create_access_token(uid)
    yield {"token": token, "oid": oid, "uid": uid}
    _delete_user(uid, oid)


def _user_with_role(role: str):
    marker = uuid.uuid4().hex[:10]
    uid = _insert_user(f"apidocs_{role}_{marker}@local")
    org = create_org_record(f"ApiDocs Org {marker}", created_by=uid)
    oid = str(org.get("id") or "")
    upsert_org_membership(oid, uid, role)
    return {"token": create_access_token(uid), "oid": oid, "uid": uid}


@pytest.fixture
def client():
    return TestClient(app)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ------------------------------------------------------------------ 401
def test_docs_401_without_token(client):
    for path in DOCS_PATHS:
        resp = client.get(path)
        assert resp.status_code == 401, f"{path}: ожидали 401, получили {resp.status_code}"


# ------------------------------------------------------------------ 403
def test_docs_403_for_viewer(client, viewer_user):
    for path in DOCS_PATHS:
        resp = client.get(path, headers=_auth(viewer_user["token"]))
        assert resp.status_code == 403, f"{path}: viewer должен получить 403, получил {resp.status_code}"


# ------------------------------------------------------------------ 200 по ролям
@pytest.mark.parametrize("role", ["org_owner", "org_admin", "auditor"])
def test_docs_200_for_admin_level_roles(client, role):
    u = _user_with_role(role)
    try:
        for path in DOCS_PATHS:
            resp = client.get(path, headers=_auth(u["token"]))
            assert resp.status_code == 200, f"{path}: {role} должен получить 200, получил {resp.status_code}"
    finally:
        _delete_user(u["uid"], u["oid"])


def test_docs_200_for_platform_admin(client):
    uid = _insert_user(f"apidocs_admin_{uuid.uuid4().hex[:10]}@local", is_admin=True)
    try:
        token = create_access_token(uid)
        for path in DOCS_PATHS:
            resp = client.get(path, headers=_auth(token))
            assert resp.status_code == 200, f"{path}: platform admin должен получить 200, получил {resp.status_code}"
    finally:
        _delete_user(uid)


# ------------------------------------------------------------------ контент
def test_docs_html_and_openapi_json_valid(client):
    u = _user_with_role("org_owner")
    try:
        html = client.get("/api/docs", headers=_auth(u["token"]))
        assert html.status_code == 200
        assert "swagger-ui" in html.text.lower(), "Swagger UI HTML"
        redoc = client.get("/api/redoc", headers=_auth(u["token"]))
        assert redoc.status_code == 200
        assert "redoc" in redoc.text.lower(), "ReDoc HTML"
        spec = client.get("/api/openapi.json", headers=_auth(u["token"]))
        assert spec.status_code == 200
        body = spec.json()
        assert isinstance(body.get("paths"), dict) and len(body["paths"]) > 0
        # контракт не изменился: docs-ручки не попадают в спеку
        for p in DOCS_PATHS:
            assert p not in body["paths"], f"{p} не должна быть в openapi.json (include_in_schema=False)"
    finally:
        _delete_user(u["uid"], u["oid"])
