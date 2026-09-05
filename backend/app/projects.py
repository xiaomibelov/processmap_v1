from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

from fastapi import HTTPException, Query, Request

from . import storage as _storage_mod
from .legacy.request_context import (
    request_active_org_id as _request_active_org_id,
    request_auth_user as _request_auth_user,
)
from .models import CreateProjectIn, Project, Session, UpdateProjectIn
from .orgs import (
    _invalidate_workspace_cache_for_org,
    _request_org_candidates,
    _resolved_org_for_cache,
)
from .redis_cache import explorer_invalidate_children
from .schemas.legacy_api import (
    CreateSessionIn,
    norm_project_session_mode as _norm_project_session_mode,
)
from .services.audit import _audit_log_safe
from .services.org_workspace import (
    org_role_for_request as _org_role_for_request,
    project_scope_for_request as _project_scope_for_request,
    validate_org_user_assignable as _validate_org_user_assignable,
)
from .shared.coerce import _norm_project_sessions_view
from .shared.text_utils import _clean_name
from .storage import (
    get_default_org_id,
    get_project_explorer_invalidation_targets,
    get_project_storage,
    get_storage,
)
from .utils.authz import (
    can_delete_workspace_content as _can_delete_workspace_content,
    can_edit_workspace as _can_edit_workspace,
    scope_allowed_project_ids as _scope_allowed_project_ids,
)
from .utils.legacy_normalization import (
    norm_prep_questions as _norm_prep_questions,
    norm_roles as _norm_roles,
)


# ── Project loader / explorer cache invalidation (moved verbatim ──
# from _legacy_main, PR-8; route decorators are re-registered on the legacy
# app in _legacy_main.py at the original positions) ────────────────

def _legacy_load_project_scoped(
    project_id: str,
    request: Optional[Request] = None,
) -> Tuple[Optional[Project], str, Optional[Dict[str, Any]]]:
    oid = _request_active_org_id(request) if request is not None else ""
    pid = str(project_id or "").strip()
    if not pid:
        return None, oid, None
    ps = get_project_storage()
    proj: Optional[Project] = None
    resolved_oid = oid
    for org_candidate in _request_org_candidates(request, oid):
        proj = ps.load(pid, org_id=(org_candidate or None), is_admin=True)
        if proj:
            resolved_oid = org_candidate
            break
    if not proj:
        return None, oid, None
    scope = _project_scope_for_request(
        request,
        resolved_oid or str(getattr(proj, "org_id", "") or "").strip() or get_default_org_id(),
    )
    allowed = _scope_allowed_project_ids(scope)
    if allowed and str(getattr(proj, "id", "") or "").strip() not in allowed:
        return None, resolved_oid, scope
    return proj, (resolved_oid or str(getattr(proj, "org_id", "") or "").strip() or get_default_org_id()), scope



def _invalidate_explorer_children_for_project(project_id: Any, org_id: Any) -> None:
    pid = str(project_id or "").strip()
    oid = _resolved_org_for_cache(org_id)
    if not pid or not oid:
        return
    try:
        targets = get_project_explorer_invalidation_targets(oid, pid)
    except Exception:
        targets = None
    if not targets:
        return
    wid = str(targets.get("workspace_id") or "").strip()
    for folder_id in (targets.get("children_folder_ids") or []):
        explorer_invalidate_children(oid, wid, str(folder_id or ""))



# ── Project CRUD handlers ─────────────────────────────────────────

  # DEPRECATED: moved to routers/orgs.py + org_service.py
def delete_project_api(project_id: str, request: Request = None):
    import app._legacy_main as _lm
    pid = str(project_id or "").strip()
    if not pid:
        return {"ok": False, "error": "project_not_found", "project_id": str(project_id), "deleted_sessions": []}
    proj, oid, _ = _legacy_load_project_scoped(pid, request)
    ps = get_project_storage()
    if proj is None:
        return {"ok": False, "error": "project_not_found", "project_id": pid, "deleted_sessions": []}
    role = _org_role_for_request(request, oid) if request is not None and oid else ""
    user = _request_auth_user(request) if request is not None else {}
    is_admin = bool(user.get("is_admin", False)) if isinstance(user, dict) else False
    if not _can_delete_workspace_content(role, is_admin=is_admin):
        raise HTTPException(status_code=403, detail="forbidden")
    _invalidate_explorer_children_for_project(pid, oid or str(getattr(proj, "org_id", "") or get_default_org_id()))
    st = get_storage()
    related = st.list(project_id=pid, limit=500, org_id=oid, is_admin=True)
    deleted_sessions: list[str] = []
    for row in related:
        sid = str((row or {}).get("id") or "").strip()
        if not sid:
            continue
        if st.delete(sid, org_id=oid, is_admin=True):
            deleted_sessions.append(sid)
            _lm._invalidate_tldr_cache_for_session(sid)
    deleted_project = ps.delete(pid, org_id=oid, is_admin=True)
    if not deleted_project:
        return {"ok": False, "error": "project_not_found", "project_id": pid, "deleted_sessions": deleted_sessions}
    _audit_log_safe(
        request,
        org_id=oid or str(getattr(proj, "org_id", "") or get_default_org_id()),
        action="project.delete",
        entity_type="project",
        entity_id=pid,
        project_id=pid,
        meta={"deleted_sessions": deleted_sessions},
    )
    _invalidate_workspace_cache_for_org(oid or str(getattr(proj, "org_id", "") or get_default_org_id()))
    return {"ok": True, "project_id": pid, "deleted_sessions": deleted_sessions}



