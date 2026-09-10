"""S1 (llm-agent-audit-v1): инфра-детали ошибок LLM не утекают в ответ пользователю.

Утечка: backend/app/ai/gateway.py формировал last_error как
'{provider}: {exc.__class__.__name__}: {exc}', а requests.HTTPError содержит
'for url: https://<internal-host>/<router-path>'. Текст пробрасывался через
agent-чат и LLM3 endpoints наружу. Эти тесты провоцируют 403/таймаут upstream
и требуют generic-текст без URL/host/пути роутера.

Паттерн: TestClient + изолированная SQLite из conftest, LLM-хелперы замоканы.
"""
from __future__ import annotations

import json
import os
import sys
import uuid
from unittest import mock

import pytest
import requests
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.ai import llm_store  # noqa: E402
from app.ai.error_sanitize import GENERIC_LLM_ERROR  # noqa: E402
from app.ai import gateway  # noqa: E402
from app.ai import llm_internal_client  # noqa: E402
from app.auth import create_access_token, create_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Node  # noqa: E402
from app.repositories import session_repo  # noqa: E402
from app.storage import _db_path, get_default_org_id, get_storage  # noqa: E402

# SQLite-совместимые копии таблиц миграции 012+016 (паттерн
# test_llm_provider_resolution.py): conftest даёт каждому тесту свежий temp-DB,
# llm_* таблицы в него не входят — создаём локально.
_LLM_SQLITE_DDL = """
CREATE TABLE IF NOT EXISTS llm_providers (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'org_default',
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 100,
    enabled BOOLEAN NOT NULL DEFAULT true,
    capabilities TEXT NOT NULL DEFAULT '{}',
    created_by TEXT,
    created_at BIGINT,
    updated_by TEXT,
    updated_at BIGINT
);
CREATE TABLE IF NOT EXISTS llm_prompts (
    id TEXT PRIMARY KEY,
    feature TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    system TEXT NOT NULL DEFAULT '',
    template TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    max_tokens INTEGER NOT NULL DEFAULT 2000,
    model_class TEXT NOT NULL DEFAULT 'primary',
    updated_by TEXT,
    updated_at BIGINT
);
CREATE TABLE IF NOT EXISTS llm_feature_flags (
    feature TEXT PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT true,
    daily_token_limit INTEGER NOT NULL DEFAULT 200000,
    updated_by TEXT,
    updated_at BIGINT
);
CREATE TABLE IF NOT EXISTS llm_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id TEXT,
    feature TEXT NOT NULL,
    model TEXT,
    provider_id TEXT,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    cached INTEGER NOT NULL DEFAULT 0,
    cost_usd NUMERIC NOT NULL DEFAULT 0,
    user_id TEXT,
    project_id TEXT,
    session_id TEXT,
    latency_ms INTEGER,
    status TEXT NOT NULL DEFAULT 'ok',
    ts BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS llm_models (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'org_default',
    provider TEXT,
    model_name TEXT NOT NULL,
    display_name TEXT,
    enabled BOOLEAN NOT NULL DEFAULT true,
    is_default BOOLEAN NOT NULL DEFAULT false,
    params TEXT NOT NULL DEFAULT '{}',
    created_by TEXT,
    created_at BIGINT,
    updated_by TEXT,
    updated_at BIGINT
);
CREATE TABLE IF NOT EXISTS llm_feature_models (
    feature TEXT NOT NULL,
    org_id TEXT NOT NULL DEFAULT 'org_default',
    model_id TEXT NOT NULL,
    updated_by TEXT,
    updated_at BIGINT,
    PRIMARY KEY (feature, org_id)
);
"""


@pytest.fixture(autouse=True)
def _llm_tables():
    import sqlite3

    with sqlite3.connect(str(_db_path())) as con:
        con.executescript(_LLM_SQLITE_DDL)
        con.commit()
    yield

INTERNAL_ROUTER_URL = "https://vvchat.vkusvill.ru/red-mad-router/v1/chat/completions"
HTTP_403_WITH_URL = f"403 Client Error: Forbidden for url: {INTERNAL_ROUTER_URL}"
READ_TIMEOUT_WITH_HOST = (
    "HTTPSConnectionPool(host='vvchat.vkusvill.ru', port=443): Read timed out. (read timeout=30)"
)

# Известные инфра-строки, которые не должны встречаться в пользовательском ответе.
INFRA_FRAGMENTS = [
    "vvchat.vkusvill.ru",
    "red-mad-router",
    "http://",
    "https://",
    "/v1/chat/completions",
    "api.deepseek.com",
]


def _assert_no_infra(text: str, where: str) -> None:
    for frag in INFRA_FRAGMENTS:
        assert frag not in text, f"{where}: утекла инфра-строка {frag!r} в {text!r}"


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def admin_user():
    email = f"llm_san_{uuid.uuid4().hex[:8]}@local"
    yield create_user(email, "password", is_admin=True)


@pytest.fixture
def admin_token(admin_user):
    return create_access_token(admin_user["id"])


@pytest.fixture
def session_id(admin_user):
    return session_repo.create(
        title="llm sanitize test",
        user_id=admin_user["id"],
        is_admin=True,
        org_id=get_default_org_id(),
    )


