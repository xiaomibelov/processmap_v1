"""AGENT-3: streaming edit_canvas + resume (confirm/reject) tests.

Фиксирует баг FK violation: pending_edit.turn_id должен указывать на
реальный agent_turns.id, а не на фиктивный stream_id.
"""
from __future__ import annotations

import json
import os
import sys
from unittest import mock

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from edit import get_pending_edit  # noqa: E402
from main import app  # noqa: E402


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


def _find_event(events, event_type):
    for e in events:
        if e.get("event") == event_type:
            return e
    return None


@pytest.fixture
def valid_edit_plan():
    return {
        "operations": [
            {"op": "update_node", "node_id": "step_1", "fields": {"title": "Приём заявки"}}
        ],
        "note": "Переименую шаг",
    }


def test_stream_edit_canvas_creates_pending_edit_with_real_turn_id(
    admin_token, session_with_steps, mock_projection, mock_route_intent_smalltalk, valid_edit_plan
):
    mock_route_intent_smalltalk.return_value = "edit_canvas"
    with mock.patch("memory.chat.propose_edit_plan") as fake_propose, \
         mock.patch("memory.chat.validate_edit_plan", return_value=[]):
        fake_propose.return_value = (valid_edit_plan, {"status": "ok", "iterations": 1, "validation_errors": []})
        c = TestClient(app)
        with c.stream(
            "POST",
            f"/sessions/{session_with_steps}/agent/stream",
            headers={**_auth(admin_token), "Accept": "text/event-stream"},
            json={"message": "переименуй шаг Приёмка в Приём заявки", "selected_step_id": "step_1"},
        ) as r:
            r.read()
            text = r.text
    assert r.status_code == 200, text
    events = _parse_sse(text)
    confirm = _find_event(events, "confirm_required")
    assert confirm is not None, f"expected confirm_required event, got events: {[e['event'] for e in events]}"
    data = json.loads(confirm["data"])
    pending_id = data["pending_edit_id"]
    assert pending_id.startswith("ape_")

    # FK: turn_id pending_edit должен совпадать с одним из реальных turn'ов из истории.
    pending = get_pending_edit(pending_id, org_id="org_default")
    assert pending is not None
    history_resp = c.get(
        f"/sessions/{session_with_steps}/agent/history",
        headers=_auth(admin_token),
    )
    assert history_resp.status_code == 200
    turn_ids = {t["id"] for t in history_resp.json()["turns"]}
    assert pending["turn_id"] in turn_ids, "pending_edit.turn_id must reference an existing agent_turns.id"


def test_stream_edit_reject_updates_status(
    admin_token, session_with_steps, mock_projection, mock_route_intent_smalltalk, valid_edit_plan
):
    mock_route_intent_smalltalk.return_value = "edit_canvas"
    with mock.patch("memory.chat.propose_edit_plan") as fake_propose, \
         mock.patch("memory.chat.validate_edit_plan", return_value=[]):
        fake_propose.return_value = (valid_edit_plan, {"status": "ok", "iterations": 1, "validation_errors": []})
        c = TestClient(app)
        with c.stream(
            "POST",
            f"/sessions/{session_with_steps}/agent/stream",
            headers={**_auth(admin_token), "Accept": "text/event-stream"},
            json={"message": "переименуй шаг", "selected_step_id": "step_1"},
        ) as r:
            r.read()
            text = r.text
    events = _parse_sse(text)
    confirm = _find_event(events, "confirm_required")
    pending_id = json.loads(confirm["data"])["pending_edit_id"]

    with c.stream(
        "POST",
        f"/sessions/{session_with_steps}/agent/resume",
        headers={**_auth(admin_token), "Accept": "text/event-stream"},
        json={"message": "", "selected_step_id": "step_1", "pending_edit_id": pending_id, "decision": "reject"},
    ) as r:
        r.read()
        text2 = r.text
    assert r.status_code == 200, text2
    resume_events = _parse_sse(text2)
    done = _find_event(resume_events, "done")
    assert done is not None
    assert json.loads(done["data"])["status"] == "rejected"

    pending = get_pending_edit(pending_id, org_id="org_default")
    assert pending["status"] == "rejected"


