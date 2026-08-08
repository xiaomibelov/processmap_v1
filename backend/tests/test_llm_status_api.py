"""LLM4 — контракт-тесты GET /api/llm/status (вкладка «Статус LLM» панели PROCESSMAN).

Паттерн: реальная dev-БД (_pg_env) + TestClient, как test_admin_llm_api.py.

Покрытие:
- RBAC: 401 без токена, 404 для не-члена организации, 200 для viewer (роль viewer+);
- shape: {configured, quota:{used, limit}} — ТОЛЬКО эти ключи; секретов/имён
  провайдеров/base_url/model в ответе нет;
- configured = enabled провайдер с непустым ключом (enabled_providers_with_key,
  а НЕ any_enabled_provider — провайдер без ключа не делает статус configured);
- quota.used = сумма токенов по фиче analysis за 24ч;
- quota.limit = daily_token_limit фичефлага analysis (дефолт 200000 при отсутствии флага).

Запуск — из корня репо: python -m pytest backend/tests/test_llm_status_api.py -q
"""
import os
import sys
import time
import uuid
from unittest import mock

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

DATABASE_URL = os.environ.get("E2_TEST_DATABASE_URL", "postgresql://fpc:fpc@localhost:5432/processmap")

from backend.app.main import app  # noqa: E402
from backend.app.auth import create_access_token  # noqa: E402
from backend.app.ai import llm_store  # noqa: E402
from backend.app.storage import create_org_record, upsert_org_membership  # noqa: E402

STATUS_SHAPE = {"configured": bool, "quota": dict}
QUOTA_SHAPE = {"used": int, "limit": int}


def _assert_shape(item: dict, shape: dict, where: str) -> None:
    assert set(item.keys()) == set(shape.keys()), (
        f"{where}: ключи {sorted(item.keys())} != ожидаемые {sorted(shape.keys())}"
    )
    for key, types in shape.items():
        if not isinstance(types, tuple):
            types = (types,)
        assert isinstance(item[key], types), (
            f"{where}.{key}: тип {type(item[key]).__name__} не из {types} "
            f"(значение: {str(item[key])[:80]})"
        )


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
    """Создаёт org + члена (role viewer); возвращает (token, oid, uid, marker)."""
    marker = uuid.uuid4().hex[:10]
    uid = _insert_user(f"llm4_status_{marker}@local")
    org = create_org_record(f"LLM4 Status Org {marker}", created_by=uid)
    oid = str(org.get("id") or "")
    upsert_org_membership(oid, uid, "viewer")
    token = create_access_token(uid)
    yield {"token": token, "oid": oid, "uid": uid, "marker": marker}
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM org_memberships WHERE org_id = %s", (oid,))
            cur.execute("DELETE FROM llm_providers WHERE org_id = %s", (oid,))
            cur.execute("DELETE FROM llm_usage WHERE org_id = %s", (oid,))
            cur.execute("DELETE FROM orgs WHERE id = %s", (oid,))
            cur.execute("DELETE FROM users WHERE id = %s", (uid,))
        conn.commit()


@pytest.fixture
def foreign_user():
    """Пользователь БЕЗ членства в активной org (org_default) — ожидаем 404."""
    uid = _insert_user(f"llm4_status_foreign_{uuid.uuid4().hex[:10]}@local")
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


def _insert_usage(oid: str, *, prompt: int, completion: int, feature: str = "analysis"):
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO llm_usage"
                " (org_id, feature, model, prompt_tokens, completion_tokens, cached, status, ts)"
                " VALUES (%s, %s, 'test-model', %s, %s, false, 'ok', %s)",
                (oid, feature, prompt, completion, int(time.time())),
            )
        conn.commit()


# ------------------------------------------------------------------ RBAC

def test_status_401_without_token(client):
    assert client.get("/api/llm/status").status_code == 401


def test_status_404_foreign_user(client, foreign_user):
    resp = client.get("/api/llm/status", headers=_auth(foreign_user))
    assert resp.status_code == 404, resp.text