@pytest.fixture
def router_provider():
    row = llm_store.create_provider(
        org_id="org_default",
        name=f"sani-{uuid.uuid4().hex[:6]}",
        base_url="https://vvchat.vkusvill.ru/red-mad-router/v1",
        model="deepseek-chat",
        api_key="sk-test-not-a-real-key",
    )
    yield row
    try:
        llm_store.delete_provider(row["id"])
    except Exception:
        pass


def _auth(token: str):
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------- gateway

def test_gateway_http_error_sanitized(router_provider):
    """RED: 403 upstream с URL роутера → пользователю generic-текст, не URL."""
    with mock.patch.object(
        gateway, "_deepseek_chat_request",
        side_effect=requests.exceptions.HTTPError(HTTP_403_WITH_URL),
    ):
        result = gateway.complete(f"sani_{uuid.uuid4().hex[:8]}", {"input": "ping"})
    assert result.get("ok") is False
    assert result.get("status") == "error"
    assert result.get("error") == GENERIC_LLM_ERROR
    _assert_no_infra(str(result.get("error") or ""), "gateway.error")


def test_gateway_timeout_error_sanitized(router_provider):
    """RED: таймаут с host='…' в тексте исключения → generic-текст."""
    with mock.patch.object(
        gateway, "_deepseek_chat_request",
        side_effect=requests.exceptions.ReadTimeout(READ_TIMEOUT_WITH_HOST),
    ):
        result = gateway.complete(f"sani_{uuid.uuid4().hex[:8]}", {"input": "ping"})
    assert result.get("status") == "error"
    assert result.get("error") == GENERIC_LLM_ERROR
    _assert_no_infra(str(result.get("error") or ""), "gateway.error")


def test_gateway_non_error_statuses_unchanged():
    """Контракт: no_provider без вызова upstream — текст статуса сохраняется."""
    with mock.patch.object(gateway, "_provider_chain", return_value=[]), \
         mock.patch.object(gateway.llm_store, "any_enabled_provider", return_value=False):
        result = gateway.complete(f"sani_{uuid.uuid4().hex[:8]}", {"input": "ping"})
    assert result.get("status") == "no_provider"
    assert result.get("error") == "no enabled LLM providers with api key"


# ------------------------------------------------------- llm_internal_client

def test_internal_client_connectivity_error_sanitized():
    """RED: недоступность agent-svc → generic-текст, не детали httpx/URL."""
    import httpx

    old_url = os.environ.get("AGENT_SVC_URL")
    os.environ["AGENT_SVC_URL"] = "http://agent-svc-internal:8000"
    try:
        with mock.patch.object(
            httpx, "post",
            side_effect=httpx.ConnectError("[Errno 111] Connection refused"),
        ):
            result = llm_internal_client.complete("some_feature", {"input": "x"})
    finally:
        if old_url is None:
            os.environ.pop("AGENT_SVC_URL", None)
        else:
            os.environ["AGENT_SVC_URL"] = old_url
    assert result.get("ok") is False
    assert result.get("status") == "error"
    assert result.get("error") == GENERIC_LLM_ERROR
    _assert_no_infra(str(result), "llm_internal_client")


# ------------------------------------------------------- agent chat (API)