def test_stream_edit_confirm_applies_plan(
    admin_token, session_with_steps, mock_projection, mock_route_intent_smalltalk, valid_edit_plan
):
    mock_route_intent_smalltalk.return_value = "edit_canvas"
    with mock.patch("memory.chat.propose_edit_plan") as fake_propose, \
         mock.patch("memory.chat.validate_edit_plan", return_value=[]):
        fake_propose.return_value = (valid_edit_plan, {"status": "ok", "iterations": 1, "validation_errors": []})
        c = TestClient(app)
        with c.stream(
            "POST",
            f"/sessions/{session_with_steps}/agent/stream",
            headers={**_auth(admin_token), "Accept": "text/event-stream"},
            json={"message": "переименуй шаг", "selected_step_id": "step_1"},
        ) as r:
            r.read()
            text = r.text
    events = _parse_sse(text)
    confirm = _find_event(events, "confirm_required")
    pending_id = json.loads(confirm["data"])["pending_edit_id"]

    with mock.patch("runners.monolith_client.get_session") as fake_session, \
         mock.patch("routers.agent_resume.apply_edit_plan") as fake_apply:
        # base_diagram_state_version must match the pending edit's stored version
        # (session fixture has diagram_state_version=0).
        fake_session.return_value = {"diagram_state_version": 0, "project_id": "proj_1"}
        fake_apply.return_value = {"status": "applied", "operations_applied": 1, "snapshot_version_id": "snap_1"}
        with c.stream(
            "POST",
            f"/sessions/{session_with_steps}/agent/resume",
            headers={**_auth(admin_token), "Accept": "text/event-stream"},
            json={"message": "", "selected_step_id": "step_1", "pending_edit_id": pending_id, "decision": "confirm"},
        ) as r:
            r.read()
            text2 = r.text
    assert r.status_code == 200, text2
    resume_events = _parse_sse(text2)
    done = _find_event(resume_events, "done")
    assert done is not None
    assert json.loads(done["data"])["status"] == "applied"

    pending = get_pending_edit(pending_id, org_id="org_default")
    assert pending["status"] == "applied"


def test_stream_edit_captures_base_diagram_state_version(
    admin_token, session_with_steps, mock_projection, mock_route_intent_smalltalk, valid_edit_plan
):
    """Streaming edit_canvas must store the session's diagram_state_version in pending_edit."""
    import db

    expected_version = 7
    with db.get_conn() as conn:
        conn.execute(
            db.adapt_sql("UPDATE sessions SET diagram_state_version = ? WHERE id = ?"),
            [expected_version, session_with_steps],
        )

    mock_route_intent_smalltalk.return_value = "edit_canvas"
    with mock.patch("memory.chat.propose_edit_plan") as fake_propose, \
         mock.patch("memory.chat.validate_edit_plan", return_value=[]):
        fake_propose.return_value = (valid_edit_plan, {"status": "ok", "iterations": 1, "validation_errors": []})
        c = TestClient(app)
        with c.stream(
            "POST",
            f"/sessions/{session_with_steps}/agent/stream",
            headers={**_auth(admin_token), "Accept": "text/event-stream"},
            json={"message": "переименуй шаг", "selected_step_id": "step_1"},
        ) as r:
            r.read()
            text = r.text
    assert r.status_code == 200, text
    events = _parse_sse(text)
    confirm = _find_event(events, "confirm_required")
    assert confirm is not None
    pending_id = json.loads(confirm["data"])["pending_edit_id"]
    pending = get_pending_edit(pending_id, org_id="org_default")
    assert pending["base_diagram_state_version"] == expected_version
