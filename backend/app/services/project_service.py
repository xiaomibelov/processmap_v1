from __future__ import annotations

from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import HTTPException, Request

from ..legacy.request_context import (
    request_active_org_id as _request_active_org_id,
    request_auth_user as _request_auth_user,
    request_user_meta as _request_user_meta,
)
from ..models import Project
from ..repositories import project_repo
from ..services.org_workspace import (
    get_default_org_id,
    org_role_for_request as _org_role_for_request,
    project_scope_for_request as _project_scope_for_request,
    validate_org_user_assignable,
)
from ..storage import list_user_org_memberships
from ..utils.authz import (
    can_delete_workspace_content,
    can_edit_workspace,
    scope_allowed_project_ids,
)


# ── Internal helpers ──────────────────────────────────────────────

def _request_org_candidates(request: Optional[Request], preferred_org_id: str) -> List[str]:
    out: List[str] = []
    seen: Set[str] = set()

    def _push(org_id_raw: Any) -> None:
        org_id = str(org_id_raw or "").strip()
        if not org_id or org_id in seen:
            return
        seen.add(org_id)
        out.append(org_id)

    _push(preferred_org_id)
    if request is not None:
        user_id, is_admin = request_user_meta(request)
        if user_id:
            for row in list_user_org_memberships(user_id, is_admin=is_admin):
                if isinstance(row, dict):
                    _push(row.get("org_id"))
    if not out:
        _push(get_default_org_id())
    return out


def _legacy_load_project_scoped(
    project_id: str,
    request: Optional[Request] = None,
) -> Tuple[Optional[Project], str, Optional[Dict[str, Any]]]:
    oid = _request_active_org_id(request) if request is not None else ""
    pid = str(project_id or "").strip()
    if not pid:
        return None, oid, None
    resolved_oid = oid
    proj = None
    for org_candidate in _request_org_candidates(request, oid):
        proj = project_repo.load_project(pid, org_id=(org_candidate or None), is_admin=True)
        if proj:
            resolved_oid = org_candidate
            break
    if not proj:
        return None, oid, None
    scope = _project_scope_for_request(
        request,
        resolved_oid or str(getattr(proj, "org_id", "") or "").strip() or get_default_org_id(),
    )
    allowed = scope_allowed_project_ids(scope)
    if allowed and str(getattr(proj, "id", "") or "").strip() not in allowed:
        return None, resolved_oid, scope
    return proj, (resolved_oid or str(getattr(proj, "org_id", "") or "").strip() or get_default_org_id()), scope


# ── Project CRUD ──────────────────────────────────────────────────

def list_projects(request: Optional[Request] = None) -> List[dict]:
    oid = _request_active_org_id(request) if request is not None else ""
    scope = _project_scope_for_request(request, oid or get_default_org_id())
    allowed = scope_allowed_project_ids(scope)
    items = project_repo.list_projects(org_id=(oid or None), is_admin=True)
    if allowed:
        items = [proj for proj in items if str(getattr(proj, "id", "") or "").strip() in allowed]
    return [p.model_dump() for p in items]


def create_project(inp, request: Optional[Request] = None) -> dict:
    user = _request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    is_admin = bool(user.get("is_admin", False)) if isinstance(user, dict) else False
    oid = _request_active_org_id(request) if request is not None else ""
    role = _org_role_for_request(request, oid) if request is not None and oid else ""
    if oid and not can_edit_workspace(role, is_admin=is_admin):
        raise HTTPException(status_code=403, detail="forbidden")
    title = _clean_name(inp.title)
    if not title:
        raise HTTPException(status_code=422, detail="title required")
    sibling_titles = {
        _clean_name(getattr(item, "title", ""))
        for item in project_repo.list_projects(org_id=(oid or None), is_admin=True)
    }
    if title in sibling_titles:
        raise HTTPException(status_code=409, detail="project title already exists")
    executor_user_id = validate_org_user_assignable(oid or get_default_org_id(), getattr(inp, "executor_user_id", ""))
    pid = project_repo.create_project(
        title=title,
        passport=inp.passport,
        user_id=user_id,
        org_id=(oid or None),
        executor_user_id=executor_user_id,
    )
    proj = project_repo.load_project(pid, org_id=(oid or None), is_admin=True)
    if not proj:
        raise HTTPException(status_code=500, detail="create failed")
    _audit_log_safe(
        request,
        org_id=oid or str(getattr(proj, "org_id", "") or get_default_org_id()),
        action="project.create",
        entity_type="project",
        entity_id=pid,
        project_id=pid,
        meta={"title": str(getattr(proj, "title", "") or "")},
    )
    _invalidate_workspace_cache_for_org(oid or str(getattr(proj, "org_id", "") or get_default_org_id()))
    _invalidate_explorer_children_for_project(pid, oid or str(getattr(proj, "org_id", "") or get_default_org_id()))
    return proj.model_dump()


