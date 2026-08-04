"""LLM0 — shape/контракт-тесты admin API /api/admin/llm/* (снапшоты роутов).

Паттерн: реальная dev-БД (_pg_env) + TestClient, как test_api_contracts.py.

Покрытие гейтов:
- гейт 1 (маскирование ключа): GET/PATCH/POST providers НЕ содержат api_key —
  ни в shape, ни в сыром JSON (assert по тексту ответа);
- гейт 2 (версионирование промтов с откатом): draft→activate→archive + rollback, 409;
- гейт 5 (снапшоты роутов): точные наборы ключей items/totals/flags.

Запуск — из корня репо: python -m pytest backend/tests/test_admin_llm_api.py -q
"""
import json
import os
import sys
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
from backend.app.routers import admin_llm  # noqa: E402

SECRET_KEY_VALUE = "sk-supersecret-abcdef1234567890"

PROVIDER_SHAPE = {
    "id": str, "org_id": str, "name": str, "base_url": str, "model": str,
    "priority": int, "enabled": bool, "has_api_key": bool, "key_last4": str,
    "created_by": str, "created_at": int, "updated_by": str, "updated_at": int,
}
PROMPT_SHAPE = {
    "id": str, "feature": str, "version": int, "system": str, "template": str,
    "status": str, "max_tokens": int, "model_class": str, "updated_by": str, "updated_at": int,
}
FEATURE_SHAPE = {
    "feature": str, "enabled": bool, "daily_token_limit": int,
    "used_tokens_24h": int, "updated_by": str, "updated_at": int,
}
USAGE_ITEM_SHAPE = {
    "day": str, "feature": str, "model": str, "calls": int,
    "prompt_tokens": int, "completion_tokens": int, "cached_hits": int, "errors": int,
}
USAGE_TOTALS_SHAPE = {
    "calls": int, "prompt_tokens": int, "completion_tokens": int, "cached_hits": int, "errors": int,
}


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


def _insert_user(*, is_admin: bool) -> str:
    import psycopg

    uid = uuid.uuid4().hex
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO users (id, email, password_hash, is_active, is_admin, role, created_at, updated_at) "
                "VALUES (%s, %s, '', 1, %s, 'analyst', 0, 0)",
                (uid, f"llm0_{uid[:8]}@local", 1 if is_admin else 0),
            )
        conn.commit()
    return uid


@pytest.fixture
def admin_token():
    import psycopg

    uid = _insert_user(is_admin=True)
    yield create_access_token(uid)
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM users WHERE id = %s", (uid,))
        conn.commit()


@pytest.fixture
def user_token():
    import psycopg

    uid = _insert_user(is_admin=False)
    yield create_access_token(uid)
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM users WHERE id = %s", (uid,))
        conn.commit()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def sandbox():
    """Уборка тестовых строк llm_* после каждого теста."""
    import psycopg

    marker = uuid.uuid4().hex[:8]
    yield {"feature": f"test_api_{marker}", "name": f"llm0-prov-{marker}"}
    like_p = f"test_api_{marker}%"
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM llm_providers WHERE name LIKE %s", (f"llm0-prov-{marker}%",))
            cur.execute("DELETE FROM llm_prompts WHERE feature LIKE %s", (like_p,))
            cur.execute("DELETE FROM llm_feature_flags WHERE feature LIKE %s", (like_p,))
            cur.execute("DELETE FROM llm_usage WHERE feature LIKE %s", (like_p,))
        conn.commit()


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ------------------------------------------------------------------ RBAC

def test_admin_gate_401_403(client, admin_token, user_token):
    assert client.get("/api/admin/llm/providers").status_code == 401
    assert client.get("/api/admin/llm/providers", headers=_auth(user_token)).status_code == 403
    assert client.get("/api/admin/llm/usage", headers=_auth(user_token)).status_code == 403
    assert client.patch("/api/admin/llm/features/process_analysis",
                        headers=_auth(user_token), json={"enabled": False}).status_code == 403
    resp = client.get("/api/admin/llm/providers", headers=_auth(admin_token))
    assert resp.status_code == 200 and resp.json()["ok"] is True