# -----------------------------
# Epic #1: Projects + Process Passport
# -----------------------------

  # DEPRECATED: moved to routers/orgs.py + org_service.py
def list_projects(request: Request = None) -> list[dict]:
    oid = _request_active_org_id(request) if request is not None else ""
    scope = _project_scope_for_request(request, oid or get_default_org_id())
    allowed = _scope_allowed_project_ids(scope)
    st = get_project_storage()
    items = st.list(org_id=(oid or None), is_admin=True)
    if allowed:
        items = [proj for proj in items if str(getattr(proj, "id", "") or "").strip() in allowed]
    return [p.model_dump() for p in items]



  # DEPRECATED: moved to routers/orgs.py + org_service.py
def create_project(inp: CreateProjectIn, request: Request = None) -> dict:
    user = _request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    is_admin = bool(user.get("is_admin", False)) if isinstance(user, dict) else False
    oid = _request_active_org_id(request) if request is not None else ""
    role = _org_role_for_request(request, oid) if request is not None and oid else ""
    if oid and not _can_edit_workspace(role, is_admin=is_admin):
        raise HTTPException(status_code=403, detail="forbidden")
    st = get_project_storage()
    title = _clean_name(inp.title)
    if not title:
        raise HTTPException(status_code=422, detail="title required")
    sibling_titles = {
        _clean_name(getattr(item, "title", ""))
        for item in st.list(org_id=(oid or None), is_admin=True)
    }
    if title in sibling_titles:
        raise HTTPException(status_code=409, detail="project title already exists")
    executor_user_id = _validate_org_user_assignable(oid or get_default_org_id(), getattr(inp, "executor_user_id", ""))
    pid = st.create(
        title=title,
        passport=inp.passport,
        user_id=user_id,
        org_id=(oid or None),
        executor_user_id=executor_user_id,
    )
    proj = st.load(pid, org_id=(oid or None), is_admin=True)
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



  # DEPRECATED: moved to routers/orgs.py + org_service.py
def get_project(project_id: str, request: Request = None) -> dict:
    proj, _, _ = _legacy_load_project_scoped(project_id, request)
    if not proj:
        raise HTTPException(status_code=404, detail="not found")
    return proj.model_dump()



# Статусы проекта хранятся в passport.status. Канонические API-значения —
# то, что реально шлёт фронт (mapCatalogStatusToProjectApi):
# active / on_hold / done / archived (каталогный «Готово» → "done").
# Alias'и completed/archive принимаются по отображающему контракту
# (mapProjectStatusToCatalog) и нормализуются к каноническим значениям.
_PROJECT_STATUS_ALIASES = {
    "completed": "done",
    "archive": "archived",
}
_PROJECT_STATUSES = ("active", "on_hold", "done", "archived")


def _normalize_project_status(value: Any) -> str:
    v = str(value or "").strip().lower()
    v = _PROJECT_STATUS_ALIASES.get(v, v)
    if v not in _PROJECT_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"invalid project status: {value!r}; allowed: {', '.join(_PROJECT_STATUSES)}",
        )
    return v


  # DEPRECATED: moved to routers/orgs.py + org_service.py
