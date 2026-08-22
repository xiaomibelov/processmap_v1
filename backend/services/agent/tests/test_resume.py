"""Tests for AGENT-3 resume endpoint (confirm/reject/conflict_rev)."""
from __future__ import annotations

import uuid
from unittest import mock

import pytest

from edit import create_pending_edit, get_pending_edit
from memory.memory_store import _ensure_agent_schema
from routers.agent_resume import _resume_stream, ResumeIn


@pytest.fixture
def seed():
    return {
        "org_id": "org_default",
        "user_id": f"u_{uuid.uuid4().hex[:8]}",
        "session_id": f"s_{uuid.uuid4().hex[:8]}",
    }


def _events(stream):
    """Collect SSE events from generator into list of (event_type, data)."""
    out = []
    for raw in stream:
        for line in raw.strip().split("\n"):
            if line.startswith("event:"):
                out.append({"event": line.split(":", 1)[1].strip()})
            elif line.startswith("data:"):
                out[-1]["data"] = line.split(":", 1)[1].strip()
    return out


def test_resume_confirm_conflict_rev_on_version_mismatch(seed):
    """If session version changed since proposal, resume returns conflict_rev."""
    _ensure_agent_schema()

    pending_id = create_pending_edit(
        session_id=seed["session_id"],
        org_id=seed["org_id"],
        turn_id="turn_1",
        edit_plan={"operations": [{"op": "update_node", "node_id": "n_1", "fields": {"title": "X"}}]},
        base_diagram_state_version=2,
    )

    payload = ResumeIn(pending_edit_id=pending_id, decision="confirm", message="", selected_step_id=None)

    with mock.patch("routers.agent_resume.monolith_client.get_session") as m_get_session:
        m_get_session.return_value = {
            "id": seed["session_id"],
            "org_id": seed["org_id"],
            "project_id": "p_1",
            "diagram_state_version": 3,  # bumped after proposal
        }

        events = list(_resume_stream(
            session_id=seed["session_id"],
            user_id=seed["user_id"],
            org_id=seed["org_id"],
            payload=payload,
            token="tok",
        ))

    parsed = _events(events)
    assert parsed[0]["event"] == "start"
    assert parsed[1]["event"] == "error"
    assert '"status": "conflict_rev"' in parsed[1]["data"]
    assert '"pending_base_version": 2' in parsed[1]["data"]
    assert '"server_current_version": 3' in parsed[1]["data"]

    row = get_pending_edit(pending_id, seed["org_id"])
    assert row["status"] == "conflict_rev"
    assert row["resumed_by_user_id"] == seed["user_id"]


def test_resume_reject_sets_status(seed):
    """Reject decision marks pending_edit as rejected without touching session."""
    _ensure_agent_schema()

    pending_id = create_pending_edit(
        session_id=seed["session_id"],
        org_id=seed["org_id"],
        turn_id="turn_1",
        edit_plan={"operations": []},
        base_diagram_state_version=2,
    )

    payload = ResumeIn(pending_edit_id=pending_id, decision="reject", message="", selected_step_id=None)
    events = list(_resume_stream(
        session_id=seed["session_id"],
        user_id=seed["user_id"],
        org_id=seed["org_id"],
        payload=payload,
        token="tok",
    ))

    parsed = _events(events)
    assert parsed[0]["event"] == "start"
    assert parsed[1]["event"] == "done"
    assert '"status": "rejected"' in parsed[1]["data"]

    row = get_pending_edit(pending_id, seed["org_id"])
    assert row["status"] == "rejected"
