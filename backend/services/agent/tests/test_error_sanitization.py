"""S1 (llm-agent-audit-v1): инфра-детали ошибок LLM не утекают в ответ пользователю.

Сервисная копия backend/tests/test_llm_error_sanitization.py: gateway сервиса
(complete + complete_stream) и _gateway_error_out memory/chat не должны
отдавать URL/host upstream-роутера в пользовательском ответе.

Паттерн: изолированная SQLite (conftest.isolate_service_db), HTTP замокан.
"""
from __future__ import annotations

import json
import os
import sys
from unittest import mock

import pytest
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from gateway import gateway  # noqa: E402
from gateway.error_sanitize import GENERIC_LLM_ERROR  # noqa: E402
from memory import chat as memory_chat  # noqa: E402

INTERNAL_ROUTER_URL = "https://vvchat.vkusvill.ru/red-mad-router/v1/chat/completions"
HTTP_403_WITH_URL = f"403 Client Error: Forbidden for url: {INTERNAL_ROUTER_URL}"

INFRA_FRAGMENTS = [
    "vvchat.vkusvill.ru",
    "red-mad-router",
    "http://",
    "https://",
    "/v1/chat/completions",
]


def _assert_no_infra(text: str, where: str) -> None:
    for frag in INFRA_FRAGMENTS:
        assert frag not in text, f"{where}: утекла инфра-строка {frag!r} в {text!r}"


def _provider_dict(**kwargs):
    defaults = {
        "id": "llmprov_sani",
        "org_id": "org_default",
        "name": "sani-provider",
        "base_url": "https://vvchat.vkusvill.ru/red-mad-router/v1",
        "model": "deepseek-chat",
        "api_key": "sk-test-not-a-real-key",
        "priority": 10,
        "enabled": True,
        "capabilities": {},
    }
    defaults.update(kwargs)
    return defaults


def _seed_provider(monkeypatch=None):
    """Подменяем цепочку провайдеров одним тестовым (без записи в БД)."""
    patcher = mock.patch.object(
        gateway, "_provider_chain", return_value=[_provider_dict()],
    )
    patcher.start()
    return patcher


# ------------------------------------------------------------------ gateway

def test_gateway_complete_error_sanitized():
    """RED: 403 upstream с URL роутера → generic-текст, не URL."""
    patcher = _seed_provider()
    try:
        with mock.patch.object(
            gateway, "_deepseek_chat_request",
            side_effect=requests.exceptions.HTTPError(HTTP_403_WITH_URL),
        ):
            result = gateway.complete("sani_feature", {"input": "ping"})
    finally:
        patcher.stop()
    assert result.get("ok") is False
    assert result.get("status") == "error"
    assert result.get("error") == GENERIC_LLM_ERROR
    _assert_no_infra(str(result.get("error") or ""), "gateway.error")


def test_gateway_stream_error_sanitized():
    """RED: SSE-ветка gateway та же утечка → generic-текст в error-событии."""
    patcher = _seed_provider()
    try:
        with mock.patch.object(
            gateway, "_deepseek_chat_request_stream",
            side_effect=requests.exceptions.HTTPError(HTTP_403_WITH_URL),
        ):
            events = list(gateway.complete_stream("sani_feature", {"input": "ping"}))
    finally:
        patcher.stop()
    error_events = [e for e in events if e[0] == "error"]
    assert len(error_events) == 1
    payload = error_events[0][1]
    assert payload.get("status") == "error"
    assert payload.get("error") == GENERIC_LLM_ERROR
    # provider_id/model — диагностика без URL, контракт сохраняется
    assert payload.get("provider_id") == "llmprov_sani"
    _assert_no_infra(json.dumps(payload, ensure_ascii=False), "gateway stream error")


# ------------------------------------------------------- memory/chat boundary

def test_gateway_error_out_sanitized():
    """RED: _gateway_error_out не прокидывает сырой текст ошибки провайдера."""
    leak = f"sani-provider: HTTPError: {HTTP_403_WITH_URL}"
    result = {"ok": False, "status": "error", "error": leak, "usage": {}}
    ctx = mock.Mock(digest="d" * 32)
    with mock.patch.object(memory_chat, "append_turn"):
        out = memory_chat._gateway_error_out("sid", "uid", "org_default", result, ctx)
    assert out.ok is False and out.status == "error"
    assert out.error == GENERIC_LLM_ERROR
    assert GENERIC_LLM_ERROR in out.message and "HTTPError" not in out.message
    _assert_no_infra(json.dumps(out.model_dump(), ensure_ascii=False), "_gateway_error_out")


def test_gateway_error_out_non_error_status_unchanged():
    """Контракт: no_provider — текст статуса сохраняется."""
    result = {"ok": False, "status": "no_provider", "error": "no enabled LLM providers with api key", "usage": {}}
    ctx = mock.Mock(digest="d" * 32)
    with mock.patch.object(memory_chat, "append_turn"):
        out = memory_chat._gateway_error_out("sid", "uid", "org_default", result, ctx)
    assert out.status == "no_provider"
    assert out.error == "no enabled LLM providers with api key"


# ------------------------------------------------- R3: сырой last_error в логах

def test_gateway_logs_raw_error(caplog):
    """RED (R3): полный отказ цепочки логирует сырой last_error с деталями."""
    patcher = _seed_provider()
    try:
        with mock.patch.object(
            gateway, "_deepseek_chat_request",
            side_effect=requests.exceptions.HTTPError(HTTP_403_WITH_URL),
        ):
            with caplog.at_level("WARNING"):
                result = gateway.complete("sani_feature", {"input": "ping"})
    finally:
        patcher.stop()
    assert result.get("status") == "error"
    assert INTERNAL_ROUTER_URL in caplog.text, "сырый last_error должен попадать в логи"


def test_gateway_stream_logs_raw_error(caplog):
    """RED (R3): stream-ветка полного отказа тоже логирует сырой last_error."""
    patcher = _seed_provider()
    try:
        with mock.patch.object(
            gateway, "_deepseek_chat_request_stream",
            side_effect=requests.exceptions.HTTPError(HTTP_403_WITH_URL),
        ):
            with caplog.at_level("WARNING"):
                events = list(gateway.complete_stream("sani_feature", {"input": "ping"}))
    finally:
        patcher.stop()
    assert any(e[0] == "error" for e in events)
    assert INTERNAL_ROUTER_URL in caplog.text, "сырый last_error должен попадать в логи"
