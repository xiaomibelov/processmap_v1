"""AGENT-SVC: unit-тесты сервисного gateway (org_default fallback, effective chain).

Паттерн: изолированная SQLite (conftest.isolate_service_db), HTTP-вызовы замоканы.
"""
from __future__ import annotations

import os
import sys
from unittest import mock

import pytest

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
