"""LLM4 — контракт-тесты POST /api/llm/feedback (👍/👎 панели PROCESSMAN).

Паттерн: реальная dev-БД (_pg_env) + TestClient, как test_llm_status_api.py.

Покрытие:
- RBAC: 401 без токена, 404 для не-члена организации, 200 для viewer;
- feedback пишется в llm_usage БЕЗ обращения к LLM: feature=processman_feedback,
  status=feedback_up/feedback_down, токены 0;
- валидация: rating вне {up, down} → 422; секретов в ответе нет.

Запуск — из корня репо: python -m pytest backend/tests/test_llm_feedback_api.py -q
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


def _insert_user(email: str) -> str:
    import psycopg

    uid = uuid.uuid4().hex
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO users (id, email, password_hash, is_active, is_admin, role, created_at, updated_at) "
                "VALUES (%s, %s, '', 1, 0, 'analyst', 0, 0)",
                (uid, email),
            )
        conn.commit()
    return uid


@pytest.fixture
def org_and_user():
    marker = uuid.uuid4().hex[:10]
    uid = _insert_user(f"llm4_feedback_{marker}@local")
    org = create_org_record(f"LLM4 Feedback Org {marker}", created_by=uid)
    oid = str(org.get("id") or "")
    upsert_org_membership(oid, uid, "viewer")
    token = create_access_token(uid)
    yield {"token": token, "oid": oid, "uid": uid, "marker": marker}
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM org_memberships WHERE org_id = %s", (oid,))
            cur.execute("DELETE FROM llm_usage WHERE org_id = %s", (oid,))
            cur.execute("DELETE FROM orgs WHERE id = %s", (oid,))
            cur.execute("DELETE FROM users WHERE id = %s", (uid,))
        conn.commit()


@pytest.fixture
def foreign_user():
    uid = _insert_user(f"llm4_feedback_foreign_{uuid.uuid4().hex[:10]}@local")
    yield create_access_token(uid)
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM users WHERE id = %s", (uid,))
        conn.commit()


@pytest.fixture
def client():
    return TestClient(app)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _feedback_rows(oid: str):
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT feature, status, prompt_tokens, completion_tokens, session_id, user_id, model "
                "FROM llm_usage WHERE org_id = %s ORDER BY id",
                (oid,),
            )
            cols = ["feature", "status", "prompt_tokens", "completion_tokens", "session_id", "user_id", "model"]
            return [dict(zip(cols, r)) for r in cur.fetchall()]


# ------------------------------------------------------------------ RBAC

def test_feedback_401_without_token(client):
    resp = client.post("/api/llm/feedback", json={"rating": "up"})
    assert resp.status_code == 401


def test_feedback_404_foreign_user(client, foreign_user):
    resp = client.post("/api/llm/feedback", json={"rating": "up"}, headers=_auth(foreign_user))
    assert resp.status_code == 404, resp.text


# ------------------------------------------------------------------ запись

def test_feedback_up_recorded_zero_tokens(client, org_and_user):
    resp = client.post(
        "/api/llm/feedback",
        json={"rating": "up", "session_id": "sess123", "action": "suggest-next"},
        headers=_auth(org_and_user["token"]),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body == {"ok": True, "recorded": "feedback_up", "tokens": 0}
    rows = _feedback_rows(org_and_user["oid"])
    assert len(rows) == 1
    row = rows[0]
    assert row["feature"] == "processman_feedback"
    assert row["status"] == "feedback_up"
    assert row["prompt_tokens"] == 0 and row["completion_tokens"] == 0
    assert row["session_id"] == "sess123"
    assert row["user_id"] == org_and_user["uid"]
    assert row["model"] == "suggest-next", "контекст действия — в поле model для аналитики"


def test_feedback_down_recorded(client, org_and_user):
    resp = client.post(
        "/api/llm/feedback", json={"rating": "down"}, headers=_auth(org_and_user["token"]),
    )
    assert resp.status_code == 200
    rows = _feedback_rows(org_and_user["oid"])
    assert rows[-1]["status"] == "feedback_down"
    assert rows[-1]["prompt_tokens"] == 0 and rows[-1]["completion_tokens"] == 0


def test_feedback_invalid_rating_422(client, org_and_user):
    resp = client.post(
        "/api/llm/feedback", json={"rating": "meh"}, headers=_auth(org_and_user["token"]),
    )
    assert resp.status_code == 422, resp.text
    assert _feedback_rows(org_and_user["oid"]) == [], "при 422 запись не создаётся"


def test_feedback_no_secrets_no_llm_call(client, org_and_user):
    """Ответ не содержит секретов; эндпоинт не вызывает gateway (0 обращений к LLM)."""
    from backend.app.ai import gateway
    from unittest import mock

    with mock.patch.object(gateway, "complete", side_effect=AssertionError("LLM call forbidden")) as mocked:
        resp = client.post(
            "/api/llm/feedback", json={"rating": "up"}, headers=_auth(org_and_user["token"]),
        )
    assert resp.status_code == 200
    assert mocked.call_count == 0
    for needle in ("api_key", "base_url", "deepseek", "sk-"):
        assert needle not in resp.text, f"в ответе не должно быть {needle!r}"
