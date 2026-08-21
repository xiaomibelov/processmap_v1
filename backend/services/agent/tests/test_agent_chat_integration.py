"""AGENT-0 → AGENT-SVC: integration tests with mocked gateway and action runners.

Перенос backend/tests/test_agent_chat_integration.py: кейсы и ассерты ОДИН В ОДИН.
Изменено только: import-path, мок LLM (app.agent.chat.complete →
memory.chat.complete), мок runners (app.agent.chat.run_* → memory.chat.run_*),
сидирование через conftest seed, мок монолита на monolith_client.get_projection.
"""
from __future__ import annotations

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
                    {"id": "step_2", "type": "step", "name_ru": "Step 2", "duration": None, "role": ""},
                ],
                "edges": [{"from": "step_1", "to": "step_2"}],
                "meta": {"session_id": "", "rev": 1, "nodes_count": 2, "schema": 1},
            },
            "projection_digest": "d" * 32,
            "rev": 1,
        }
        yield m


def _auth(token: str):
    return {"Authorization": f"Bearer {token}"}


def test_malformed_action_degrades_to_free_answer(admin_token, session_with_steps, mock_projection):
    with mock.patch("memory.chat.complete") as fake_complete:
        fake_complete.return_value = {
            "ok": True,
            "status": "ok",
            "text": "```json\n{not valid json}\n```",
            "usage": {"prompt_tokens": 1, "completion_tokens": 1},
            "provider_id": "p1",
            "model": "m",
            "prompt_version": 1,
            "fallback": False,
            "cached": False,
        }
        c = TestClient(app)
        r = c.post(
            f"/sessions/{session_with_steps}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "do something weird"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["action"] is None
    assert body["action_payload"] == {}


def test_action_with_unknown_step_degrades_to_free_answer(admin_token, session_with_steps, mock_projection):
    with mock.patch("memory.chat.complete") as fake_complete:
        fake_complete.return_value = {
            "ok": True,
            "status": "ok",
            "text": '```json\n{"action":"explain-step","step_id":"ghost_step"}\n```',
            "usage": {"prompt_tokens": 1, "completion_tokens": 1},
            "provider_id": "p1",
            "model": "m",
            "prompt_version": 1,
            "fallback": False,
            "cached": False,
        }
        c = TestClient(app)
        r = c.post(
            f"/sessions/{session_with_steps}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "explain ghost"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["action"] is None


def test_suggest_next_action_calls_runner(admin_token, session_with_steps, mock_projection):
    with mock.patch("memory.chat.complete") as fake_complete, \
         mock.patch("memory.chat.run_suggest_next") as fake_runner:
        fake_complete.return_value = {
            "ok": True,
            "status": "ok",
            "text": '```json\n{"action":"suggest-next","after_step_id":"step_1"}\n```',
            "usage": {"prompt_tokens": 1, "completion_tokens": 1},
            "provider_id": "p1",
            "model": "m",
            "prompt_version": 1,
            "fallback": False,
            "cached": False,
        }
        fake_runner.return_value = {
            "ok": True,
            "status": "ok",
            "suggestions": {"candidates": [], "note": "no candidates"},
        }
        c = TestClient(app)
        r = c.post(
            f"/sessions/{session_with_steps}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "what next"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["action"] == "suggest-next"
    fake_runner.assert_called_once()
    call_kwargs = fake_runner.call_args.kwargs
    assert call_kwargs.get("after_step_id") == "step_1"


def test_explain_step_action_calls_runner(admin_token, session_with_steps, mock_projection):
    with mock.patch("memory.chat.complete") as fake_complete, \
         mock.patch("memory.chat.run_explain_step") as fake_runner:
        fake_complete.return_value = {
            "ok": True,
            "status": "ok",
            "text": '```json\n{"action":"explain-step","step_id":"step_1"}\n```',
            "usage": {"prompt_tokens": 1, "completion_tokens": 1},
            "provider_id": "p1",
            "model": "m",
            "prompt_version": 1,
            "fallback": False,
            "cached": False,
        }
        fake_runner.return_value = {
            "ok": False,
            "status": "no_trace",
            "error": "no transform decision",
        }
        c = TestClient(app)
        r = c.post(
            f"/sessions/{session_with_steps}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "explain step 1"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["action"] == "explain-step"
    fake_runner.assert_called_once()
    assert fake_runner.call_args.kwargs.get("step_id") == "step_1"
