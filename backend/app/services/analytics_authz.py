from __future__ import annotations

from typing import Any, Dict, Literal
from fastapi import HTTPException, Request

from ..legacy.request_context import request_auth_user
from ..storage import _connect


ScopeType = Literal["workspace", "project", "session"]


def _request_user(request: Request) -> Dict[str, Any]:
    return request_auth_user(request)


def _find_workspace_for_project(project_id: str, org_id: str) -> str:
    with _connect() as con:
        rows = con.execute(
            "SELECT workspace_id FROM projects WHERE id=? AND org_id=?",
            (project_id, org_id),
        ).fetchall()
    if rows:
        return rows[0][0]
    return ""


def _find_org_for_workspace(workspace_id: str) -> str:
    with _connect() as con:
        rows = con.execute(
            "SELECT org_id FROM workspaces WHERE id=?",
            (workspace_id,),
        ).fetchall()
    if rows:
        return rows[0][0]
    return ""


def _is_org_admin(user: Dict[str, Any], org_id: str) -> bool:
    if user.get("is_admin"):
        return True
    with _connect() as con:
        rows = con.execute(
            "SELECT role FROM org_memberships WHERE org_id=? AND user_id=?",
            (org_id, str(user.get("id") or "")),
        ).fetchall()
    if not rows:
        return False
    return rows[0][0] in ("owner", "admin", "org_admin")


def _allowed_role(role: str) -> bool:
    return role in ("owner", "admin", "analyst", "viewer", "org_admin")


def _check_workspace_role(user: Dict[str, Any], workspace_id: str) -> bool:
    if user.get("is_admin"):
        return True
    org_id = _find_org_for_workspace(workspace_id)
    if org_id and _is_org_admin(user, org_id):
        return True
    with _connect() as con:
        rows = con.execute(
            """
            SELECT pm.role FROM project_memberships pm
            JOIN projects p ON p.id = pm.project_id
            WHERE p.workspace_id = ? AND pm.user_id = ?
            LIMIT 1
            """,
            (workspace_id, str(user.get("id") or "")),
        ).fetchall()
    if not rows:
        return False
    return _allowed_role(rows[0][0])


def _check_project_role(user: Dict[str, Any], project_id: str, org_id: str) -> bool:
    if user.get("is_admin"):
        return True
    if _is_org_admin(user, org_id):
        return True
    workspace_id = _find_workspace_for_project(project_id, org_id)
    if workspace_id and _check_workspace_role(user, workspace_id):
        return True
    with _connect() as con:
        rows = con.execute(
            "SELECT role FROM project_memberships WHERE project_id=? AND user_id=?",
            (project_id, str(user.get("id") or "")),
        ).fetchall()
    if rows:
        return _allowed_role(rows[0][0])
    return False


def _check_session_role(user: Dict[str, Any], session_id: str, org_id: str) -> bool:
    if user.get("is_admin"):
        return True
    if _is_org_admin(user, org_id):
        return True
    project_id = ""
    owner_user_id = ""
    with _connect() as con:
        rows = con.execute(
            "SELECT project_id, owner_user_id FROM sessions WHERE id=? AND org_id=?",
            (session_id, org_id),
        ).fetchall()
    if rows:
        project_id = rows[0][0] or ""
        owner_user_id = rows[0][1] or ""
    if owner_user_id and str(user.get("id") or "") == str(owner_user_id):
        return True
    if project_id and _check_project_role(user, project_id, org_id):
        return True
    return False


def _scope_exists(scope_type: str, scope_id: str, org_id: str) -> bool:
    with _connect() as con:
        if scope_type == "workspace":
            rows = con.execute("SELECT id FROM workspaces WHERE id=? AND org_id=?", (scope_id, org_id)).fetchall()
        elif scope_type == "project":
            rows = con.execute("SELECT id FROM projects WHERE id=? AND org_id=?", (scope_id, org_id)).fetchall()
        elif scope_type == "session":
            rows = con.execute("SELECT id FROM sessions WHERE id=? AND org_id=?", (scope_id, org_id)).fetchall()
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