def test_status_200_viewer_shape(client, org_and_user):
    """viewer+ — 200; shape ровно {configured, quota:{used, limit}}; без секретов."""
    resp = client.get("/api/llm/status", headers=_auth(org_and_user["token"]))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    _assert_shape(body, STATUS_SHAPE, "status")
    _assert_shape(body["quota"], QUOTA_SHAPE, "status.quota")
    assert isinstance(body["configured"], bool)
    # имена провайдеров/секреты не должны просочиться в сыром тексте
    for needle in ("api_key", "base_url", "deepseek", "sk-", org_and_user["marker"]):
        assert needle not in resp.text, f"в ответе не должно быть {needle!r}"


# ------------------------------------------------------------- configured

def test_configured_false_without_enabled_provider(client, org_and_user):
    resp = client.get("/api/llm/status", headers=_auth(org_and_user["token"]))
    assert resp.status_code == 200
    assert resp.json()["configured"] is False


def test_configured_false_provider_without_key(client, org_and_user):
    """Enabled провайдер БЕЗ ключа — НЕ configured (enabled_providers_with_key)."""
    oid = org_and_user["oid"]
    llm_store.create_provider(
        org_id=oid, name=f"llm4-{org_and_user['marker']}-nokey",
        base_url="https://x.example", model="m", api_key="", enabled=True,
    )
    resp = client.get("/api/llm/status", headers=_auth(org_and_user["token"]))
    assert resp.status_code == 200
    assert resp.json()["configured"] is False


def test_configured_true_provider_with_key(client, org_and_user):
    oid = org_and_user["oid"]
    llm_store.create_provider(
        org_id=oid, name=f"llm4-{org_and_user['marker']}-key",
        base_url="https://api.deepseek.com", model="deepseek-chat",
        api_key="sk-supersecret-llm4-test", enabled=True,
    )
    resp = client.get("/api/llm/status", headers=_auth(org_and_user["token"]))
    assert resp.status_code == 200
    body = resp.json()
    assert body["configured"] is True
    assert "sk-supersecret-llm4-test" not in resp.text
    assert "deepseek-chat" not in resp.text


def test_configured_true_disabled_provider_with_key_ignored(client, org_and_user):
    """Выключенный провайдер с ключом не делает configured (only enabled)."""
    oid = org_and_user["oid"]
    llm_store.create_provider(
        org_id=oid, name=f"llm4-{org_and_user['marker']}-disabled",
        base_url="https://y.example", model="m",
        api_key="sk-zzz", enabled=False,
    )
    resp = client.get("/api/llm/status", headers=_auth(org_and_user["token"]))
    assert resp.status_code == 200
    assert resp.json()["configured"] is False


# ------------------------------------------------------------------ quota

def test_quota_used_24h_only_analysis(client, org_and_user):
    oid = org_and_user["oid"]
    _insert_usage(oid, prompt=100, completion=50, feature="analysis")
    _insert_usage(oid, prompt=1000, completion=2000, feature="schema_assistant")
    resp = client.get("/api/llm/status", headers=_auth(org_and_user["token"]))
    assert resp.status_code == 200
    body = resp.json()
    assert body["quota"]["used"] == 150, "used = токены только по фиче analysis"
    assert body["quota"]["limit"] == 200000, "дефолтный лимит при отсутствии фичефлага"


def test_quota_used_zero_without_usage(client, org_and_user):
    resp = client.get("/api/llm/status", headers=_auth(org_and_user["token"]))
    assert resp.status_code == 200
    assert resp.json()["quota"]["used"] == 0


def test_quota_limit_from_feature_flag(client, org_and_user):
    llm_store.patch_feature_flag("analysis", daily_token_limit=987654, actor="llm4-test")
    try:
        resp = client.get("/api/llm/status", headers=_auth(org_and_user["token"]))
        assert resp.status_code == 200
        assert resp.json()["quota"]["limit"] == 987654
    finally:
        llm_store.patch_feature_flag("analysis", daily_token_limit=200000, actor="llm4-test")


def test_quota_limit_default_when_flag_missing(client, org_and_user):
    """Нет фичефлага analysis — дефолт 200000 (константа роутера)."""
    with mock.patch.object(llm_store, "get_feature_flag", return_value=None):
        resp = client.get("/api/llm/status", headers=_auth(org_and_user["token"]))
    assert resp.status_code == 200
    assert resp.json()["quota"]["limit"] == 200000
