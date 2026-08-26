"""AGENT-SVC: unit-тесты сервисного gateway (org_default fallback, effective chain).

Паттерн: изолированная SQLite (conftest.isolate_service_db), HTTP-вызовы замоканы.
"""
from __future__ import annotations

import os
import sys
from unittest import mock

import pytest
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from gateway import gateway  # noqa: E402


def _llm_response(text="ok", model="m", pt=3, ct=2):
    return {
        "model": model,
        "choices": [{"message": {"content": text}}],
        "usage": {"prompt_tokens": pt, "completion_tokens": ct},
    }


def _usage_rows(feature: str):
    import db

    with db.get_conn() as conn:
        cur = conn.execute(
            db.adapt_sql(
                "SELECT status, provider_id, prompt_tokens, completion_tokens FROM llm_usage"
                " WHERE feature = ? ORDER BY id"
            ),
            (feature,),
        )
        cols = ["status", "provider_id", "prompt_tokens", "completion_tokens"]
        return [dict(zip(cols, r)) for r in cur.fetchall()]


def _provider_dict(**kwargs):
    defaults = {
        "id": "llmprov_test",
        "org_id": "org_default",
        "name": "test-provider",
        "base_url": "https://a",
        "model": "m",
        "api_key": "key",
        "priority": 10,
        "enabled": True,
    }
    defaults.update(kwargs)
    return defaults


def test_org_default_fallback_for_org_without_provider(isolate_service_db):
    """Bug B: сервисный gateway использует org_default, если у org нет ключа."""
    feature = "test_svc_fallback"
    org = "org_no_key_1"
    default_p = _provider_dict(
        id="llmprov_org_default_fb",
        org_id="org_default",
        name="default-fb",
        model="m-fb",
        api_key="key-default",
    )
    with mock.patch.object(gateway.llm_store, "effective_providers_with_key", return_value=[default_p]) as eff, \
         mock.patch.object(gateway, "_deepseek_chat_request", return_value=_llm_response(model="m-fb")):
        result = gateway.complete(feature, {"x": 1}, org_id=org)
    assert result["ok"] is True and result["status"] == "ok"
    assert result["provider_id"] == default_p["id"]
    assert result["fallback"] is True
    eff.assert_called_once_with(org)
    rows = _usage_rows(feature)
    assert rows[-1]["provider_id"] == default_p["id"]
    assert rows[-1]["status"] == "ok"


def test_own_provider_wins_over_org_default(isolate_service_db):
    """Org с собственным провайдером использует его, а не org_default."""
    feature = "test_svc_own_wins"
    org = "org_own_key_1"
    own_p = _provider_dict(
        id="llmprov_own",
        org_id=org,
        name="own-p",
        model="m-own",
        api_key="key-own",
        priority=5,
    )
    with mock.patch.object(gateway.llm_store, "effective_providers_with_key", return_value=[own_p]), \
         mock.patch.object(gateway, "_deepseek_chat_request", return_value=_llm_response(model="m-own")):
        result = gateway.complete(feature, {"x": 1}, org_id=org)
    assert result["provider_id"] == own_p["id"]
    assert result["fallback"] is False


def test_timeout_fails_fast_to_backup_provider(isolate_service_db):
    """Таймаут у первого провайдера → сразу failover на backup без retry."""
    feature = "test_svc_timeout_failover"
    org = "org_timeout_1"
    primary = _provider_dict(id="llmprov_timeout", org_id=org, name="p-timeout", api_key="key-a", priority=5)
    backup = _provider_dict(id="llmprov_backup", org_id=org, name="p-backup", api_key="key-b", priority=10, model="m2")
    calls = []

    def _fake(**kwargs):
        calls.append(kwargs["api_key"])
        if kwargs["api_key"] == "key-a":
            raise requests.exceptions.Timeout("primary timed out")
        return _llm_response(model="m2")

    with mock.patch.object(gateway.llm_store, "effective_providers_with_key", return_value=[primary, backup]), \
         mock.patch.object(gateway, "_deepseek_chat_request", side_effect=_fake):
        result = gateway.complete(feature, {"x": 1}, org_id=org)

    assert result["ok"] is True and result["status"] == "ok"
    assert calls == ["key-a", "key-b"], "timeout primary → один вызов, затем backup"
    assert result["provider_id"] == backup["id"]
    assert result["fallback"] is True


def test_stream_timeout_fails_fast_to_backup_provider(isolate_service_db):
    """Таймаут у streaming-провайдера → сразу failover на backup без retry."""
    feature = "test_svc_stream_timeout_failover"
    org = "org_stream_timeout_1"
    primary = _provider_dict(id="llmprov_stream_timeout", org_id=org, name="p-stream-timeout", api_key="key-a", priority=5)
    backup = _provider_dict(id="llmprov_stream_backup", org_id=org, name="p-stream-backup", api_key="key-b", priority=10)
    calls = []

    def _fake_stream(**kwargs):
        calls.append(kwargs["api_key"])
        if kwargs["api_key"] == "key-a":
            raise requests.exceptions.Timeout("primary stream timed out")
        # Yield one token and usage to finish cleanly.
        yield {"choices": [{"delta": {"content": "ok"}}]}
        yield {
            "choices": [],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1},
            "model": "m2",
        }

    with mock.patch.object(gateway.llm_store, "effective_providers_with_key", return_value=[primary, backup]), \
         mock.patch.object(gateway, "_deepseek_chat_request_stream", side_effect=_fake_stream):
        events = list(gateway.complete_stream(feature, {"x": 1}, org_id=org))

    token_events = [e for e in events if e[0] == "token"]
    usage_events = [e for e in events if e[0] == "usage"]
    error_events = [e for e in events if e[0] == "error"]
    assert calls == ["key-a", "key-b"], "timeout primary stream → один вызов, затем backup"
    assert token_events and token_events[-1][1].get("delta") == "ok"
    assert usage_events and usage_events[-1][1].get("provider_id") == backup["id"]
    assert not error_events