def get_project(project_id: str, request: Optional[Request] = None) -> dict:
    proj, _oid, _scope = _legacy_load_project_scoped(project_id, request)
    if not proj:
        raise HTTPException(status_code=404, detail="not found")
    return proj.model_dump()


def patch_project(project_id: str, inp, request: Optional[Request] = None) -> dict:
    user = _request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    is_admin = bool(user.get("is_admin", False)) if isinstance(user, dict) else False
    proj, oid, _scope = _legacy_load_project_scoped(project_id, request)
    if not proj:
        raise HTTPException(status_code=404, detail="not found")
    role = _org_role_for_request(request, oid) if request is not None and oid else ""
    if not can_edit_workspace(role, is_admin=is_admin):
        raise HTTPException(status_code=403, detail="forbidden")

    payload = inp.model_dump(exclude_unset=True)

    if "title" in payload and payload["title"] is not None:
        t = _clean_name(payload["title"])
        if t:
            sibling_titles = {
                _clean_name(getattr(item, "title", ""))
                for item in project_repo.list_projects(org_id=(oid or None), is_admin=True)
                if str(getattr(item, "id", "") or project_id).strip() != str(getattr(proj, "id", "") or project_id).strip()
            }
            if t in sibling_titles:
                raise HTTPException(status_code=409, detail="project title already exists")
            proj.title = t

    if "passport" in payload and payload["passport"] is not None:
        if not isinstance(payload["passport"], dict):
            raise HTTPException(status_code=400, detail="passport must be an object")
        merged = dict(proj.passport or {})
        merged.update(payload["passport"])
        proj.passport = merged

    if "executor_user_id" in payload:
        proj.executor_user_id = validate_org_user_assignable(oid or get_default_org_id(), payload.get("executor_user_id")) or None

    project_repo.save_project(proj, user_id=user_id, org_id=oid, is_admin=True)
    _audit_log_safe(
        request,
        org_id=oid or str(getattr(proj, "org_id", "") or get_default_org_id()),
        action="project.update",
        entity_type="project",
        entity_id=str(getattr(proj, "id", "") or project_id),
        project_id=str(getattr(proj, "id", "") or project_id),
        meta={"title": str(getattr(proj, "title", "") or "")},
    )
    _invalidate_workspace_cache_for_org(oid or str(getattr(proj, "org_id", "") or get_default_org_id()))
    _invalidate_explorer_children_for_project(str(getattr(proj, "id", "") or project_id), oid or str(getattr(proj, "org_id", "") or get_default_org_id()))
    return proj.model_dump()


def put_project(project_id: str, inp, request: Optional[Request] = None) -> dict:
    user = _request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    proj, oid, _scope = _legacy_load_project_scoped(project_id, request)
    if not proj:
        raise HTTPException(status_code=404, detail="not found")
    t = str(inp.title).strip()
    if not t:
        raise HTTPException(status_code=400, detail="title required")
    proj.title = t
    if isinstance(inp.passport, dict):
        proj.passport = dict(inp.passport)
    proj.executor_user_id = validate_org_user_assignable(oid or get_default_org_id(), getattr(inp, "executor_user_id", "")) or None
    project_repo.save_project(proj, user_id=user_id, org_id=oid, is_admin=True)
    _audit_log_safe(
        request,
        org_id=oid or str(getattr(proj, "org_id", "") or get_default_org_id()),
        action="project.update",
        entity_type="project",
        entity_id=str(getattr(proj, "id", "") or project_id),
        project_id=str(getattr(proj, "id", "") or project_id),
        meta={"title": str(getattr(proj, "title", "") or ""), "put": True},
    )
    _invalidate_workspace_cache_for_org(oid or str(getattr(proj, "org_id", "") or get_default_org_id()))
    _invalidate_explorer_children_for_project(str(getattr(proj, "id", "") or project_id), oid or str(getattr(proj, "org_id", "") or get_default_org_id()))
    return proj.model_dump()


def delete_project(project_id: str, request: Optional[Request] = None):
    # Thin wrapper — cascading delete + session invalidation stays in legacy for now.
    import app._legacy_main as _lm
    return _lm.delete_project_api(project_id, request)


# ── Internal helpers (copied from org_service for self-containment) ─

def _clean_name(value: Any) -> str:
    return " ".join(str(value or "").split()).strip()


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
    from ..legacy.request_context import request_user_meta, request_active_org_id
    from ..storage import append_audit_log
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


def _invalidate_workspace_cache_for_org(org_id: Any) -> None:
    from ..redis_cache import invalidate_workspace_org
    invalidate_workspace_org(str(org_id or "").strip() or get_default_org_id())


def _invalidate_explorer_children_for_project(project_id: Any, org_id: Any) -> None:
    import app._legacy_main as _lm
    _lm._invalidate_explorer_children_for_project(project_id, org_id)
