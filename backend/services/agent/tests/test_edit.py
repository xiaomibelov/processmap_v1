"""Tests for AGENT-3 canvas editing helpers.

Сервис не импортирует backend.app.* — guard в test_no_monolith_imports.py.
"""
from __future__ import annotations

import uuid
from unittest import mock

import pytest

from edit import (
    apply_edit_plan,
    build_human_diff,
    create_pending_edit,
    get_pending_edit,
    propose_edit_plan,
    update_pending_edit_status,
    validate_edit_plan,
)
from edit.applier import EditApplyError
from edit.state import _now_ts


@pytest.fixture
def projection():
    return {
        "steps": [
            {"id": "n_1", "title": "Приёмка", "operation_code": "receiving"},
            {"id": "n_2", "title": "Предварительная обработка", "operation_code": "preprocess"},
        ],
        "edges": [
            {"from_id": "n_1", "to_id": "n_2"},
        ],
    }


def test_validate_update_node_ok(projection):
    plan = {
        "operations": [
            {"op": "update_node", "node_id": "n_1", "fields": {"title": "Новая приёмка"}}
        ]
    }
    errors = validate_edit_plan(plan, projection, token="", session_id="s1")
    assert errors == []


def test_validate_update_node_unknown(projection):
    plan = {
        "operations": [
            {"op": "update_node", "node_id": "n_99", "fields": {"title": "X"}}
        ]
    }
    errors = validate_edit_plan(plan, projection, token="", session_id="s1")
    assert any("n_99" in e for e in errors)


def test_validate_delete_node_orphan(projection):
    plan = {
        "operations": [
            {"op": "delete_node", "node_id": "n_1"}
        ]
    }
    errors = validate_edit_plan(plan, projection, token="", session_id="s1")
    assert any("висяч" in e.lower() for e in errors)


def test_validate_add_node_ok(projection):
    plan = {
        "operations": [
            {"op": "add_node", "node_id": "n_9", "title": "Новый шаг", "type": "step"}
        ]
    }
    errors = validate_edit_plan(plan, projection, token="", session_id="s1")
    assert errors == []


def test_validate_add_node_duplicate(projection):
    plan = {
        "operations": [
            {"op": "add_node", "node_id": "n_1", "title": "X", "type": "step"}
        ]
    }
    errors = validate_edit_plan(plan, projection, token="", session_id="s1")
    assert any("уже существует" in e.lower() for e in errors)


def test_build_human_diff():
    plan = {
        "operations": [
            {"op": "update_node", "node_id": "n_1", "fields": {"title": "Новое имя"}},
            {"op": "add_node", "node_id": "n_9", "title": "Новый шаг"},
            {"op": "delete_node", "node_id": "n_2"},
        ]
    }
    diff = build_human_diff(plan)
    assert len(diff) == 3
    assert diff[0]["op"] == "update"
    assert diff[1]["op"] == "add_node"
    assert diff[2]["op"] == "delete_node"


def test_create_and_get_pending_edit():
    sid = f"sess_{uuid.uuid4().hex[:8]}"
    peid = create_pending_edit(
        session_id=sid,
        org_id="org_default",
        turn_id="turn_1",
        edit_plan={"operations": []},
    )
    assert peid.startswith("ape_")
    row = get_pending_edit(peid, "org_default")
    assert row is not None
    assert row["status"] == "pending"
    assert row["session_id"] == sid
    assert row["base_diagram_state_version"] == 0


def test_pending_edit_stores_base_diagram_state_version():
    peid = create_pending_edit(
        session_id="s1",
        org_id="org_default",
        turn_id="turn_1",
        edit_plan={"operations": []},
        base_diagram_state_version=7,
    )
    row = get_pending_edit(peid)
    assert row["base_diagram_state_version"] == 7


def test_update_pending_edit_status():
    peid = create_pending_edit(
        session_id="s1",
        org_id="org_default",
        turn_id="turn_1",
        edit_plan={"operations": []},
    )
    ok = update_pending_edit_status(peid, "rejected", resumed_by_user_id="u_1")
    assert ok is True
    row = get_pending_edit(peid)
    assert row["status"] == "rejected"
    assert row["resumed_by_user_id"] == "u_1"


def test_propose_edit_plan_returns_valid_plan(projection):
    with mock.patch("edit.planner.complete") as m_complete:
        m_complete.return_value = {
            "ok": True,
            "text": (
                '```json\n'
                '{"operations": [{"op": "update_node", "node_id": "n_1", "fields": {"title": "Новое имя"}}], "note": "ok"}\n'
                '```'
            ),
            "usage": {"prompt_tokens": 10, "completion_tokens": 5},
            "model": "deepseek-chat",
        }
        plan, meta = propose_edit_plan(
            question="переименуй n_1",
            projection=projection,
            token="",
            session_id="s1",
            org_id="org_default",
            user_id="u_1",
            project_id="p_1",
        )
    assert meta["status"] == "ok"
    assert plan is not None
    assert plan["operations"][0]["node_id"] == "n_1"


