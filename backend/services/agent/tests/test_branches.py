"""AGENT-1: branch execution tests for node_qa/schema_overview/doc_qa/suggest_next."""
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


def test_node_qa_branch_calls_runner(admin_token, session_with_steps, mock_projection, mock_route_intent_smalltalk):
    mock_route_intent_smalltalk.return_value = "node_qa"
    with mock.patch("memory.chat.run_step_qa") as fake_runner:
        fake_runner.return_value = {
            "ok": True,
            "answer": "Это шаг 1",
        }
        c = TestClient(app)
        r = c.post(
            f"/sessions/{session_with_steps}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "что это за шаг", "selected_step_id": "step_1"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["action"] == "step-qa"
    assert body["message"] == "Это шаг 1"
    fake_runner.assert_called_once()
    assert fake_runner.call_args.kwargs.get("step_id") == "step_1"


def test_node_qa_without_selected_step_degrades(admin_token, session_with_steps, mock_projection, mock_route_intent_smalltalk):
    mock_route_intent_smalltalk.return_value = "node_qa"
    with mock.patch("memory.chat.complete") as fake_complete:
        fake_complete.return_value = {
            "ok": True,
            "status": "ok",
            "text": "Свободный ответ",
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
            json={"message": "что это за шаг"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["message"] == "Свободный ответ"
    fake_complete.assert_called_once()


def test_suggest_next_branch_calls_runner(admin_token, session_with_steps, mock_projection, mock_route_intent_smalltalk):
    mock_route_intent_smalltalk.return_value = "suggest_next"
    with mock.patch("memory.chat.run_suggest_next") as fake_runner:
        fake_runner.return_value = {
            "ok": True,
            "status": "ok",
            "candidates": [{"id": "step_2"}],
            "note": "next step",
        }
        c = TestClient(app)
        r = c.post(
            f"/sessions/{session_with_steps}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "что дальше", "selected_step_id": "step_1"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["action"] == "suggest-next"
    fake_runner.assert_called_once()


def test_schema_overview_branch_uses_warm_memory(admin_token, session_with_steps, mock_projection, mock_route_intent_smalltalk):
    mock_route_intent_smalltalk.return_value = "schema_overview"
    from memory.schema_memory import save_schema_memory

    save_schema_memory(session_with_steps, "org_default", "Тёплое summary", [], [], "d" * 32)
    c = TestClient(app)
    r = c.post(
        f"/sessions/{session_with_steps}/agent/chat",
        headers=_auth(admin_token),
        json={"message": "расскажи про схему"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["message"] == "Тёплое summary"
    assert body["action"] == "schema_overview"


def test_schema_overview_branch_cold_generates_summary(admin_token, session_with_steps, mock_projection, mock_route_intent_smalltalk):
    mock_route_intent_smalltalk.return_value = "schema_overview"
    with mock.patch("memory.chat.complete") as fake_complete, mock.patch("memory.chat.schedule_memory_update") as fake_schedule:
        fake_complete.return_value = {
            "ok": True,
            "status": "ok",
            "text": "Холодное summary",
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
            json={"message": "расскажи про схему"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["message"] == "Холодное summary"
    fake_schedule.assert_called_once()


def test_doc_qa_branch_with_results(admin_token, session_with_steps, mock_projection, mock_route_intent_smalltalk):
    mock_route_intent_smalltalk.return_value = "doc_qa"
    with mock.patch("memory.chat.complete") as fake_complete, mock.patch("memory.chat.search_rag") as fake_rag:
        fake_rag.return_value = {
            "ok": True,
            "results": [
                {"chunk": "Отрывок 1", "score": 0.9},
                {"chunk": "Отрывок 2", "score": 0.8},
            ],
        }
        fake_complete.return_value = {
            "ok": True,
            "status": "ok",
            "text": "Ответ из документации",
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
            json={"message": "как оформить заявку"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["action"] == "doc_qa"
    assert "Ответ из документации" in body["message"]
    fake_complete.assert_called_once()


def test_doc_qa_branch_empty_rag_degrades_to_free_answer(admin_token, session_with_steps, mock_projection, mock_route_intent_smalltalk):
    mock_route_intent_smalltalk.return_value = "doc_qa"
    with mock.patch("memory.chat.complete") as fake_complete, mock.patch("memory.chat.search_rag") as fake_rag:
        fake_rag.return_value = {"ok": True, "results": []}
        fake_complete.return_value = {
            "ok": True,
            "status": "ok",
            "text": "Свободный ответ",
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
            json={"message": "как оформить заявку"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["message"] == "Свободный ответ"


def test_empty_schema_smalltalk_no_json(admin_token, session_with_steps, mock_projection, mock_route_intent_smalltalk):
    """Acceptance: empty projection + smalltalk -> human text, no raw JSON."""
    mock_projection.return_value = {
        "ok": True,
        "projection": {"steps": [], "edges": [], "meta": {"session_id": "", "rev": 1, "nodes_count": 0, "schema": 1}},
        "projection_digest": "emptydigest",
        "rev": 1,
    }
    mock_route_intent_smalltalk.return_value = "smalltalk"
    with mock.patch("memory.chat.complete") as fake_complete:
        fake_complete.return_value = {
            "ok": True,
            "status": "ok",
            "text": "Это пустая схема. Начните добавлять шаги.",
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
            json={"message": "что это"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert "пустая схема" in body["message"]
    assert "{" not in body["message"]