# -------------------------------------------------------------- providers

def test_providers_crud_and_key_masking(client, admin_token, sandbox):
    """Гейт 1: api_key нигде в ответах; только has_api_key + key_last4."""
    # create
    resp = client.post("/api/admin/llm/providers", headers=_auth(admin_token), json={
        "name": sandbox["name"], "base_url": "https://api.deepseek.com",
        "model": "deepseek-chat", "priority": 42, "api_key": SECRET_KEY_VALUE,
    })
    assert resp.status_code == 201
    body_text = resp.text
    item = resp.json()["item"]
    _assert_shape(item, PROVIDER_SHAPE, "provider.item")
    assert "api_key" not in item
    assert item["has_api_key"] is True and item["key_last4"] == SECRET_KEY_VALUE[-4:]
    assert item["priority"] == 42
    assert SECRET_KEY_VALUE not in body_text, "ключ не должен утекать в сыром ответе"
    pid = item["id"]

    # list
    resp = client.get("/api/admin/llm/providers", headers=_auth(admin_token))
    assert SECRET_KEY_VALUE not in resp.text
    listed = [p for p in resp.json()["items"] if p["id"] == pid]
    assert len(listed) == 1
    _assert_shape(listed[0], PROVIDER_SHAPE, "provider.list")

    # patch (без api_key — ключ сохраняется; с api_key="" — очищается)
    resp = client.patch(f"/api/admin/llm/providers/{pid}", headers=_auth(admin_token),
                        json={"priority": 7, "enabled": False})
    assert resp.status_code == 200 and resp.json()["item"]["priority"] == 7
    assert resp.json()["item"]["enabled"] is False
    assert resp.json()["item"]["has_api_key"] is True, "ключ сохранён без передачи"
    resp = client.patch(f"/api/admin/llm/providers/{pid}", headers=_auth(admin_token),
                        json={"api_key": ""})
    assert resp.json()["item"]["has_api_key"] is False and resp.json()["item"]["key_last4"] == ""

    # 404 + delete
    assert client.patch("/api/admin/llm/providers/nope", headers=_auth(admin_token),
                        json={"priority": 1}).status_code == 404
    resp = client.delete(f"/api/admin/llm/providers/{pid}", headers=_auth(admin_token))
    assert resp.status_code == 200 and resp.json()["deleted"] is True
    assert client.delete(f"/api/admin/llm/providers/{pid}", headers=_auth(admin_token)).status_code == 404


def test_provider_validation_422(client, admin_token, sandbox):
    resp = client.post("/api/admin/llm/providers", headers=_auth(admin_token),
                       json={"name": "", "base_url": "", "model": ""})
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "validation_error"


