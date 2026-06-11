from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Request

from .. import _legacy_main
from ..utils.authz import is_role_allowed, scope_allowed_project_ids
from ..analytics import compute_analytics
from ..storage import (
    _connect,
    _ensure_schema,
    _row_value,
    get_storage,
)

router = APIRouter()


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def _as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return int(default)


def _projects_for_workspace(org_id: str, workspace_id: str) -> List[Dict[str, Any]]:
    oid = _as_text(org_id)
    wid = _as_text(workspace_id)
    if not oid or not wid:
        return []
    _ensure_schema()
    with _connect() as con:
        rows = con.execute(
            "SELECT id, title, owner_user_id, created_at, updated_at FROM projects WHERE org_id = ? AND workspace_id = ? ORDER BY updated_at DESC",
            [oid, wid],
        ).fetchall()
    return [
        {
            "id": _as_text(row["id"]),
            "title": _as_text(row["title"]),
            "owner_user_id": _as_text(row["owner_user_id"]),
            "created_at": _as_int(row["created_at"]),
            "updated_at": _as_int(row["updated_at"]),
        }
        for row in rows
    ]


def _sessions_for_project(org_id: str, project_id: str, limit: int = 500) -> List[Any]:
    oid = _as_text(org_id)
    pid = _as_text(project_id)
    if not pid:
        return []
    st = get_storage()
    _ensure_schema()
    with _connect() as con:
        if oid:
            rows = con.execute(
                "SELECT id FROM sessions WHERE project_id = ? AND org_id = ? ORDER BY updated_at DESC LIMIT ?",
                [pid, oid, limit],
            ).fetchall()
            if not rows:
                rows = con.execute(
                    "SELECT id FROM sessions WHERE project_id = ? ORDER BY updated_at DESC LIMIT ?",
                    [pid, limit],
                ).fetchall()
        else:
            rows = con.execute(
                "SELECT id FROM sessions WHERE project_id = ? ORDER BY updated_at DESC LIMIT ?",
                [pid, limit],
            ).fetchall()
    sessions = []
    for row in rows:
        sid = _as_text(row["id"])
        if not sid:
            continue
        sess = st.load(sid, org_id=(oid or None), is_admin=True)
        if sess:
            sessions.append(sess)
    return sessions


def _session_summary_row(sess: Any) -> Dict[str, Any]:
    analytics = getattr(sess, "analytics", None) or {}
    timing = analytics.get("timing", {}) if isinstance(analytics, dict) else {}
    actions = analytics.get("actions", {}) if isinstance(analytics, dict) else {}
    coverage = analytics.get("coverage", {}) if isinstance(analytics, dict) else {}
    return {
        "session_id": _as_text(getattr(sess, "id", "")),
        "title": _as_text(getattr(sess, "title", "")),
        "duration_min": _as_int(timing.get("total_duration_min"), 0),
        "actions_count": _as_int(actions.get("total"), 0),
        "critical_questions": _as_int(coverage.get("critical_questions"), 0),
        "updated_at": _as_int(getattr(sess, "updated_at", 0)),
    }


def _compute_session_analytics(sess: Any) -> Dict[str, Any]:
    if not getattr(sess, "analytics", None):
        try:
            return compute_analytics(sess)
        except Exception:
            return {}
    return getattr(sess, "analytics", {}) or {}


def _aggregate_sessions(sessions: List[Any]) -> Dict[str, Any]:
    total_actions = 0
    total_duration = 0
    total_critical = 0
    duration_count = 0
    session_rows = []

    for sess in sessions:
        analytics = _compute_session_analytics(sess)
        timing = analytics.get("timing", {}) if isinstance(analytics, dict) else {}
        actions = analytics.get("actions", {}) if isinstance(analytics, dict) else {}
        coverage = analytics.get("coverage", {}) if isinstance(analytics, dict) else {}

        duration = _as_int(timing.get("total_duration_min"), 0)
        act_count = _as_int(actions.get("total"), 0)
        crit = _as_int(coverage.get("critical_questions"), 0)

        total_actions += act_count
        total_duration += duration
        total_critical += crit
        if duration > 0:
            duration_count += 1

        session_rows.append(_session_summary_row(sess))

    avg_duration = round(total_duration / max(len(sessions), 1), 1)

    return {
        "sessions_count": len(sessions),
        "total_actions": total_actions,
        "avg_duration_min": avg_duration,
        "total_critical_questions": total_critical,
        "sessions": session_rows,
    }


@router.get("/api/projects/{project_id}/analytics")
def get_project_analytics(project_id: str, request: Request) -> Dict[str, Any]:
    oid = _legacy_main._request_active_org_id(request)
    role, err = _legacy_main._enterprise_require_org_member(request, oid)
    if err is not None:
        return err

    pid = _as_text(project_id)
    if not pid:
        return _legacy_main._enterprise_error(422, "validation_error", "project_id required")

    scope = _legacy_main._project_scope_for_request(request, oid)
    allowed = scope_allowed_project_ids(scope)
    if allowed and pid not in allowed:
        return _legacy_main._enterprise_error(404, "not_found", "not_found")

    sessions = _sessions_for_project(oid, pid, limit=500)
    agg = _aggregate_sessions(sessions)

    return {
        "project_id": pid,
        "sessions_count": agg["sessions_count"],
        "total_actions": agg["total_actions"],
        "avg_duration_min": agg["avg_duration_min"],
        "total_critical_questions": agg["total_critical_questions"],
        "sessions": agg["sessions"],
    }


@router.get("/api/workspaces/{workspace_id}/analytics")
def get_workspace_analytics(workspace_id: str, request: Request) -> Dict[str, Any]:
    oid = _legacy_main._request_active_org_id(request)
    role, err = _legacy_main._enterprise_require_org_member(request, oid)
    if err is not None:
        return err

    wid = _as_text(workspace_id)
    if not wid:
        return _legacy_main._enterprise_error(422, "validation_error", "workspace_id required")

    scope = _legacy_main._project_scope_for_request(request, oid)
    allowed = scope_allowed_project_ids(scope)

    projects = _projects_for_workspace(oid, wid)
    if allowed:
        projects = [p for p in projects if p["id"] in allowed]

    project_ids = [p["id"] for p in projects]
    all_sessions: List[Any] = []
    for pid in project_ids:
        all_sessions.extend(_sessions_for_project(oid, pid, limit=500))

    # Deduplicate by session id and cap
    seen = set()
    deduped = []
    for sess in all_sessions:
        sid = _as_text(getattr(sess, "id", ""))
        if not sid or sid in seen:
            continue
        seen.add(sid)
        deduped.append(sess)
        if len(deduped) >= 500:
            break

    agg = _aggregate_sessions(deduped)

    # Build recent sessions with project titles
    project_titles = {p["id"]: p["title"] for p in projects}
    recent_sessions = []
    for s in agg["sessions"][:20]:
        row = dict(s)
        # Find project_id from session object
        for sess in deduped:
            if _as_text(getattr(sess, "id", "")) == row["session_id"]:
                row["project_id"] = _as_text(getattr(sess, "project_id", ""))
                row["project_title"] = project_titles.get(row["project_id"], "")
                break
        recent_sessions.append(row)

    return {
        "workspace_id": wid,
        "projects_count": len(projects),
        "sessions_count": agg["sessions_count"],
        "total_actions": agg["total_actions"],
        "avg_duration_min": agg["avg_duration_min"],
        "recent_sessions": recent_sessions,
    }
