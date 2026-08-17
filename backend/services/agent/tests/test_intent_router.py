"""AGENT-1: intent router unit tests."""
from __future__ import annotations

import os
import sys
from unittest import mock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from memory.chat import _normalize_intent, _router_digest, route_intent


def test_router_digest_stable():
    d1 = _router_digest("hello", "digest1", "step_1")
    d2 = _router_digest("hello", "digest1", "step_1")
    d3 = _router_digest("hello", "digest1", "step_2")
    assert d1 == d2
    assert d1 != d3


def test_normalize_intent_valid():
    assert _normalize_intent("node_qa") == "node_qa"
    assert _normalize_intent("schema_overview") == "schema_overview"
    assert _normalize_intent("doc_qa") == "doc_qa"
    assert _normalize_intent("suggest_next") == "suggest_next"
    assert _normalize_intent("smalltalk") == "smalltalk"


def test_normalize_intent_aliases_and_garbage():
    assert _normalize_intent("Node QA") == "node_qa"
    assert _normalize_intent("SCHEMA_OVERVIEW") == "schema_overview"
    assert _normalize_intent("overview") == "schema_overview"
    assert _normalize_intent("next") == "suggest_next"
    assert _normalize_intent("hello world") == "smalltalk"
    assert _normalize_intent("") == "smalltalk"


def test_route_intent_classifies_via_complete(mock_route_intent_smalltalk):
    """Restore real router and mock gateway.complete to assert classification."""
    mock_route_intent_smalltalk.side_effect = route_intent
    with mock.patch("memory.chat.complete") as fake_complete:
        fake_complete.return_value = {
            "ok": True,
            "status": "ok",
            "text": "schema_overview",
            "usage": {"prompt_tokens": 10, "completion_tokens": 2},
            "provider_id": "p1",
            "model": "m",
            "prompt_version": 1,
            "fallback": False,
            "cached": False,
        }
        intent = route_intent(
            "расскажи про схему",
            "digest1",
            "",
            [],
            user_id="u1",
            project_id="pr1",
            session_id="s1",
            org_id="org_default",
        )
    assert intent == "schema_overview"
    fake_complete.assert_called_once()
    call_args = fake_complete.call_args
    assert call_args.args[0] == "agent_router"
    assert call_args.kwargs.get("max_tokens") == 200


def test_route_intent_degrades_to_smalltalk_on_gateway_error(mock_route_intent_smalltalk):
    mock_route_intent_smalltalk.side_effect = route_intent
    with mock.patch("memory.chat.complete") as fake_complete:
        fake_complete.return_value = {
            "ok": False,
            "status": "no_provider",
            "error": "no provider",
        }
        intent = route_intent("hello", "digest1", "", [])
    assert intent == "smalltalk"


def test_route_intent_degrades_to_smalltalk_on_garbage_output(mock_route_intent_smalltalk):
    mock_route_intent_smalltalk.side_effect = route_intent
    with mock.patch("memory.chat.complete") as fake_complete:
        fake_complete.return_value = {
            "ok": True,
            "status": "ok",
            "text": "I think you want something",
        }
        intent = route_intent("hello", "digest1", "", [])
    assert intent == "smalltalk"
