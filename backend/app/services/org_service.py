from __future__ import annotations

import time
from typing import Any, Dict, List, Optional, Tuple

from fastapi import Request
from fastapi.responses import JSONResponse

from ..legacy.request_context import (
    enterprise_error as _enterprise_error,
    request_active_org_id as _request_active_org_id,
    request_auth_user as _request_auth_user,
    request_user_meta,
)
from ..redis_cache import invalidate_workspace_org
from ..repositories import org_repo, project_repo
from ..services.org_workspace import (
    enterprise_require_org_member as _enterprise_require_org_member,
    enterprise_require_org_role as _enterprise_require_org_role,
    evaluate_org_git_mirror_config,
    get_default_org_id,
    project_scope_for_request as _project_scope_for_request,
)
from ..auth import find_user_by_id
from ..storage import (
    append_audit_log,
    get_storage,
)
from ..utils.authz import (
    can_manage_workspace,
    is_role_allowed,
    ORG_INVITE_MANAGE_ROLES,
    ORG_MEMBER_MANAGE_ROLES,
    ORG_PROJECT_MEMBER_MANAGE_ROLES,
    ORG_READ_ROLES,
    ORG_WRITE_ROLES,
)


# ── Internal helpers ──────────────────────────────────────────────

def _resolved_org_for_cache(org_id: Any) -> str:
    return str(org_id or "").strip() or get_default_org_id()


def _invalidate_workspace_cache_for_org(org_id: Any) -> None:
    invalidate_workspace_org(_resolved_org_for_cache(org_id))


def _audit_log_safe(
    request: Optional[Request],
    *,
    org_id: str,
    action: str,
    entity_type: str,
    entity_id: str,
    status: str = "ok",
    project_id: Optional[str] = None,
    session_id: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> None:
    uid, _ = request_user_meta(request)
    if not uid:
        return
    try:
        append_audit_log(
            actor_user_id=uid,
            org_id=str(org_id or "").strip() or request_active_org_id(request),
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id or "").strip() or "-",
            status=status,
            project_id=project_id,
            session_id=session_id,
            meta=meta if isinstance(meta, dict) else {},
        )
    except Exception as exc:
        print(f"[AUDIT] write_failed action={action} entity={entity_type}:{entity_id} err={exc}")


def _clean_name(value: Any) -> str:
    return " ".join(str(value or "").split()).strip()


# ── Org CRUD ──────────────────────────────────────────────────────

def patch_org(org_id: str, inp, request: Request) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    role, err = _enterprise_require_org_role(request, oid, ORG_MEMBER_MANAGE_ROLES)
    if err is not None:
        return err
    uid, is_admin = request_user_meta(request)
    if not can_manage_workspace(role, is_admin=is_admin):
        return _enterprise_error(403, "forbidden", "insufficient_permissions")
    name = _clean_name(getattr(inp, "name", ""))
    if not name:
        return _enterprise_error(422, "validation_error", "name is required")
    try:
        org = org_repo.rename_org(oid, name)
    except ValueError as exc:
        marker = str(exc or "").strip().lower()
        if "exists" in marker:
            return _enterprise_error(409, "conflict", "workspace_name_exists")
        if "not found" in marker:
            return _enterprise_error(404, "not_found", "not_found")
        return _enterprise_error(422, "validation_error", str(exc))
    _audit_log_safe(
        request,
        org_id=oid,
        action="org.rename",
        entity_type="org",
        entity_id=oid,
        meta={"name": name, "actor_user_id": uid},
    )
    _invalidate_workspace_cache_for_org(oid)
    return org


# ── Git mirror ────────────────────────────────────────────────────

def get_org_git_mirror(org_id: str, request: Request) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    role, err = _enterprise_require_org_member(request, oid)
    if err is not None:
        return err
    _uid, is_admin = request_user_meta(request)
    role_l = str(role or "").strip().lower()
    if not (is_admin or is_role_allowed(role_l, ORG_READ_ROLES)):
        return _enterprise_error(403, "forbidden", "insufficient_permissions")
    try:
        config = org_repo.get_git_mirror_config(oid)
    except ValueError:
        return _enterprise_error(404, "not_found", "not_found")
    return {"ok": True, "org_id": oid, "config": config}


