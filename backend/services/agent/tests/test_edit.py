"""Tests for AGENT-3 canvas editing helpers.

Сервис не импортирует backend.app.* — guard в test_no_monolith_imports.py.
"""
from __future__ import annotations

import uuid
from unittest import mock

import pytest

from edit import (
    build_human_diff,
    create_pending_edit,
    get_pending_edit,
    propose_edit_plan,
    update_pending_edit_status,
    validate_edit_plan,
)
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