def test_provider_test_call(client, admin_token, sandbox):
    row = llm_store.create_provider(org_id="org_default", name=sandbox["name"],
                                    base_url="https://api.deepseek.com", model="deepseek-chat",
                                    api_key=SECRET_KEY_VALUE)
    fake_resp = {"model": "deepseek-chat",
                 "choices": [{"message": {"content": "pong"}}],
                 "usage": {"prompt_tokens": 3, "completion_tokens": 1}}
    with mock.patch.object(admin_llm, "_deepseek_chat_request", return_value=fake_resp) as mocked:
        resp = client.post(f"/api/admin/llm/providers/{row['id']}/test", headers=_auth(admin_token))
    item = resp.json()["item"]
    assert resp.status_code == 200 and item["ok"] is True
    assert item["preview"] == "pong" and isinstance(item["latency_ms"], int)
    assert SECRET_KEY_VALUE not in resp.text
    assert mocked.call_args.kwargs["api_key"] == SECRET_KEY_VALUE, "ключ берётся из БД на бэке"

    # тест-вызов учитывается в llm_usage (виден в «Расходе»)
    import psycopg
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status, prompt_tokens, completion_tokens FROM llm_usage "
                "WHERE feature = 'admin_provider_test' AND provider_id = %s",
                (row["id"],),
            )
            usage_rows = cur.fetchall()
            cur.execute("DELETE FROM llm_usage WHERE feature = 'admin_provider_test' "
                        "AND provider_id = %s", (row["id"],))
        conn.commit()
    assert usage_rows == [("ok", 3, 1)], "тест-вызов записан в llm_usage с токенами"

    # ошибка провайдера — usage со status=error, не 500
    with mock.patch.object(admin_llm, "_deepseek_chat_request",
                           side_effect=RuntimeError("boom")):
        resp = client.post(f"/api/admin/llm/providers/{row['id']}/test", headers=_auth(admin_token))
    assert resp.status_code == 200 and resp.json()["item"]["ok"] is False

    # отключённый провайдер — честный статус, вызова нет
    llm_store.update_provider(row["id"], {"enabled": False})
    with mock.patch.object(admin_llm, "_deepseek_chat_request") as mocked2:
        resp = client.post(f"/api/admin/llm/providers/{row['id']}/test", headers=_auth(admin_token))
    assert resp.status_code == 200
    assert resp.json()["item"]["ok"] is False
    assert resp.json()["item"]["error"] == "provider is disabled"
    mocked2.assert_not_called()

    # без ключа — честная ошибка, не 500
    row2 = llm_store.create_provider(org_id="org_default", name=sandbox["name"] + "-nokey",
                                     base_url="https://x", model="m", api_key="")
    resp = client.post(f"/api/admin/llm/providers/{row2['id']}/test", headers=_auth(admin_token))
    assert resp.status_code == 200 and resp.json()["item"]["ok"] is False
    assert "api_key" in resp.json()["item"]["error"]
    assert client.post("/api/admin/llm/providers/nope/test", headers=_auth(admin_token)).status_code == 404


# ---------------------------------------------------------------- prompts

def test_prompts_versioning_activate_rollback(client, admin_token, sandbox):
    """Гейт 2: draft → activate (старая active → archive) → rollback."""
    feature = sandbox["feature"]
    r1 = client.post("/api/admin/llm/prompts", headers=_auth(admin_token),
                     json={"feature": feature, "system": "S1", "template": "T1", "max_tokens": 100})
    assert r1.status_code == 201
    v1 = r1.json()["item"]
    _assert_shape(v1, PROMPT_SHAPE, "prompt.v1")
    assert v1["version"] == 1 and v1["status"] == "draft"

    r2 = client.post("/api/admin/llm/prompts", headers=_auth(admin_token),
                     json={"feature": feature, "system": "S2", "template": "T2"})
    v2 = r2.json()["item"]
    assert v2["version"] == 2 and v2["status"] == "draft"

    # activate v1
    resp = client.post(f"/api/admin/llm/prompts/{v1['id']}/activate", headers=_auth(admin_token))
    assert resp.status_code == 200 and resp.json()["item"]["status"] == "active"
    assert resp.json()["archived_id"] == ""

    # activate v2 → v1 в archive
    resp = client.post(f"/api/admin/llm/prompts/{v2['id']}/activate", headers=_auth(admin_token))
    assert resp.status_code == 200 and resp.json()["archived_id"] == v1["id"]
    lst = client.get(f"/api/admin/llm/prompts?feature={feature}",
                     headers=_auth(admin_token)).json()
    by_id = {p["id"]: p for p in lst["items"]}
    assert by_id[v1["id"]]["status"] == "archive"
    assert by_id[v2["id"]]["status"] == "active"
    _assert_shape(by_id[v2["id"]], PROMPT_SHAPE, "prompt.listed")
    assert lst["page"]["total"] == 2

    # rollback → активна v1, v2 в archive
    resp = client.post(f"/api/admin/llm/prompts/{v2['id']}/rollback", headers=_auth(admin_token))
    assert resp.status_code == 200
    assert resp.json()["item"]["id"] == v1["id"] and resp.json()["item"]["status"] == "active"
    by_id = {p["id"]: p for p in client.get(
        f"/api/admin/llm/prompts?feature={feature}", headers=_auth(admin_token)).json()["items"]}
    assert by_id[v1["id"]]["status"] == "active" and by_id[v2["id"]]["status"] == "archive"

    # 404/409/422
    assert client.post("/api/admin/llm/prompts/nope/activate",
                       headers=_auth(admin_token)).status_code == 404
    empty_feature = feature + "_empty"
    r = client.post("/api/admin/llm/prompts", headers=_auth(admin_token),
                    json={"feature": empty_feature, "template": "x"})
    assert client.post(f"/api/admin/llm/prompts/{r.json()['item']['id']}/rollback",
                       headers=_auth(admin_token)).status_code == 409
    assert client.post("/api/admin/llm/prompts", headers=_auth(admin_token),
                       json={"feature": "", "template": "x"}).status_code == 422
    assert client.post("/api/admin/llm/prompts", headers=_auth(admin_token),
                       json={"feature": feature, "model_class": "lux"}).status_code == 422