def test_chat_endpoint_error_sanitized(client, admin_token, session_id):
    """RED: agent-чат не прокидывает текст провайдерской ошибки наружу."""
    leak = f"deepseek: HTTPError: {HTTP_403_WITH_URL}"
    with mock.patch("app.agent.chat.complete") as fake_complete:
        fake_complete.return_value = {
            "ok": False, "status": "error", "error": leak,
            "usage": {}, "provider_id": "p1", "model": "m",
        }
        r = client.post(
            f"/api/sessions/{session_id}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "hello"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is False and body["status"] == "error"
    assert body["error"] == GENERIC_LLM_ERROR
    assert body["message"] == f"[error] {GENERIC_LLM_ERROR}"
    _assert_no_infra(r.text, "agent/chat")


def test_chat_endpoint_disabled_status_unchanged(client, admin_token, session_id):
    """Контракт: статус disabled без изменений (не 'error' → не санитизируем)."""
    with mock.patch("app.agent.chat.complete") as fake_complete:
        fake_complete.return_value = {"ok": False, "status": "disabled", "error": "feature disabled"}
        r = client.post(
            f"/api/sessions/{session_id}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "hello"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "disabled"
    assert body["error"] == "feature disabled"


# --------------------------------------------------- LLM3 schema_assistant

def test_schema_assistant_error_sanitized(client, admin_token, session_id):
    """RED: LLM3 suggest-next не отдаёт URL upstream при сбое цепочки."""
    leak = f"deepseek: HTTPError: {HTTP_403_WITH_URL}"
    with mock.patch("app.ai.schema_assistant.complete") as fake_complete, \
         mock.patch("app.ai.schema_assistant.complete_cached") as fake_cached, \
         mock.patch("app.ai.schema_assistant.load_catalog_from_db", return_value={}), \
         mock.patch("app.ai.schema_assistant.build_process_projection", return_value={"steps": [], "edges": []}):
        fake_complete.return_value = {
            "ok": False, "status": "error", "error": leak,
            "usage": {}, "provider_id": "p1", "model": "m",
        }
        fake_cached.return_value = fake_complete.return_value
        r = client.post(
            f"/api/sessions/{session_id}/llm/suggest-next",
            headers=_auth(admin_token),
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is False and body["status"] == "error"
    assert body["error"] == GENERIC_LLM_ERROR
    _assert_no_infra(r.text, "llm/suggest-next")


# ------------------------------------------------------- process_analysis

def test_process_analysis_error_sanitized(client, admin_token, session_id):
    """RED: process-analysis не отдаёт URL upstream при сбое цепочки."""
    leak = f"deepseek: HTTPError: {HTTP_403_WITH_URL}"
    with mock.patch("app.ai.process_analysis.complete") as fake_complete, \
         mock.patch("app.ai.process_analysis.complete_cached") as fake_cached:
        fake_complete.return_value = {
            "ok": False, "status": "error", "error": leak,
            "usage": {}, "provider_id": "p1", "model": "m",
        }
        fake_cached.return_value = fake_complete.return_value
        r = client.post(
            f"/api/sessions/{session_id}/llm/analysis",
            headers=_auth(admin_token),
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is False and body["status"] == "error"
    assert body["error"] == GENERIC_LLM_ERROR
    _assert_no_infra(r.text, "llm/analysis")


# ------------------------------------------- ai/questions (R1, review S1)

_LLM_SETTINGS = {
    "api_key": "sk-test-not-a-real-key",
    "base_url": "https://vvchat.vkusvill.ru/red-mad-router/v1",
    "model": "deepseek-chat",
}


def test_ai_questions_error_sanitized(client, admin_token, session_id):
    """RED: POST /api/sessions/{id}/ai/questions (strict) не отдаёт URL upstream."""
    leak = f"403 Client Error: Forbidden for url: {INTERNAL_ROUTER_URL}"
    with mock.patch("app._legacy_main.load_llm_settings", return_value=dict(_LLM_SETTINGS)), \
         mock.patch("app.ai.deepseek_questions.generate_llm_questions",
                    side_effect=requests.exceptions.HTTPError(leak)):
        r = client.post(
            f"/api/sessions/{session_id}/ai/questions",
            headers=_auth(admin_token),
            json={"mode": "strict", "limit": 5},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("error") == GENERIC_LLM_ERROR
    _assert_no_infra(r.text, "ai/questions")


def test_ai_questions_node_step_error_sanitized(client, admin_token, session_id):
    """RED: тот же endpoint, ветка node_step (:510) — generate_llm_questions_for_node."""
    st = get_storage()
    s = st.load(session_id, org_id=get_default_org_id(), is_admin=True)
    s.nodes = [Node(id="n1", title="Шаг 1")]
    st.save(s)
    leak = f"403 Client Error: Forbidden for url: {INTERNAL_ROUTER_URL}"
    with mock.patch("app._legacy_main.load_llm_settings", return_value=dict(_LLM_SETTINGS)), \
         mock.patch("app.ai.deepseek_questions.generate_llm_questions_for_node",
                    side_effect=requests.exceptions.HTTPError(leak)):
        r = client.post(
            f"/api/sessions/{session_id}/ai/questions",
            headers=_auth(admin_token),
            json={"mode": "node_step", "node_id": "n1"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("error") == GENERIC_LLM_ERROR
    _assert_no_infra(r.text, "ai/questions node_step")


# ------------------------------ /api/llm/session-title/questions (R2, review)

def test_session_title_questions_error_sanitized():
    """RED: POST /api/llm/session-title/questions (system-router) не отдаёт URL upstream."""
    from app._legacy_main import SessionTitleQuestionsIn, llm_session_title_questions

    leak = f"403 Client Error: Forbidden for url: {INTERNAL_ROUTER_URL}"
    with mock.patch("app._legacy_main.load_llm_settings", return_value=dict(_LLM_SETTINGS)), \
         mock.patch("app.ai.deepseek_questions.generate_session_title_questions",
                    side_effect=requests.exceptions.HTTPError(leak)):
        res = llm_session_title_questions(SessionTitleQuestionsIn(title="Тестовый процесс"))
    assert res.get("error") == GENERIC_LLM_ERROR
    _assert_no_infra(json.dumps(res, ensure_ascii=False), "session-title/questions")


# ------------------------------------------------- R3: сырой last_error в логах

def test_gateway_logs_raw_error(caplog, router_provider):
    """RED (R3): полный отказ цепочки логирует сырой last_error с деталями."""
    with mock.patch.object(
        gateway, "_deepseek_chat_request",
        side_effect=requests.exceptions.HTTPError(HTTP_403_WITH_URL),
    ):
        with caplog.at_level("WARNING"):
            result = gateway.complete(f"sani_{uuid.uuid4().hex[:8]}", {"input": "ping"})
    assert result.get("status") == "error"
    assert INTERNAL_ROUTER_URL in caplog.text, "сырый last_error должен попадать в логи"
