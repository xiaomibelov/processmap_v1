"""AGENT-0 → AGENT-SVC: durable memory tests for PROCESSMAN chat.

Перенос backend/tests/test_agent_memory.py: кейсы и ассерты ОДИН В ОДИН
(5 пар реплик переживают "reload" клиента, 0 LLM-вызовов на history,
идемпотентность client_turn_id). Изменено только: import-path, мок LLM
(app.agent.chat.complete → memory.chat.complete), сидирование через conftest
seed, мок монолита на monolith_client.get_projection.
"""
from __future__ import annotations

import os
import sys
import uuid
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


def test_five_turns_survive_reload(admin_token, session_id, mock_projection):
    """5 user/assistant pairs persist and are readable by a fresh client."""
    with mock.patch("memory.chat.complete") as fake_complete:
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
                f"/sessions/{session_id}/agent/chat",
                headers=_auth(admin_token),
                json={"message": f"message {i}"},
            )
            assert r.status_code == 200, r.text

    c2 = TestClient(app)
    r = c2.get(
        f"/sessions/{session_id}/agent/history",
        headers=_auth(admin_token),
    )
    assert r.status_code == 200, r.text
    turns = r.json()["turns"]
    assert len(turns) == 10  # 5 user + 5 assistant
    assert [t["role"] for t in turns[::2]] == ["user"] * 5
    assert [t["role"] for t in turns[1::2]] == ["assistant"] * 5


def test_history_makes_zero_llm_calls(admin_token, session_id, mock_projection):
    with mock.patch("memory.chat.complete") as fake_complete:
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
            f"/sessions/{session_id}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "hello"},
        )
        call_count_after_chat = fake_complete.call_count

        # fresh history request must not call complete again
        c.get(
            f"/sessions/{session_id}/agent/history",
            headers=_auth(admin_token),
        )
        assert fake_complete.call_count == call_count_after_chat


def test_double_click_idempotency(admin_token, session_id, mock_projection):
    client_turn_id = f"client-turn-{uuid.uuid4().hex}"
    with mock.patch("memory.chat.complete") as fake_complete:
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
            f"/sessions/{session_id}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "hello", "client_turn_id": client_turn_id},
        )
        r2 = c.post(
            f"/sessions/{session_id}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "hello", "client_turn_id": client_turn_id},
        )
        assert r1.status_code == 200, r1.text
        assert r2.status_code == 200, r2.text
        assert fake_complete.call_count == 1
        assert r1.json()["message"] == r2.json()["message"]

    h = c.get(
        f"/sessions/{session_id}/agent/history",
        headers=_auth(admin_token),
    )
    assert h.status_code == 200, h.text
    turns = h.json()["turns"]
    assert len([t for t in turns if t["role"] == "user"]) == 1
    assert len([t for t in turns if t["role"] == "assistant"]) == 1