def patch_project(project_id: str, inp: UpdateProjectIn, request: Request = None) -> dict:
    user = _request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    is_admin = bool(user.get("is_admin", False)) if isinstance(user, dict) else False
    proj, oid, _ = _legacy_load_project_scoped(project_id, request)
    st = get_project_storage()
    if not proj:
        raise HTTPException(status_code=404, detail="not found")
    role = _org_role_for_request(request, oid) if request is not None and oid else ""
    if not _can_edit_workspace(role, is_admin=is_admin):
        raise HTTPException(status_code=403, detail="forbidden")

    payload = inp.model_dump(exclude_unset=True)

    if "title" in payload and payload["title"] is not None:
        t = _clean_name(payload["title"])
        if t:
            sibling_titles = {
                _clean_name(getattr(item, "title", ""))
                for item in st.list(org_id=(oid or None), is_admin=True)
                if str(getattr(item, "id", "") or "").strip() != str(getattr(proj, "id", "") or project_id).strip()
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
        proj.executor_user_id = _validate_org_user_assignable(oid or get_default_org_id(), payload.get("executor_user_id")) or None

    status_from = ""
    status_to = ""
    if "status" in payload and payload["status"] is not None:
        status_from = str((proj.passport or {}).get("status") or "active")
        status_to = _normalize_project_status(payload["status"])
        merged = dict(proj.passport or {})
        merged["status"] = status_to
        proj.passport = merged

    st.save(proj, user_id=user_id, org_id=oid, is_admin=True)
    audit_meta: Dict[str, Any] = {"title": str(getattr(proj, "title", "") or "")}
    if status_to:
        audit_meta["status_from"] = status_from
        audit_meta["status_to"] = status_to
    _audit_log_safe(
        request,
        org_id=oid or str(getattr(proj, "org_id", "") or get_default_org_id()),
        action="project.update",
        entity_type="project",
        entity_id=str(getattr(proj, "id", "") or project_id),
        project_id=str(getattr(proj, "id", "") or project_id),
        meta=audit_meta,
    )
    _invalidate_workspace_cache_for_org(oid or str(getattr(proj, "org_id", "") or get_default_org_id()))
    _invalidate_explorer_children_for_project(str(getattr(proj, "id", "") or project_id), oid or str(getattr(proj, "org_id", "") or get_default_org_id()))
    return proj.model_dump()



  # DEPRECATED: moved to routers/orgs.py + org_service.py
def put_project(project_id: str, inp: CreateProjectIn, request: Request = None) -> dict:
    user = _request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    proj, oid, _ = _legacy_load_project_scoped(project_id, request)
    st = get_project_storage()
    if not proj:
        raise HTTPException(status_code=404, detail="not found")

    t = str(inp.title).strip()
    if not t:
        raise HTTPException(status_code=400, detail="title required")
    if not isinstance(inp.passport, dict):
        raise HTTPException(status_code=400, detail="passport must be an object")

    proj.title = t
    proj.passport = inp.passport or {}
    st.save(proj, user_id=user_id, org_id=oid, is_admin=True)
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



# Restored legacy session helpers removed by router split
def list_project_sessions(project_id: str, mode: str | None = None, view: str | None = None, request: Request = None):
    import app._legacy_main as _lm
    proj, oid, _ = _legacy_load_project_scoped(project_id, request)
    if proj is None:
        raise HTTPException(status_code=404, detail="project not found")
    raw_mode = mode
    mode = _norm_project_session_mode(mode)
    if raw_mode is not None and mode is None:
        raise HTTPException(status_code=422, detail="invalid mode; allowed: quick_skeleton, deep_audit")
    view_mode = _norm_project_sessions_view(view)
    if not view_mode:
        raise HTTPException(status_code=422, detail="invalid view; allowed: summary, full")
    st = get_storage()
    if view_mode == "summary":
        return st.list_project_session_summaries(project_id=project_id, mode=mode, limit=500, org_id=oid, is_admin=True)
    rows = st.list(project_id=project_id, mode=mode, limit=500, org_id=oid, is_admin=True)
    out = []
    for row in rows:
        if isinstance(row, dict):
            out.append(_lm._session_api_dump(Session.model_validate(row)))
    return out



# DEPRECATED: session routes moved to routers/sessions.py — kept for backward compatibility during migration.
  # DEPRECATED: moved to routers/sessions.py + session_service.py
def create_project_session(project_id: str, inp: CreateSessionIn, mode: str | None = Query(default="quick_skeleton"), request: Request = None):
    import app._legacy_main as _lm
    user = _request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    is_admin = bool(user.get("is_admin", False)) if isinstance(user, dict) else False
    proj, oid, _ = _legacy_load_project_scoped(project_id, request)
    if proj is None:
        raise HTTPException(status_code=404, detail="project not found")
    role = _org_role_for_request(request, oid) if request is not None and oid else ""
    if not _can_edit_workspace(role, is_admin=is_admin):
        raise HTTPException(status_code=403, detail="forbidden")

    st = get_storage()
    title = _clean_name(getattr(inp, "title", None) or "process") or "process"
    sibling_titles = {
        _clean_name(str((row or {}).get("title") or ""))
        for row in st.list(project_id=project_id, mode=mode, limit=500, org_id=oid, is_admin=True)
    }
    if title in sibling_titles:
        raise HTTPException(status_code=409, detail="session title already exists")
    roles = _norm_roles(getattr(inp, "roles", None))
    sr = getattr(inp, "start_role", None)
    if sr is not None and str(sr).strip() != "":
        sr = str(sr).strip()
        if roles and sr not in roles:
            return {"error": "start_role must be one of roles", "start_role": sr, "roles": roles}
    else:
        sr = None
    prep_questions = _norm_prep_questions(getattr(inp, "ai_prep_questions", None))
    # W4: тип сессии (as_is|to_be) + связь с AS IS (extra="allow" в CreateSessionIn)
    process_layer = str(getattr(inp, "process_layer", "") or "as_is").strip() or "as_is"
    derived_from = str(getattr(inp, "derived_from_session_id", "") or "").strip()
    if process_layer not in ("as_is", "to_be"):
        process_layer = "as_is"
    # prefer storage-native create signature if it supports project_id/mode
    try:
        # process_layer/derived_from задаются атомарно при INSERT (audit P3):
        # TO BE-дедуп по derived_from_session_id не оставляет сирот при гонке.
        sid = st.create(
            title=title,
            roles=roles,
            start_role=sr,
            project_id=project_id,
            mode=mode,
            process_layer=process_layer,
            derived_from_session_id=derived_from,
            user_id=user_id,
            org_id=oid,
        )
        sess = st.load(sid, org_id=oid, is_admin=True)
        if sess is None:
            raise HTTPException(status_code=500, detail="session not persisted")
        if prep_questions:
            sess.interview = {**(sess.interview or {}), "prep_questions": prep_questions}
            st.save(sess, user_id=user_id, org_id=oid, is_admin=True)
        _audit_log_safe(
            request,
            org_id=oid or str(getattr(sess, "org_id", "") or get_default_org_id()),
            action="session.create",
            entity_type="session",
            entity_id=str(getattr(sess, "id", "") or sid),
            project_id=project_id,
            session_id=str(getattr(sess, "id", "") or sid),
            meta={"mode": str(getattr(sess, "mode", "") or ""), "title": str(getattr(sess, "title", "") or "")},
        )
        _lm._invalidate_session_caches(sess, org_id=oid or getattr(sess, "org_id", "") or get_default_org_id())
        return _lm._session_api_dump(sess)
    except _storage_mod.SessionTitleConflictError:
        # Race-safe dedup (audit P3): concurrent create with the same natural
        # key hits the unique index -> same 409 contract as the title pre-check.
        raise HTTPException(status_code=409, detail="session title already exists")
    except TypeError:
        # fallback: create base session then attach fields
        sid = st.create(title=title, roles=roles, start_role=sr, user_id=user_id, org_id=oid)
        sess = st.load(sid, org_id=oid, is_admin=True)
        if sess is None:
            raise HTTPException(status_code=500, detail="session not persisted")
        if hasattr(sess, "project_id"):
            sess.project_id = project_id
        if hasattr(sess, "mode"):
            sess.mode = mode
        # W4: тип сессии + связь AS IS (fallback-путь)
        if hasattr(sess, "process_layer"):
            _pl = str(getattr(inp, "process_layer", "") or "as_is").strip() or "as_is"
            sess.process_layer = _pl if _pl in ("as_is", "to_be") else "as_is"
        if hasattr(sess, "derived_from_session_id"):
            sess.derived_from_session_id = str(getattr(inp, "derived_from_session_id", "") or "").strip()
        if prep_questions:
            sess.interview = {**(sess.interview or {}), "prep_questions": prep_questions}
        st.save(sess, user_id=user_id, org_id=oid, is_admin=True)
        _audit_log_safe(
            request,
            org_id=oid or str(getattr(sess, "org_id", "") or get_default_org_id()),
            action="session.create",
            entity_type="session",
            entity_id=str(getattr(sess, "id", "") or sid),
            project_id=project_id,
            session_id=str(getattr(sess, "id", "") or sid),
            meta={"mode": str(getattr(sess, "mode", "") or ""), "title": str(getattr(sess, "title", "") or ""), "fallback": True},
        )
        _lm._invalidate_session_caches(sess, org_id=oid or getattr(sess, "org_id", "") or get_default_org_id())
        return _lm._session_api_dump(sess)