def patch_org_git_mirror(org_id: str, inp, request: Request) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    role, err = _enterprise_require_org_role(request, oid, ORG_MEMBER_MANAGE_ROLES)
    if err is not None:
        return err
    uid, is_admin = request_user_meta(request)
    if not can_manage_workspace(role, is_admin=is_admin):
        return _enterprise_error(403, "forbidden", "insufficient_permissions")
    try:
        current = org_repo.get_git_mirror_config(oid)
    except ValueError:
        return _enterprise_error(404, "not_found", "not_found")
    patch = inp.model_dump(exclude_unset=True)
    candidate = {
        "git_mirror_enabled": bool(current.get("git_mirror_enabled")),
        "git_provider": current.get("git_provider"),
        "git_repository": current.get("git_repository"),
        "git_branch": current.get("git_branch"),
        "git_base_path": current.get("git_base_path"),
    }
    for key in candidate:
        if key in patch:
            candidate[key] = patch.get(key)
    evaluated = evaluate_org_git_mirror_config(candidate)
    try:
        saved = org_repo.update_git_mirror_config(
            oid,
            git_mirror_enabled=bool(evaluated.get("git_mirror_enabled")),
            git_provider=evaluated.get("git_provider"),
            git_repository=evaluated.get("git_repository"),
            git_branch=evaluated.get("git_branch"),
            git_base_path=evaluated.get("git_base_path"),
            git_health_status=evaluated.get("git_health_status"),
            git_health_message=evaluated.get("git_health_message"),
            git_updated_by=uid,
        )
    except ValueError:
        return _enterprise_error(404, "not_found", "not_found")
    _audit_log_safe(
        request,
        org_id=oid,
        action="org.git_mirror_update",
        entity_type="org",
        entity_id=oid,
        meta={
            "actor_user_id": uid,
            "git_mirror_enabled": bool(saved.get("git_mirror_enabled")),
            "git_provider": str(saved.get("git_provider") or ""),
            "git_repository": str(saved.get("git_repository") or ""),
            "git_branch": str(saved.get("git_branch") or ""),
            "git_base_path": str(saved.get("git_base_path") or ""),
            "git_health_status": str(saved.get("git_health_status") or "unknown"),
        },
    )
    _invalidate_workspace_cache_for_org(oid)
    return {"ok": True, "org_id": oid, "config": saved}


def validate_org_git_mirror(org_id: str, inp, request: Request) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    role, err = _enterprise_require_org_role(request, oid, ORG_MEMBER_MANAGE_ROLES)
    if err is not None:
        return err
    _uid, is_admin = request_user_meta(request)
    if not can_manage_workspace(role, is_admin=is_admin):
        return _enterprise_error(403, "forbidden", "insufficient_permissions")
    try:
        current = org_repo.get_git_mirror_config(oid)
    except ValueError:
        return _enterprise_error(404, "not_found", "not_found")
    patch = inp.model_dump(exclude_unset=True)
    candidate = {
        "git_mirror_enabled": bool(current.get("git_mirror_enabled")),
        "git_provider": current.get("git_provider"),
        "git_repository": current.get("git_repository"),
        "git_branch": current.get("git_branch"),
        "git_base_path": current.get("git_base_path"),
    }
    for key in candidate:
        if key in patch:
            candidate[key] = patch.get(key)
    evaluated = evaluate_org_git_mirror_config(candidate)
    return {"ok": True, "org_id": oid, "config": evaluated}


# ── Member management ─────────────────────────────────────────────

def patch_org_member(org_id: str, user_id: str, inp, request: Request):
    oid = str(org_id or "").strip()
    uid = str(user_id or "").strip()
    _, err = _enterprise_require_org_role(request, oid, ORG_MEMBER_MANAGE_ROLES)
    if err is not None:
        return err
    if not uid:
        return _enterprise_error(422, "validation_error", "user_id is required")
    role = str(getattr(inp, "role", "") or "").strip()
    if not role:
        return _enterprise_error(422, "validation_error", "role is required")
    try:
        row = org_repo.upsert_membership(oid, uid, role)
    except ValueError as exc:
        return _enterprise_error(422, "validation_error", str(exc))
    _audit_log_safe(
        request,
        org_id=oid,
        action="member.role_change",
        entity_type="org_membership",
        entity_id=f"{oid}:{uid}",
        meta={"target_user_id": uid, "role": str(row.get("role") or "")},
    )
    return row


# ── Project management within org ─────────────────────────────────

def list_org_projects(org_id: str, request: Request) -> List[Dict[str, Any]]:
    oid = str(org_id or "").strip()
    _, err = _enterprise_require_org_member(request, oid)
    if err is not None:
        return err
    scope = _project_scope_for_request(request, oid)
    items = project_repo.list_projects(org_id=oid, is_admin=True)
    if str(scope.get("mode") or "") != "all":
        allowed = {str(item or "").strip() for item in (scope.get("project_ids") or []) if str(item or "").strip()}
        items = [proj for proj in items if str(getattr(proj, "id", "") or "").strip() in allowed]
    return [p.model_dump() for p in items]