# ---------------------------------------------------------------- features

def test_features_list_and_patch(client, admin_token, sandbox):
    resp = client.get("/api/admin/llm/features", headers=_auth(admin_token))
    assert resp.status_code == 200
    items = resp.json()["items"]
    seeded = {i["feature"] for i in items}
    assert {"process_analysis", "as_is_transform", "schema_assistant"} <= seeded
    for item in items:
        _assert_shape(item, FEATURE_SHAPE, "features.item")

    feature = sandbox["feature"]
    resp = client.patch(f"/api/admin/llm/features/{feature}", headers=_auth(admin_token),
                        json={"enabled": False, "daily_token_limit": 12345})
    assert resp.status_code == 200
    item = resp.json()["item"]
    assert item["enabled"] is False and item["daily_token_limit"] == 12345
    got = {i["feature"]: i for i in client.get("/api/admin/llm/features",
                                               headers=_auth(admin_token)).json()["items"]}
    assert got[feature]["enabled"] is False and got[feature]["used_tokens_24h"] == 0

    assert client.patch(f"/api/admin/llm/features/{feature}", headers=_auth(admin_token),
                        json={}).status_code == 422


# ------------------------------------------------------------------- usage

def test_usage_aggregate_shape_and_totals(client, admin_token, sandbox):
    """Гейт 5: снапшот shape items/totals; cached=0 токенов виден в агрегации."""
    feature = sandbox["feature"]
    now = 1890000000
    llm_store.record_usage(org_id="org_default", feature=feature, model="m1",
                           prompt_tokens=100, completion_tokens=50, ts=now)
    llm_store.record_usage(org_id="org_default", feature=feature, model="m1",
                           cached=True, ts=now)
    llm_store.record_usage(org_id="org_default", feature=feature, model="m1",
                           status="error", ts=now)
    resp = client.get(f"/api/admin/llm/usage?feature={feature}&from_ts={now - 3600}&to_ts={now + 3600}",
                      headers=_auth(admin_token))
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 1
    item = data["items"][0]
    _assert_shape(item, USAGE_ITEM_SHAPE, "usage.item")
    assert item["calls"] == 3 and item["prompt_tokens"] == 100 and item["completion_tokens"] == 50
    assert item["cached_hits"] == 1 and item["errors"] == 1
    _assert_shape(data["totals"], USAGE_TOTALS_SHAPE, "usage.totals")
    assert data["totals"]["calls"] == 3 and data["totals"]["cached_hits"] == 1


def test_no_secret_in_any_llm_endpoint(client, admin_token, sandbox):
    """Гейт 1 (сквозной): ключ не встречается ни в одном GET-эндпоинте."""
    row = llm_store.create_provider(org_id="org_default", name=sandbox["name"],
                                    base_url="https://api.deepseek.com", model="m",
                                    api_key=SECRET_KEY_VALUE)
    for url in ("/api/admin/llm/providers", "/api/admin/llm/features",
                "/api/admin/llm/prompts", "/api/admin/llm/usage"):
        resp = client.get(url, headers=_auth(admin_token))
        assert SECRET_KEY_VALUE not in resp.text, f"утечка ключа в {url}"
    assert json.dumps(client.get("/api/admin/llm/providers",
                                 headers=_auth(admin_token)).json()) .find(SECRET_KEY_VALUE[-4:]) >= 0
