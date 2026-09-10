"""AGENT-0: integration tests with mocked gateway and action runners."""
from __future__ import annotations

import os
import sys
import uuid
from unittest import mock

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.auth import create_access_token, create_user
from app.main import app
from app.models import Edge, Node
from app.repositories import session_repo
from app.storage import get_default_org_id, get_storage


@pytest.fixture
def admin_user():
    email = f"agent_int_{uuid.uuid4().hex[:8]}@local"
    user = create_user(email, "password", is_admin=True)
    yield user


@pytest.fixture
def admin_token(admin_user):
    return create_access_token(admin_user["id"])


@pytest.fixture
def session_with_steps(admin_user):
    sid = session_repo.create(
        title="agent integration test",
        user_id=admin_user["id"],
        is_admin=True,
        org_id=get_default_org_id(),
    )
    st = get_storage()
    sess = st.load(sid, is_admin=True)
    sess.nodes = [
        Node(id="step_1", title="Step 1", parameters={}, equipment=[], disposition={}),
        Node(id="step_2", title="Step 2", parameters={}, equipment=[], disposition={}),
    ]
    sess.edges = [Edge(from_id="step_1", to_id="step_2")]
    st.save(sess, is_admin=True)
    return sid


def _auth(token: str):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def session_empty_schema(admin_user):
    sid = session_repo.create(
        title="agent empty schema test",
        user_id=admin_user["id"],
        is_admin=True,
        org_id=get_default_org_id(),
    )
    return sid


def _ok_llm_result(text: str):
    return {
        "ok": True,
        "status": "ok",
        "text": text,
        "usage": {"prompt_tokens": 1, "completion_tokens": 1},
        "provider_id": "p1",
        "model": "m",
        "prompt_version": 1,
        "fallback": False,
        "cached": False,
    }


def _assert_no_raw_json(message: str):
    assert "{" not in message
    assert "```" not in message
    assert '"action"' not in message


def test_empty_schema_raw_action_json_gets_friendly_fallback(admin_token, session_empty_schema):
    """N1/M3: пустая схема + модель вернула action-JSON -> дружелюбный текст, не сырой JSON."""
    with mock.patch("app.agent.chat.complete") as fake_complete, \
         mock.patch("app.agent.chat.run_explain_step") as fake_runner:
        fake_complete.return_value = _ok_llm_result(
            '```json\n{"action":"explain-step","step_id":"step_1"}\n```'
        )
        c = TestClient(app)
        r = c.post(
            f"/api/sessions/{session_empty_schema}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "что это за шаг?"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["action"] is None
    assert body["action_payload"] == {}
    _assert_no_raw_json(body["message"])
    fake_runner.assert_not_called()


def test_free_answer_valid_action_json_executes(admin_token, session_with_steps):
    """Валидный action-JSON в fence на непустой схеме выполняется как action."""
    with mock.patch("app.agent.chat.complete") as fake_complete, \
         mock.patch("app.agent.chat.run_step_qa") as fake_runner:
        fake_complete.return_value = _ok_llm_result(
            '```json\n{"action":"step-qa","step_id":"step_1","question":"какие параметры?"}\n```'
        )
        fake_runner.return_value = {"ok": True, "status": "ok", "message": "Ответ по шагу 1"}
        c = TestClient(app)
        r = c.post(
            f"/api/sessions/{session_with_steps}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "какие параметры у шага?"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["action"] == "step-qa"
    assert body["message"] == "Ответ по шагу 1"
    fake_runner.assert_called_once()
    assert fake_runner.call_args.kwargs.get("step_id") == "step_1"


def test_non_whitelist_action_json_gets_fallback_runner_not_called(admin_token, session_with_steps):
    """Не-whitelist action-JSON -> fallback-текст, runner НЕ вызывается."""
    with mock.patch("app.agent.chat.complete") as fake_complete, \
         mock.patch("app.agent.chat.run_explain_step") as fake_runner:
        fake_complete.return_value = _ok_llm_result(
            '```json\n{"action":"delete-everything"}\n```'
        )
        c = TestClient(app)
        r = c.post(
            f"/api/sessions/{session_with_steps}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "удали всё"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["action"] is None
    _assert_no_raw_json(body["message"])
    fake_runner.assert_not_called()


def test_action_fallback_text_languages():
    from app.agent.chat import _action_fallback_text

    assert _action_fallback_text("что это?") == _action_fallback_text("Привет")
    assert "{" not in _action_fallback_text("что это?")
    ru = _action_fallback_text("что это?")
    en = _action_fallback_text("what is this?")
    assert ru != en
    assert "{" not in en


def test_malformed_action_degrades_to_free_answer(admin_token, session_with_steps):
    with mock.patch("app.agent.chat.complete") as fake_complete:
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
            f"/api/sessions/{session_with_steps}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "do something weird"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["action"] is None
    assert body["action_payload"] == {}


def test_action_with_unknown_step_degrades_to_free_answer(admin_token, session_with_steps):
    with mock.patch("app.agent.chat.complete") as fake_complete:
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
            f"/api/sessions/{session_with_steps}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "explain ghost"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["action"] is None


def test_suggest_next_action_calls_runner(admin_token, session_with_steps):
    with mock.patch("app.agent.chat.complete") as fake_complete, \
         mock.patch("app.agent.chat.run_suggest_next") as fake_runner:
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
            f"/api/sessions/{session_with_steps}/agent/chat",
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


def test_explain_step_action_calls_runner(admin_token, session_with_steps):
    with mock.patch("app.agent.chat.complete") as fake_complete, \
         mock.patch("app.agent.chat.run_explain_step") as fake_runner:
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
            f"/api/sessions/{session_with_steps}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "explain step 1"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["action"] == "explain-step"
    fake_runner.assert_called_once()
    assert fake_runner.call_args.kwargs.get("step_id") == "step_1"