def create_org_project(org_id: str, inp, request: Request) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    _, err = _enterprise_require_org_role(request, oid, ORG_WRITE_ROLES)
    if err is not None:
        return err
    title = str(getattr(inp, "title", "") or "").strip()
    if not title:
        return _enterprise_error(422, "validation_error", "title required")
    passport = inp.passport if isinstance(inp.passport, dict) else {}
    user = _request_auth_user(request)
    uid = str(user.get("id") or "").strip()
    pid = project_repo.create_project(
        title=title,
        passport=passport,
        user_id=uid,
        org_id=oid,
    )
    proj = project_repo.load_project(pid, org_id=oid, is_admin=True)
    if not proj:
        return _enterprise_error(404, "not_found", "not_found")
    _audit_log_safe(
        request,
        org_id=oid,
        action="project.create",
        entity_type="project",
        entity_id=pid,
        project_id=pid,
        meta={"title": str(getattr(proj, "title", "") or title)},
    )
    _invalidate_workspace_cache_for_org(oid)
    return proj.model_dump()


def get_org_project(org_id: str, project_id: str, request: Request) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    pid = str(project_id or "").strip()
    # Use authz helper for project access
    from ..utils.authz import enterprise_require_project_access
    _role, _scope, err = enterprise_require_project_access(request, oid, pid)
    if err is not None:
        return err
    proj = project_repo.load_project(pid, org_id=oid, is_admin=True)
    if not proj:
        return _enterprise_error(404, "not_found", "not_found")
    return proj.model_dump()


# ── Project sessions (thin — deeply coupled to session logic) ─────

def list_org_project_sessions(org_id: str, project_id: str, request: Request, mode=None, view=None) -> List[Dict[str, Any]]:
    import app._legacy_main as _lm
    return _lm.list_org_project_sessions(org_id, project_id, request, mode, view)


def create_org_project_session(org_id: str, project_id: str, inp, request=None, mode=None):
    import app._legacy_main as _lm
    _lm._require_org_active_for_writes(request, org_id)
    return _lm.create_org_project_session(org_id, project_id, inp, request, mode)


# ── Project member management ─────────────────────────────────────

def list_org_project_members(org_id: str, project_id: str, request: Request) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    pid = str(project_id or "").strip()
    from ..utils.authz import enterprise_manage_project_members_guard
    _role, _scope, err = enterprise_manage_project_members_guard(request, oid, pid)
    if err is not None:
        return err
    if project_repo.load_project(pid, org_id=oid, is_admin=True) is None:
        return _enterprise_error(404, "not_found", "not_found")
    items = project_repo.list_members(oid, pid)
    return {"items": items, "count": len(items)}


def create_org_project_member(org_id: str, project_id: str, inp, request: Request):
    oid = str(org_id or "").strip()
    pid = str(project_id or "").strip()
    from ..utils.authz import enterprise_manage_project_members_guard
    _role, _scope, err = enterprise_manage_project_members_guard(request, oid, pid)
    if err is not None:
        return err
    if project_repo.load_project(pid, org_id=oid, is_admin=True) is None:
        return _enterprise_error(404, "not_found", "not_found")
    user_id = str(getattr(inp, "user_id", "") or "").strip()
    role = str(getattr(inp, "role", "") or "").strip()
    if not user_id or not role:
        return _enterprise_error(422, "validation_error", "user_id and role are required")
    try:
        row = project_repo.upsert_member(oid, pid, user_id, role)
    except ValueError as exc:
        return _enterprise_error(422, "validation_error", str(exc))
    _audit_log_safe(
        request,
        org_id=oid,
        action="project.member.add",
        entity_type="project_membership",
        entity_id=f"{oid}:{pid}:{user_id}",
        project_id=pid,
        meta={"target_user_id": user_id, "role": str(row.get("role") or role)},
    )
    return row


def patch_org_project_member(org_id: str, project_id: str, user_id: str, inp, request: Request):
    oid = str(org_id or "").strip()
    pid = str(project_id or "").strip()
    uid = str(user_id or "").strip()
    from ..utils.authz import enterprise_manage_project_members_guard
    _role, _scope, err = enterprise_manage_project_members_guard(request, oid, pid)
    if err is not None:
        return err
    if project_repo.load_project(pid, org_id=oid, is_admin=True) is None:
        return _enterprise_error(404, "not_found", "not_found")
    role = str(getattr(inp, "role", "") or "").strip()
    if not uid or not role:
        return _enterprise_error(422, "validation_error", "role is required")
    try:
        row = project_repo.upsert_member(oid, pid, uid, role)
    except ValueError as exc:
        return _enterprise_error(422, "validation_error", str(exc))
    _audit_log_safe(
        request,
        org_id=oid,
        action="project.member.role_change",
        entity_type="project_membership",
        entity_id=f"{oid}:{pid}:{uid}",
        project_id=pid,
        meta={"target_user_id": uid, "role": str(row.get("role") or role)},
    )
    return row


