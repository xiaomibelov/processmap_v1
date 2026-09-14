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


def _rag_result_b():
    return {
        "ok": True,
        "results": [
            {
                "chunk_id": "chunk_b_1",
                "score": 1.5,
                "chunk_text": "В сессии B заявку оформляет оператор.",
                "source_type": "bpmn_xml",
                "source_id": "sess_b",
                "metadata": {"session_id": "sess_b", "session_title": "Сессия B"},
            },
        ],
    }


def test_stream_free_answer_emits_sources_event(admin_token, session_with_steps, mock_projection, mock_route_intent_smalltalk):
    """E2: stream free-answer — SSE-ивент sources + sources в done."""
    mock_route_intent_smalltalk.return_value = "smalltalk"
    with mock.patch("memory.chat.complete_stream") as fake_stream, mock.patch("memory.chat.search_rag") as fake_rag:
        fake_rag.return_value = _rag_result_b()
        fake_stream.return_value = iter([
            ("token", {"delta": "Оператор оформляет [S1]."}),
            ("usage", {
                "usage": {"prompt_tokens": 10, "completion_tokens": 5},
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
            json={"message": "кто оформляет заявку?"},
        ) as r:
            r.read()
            text = r.text
    assert r.status_code == 200, text
    events = _parse_sse(text)
    event_types = [e["event"] for e in events]
    assert "sources" in event_types, "SSE не содержит ивента sources"
    sources_events = [json.loads(e["data"]) for e in events if e["event"] == "sources"]
    assert sources_events[0]["sources"][0]["source_id"] == "chunk_b_1"
    done_events = [json.loads(e["data"]) for e in events if e["event"] == "done"]
    assert done_events[0]["sources"][0]["source_id"] == "chunk_b_1"


def test_stream_structured_fact_empty_rag_falls_back_without_error(admin_token, session_with_steps, mock_projection, mock_route_intent_smalltalk):
    """E2: фикс dangling _run_free_answer_branch_stream — fallback без NameError/SSE-error."""
    mock_route_intent_smalltalk.return_value = "structured_fact_qa"
    with mock.patch("memory.chat.complete_stream") as fake_stream, mock.patch("memory.chat.search_rag") as fake_rag:
        fake_rag.return_value = {"ok": True, "results": []}
        fake_stream.return_value = iter([
            ("token", {"delta": "Свободный ответ"}),
            ("usage", {
                "usage": {"prompt_tokens": 10, "completion_tokens": 5},
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
            json={"message": "какие значения у свойства X?"},
        ) as r:
            r.read()
            text = r.text
    assert r.status_code == 200, text
    events = _parse_sse(text)
    event_types = [e["event"] for e in events]
    assert "done" in event_types
    assert "error" not in event_types
    token_data = "".join(e["data"] for e in events if e["event"] == "token")
    assert "Свободный ответ" in token_data


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
