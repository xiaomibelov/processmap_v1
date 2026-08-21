"""AGENT-0 → AGENT-SVC: contract tests for /sessions/{id}/agent/chat and history.

Перенос backend/tests/test_agent_chat_contract.py: кейсы и ассерты ОДИН В ОДИН.
Изменено только: import-path (app.* → модули сервиса), точка мока LLM
(app.agent.chat.complete → memory.chat.complete), сидирование users/sessions —
SQL-хелперы conftest (seed), плюс мок монолита на monolith_client.get_projection
(проекция в сервисе приходит по HTTP — sanctioned mock point).
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
def client():
    return TestClient(app)


@pytest.fixture
def admin_user(seed):
    uid = seed.make_user(is_admin=True)
    return {"id": uid, "token": seed.make_token(uid)}


@pytest.fixture
def admin_token(admin_user):
    return admin_user["token"]


@pytest.fixture
def session_id(seed, admin_user):
    return seed.make_session(org_id=seed.DEFAULT_ORG, owner_user_id=admin_user["id"])


@pytest.fixture
def mock_projection():
    with mock.patch("runners.monolith_client.get_projection") as m:
        m.return_value = {
            "ok": True,
            "projection": {"steps": [], "edges": [], "meta": {"session_id": "", "rev": 1, "nodes_count": 0, "schema": 1}},
            "projection_digest": "d" * 32,
            "rev": 1,
        }
        yield m


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


def test_chat_contract_free_answer(client, admin_token, session_id, mock_projection):
    with mock.patch("memory.chat.complete") as fake_complete:
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
            f"/sessions/{session_id}/agent/chat",
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


def test_chat_contract_disabled_status(client, admin_token, session_id, mock_projection):
    with mock.patch("memory.chat.complete") as fake_complete:
        fake_complete.return_value = {
            "ok": False,
            "status": "disabled",
            "error": "feature disabled",
        }
        r = client.post(
            f"/sessions/{session_id}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "hello"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is False
    assert body["status"] == "disabled"
    assert isinstance(body["error"], str)


def test_history_contract(client, admin_token, session_id, mock_projection):
    with mock.patch("memory.chat.complete") as fake_complete:
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
            f"/sessions/{session_id}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "msg1"},
        )

    r = client.get(
        f"/sessions/{session_id}/agent/history",
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
        f"/sessions/{session_id}/agent/chat",
        json={"message": "hello"},
    )
    assert r.status_code == 401, r.text


def test_history_requires_authentication(client, session_id):
    r = client.get(f"/sessions/{session_id}/agent/history")
    assert r.status_code == 401, r.text
