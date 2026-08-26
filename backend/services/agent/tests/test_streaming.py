"""AGENT-1: SSE streaming endpoint tests."""
from __future__ import annotations

import json
import os
import sys
from unittest import mock

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import app


@pytest.fixture
def admin_user(seed):
    uid = seed.make_user(is_admin=True)
    return {"id": uid, "token": seed.make_token(uid)}


@pytest.fixture
def admin_token(admin_user):
    return admin_user["token"]


@pytest.fixture
def session_with_steps(seed, admin_user):
    return seed.make_session(org_id=seed.DEFAULT_ORG, owner_user_id=admin_user["id"])


@pytest.fixture
def mock_projection():
    with mock.patch("runners.monolith_client.get_projection") as m:
        m.return_value = {
            "ok": True,
            "projection": {
                "steps": [
                    {"id": "step_1", "type": "step", "name_ru": "Step 1", "duration": None, "role": ""},
                ],
                "edges": [],
                "meta": {"session_id": "", "rev": 1, "nodes_count": 1, "schema": 1},
            },
            "projection_digest": "d" * 32,
            "rev": 1,
        }
        yield m


def _auth(token: str):
    return {"Authorization": f"Bearer {token}"}


def _parse_sse(text: str):
    events = []
    current = {}
    for line in text.splitlines():
        if line.startswith("event: "):
            current["event"] = line[len("event: "):]
        elif line.startswith("data: "):
            current["data"] = line[len("data: "):]
        elif line == "" and current:
            events.append(current)
            current = {}
    if current:
        events.append(current)
    return events


def test_stream_smalltalk_emits_start_token_done(admin_token, session_with_steps, mock_projection, mock_route_intent_smalltalk):
    mock_route_intent_smalltalk.return_value = "smalltalk"
    with mock.patch("memory.chat.complete_stream") as fake_stream:
        fake_stream.return_value = iter([
            ("token", {"delta": "Привет"}),
            ("token", {"delta": "."}),
            ("usage", {
                "usage": {"prompt_tokens": 1, "completion_tokens": 2},
                "provider_id": "p1",
                "model": "m",
                "prompt_version": 1,
                "fallback": False,
            }),
        ])
        c = TestClient(app)
        with c.stream(
            "POST",
            f"/sessions/{session_with_steps}/agent/stream",
            headers={**_auth(admin_token), "Accept": "text/event-stream"},
            json={"message": "привет"},
        ) as r:
            r.read()
            text = r.text
    assert r.status_code == 200, text
    events = _parse_sse(text)
    event_types = [e["event"] for e in events]
    assert "start" in event_types
    assert "token" in event_types
    assert "done" in event_types
    token_data = [e["data"] for e in events if e["event"] == "token"]
    assert "Привет" in "".join(token_data)


def test_stream_node_qa_emits_action_event(admin_token, session_with_steps, mock_projection, mock_route_intent_smalltalk):
    mock_route_intent_smalltalk.return_value = "node_qa"
    with mock.patch("memory.chat.run_step_qa") as fake_runner:
        fake_runner.return_value = {"ok": True, "answer": "Ответ по шагу"}
        c = TestClient(app)
        with c.stream(
            "POST",
            f"/sessions/{session_with_steps}/agent/stream",
            headers={**_auth(admin_token), "Accept": "text/event-stream"},
            json={"message": "что это", "selected_step_id": "step_1"},
        ) as r:
            r.read()
            text = r.text
    assert r.status_code == 200, text
    events = _parse_sse(text)
    event_types = [e["event"] for e in events]
    assert "start" in event_types
    assert "action" in event_types
    assert "done" in event_types


def test_stream_gateway_error_emits_sse_error(admin_token, session_with_steps, mock_projection, mock_route_intent_smalltalk):
    mock_route_intent_smalltalk.return_value = "smalltalk"
    with mock.patch("memory.chat.complete_stream") as fake_stream:
        fake_stream.return_value = iter([
            ("error", {"status": "no_provider", "error": "no provider"}),
        ])
        c = TestClient(app)
        with c.stream(
            "POST",
            f"/sessions/{session_with_steps}/agent/stream",
            headers={**_auth(admin_token), "Accept": "text/event-stream"},
            json={"message": "привет"},
        ) as r:
            r.read()
            text = r.text
    assert r.status_code == 200, text
    events = _parse_sse(text)
    assert any(e["event"] == "error" for e in events)


def test_stream_gateway_error_includes_provider_and_model(admin_token, session_with_steps, mock_projection, mock_route_intent_smalltalk):
    mock_route_intent_smalltalk.return_value = "smalltalk"
    with mock.patch("memory.chat.complete_stream") as fake_stream:
        fake_stream.return_value = iter([
            ("error", {
                "status": "error",
                "error": "all providers failed",
                "provider_id": "llmprov_vvproxy",
                "model": "claude-opus-4-6",
            }),
        ])
        c = TestClient(app)
        with c.stream(
            "POST",
            f"/sessions/{session_with_steps}/agent/stream",
            headers={**_auth(admin_token), "Accept": "text/event-stream"},
            json={"message": "привет"},
        ) as r:
            r.read()
            text = r.text
    assert r.status_code == 200, text
    events = _parse_sse(text)
    error_events = [json.loads(e["data"]) for e in events if e["event"] == "error"]
    assert len(error_events) == 1
    assert error_events[0].get("provider_id") == "llmprov_vvproxy"
    assert error_events[0].get("model") == "claude-opus-4-6"
