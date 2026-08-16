"""AGENT-0: durable memory tests for PROCESSMAN chat.

Ensures history survives "frontend reload" (new TestClient, same DB) and that
history endpoint makes zero LLM calls.
"""
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
from app.repositories import session_repo
from app.storage import get_default_org_id


@pytest.fixture
def admin_user():
    email = f"agent_mem_{uuid.uuid4().hex[:8]}@local"
    user = create_user(email, "password", is_admin=True)
    yield user


@pytest.fixture
def admin_token(admin_user):
    return create_access_token(admin_user["id"])


@pytest.fixture
def session_id(admin_user):
    sid = session_repo.create(
        title="agent memory test",
        user_id=admin_user["id"],
        is_admin=True,
        org_id=get_default_org_id(),
    )
    return sid


def _auth(token: str):
    return {"Authorization": f"Bearer {token}"}


def test_five_turns_survive_reload(admin_token, session_id):
    """5 user/assistant pairs persist and are readable by a fresh client."""
    with mock.patch("app.agent.chat.complete") as fake_complete:
        fake_complete.return_value = {
            "ok": True,
            "status": "ok",
            "text": "assistant reply",
            "usage": {"prompt_tokens": 1, "completion_tokens": 1},
            "provider_id": "p1",
            "model": "m",
            "prompt_version": 1,
            "fallback": False,
            "cached": False,
        }
        c1 = TestClient(app)
        for i in range(5):
            r = c1.post(
                f"/api/sessions/{session_id}/agent/chat",
                headers=_auth(admin_token),
                json={"message": f"message {i}"},
            )
            assert r.status_code == 200, r.text

    c2 = TestClient(app)
    r = c2.get(
        f"/api/sessions/{session_id}/agent/history",
        headers=_auth(admin_token),
    )
    assert r.status_code == 200, r.text
    turns = r.json()["turns"]
    assert len(turns) == 10  # 5 user + 5 assistant
    assert [t["role"] for t in turns[::2]] == ["user"] * 5
    assert [t["role"] for t in turns[1::2]] == ["assistant"] * 5


def test_history_makes_zero_llm_calls(admin_token, session_id):
    with mock.patch("app.agent.chat.complete") as fake_complete:
        fake_complete.return_value = {
            "ok": True,
            "status": "ok",
            "text": "ok",
            "usage": {"prompt_tokens": 1, "completion_tokens": 1},
            "provider_id": "p1",
            "model": "m",
            "prompt_version": 1,
            "fallback": False,
            "cached": False,
        }
        c = TestClient(app)
        c.post(
            f"/api/sessions/{session_id}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "hello"},
        )
        call_count_after_chat = fake_complete.call_count

        # fresh history request must not call complete again
        c.get(
            f"/api/sessions/{session_id}/agent/history",
            headers=_auth(admin_token),
        )
        assert fake_complete.call_count == call_count_after_chat


def test_double_click_idempotency(admin_token, session_id):
    client_turn_id = f"client-turn-{uuid.uuid4().hex}"
    with mock.patch("app.agent.chat.complete") as fake_complete:
        fake_complete.return_value = {
            "ok": True,
            "status": "ok",
            "text": "unique assistant reply",
            "usage": {"prompt_tokens": 1, "completion_tokens": 1},
            "provider_id": "p1",
            "model": "m",
            "prompt_version": 1,
            "fallback": False,
            "cached": False,
        }
        c = TestClient(app)
        r1 = c.post(
            f"/api/sessions/{session_id}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "hello", "client_turn_id": client_turn_id},
        )
        r2 = c.post(
            f"/api/sessions/{session_id}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "hello", "client_turn_id": client_turn_id},
        )
        assert r1.status_code == 200, r1.text
        assert r2.status_code == 200, r2.text
        assert fake_complete.call_count == 1
        assert r1.json()["message"] == r2.json()["message"]

    h = c.get(
        f"/api/sessions/{session_id}/agent/history",
        headers=_auth(admin_token),
    )
    assert h.status_code == 200, h.text
    turns = h.json()["turns"]
    assert len([t for t in turns if t["role"] == "user"]) == 1
    assert len([t for t in turns if t["role"] == "assistant"]) == 1
