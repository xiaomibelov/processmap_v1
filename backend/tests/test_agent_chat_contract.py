"""AGENT-0: contract tests for /api/sessions/{id}/agent/chat and history.

Uses TestClient + isolated SQLite DB from conftest. Gateway is mocked so
no real LLM calls are made.
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
def client():
    return TestClient(app)


@pytest.fixture
def admin_user():
    email = f"agent_contract_{uuid.uuid4().hex[:8]}@local"
    user = create_user(email, "password", is_admin=True)
    yield user


@pytest.fixture
def admin_token(admin_user):
    return create_access_token(admin_user["id"])


@pytest.fixture
def session_id(admin_user):
    sid = session_repo.create(
        title="agent contract test",
        user_id=admin_user["id"],
        is_admin=True,
        org_id=get_default_org_id(),
    )
    return sid


def _auth(token: str):
    return {"Authorization": f"Bearer {token}"}


_CHAT_OUT_KEYS = {
    "ok",
    "status",
    "error",
    "message",
    "action",
    "action_payload",
    "usage",
    "projection_digest",
}


def test_chat_contract_free_answer(client, admin_token, session_id):
    with mock.patch("app.agent.chat.complete") as fake_complete:
        fake_complete.return_value = {
            "ok": True,
            "status": "ok",
            "text": "Привет, вот ответ на ваш вопрос.",
            "usage": {"prompt_tokens": 10, "completion_tokens": 7},
            "provider_id": "p1",
            "model": "deepseek-chat",
            "prompt_version": 1,
            "fallback": False,
            "cached": False,
        }
        r = client.post(
            f"/api/sessions/{session_id}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "расскажи про схему"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body.keys()) == _CHAT_OUT_KEYS, f"keys mismatch: {sorted(body.keys())}"
    assert body["ok"] is True
    assert body["status"] == "ok"
    assert isinstance(body["message"], str)
    assert isinstance(body["usage"], dict)
    assert "projection_digest" in body and isinstance(body["projection_digest"], str)


def test_chat_contract_disabled_status(client, admin_token, session_id):
    with mock.patch("app.agent.chat.complete") as fake_complete:
        fake_complete.return_value = {
            "ok": False,
            "status": "disabled",
            "error": "feature disabled",
        }
        r = client.post(
            f"/api/sessions/{session_id}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "hello"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is False
    assert body["status"] == "disabled"
    assert isinstance(body["error"], str)


def test_history_contract(client, admin_token, session_id):
    with mock.patch("app.agent.chat.complete") as fake_complete:
        fake_complete.return_value = {
            "ok": True,
            "status": "ok",
            "text": "ответ",
            "usage": {"prompt_tokens": 1, "completion_tokens": 1},
            "provider_id": "p1",
            "model": "m",
            "prompt_version": 1,
            "fallback": False,
            "cached": False,
        }
        client.post(
            f"/api/sessions/{session_id}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "msg1"},
        )

    r = client.get(
        f"/api/sessions/{session_id}/agent/history",
        headers=_auth(admin_token),
    )
    assert r.status_code == 200, r.text
    payload = r.json()
    assert "turns" in payload
    turns = payload["turns"]
    assert isinstance(turns, list)
    assert len(turns) >= 2  # user + assistant
    for turn in turns:
        assert set(turn.keys()) == {
            "id",
            "role",
            "content",
            "action",
            "action_payload",
            "projection_digest",
            "usage",
            "created_at",
            "client_turn_id",
        }
        assert turn["role"] in {"user", "assistant"}


def test_chat_requires_authentication(client, session_id):
    r = client.post(
        f"/api/sessions/{session_id}/agent/chat",
        json={"message": "hello"},
    )
    assert r.status_code == 401, r.text


def test_history_requires_authentication(client, session_id):
    r = client.get(f"/api/sessions/{session_id}/agent/history")
    assert r.status_code == 401, r.text