def delete_org_project_member(org_id: str, project_id: str, user_id: str, request: Request):
    oid = str(org_id or "").strip()
    pid = str(project_id or "").strip()
    uid = str(user_id or "").strip()
    from ..utils.authz import enterprise_manage_project_members_guard
    _role, _scope, err = enterprise_manage_project_members_guard(request, oid, pid)
    if err is not None:
        return err
    if project_repo.load_project(pid, org_id=oid, is_admin=True) is None:
        return _enterprise_error(404, "not_found", "not_found")
    if not uid:
        return _enterprise_error(422, "validation_error", "user_id is required")
    try:
        project_repo.delete_member(oid, pid, uid)
    except ValueError as exc:
        return _enterprise_error(422, "validation_error", str(exc))
    _audit_log_safe(
        request,
        org_id=oid,
        action="project.member.remove",
        entity_type="project_membership",
        entity_id=f"{oid}:{pid}:{uid}",
        project_id=pid,
        meta={"target_user_id": uid},
    )
    return {"ok": True}


# ── Audit ─────────────────────────────────────────────────────────

def list_org_audit(org_id: str, request: Request, limit=100, action="", project_id="", session_id="", status=""):
    oid = str(org_id or "").strip()
    role, err = _enterprise_require_org_member(request, oid)
    if err is not None:
        return err
    uid, is_admin = request_user_meta(request)
    role_l = str(role or "").strip().lower()
    if not (is_admin or is_role_allowed(role_l, ORG_AUDIT_READ_ROLES)):
        return _enterprise_error(403, "forbidden", "insufficient_permissions")
    scope = _project_scope_for_request(request, oid)
    requested_project = str(project_id or "").strip()
    if requested_project and str(scope.get("mode") or "") != "all":
        from ..utils.authz import scope_allowed_project_ids
        allowed = scope_allowed_project_ids(scope)
        if requested_project not in allowed:
            return _enterprise_error(404, "not_found", "not_found")
    rows = org_repo.list_audit(
        oid,
        limit=limit,
        action=action or None,
        project_id=requested_project or None,
        session_id=str(session_id or "").strip() or None,
        status=str(status or "").strip() or None,
    )
    if str(scope.get("mode") or "") != "all":
        from ..utils.authz import scope_allowed_project_ids
        allowed = scope_allowed_project_ids(scope)
        filtered: List[Dict[str, Any]] = []
        for row in rows:
            pid = str((row or {}).get("project_id") or "").strip()
            if not pid or pid in allowed:
                filtered.append(row)
        rows = filtered
    for row in rows:
        actor_id = str((row or {}).get("actor_user_id") or "").strip()
        if actor_id:
            actor = find_user_by_id(actor_id) or {}
            email = str(actor.get("email") or "").strip().lower()
            if email:
                row["actor_email"] = email
    _ = uid
    return {"items": rows, "count": len(rows)}


def cleanup_org_audit(org_id: str, request: Request, retention_days: int = 0):
    oid = str(org_id or "").strip()
    _, err = _enterprise_require_org_role(request, oid, ORG_INVITE_MANAGE_ROLES)
    if err is not None:
        return err
    retention = int(retention_days or 0)
    if retention <= 0:
        retention = _audit_retention_days()
    deleted = org_repo.cleanup_audit(oid, retention)
    _audit_log_safe(
        request,
        org_id=oid,
        action="audit.cleanup",
        entity_type="audit_log",
        entity_id=f"cleanup:{oid}",
        status="ok",
        meta={"deleted": int(deleted or 0), "retention_days": int(retention)},
    )
    return {"ok": True, "org_id": oid, "deleted": int(deleted or 0), "retention_days": int(retention)}


def _audit_retention_days() -> int:
    return int(os.environ.get("AUDIT_RETENTION_DAYS", "90") or "90")


# ── Workspace / Invites (thin — keep in legacy for now) ───────────

def get_enterprise_workspace(request=None):
    import app._legacy_main as _lm
    return _lm.get_enterprise_workspace(request)


def list_org_invites(org_id: str, request=None):
    import app._legacy_main as _lm
    return _lm.list_org_invites_endpoint(org_id, request)


def create_org_invite(org_id: str, inp, request=None):
    import app._legacy_main as _lm
    return _lm.create_org_invite_endpoint(org_id, inp, request)


def accept_org_invite(org_id: str, inp, request=None):
    import app._legacy_main as _lm
    return _lm.accept_org_invite_endpoint(org_id, inp, request)


def accept_invite(inp, request=None):
    import app._legacy_main as _lm
    return _lm.accept_invite_endpoint(inp, request)


def revoke_org_invite(org_id: str, invite_id: str, request=None):
    import app._legacy_main as _lm
    return _lm.revoke_org_invite_endpoint(org_id, invite_id, request)


def cleanup_org_invites(org_id: str, request=None, keep_days: int = 0):
    import app._legacy_main as _lm
    return _lm.cleanup_org_invites_endpoint(org_id, request, keep_days)

import os