def test_propose_edit_plan_retries_on_validation_error(projection):
    with mock.patch("edit.planner.complete") as m_complete:
        # First response invalid; second valid.
        m_complete.side_effect = [
            {
                "ok": True,
                "text": '{"operations": [{"op": "update_node", "node_id": "n_99", "fields": {"title": "X"}}]}',
                "usage": {"prompt_tokens": 10, "completion_tokens": 5},
                "model": "deepseek-chat",
            },
            {
                "ok": True,
                "text": '{"operations": [{"op": "update_node", "node_id": "n_1", "fields": {"title": "Y"}}]}',
                "usage": {"prompt_tokens": 10, "completion_tokens": 5},
                "model": "deepseek-chat",
            },
        ]
        plan, meta = propose_edit_plan(
            question="переименуй",
            projection=projection,
            token="",
            session_id="s1",
            org_id="org_default",
            user_id="u_1",
            project_id="p_1",
        )
    assert meta["status"] == "ok"
    assert plan is not None
    assert meta["iterations"] == 2


def test_propose_edit_plan_disabled_without_feature_flag(projection):
    import db

    with db.get_conn() as conn:
        conn.execute(
            db.adapt_sql("INSERT INTO llm_feature_flags (feature, enabled, daily_token_limit) VALUES (?, 0, ?)"),
            ("agent_edit_propose", 0),
        )
    plan, meta = propose_edit_plan(
        question="переименуй",
        projection=projection,
        token="",
        session_id="s1",
        org_id="org_default",
        user_id="u_1",
        project_id="p_1",
    )
    assert meta["status"] == "disabled"
    assert plan is None


def test_apply_edit_plan_conflict_rev_on_version_mismatch():
    with mock.patch("edit.applier.monolith_client") as m:
        m.get_session_graph.return_value = {"diagram_state_version": 5, "nodes": [], "edges": []}
        m.get_session_bpmn.return_value = ""
        with pytest.raises(EditApplyError) as exc_info:
            apply_edit_plan("s1", "tok", {"operations": []}, base_diagram_state_version=4)
    assert exc_info.value.status == "conflict_rev"


def test_apply_edit_plan_updates_bpmn_xml_for_rename():
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">'
        '<bpmn:process id="Process_1"><bpmn:task id="Task_1" name="Old name"/></bpmn:process>'
        '</bpmn:definitions>'
    )
    with mock.patch("edit.applier.monolith_client") as m:
        m.get_session_graph.return_value = {"diagram_state_version": 2, "nodes": [], "edges": []}
        m.get_session_bpmn.return_value = xml
        m.bpmn_save.return_value = {
            "_http_status": 200,
            "bpmn_version_snapshot": {"id": "snap_1", "version_number": 7},
        }
        m.write_agent_edit_audit.return_value = {"_http_status": 200}
        result = apply_edit_plan(
            "s1", "tok",
            {"operations": [{"op": "update_node", "node_id": "Task_1", "fields": {"title": "New name"}}]},
            base_diagram_state_version=2,
        )
    assert result["status"] == "applied"
    assert result["operations_applied"] == 1
    assert result["snapshot_version_id"] == "snap_1"
    saved_xml = m.bpmn_save.call_args[0][2]
    assert 'name="New name"' in saved_xml
    assert saved_xml != xml


def test_apply_edit_plan_uses_granular_endpoints_when_no_bpmn_xml():
    with mock.patch("edit.applier.monolith_client") as m:
        m.get_session_graph.return_value = {
            "diagram_state_version": 3,
            "nodes": [{"id": "n_1", "title": "Old"}],
            "edges": [],
        }
        m.get_session_bpmn.return_value = ""
        m.patch_node.return_value = {"_http_status": 200, "diagram_state_version": 4}
        m.write_agent_edit_audit.return_value = {"_http_status": 200}
        result = apply_edit_plan(
            "s1", "tok",
            {"operations": [{"op": "update_node", "node_id": "n_1", "fields": {"title": "New"}}]},
            base_diagram_state_version=3,
        )
    assert result["status"] == "applied"
    assert result["operations_applied"] == 1
    assert m.patch_node.called
    _, node_id, token, fields = m.patch_node.call_args[0]
    assert node_id == "n_1"
    assert fields["title"] == "New"
