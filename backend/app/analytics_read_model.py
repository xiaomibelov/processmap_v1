from __future__ import annotations

import json
import time
from typing import Any, Dict, List, Optional

from .analytics import compute_analytics
from .storage import _connect, _ensure_schema, get_project_storage, get_storage


def _now_ts() -> int:
    return int(time.time())


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _json_loads(text: str, default: Any = None) -> Any:
    try:
        return json.loads(text or "null")
    except Exception:
        return default


def _workspace_id_for_project(project_id: str, org_id: str) -> str:
    project = get_project_storage().load(project_id, org_id=org_id, is_admin=True)
    return str(getattr(project, "workspace_id", "") or "") if project else ""


def upsert_session_analytics_snapshot(
    session_id: str,
    org_id: str,
    project_id: str,
    workspace_id: str,
) -> Dict[str, Any]:
    _ensure_schema()
    st = get_storage()
    session = st.load(session_id, org_id=org_id or None, is_admin=True)
    if session is None:
        raise ValueError("session not found")
    analytics = compute_analytics(session)
    timing = analytics.get("timing") or {}
    actions = analytics.get("actions") or {}
    handoffs = analytics.get("handoffs") or {}
    coverage = analytics.get("coverage") or {}
    computed_at = _now_ts()
    with _connect() as con:
        con.execute(
            """
            INSERT INTO analytics_session_snapshots (
              session_id, org_id, project_id, workspace_id, total_duration_min, critical_path_min,
              actions_total, actions_by_role_json, actions_by_section_json, actions_by_type_json,
              handoffs_count, open_questions, critical_questions, unknown_duration_nodes_json, computed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
              org_id=excluded.org_id,
              project_id=excluded.project_id,
              workspace_id=excluded.workspace_id,
              total_duration_min=excluded.total_duration_min,
              critical_path_min=excluded.critical_path_min,
              actions_total=excluded.actions_total,
              actions_by_role_json=excluded.actions_by_role_json,
              actions_by_section_json=excluded.actions_by_section_json,
              actions_by_type_json=excluded.actions_by_type_json,
              handoffs_count=excluded.handoffs_count,
              open_questions=excluded.open_questions,
              critical_questions=excluded.critical_questions,
              unknown_duration_nodes_json=excluded.unknown_duration_nodes_json,
              computed_at=excluded.computed_at
            """,
            [
                session_id,
                org_id,
                project_id,
                workspace_id,
                int(timing.get("total_duration_min") or 0),
                int(timing.get("critical_path_min") or 0) if timing.get("critical_path_min") is not None else None,
                int(actions.get("total") or 0),
                _json_dumps(actions.get("by_role") or {}),
                _json_dumps(actions.get("by_section") or {}),
                _json_dumps(actions.get("by_type") or {}),
                int(handoffs.get("count") or 0),
                int(coverage.get("open_questions") or 0),
                int(coverage.get("critical_questions") or 0),
                _json_dumps(timing.get("unknown_duration_nodes") or []),
                computed_at,
            ],
        )
    return {"session_id": session_id, "computed_at": computed_at}


def refresh_project_analytics_snapshot(project_id: str, org_id: str) -> Dict[str, Any]:
    _ensure_schema()
    workspace_id = _workspace_id_for_project(project_id, org_id)
    with _connect() as con:
        rows = con.execute(
            "SELECT * FROM analytics_session_snapshots WHERE org_id = ? AND project_id = ?",
            [org_id, project_id],
        ).fetchall()
    sessions_count = len(rows)
    total_actions = sum(int(r["actions_total"] or 0) for r in rows)
    durations = [int(r["total_duration_min"] or 0) for r in rows if int(r["total_duration_min"] or 0) > 0]
    avg_duration = round(sum(durations) / max(len(durations), 1), 1) if durations else 0.0
    total_critical = sum(int(r["critical_questions"] or 0) for r in rows)
    total_handoffs = sum(int(r["handoffs_count"] or 0) for r in rows)
    computed_at = _now_ts()
    with _connect() as con:
        con.execute(
            """
            INSERT INTO analytics_project_snapshots
            (project_id, org_id, workspace_id, sessions_count, total_actions, avg_duration_min,
             total_critical_questions, handoffs_count, computed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(project_id) DO UPDATE SET
              org_id=excluded.org_id, workspace_id=excluded.workspace_id, sessions_count=excluded.sessions_count,
              total_actions=excluded.total_actions, avg_duration_min=excluded.avg_duration_min,
              total_critical_questions=excluded.total_critical_questions, handoffs_count=excluded.handoffs_count,
              computed_at=excluded.computed_at
            """,
            [project_id, org_id, workspace_id, sessions_count, total_actions, avg_duration, total_critical, total_handoffs, computed_at],
        )
    return {"project_id": project_id, "computed_at": computed_at}


def refresh_workspace_analytics_snapshot(workspace_id: str, org_id: str) -> Dict[str, Any]:
    _ensure_schema()
    with _connect() as con:
        projects = con.execute(
            "SELECT id FROM projects WHERE org_id = ? AND workspace_id = ?",
            [org_id, workspace_id],
        ).fetchall()
    project_ids = [str(r["id"]) for r in projects]
    projects_count = len(project_ids)
    with _connect() as con:
        rows = (
            con.execute(
                f"SELECT * FROM analytics_session_snapshots WHERE org_id = ? AND project_id IN ({','.join('?' * len(project_ids))})",
                [org_id, *project_ids],
            ).fetchall()
            if project_ids
            else []
        )
    sessions_count = len(rows)
    total_actions = sum(int(r["actions_total"] or 0) for r in rows)
    durations = [int(r["total_duration_min"] or 0) for r in rows if int(r["total_duration_min"] or 0) > 0]
    avg_duration = round(sum(durations) / max(len(durations), 1), 1) if durations else 0.0
    total_critical = sum(int(r["critical_questions"] or 0) for r in rows)
    total_handoffs = sum(int(r["handoffs_count"] or 0) for r in rows)
    computed_at = _now_ts()
    with _connect() as con:
        con.execute(
            """
            INSERT INTO analytics_workspace_snapshots
            (workspace_id, org_id, projects_count, sessions_count, total_actions, avg_duration_min,
             total_critical_questions, handoffs_count, computed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(workspace_id) DO UPDATE SET
              org_id=excluded.org_id, projects_count=excluded.projects_count, sessions_count=excluded.sessions_count,
              total_actions=excluded.total_actions, avg_duration_min=excluded.avg_duration_min,
              total_critical_questions=excluded.total_critical_questions, handoffs_count=excluded.handoffs_count,
              computed_at=excluded.computed_at
            """,
            [workspace_id, org_id, projects_count, sessions_count, total_actions, avg_duration, total_critical, total_handoffs, computed_at],
        )
    return {"workspace_id": workspace_id, "computed_at": computed_at}


def refresh_analytics_for_session(session_id: str, org_id: str) -> Dict[str, Any]:
    st = get_storage()
    session = st.load(session_id, org_id=org_id or None, is_admin=True)
    if session is None:
        raise ValueError("session not found")
    project_id = str(getattr(session, "project_id", "") or "")
    workspace_id = _workspace_id_for_project(project_id, org_id) if project_id else ""
    upsert_session_analytics_snapshot(session_id, org_id, project_id, workspace_id)
    if project_id:
        refresh_project_analytics_snapshot(project_id, org_id)
    if workspace_id:
        refresh_workspace_analytics_snapshot(workspace_id, org_id)
    return {"session_id": session_id, "project_id": project_id, "workspace_id": workspace_id}
