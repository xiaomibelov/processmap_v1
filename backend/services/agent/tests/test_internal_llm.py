"""AGENT-SVC: контракт internal LLM API (/internal/llm/complete|complete_cached).

Ответ — поле-в-поле как gateway.complete/complete_cached; авторизация —
X-Internal-Token == AGENT_SVC_INTERNAL_TOKEN (не задан/не совпал → 401).
"""
from __future__ import annotations

import os
import sys
from unittest import mock

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import app

INTERNAL_TOKEN = "test-internal-token"  # conftest: AGENT_SVC_INTERNAL_TOKEN default

_GW_RESULT = {
    "ok": True,
    "status": "ok",
    "text": "ответ llm",
    "usage": {"prompt_tokens": 10, "completion_tokens": 5},
    "provider_id": "prov_1",
    "model": "deepseek-chat",
    "prompt_version": 3,
    "fallback": False,
    "cached": False,
    "latency_ms": 42,
}


@pytest.fixture
def client():
    return TestClient(app)


def _headers(token: str = INTERNAL_TOKEN):
    return {"X-Internal-Token": token}


def test_complete_requires_token(client):
    assert client.post("/internal/llm/complete", json={"feature": "f"}).status_code == 401
    assert client.post("/internal/llm/complete", json={"feature": "f"}, headers=_headers("wrong")).status_code == 401


def test_complete_401_when_env_token_unset(client, monkeypatch):
    monkeypatch.delenv("AGENT_SVC_INTERNAL_TOKEN", raising=False)
    r = client.post("/internal/llm/complete", json={"feature": "f"}, headers=_headers())
    assert r.status_code == 401


def test_complete_field_by_field(client):
    with mock.patch("gateway.gateway.complete", return_value=dict(_GW_RESULT)) as comp:
        r = client.post(
            "/internal/llm/complete",
            headers=_headers(),
            json={
                "feature": "process_analysis",
                "payload": {"steps": []},
                "user_id": "u1",
                "project_id": "p1",
                "session_id": "s1",
                "org_id": "org_default",
                "max_tokens": 800,
                "timeout_sec": 30,
            },
        )
    assert r.status_code == 200, r.text
    assert r.json() == _GW_RESULT  # поле-в-поле, без трансформаций
    comp.assert_called_once()
    assert comp.call_args.args[0] == "process_analysis"
    assert comp.call_args.kwargs["max_tokens"] == 800
    assert comp.call_args.kwargs["org_id"] == "org_default"


def test_complete_cached_field_by_field(client):
    cached_result = dict(_GW_RESULT, cached=True, usage={"prompt_tokens": 0, "completion_tokens": 0})
    with mock.patch("gateway.gateway.complete_cached", return_value=cached_result) as cc:
        r = client.post(
            "/internal/llm/complete_cached",
            headers=_headers(),
            json={"feature": "schema_assistant", "cache_digest": "d" * 32, "payload": {"a": 1}},
        )
    assert r.status_code == 200, r.text
    assert r.json() == cached_result
    cc.assert_called_once()
    assert cc.call_args.args[0] == "schema_assistant"
    assert cc.call_args.args[1] == "d" * 32


def test_complete_cached_digest_reaches_service(client):
    """Bug C: digest schema_assistant доезжает до сервисного gateway и бьёт кэш."""
    first = dict(_GW_RESULT, cached=False)
    second = dict(_GW_RESULT, cached=True, usage={"prompt_tokens": 0, "completion_tokens": 0})
    with mock.patch("gateway.gateway.complete_cached", side_effect=[first, second]) as cc:
        r1 = client.post(
            "/internal/llm/complete_cached",
            headers=_headers(),
            json={"feature": "schema_assistant", "cache_digest": "digest-abc", "payload": {"a": 1}},
        )
        r2 = client.post(
            "/internal/llm/complete_cached",
            headers=_headers(),
            json={"feature": "schema_assistant", "cache_digest": "digest-abc", "payload": {"a": 1}},
        )
    assert r1.status_code == 200 and r1.json()["cached"] is False
    assert r2.status_code == 200 and r2.json()["cached"] is True
    assert r2.json()["usage"] == {"prompt_tokens": 0, "completion_tokens": 0}
    assert cc.call_count == 2
    assert cc.call_args.args[1] == "digest-abc"


def test_complete_error_status_passthrough(client):
    err = {"ok": False, "status": "no_provider", "error": "no enabled LLM providers with api key", "latency_ms": 1}
    with mock.patch("gateway.gateway.complete", return_value=err):
        r = client.post("/internal/llm/complete", headers=_headers(), json={"feature": "f"})
    assert r.status_code == 200, r.text  # честный статус наружу, НЕ 500
    assert r.json() == err


def test_complete_propagates_json_mode_and_prompt_override(client):
    """Монолитный llm_internal_client шлёт json_mode и prompt_override в agent-сервис."""
    with mock.patch("gateway.gateway.complete", return_value=dict(_GW_RESULT)) as comp:
        r = client.post(
            "/internal/llm/complete",
            headers=_headers(),
            json={
                "feature": "product_actions_suggest",
                "payload": {"steps": []},
                "json_mode": True,
                "prompt_override": {"template": "return only json: {input}"},
            },
        )
    assert r.status_code == 200, r.text
    assert comp.call_args.kwargs["json_mode"] is True
    assert comp.call_args.kwargs["prompt_override"] == {"template": "return only json: {input}"}
