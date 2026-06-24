from __future__ import annotations

from typing import Any, Dict, Literal, Optional
from fastapi import HTTPException, Request

from ..storage import get_storage
from ..legacy.request_context import request_auth_user


ScopeType = Literal["workspace", "project", "session"]


def _request_user(request: Request) -> Dict[str, Any]:
    return request_auth_user(request)


def _find_workspace_for_project(project_id: str, org_id: str) -> Optional[str]:
    st = get_storage()
    rows = st._query(
        "SELECT workspace_id FROM workspace_projects WHERE project_id=? AND org_id=?",
        (project_id, org_id),
    )
    if rows:
        return rows[0][0]
    return None


def _find_project_for_session(session_id: str, org_id: str) -> Optional[str]:
    st = get_storage()
    rows = st._query(
        "SELECT project_id FROM sessions WHERE id=? AND org_id=?",
        (session_id, org_id),
    )
    if rows:
        return rows[0][0]
    return None


def _check_workspace_role(user: Dict[str, Any], workspace_id: str) -> bool:
    if user.get("is_admin"):
        return True
    st = get_storage()
    rows = st._query(
        "SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?",
        (workspace_id, str(user.get("id") or "")),
    )
    if not rows:
        return False
    return rows[0][0] in ("owner", "admin", "analyst", "viewer")


def _check_project_role(user: Dict[str, Any], project_id: str, org_id: str) -> bool:
    if user.get("is_admin"):
        return True
    workspace_id = _find_workspace_for_project(project_id, org_id)
    if workspace_id and _check_workspace_role(user, workspace_id):
        return True
    rows = get_storage()._query(
        "SELECT role FROM project_members WHERE project_id=? AND user_id=?",
        (project_id, str(user.get("id") or "")),
    )
    if rows:
        return rows[0][0] in ("owner", "admin", "analyst", "viewer")
    return False


def _check_session_role(user: Dict[str, Any], session_id: str, org_id: str) -> bool:
    if user.get("is_admin"):
        return True
    project_id = _find_project_for_session(session_id, org_id)
    if project_id and _check_project_role(user, project_id, org_id):
        return True
    rows = get_storage()._query(
        "SELECT role FROM session_members WHERE session_id=? AND user_id=?",
        (session_id, str(user.get("id") or "")),
    )
    if rows:
        return rows[0][0] in ("owner", "admin", "analyst", "viewer")
    return False


def _scope_exists(scope_type: str, scope_id: str, org_id: str) -> bool:
    st = get_storage()
    if scope_type == "workspace":
        rows = st._query("SELECT id FROM workspaces WHERE id=? AND org_id=?", (scope_id, org_id))
    elif scope_type == "project":
        rows = st._query("SELECT id FROM projects WHERE id=? AND org_id=?", (scope_id, org_id))
    elif scope_type == "session":
        rows = st._query("SELECT id FROM sessions WHERE id=? AND org_id=?", (scope_id, org_id))
    else:
        return False
    return bool(rows)


def require_analytics_scope(
    request: Request,
    scope_type: ScopeType,
    scope_id: str,
    org_id: str,
):
    user = _request_user(request)
    if not str(user.get("id") or "").strip():
        raise HTTPException(status_code=401, detail="unauthorized")

    if not _scope_exists(scope_type, scope_id, org_id):
        raise HTTPException(status_code=404, detail="not found")

    allowed = False
    if scope_type == "workspace":
        allowed = _check_workspace_role(user, scope_id)
    elif scope_type == "project":
        allowed = _check_project_role(user, scope_id, org_id)
    elif scope_type == "session":
        allowed = _check_session_role(user, scope_id, org_id)

    if not allowed:
        raise HTTPException(status_code=403, detail="forbidden")
    return user
