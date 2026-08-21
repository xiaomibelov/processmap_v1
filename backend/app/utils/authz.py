from __future__ import annotations

from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import Request
from fastapi.responses import JSONResponse

from ..legacy.request_context import (
    enterprise_error as _enterprise_error,
    request_active_org_id as _request_active_org_id,
)
from ..services.org_workspace import (
    enterprise_require_org_member as _enterprise_require_org_member,
    project_scope_for_request as _project_scope_for_request,
    get_default_org_id,
)
from ..storage import get_storage


# ── Role constants ────────────────────────────────────────────────

ORG_WRITE_ROLES = {"org_owner", "org_admin"}
ORG_READ_ROLES = {"org_owner", "org_admin", "project_manager", "editor", "viewer", "org_viewer", "auditor"}
ORG_PROJECT_MEMBER_MANAGE_ROLES = {"org_owner", "org_admin", "project_manager"}
ORG_MEMBER_MANAGE_ROLES = {"org_owner", "org_admin"}
ORG_INVITE_MANAGE_ROLES = {"org_owner", "org_admin"}
ORG_AUDIT_READ_ROLES = {"org_owner", "org_admin", "auditor", "project_manager"}
WORKSPACE_ADMIN_ROLES = {"org_owner", "org_admin"}
WORKSPACE_EDITOR_ROLES = {"org_owner", "org_admin", "project_manager", "editor"}


# ── Shared authorization helpers ──────────────────────────────────
# SHARED: used by orgs, projects, sessions, templates, admin.

def practical_role_for_org(role_raw: Any, is_admin: bool = False) -> str:
    if bool(is_admin):
        return "admin"
    role = str(role_raw or "").strip().lower()
    if role in WORKSPACE_ADMIN_ROLES:
        return "admin"
    if role in WORKSPACE_EDITOR_ROLES:
        return "editor"
    return "viewer"


def can_manage_workspace(role_raw: Any, is_admin: bool = False) -> bool:
    return practical_role_for_org(role_raw, is_admin=is_admin) == "admin"


def can_edit_workspace(role_raw: Any, is_admin: bool = False) -> bool:
    return practical_role_for_org(role_raw, is_admin=is_admin) in {"admin", "editor"}


def can_delete_workspace_content(role_raw: Any, is_admin: bool = False) -> bool:
    return practical_role_for_org(role_raw, is_admin=is_admin) == "admin"


def enterprise_require_project_access(
    request: Request,
    org_id: str,
    project_id: str,
) -> Tuple[Optional[str], Optional[Dict[str, Any]], Optional[JSONResponse]]:
    role, err = _enterprise_require_org_member(request, org_id)
    if err is not None:
        return None, None, err
    oid = str(org_id or "").strip()
    pid = str(project_id or "").strip()
    if not pid:
        return None, None, _enterprise_error(404, "not_found", "not_found")
    scope = _project_scope_for_request(request, oid)
    if str(scope.get("mode") or "") != "all":
        allowed = {str(item or "").strip() for item in (scope.get("project_ids") or []) if str(item or "").strip()}
        if pid not in allowed:
            return None, None, _enterprise_error(404, "not_found", "not_found")
    return role, scope, None


def session_access_from_request(
    request: Optional[Request],
    session_id: str,
    *,
    org_id: Optional[str] = None,
):
    from ..models import Session
    sid = str(session_id or "").strip()
    if not sid:
        return None, None, _enterprise_error(404, "not_found", "not_found")
    st = get_storage()
    oid = str(org_id or "").strip() or _request_active_org_id(request)
    sess = st.load(sid, org_id=oid, is_admin=True)
    if not sess:
        return None, None, _enterprise_error(404, "not_found", "not_found")
    scope = _project_scope_for_request(request, oid)
    project_id = str(getattr(sess, "project_id", "") or "").strip()
    if project_id and str(scope.get("mode") or "") != "all":
        allowed = {str(item or "").strip() for item in (scope.get("project_ids") or []) if str(item or "").strip()}
        if project_id not in allowed:
            return None, None, _enterprise_error(404, "not_found", "not_found")
    return sess, scope, None


def scope_allowed_project_ids(scope_raw: Any) -> Set[str]:
    scope = scope_raw if isinstance(scope_raw, dict) else {}
    if str(scope.get("mode") or "") == "all":
        return set()
    return {
        str(item or "").strip()
        for item in (scope.get("project_ids") or [])
        if str(item or "").strip()
    }


def is_role_allowed(role_raw: Any, allowed: Set[str]) -> bool:
    return str(role_raw or "").strip().lower() in {str(a or "").strip().lower() for a in (allowed or set())}


def enterprise_manage_project_members_guard(
    request: Request,
    org_id: str,
    project_id: str,
) -> Tuple[Optional[str], Optional[Dict[str, Any]], Optional[JSONResponse]]:
    role, scope, err = enterprise_require_project_access(request, org_id, project_id)
    if err is not None:
        return None, None, err
    if not is_role_allowed(role, ORG_PROJECT_MEMBER_MANAGE_ROLES):
        return None, None, _enterprise_error(403, "forbidden", "insufficient_permissions")
    return role, scope, None


def accessible_session_ids_for_request(
    request: Optional[Request],
    org_id: str,
) -> Set[str]:
    oid = str(org_id or "").strip()
    if not oid and request is not None:
        oid = _request_active_org_id(request)
    org_scope = oid or None
    scope = _project_scope_for_request(request, oid or get_default_org_id())
    allowed_projects = scope_allowed_project_ids(scope)
    st = get_storage()
    rows = st.list(limit=5000, org_id=org_scope, is_admin=True)
    out: Set[str] = set()
    for row in rows:
        sid = str((row or {}).get("id") or "").strip()
        if not sid:
            continue
        project_id = str((row or {}).get("project_id") or "").strip()
        if allowed_projects and project_id and project_id not in allowed_projects:
            continue
        out.add(sid)
    return out

# Additional role constants used by templates/admin routers
ORG_TEMPLATE_WRITE_ROLES = {"org_owner", "org_admin", "project_manager"}
