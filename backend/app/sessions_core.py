from __future__ import annotations

import logging
import re
import time
import uuid
from typing import Any, Dict, Optional, Tuple

from fastapi import HTTPException, Request

from . import storage as _storage_mod
from .cache import session_cache
from .legacy.request_context import (
    request_active_org_id as _request_active_org_id,
    request_auth_user as _request_auth_user,
    request_user_meta as _request_user_meta,
)
from .models import Session
from .orgs import (
    _invalidate_workspace_cache_for_org,
    _request_org_candidates,
    _require_org_active_for_writes,
    _resolved_org_for_cache,
    _user_is_member_of_org,
)
from .projects import _invalidate_explorer_children_for_project
from .redis_cache import (
    cache_get_json,
    cache_set_json,
    explorer_invalidate_sessions,
    invalidate_session_open,
    invalidate_tldr_session,
    session_open_cache_key,
    session_open_cache_ttl_sec,
    session_open_version_token,
)
from .schemas.legacy_api import (
    CreateSessionIn,
    SessionPresenceTouchIn,
    UpdateSessionIn,
)
from .services.audit import _audit_log_safe
from .services.org_workspace import (
    org_role_for_request as _org_role_for_request,
    project_scope_for_request as _project_scope_for_request,
)
from .shared.text_utils import (
    _clean_name,
    _resolve_actor_label_from_user,
)
from .storage import (
    SESSION_PRESENCE_TTL_SECONDS,
    get_default_org_id,
    get_storage,
    leave_session_presence,
    list_session_presence,
    prune_stale_session_presence,
    touch_session_presence,
)
from .utils.authz import (
    can_delete_workspace_content as _can_delete_workspace_content,
    can_edit_workspace as _can_edit_workspace,
    scope_allowed_project_ids as _scope_allowed_project_ids,
)
from .utils.legacy_normalization import (
    norm_edges as _norm_edges,
    norm_nodes as _norm_nodes,
    norm_notes_by_element as _norm_notes_by_element,
    norm_prep_questions as _norm_prep_questions,
    norm_questions as _norm_questions,
    norm_roles as _norm_roles,
    notes_decode as _notes_decode,
    notes_encode as _notes_encode,
)
from .utils.session_helpers import (
    _mark_diagram_truth_write,
    _require_diagram_cas_or_409,
    _resolve_base_diagram_state_version,
    _save_session_with_cas,
    raise_session_not_found,
)

logger = logging.getLogger(__name__)


# ── Sessions core domain (moved verbatim from _legacy_main, PR-9; route
# decorators are re-registered on the legacy app in _legacy_main.py at the
# original positions). Calls into helpers that still live in _legacy_main go
# through the deferred `_lm.*` import so test monkeypatch points on
# app._legacy_main keep working. ────────────────────────────────────────────

_SESSION_PRESENCE_TTL_SECONDS = SESSION_PRESENCE_TTL_SECONDS
_SESSION_PRESENCE_CLIENT_ID_RE = re.compile(r"[^A-Za-z0-9_.:-]+")
_SESSION_PRESENCE_SURFACE_RE = re.compile(r"[^A-Za-z0-9_.:-]+")


def _normalize_session_presence_client_id(value: Any) -> str:
    text = _SESSION_PRESENCE_CLIENT_ID_RE.sub("", str(value or "").strip())
    return text[:128]


def _normalize_session_presence_surface(value: Any) -> str:
    text = _SESSION_PRESENCE_SURFACE_RE.sub("", str(value or "").strip())
    return (text[:64] or "process_stage")


def _session_api_dump(sess: Session) -> Dict[str, Any]:
    import app._legacy_main as _lm
    d = sess.model_dump()
    d["notes"] = _notes_decode(d.get("notes"))
    d["bpmn_meta"] = _lm._normalize_bpmn_meta(d.get("bpmn_meta"))
    d["publish_git_mirror"] = _lm._extract_publish_git_mirror(d.get("interview"))
    d["navigation_stack"] = list(d.get("navigation_stack") or [])
    return d


def _legacy_load_session_scoped(
    session_id: str,
    request: Optional[Request] = None,
) -> Tuple[Optional[Session], str, Optional[Dict[str, Any]]]:
    oid = _request_active_org_id(request) if request is not None else ""
    sid = str(session_id or "").strip()
    if not sid:
        return None, oid, None
    st = get_storage()
    sess: Optional[Session] = None
    resolved_oid = oid
    for org_candidate in _request_org_candidates(request, oid):
        sess = st.load(sid, org_id=(org_candidate or None), is_admin=True)
        if sess:
            resolved_oid = org_candidate
            break
    if not sess:
        return None, oid, None
    scope = _project_scope_for_request(
        request,
        resolved_oid or str(getattr(sess, "org_id", "") or "").strip() or get_default_org_id(),
    )
    allowed = _scope_allowed_project_ids(scope)
    project_id = str(getattr(sess, "project_id", "") or "").strip()
    if allowed and project_id and project_id not in allowed:
        return None, resolved_oid, scope
    return sess, (resolved_oid or str(getattr(sess, "org_id", "") or "").strip() or get_default_org_id()), scope


def _invalidate_tldr_cache_for_session(session_id: Any) -> None:
    sid = str(session_id or "").strip()
    if not sid:
        return
    invalidate_tldr_session(sid)


def _invalidate_session_open_cache_for_session(session_id: Any) -> None:
    sid = str(session_id or "").strip()
    if not sid:
        return
    invalidate_session_open(sid)


def _invalidate_session_caches(session_obj: Any = None, *, session_id: Any = None, org_id: Any = None) -> None:
    import app._legacy_main as _lm
    sid = str(session_id or getattr(session_obj, "id", "") or "").strip()
    oid = _resolved_org_for_cache(org_id or getattr(session_obj, "org_id", ""))
    project_id = str(getattr(session_obj, "project_id", "") or "").strip()
    _invalidate_workspace_cache_for_org(oid)
    if project_id:
        explorer_invalidate_sessions(project_id)
        _invalidate_explorer_children_for_project(project_id, oid)
    if sid:
        _invalidate_session_open_cache_for_session(sid)
        _invalidate_tldr_cache_for_session(sid)
        try:
            session_cache.invalidate_session(sid)
        except Exception as exc:
            logger.warning("_invalidate_session_caches: session_cache invalidation failed for %s: %s", sid, exc)
    try:
        from .analytics_cache import invalidate_analytics_scope
        if sid:
            invalidate_analytics_scope("session", sid, oid)
        if project_id:
            invalidate_analytics_scope("project", project_id, oid)
            workspace_id = _lm._workspace_id_for_project(project_id)
            if workspace_id:
                invalidate_analytics_scope("workspace", workspace_id, oid)
    except Exception as exc:
        logger.warning("_invalidate_session_caches: analytics cache invalidation failed: %s", exc)


def _broadcast_session_deleted(session_id: str) -> None:
    """Publish session_deleted event to all SSE subscribers (best-effort)."""
    try:
        from .services.session_event_bus import get_session_event_bus
        bus = get_session_event_bus()
        bus.publish_nowait(session_id, {
            "type": "session_deleted",
            "data": {"session_id": session_id},
        })
    except Exception:
        logger.warning("Failed to broadcast session_deleted for %s", session_id, exc_info=True)


def create_session(inp: CreateSessionIn) -> Dict[str, Any]:
    import app._legacy_main as _lm
    st = get_storage()

    roles = _norm_roles(getattr(inp, "roles", None))
    if not roles:
        roles = ["cook_1", "technolog"]

    sr = getattr(inp, "start_role", None)
    if sr is not None and str(sr).strip() != "":
        sr = str(sr).strip()
        if sr not in roles:
            return {"error": "start_role must be one of roles", "start_role": sr, "roles": roles}
    else:
        sr = None

    prep_questions = _norm_prep_questions(getattr(inp, "ai_prep_questions", None))

    sid = uuid.uuid4().hex[:10]
    sess = Session(
        id=sid,
        title=inp.title,
        roles=roles,
        start_role=sr,
        interview={"prep_questions": prep_questions},
        notes=_notes_encode([]),
        notes_by_element={},
        nodes=[],
        edges=[],
        questions=[],
        mermaid="",
        mermaid_simple="",
        mermaid_lanes="",
        normalized={},
        resources={},
        version=1,
    )
    sess = _lm._recompute_session(sess)
    st.save(sess)
    _invalidate_session_caches(sess, org_id=getattr(sess, "org_id", "") or get_default_org_id())
    return _session_api_dump(sess)


def get_session(session_id: str, request: Request = None) -> Dict[str, Any]:
    sess, _, _ = _legacy_load_session_scoped(session_id, request)
    if not sess:
        raise_session_not_found(session_id)
    sid = str(getattr(sess, "id", "") or session_id).strip()
    version_token = session_open_version_token(sess)
    cache_key = session_open_cache_key(sid, version_token)
    cached = cache_get_json(cache_key)
    if isinstance(cached, dict):
        logger.info(
            "session_open_cache: hit session_id=%s version=%s",
            sid,
            version_token,
        )
        return cached
    logger.info(
        "session_open_cache: miss session_id=%s version=%s",
        sid,
        version_token,
    )
    payload = _session_api_dump(sess)
    if cache_set_json(cache_key, payload, ttl_sec=session_open_cache_ttl_sec()):
        logger.info(
            "session_open_cache: write session_id=%s version=%s",
            sid,
            version_token,
        )
    return payload


def patch_session(session_id: str, inp: UpdateSessionIn, request: Request = None) -> Dict[str, Any]:
    import app._legacy_main as _lm
    user = _request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    is_admin = bool(user.get("is_admin", False)) if isinstance(user, dict) else False
    effective_is_admin = is_admin or request is None
    st = get_storage()
    sess, oid, _ = _legacy_load_session_scoped(session_id, request)
    if not sess:
        raise_session_not_found(session_id)
    role = _org_role_for_request(request, oid) if request is not None and oid else ("org_admin" if effective_is_admin else "")
    _require_org_active_for_writes(request, oid)

    data = inp.model_dump(exclude_unset=True)
    if "status" in data:
        from .save_services.status_service import change_session_status
        return change_session_status(session_id, inp, request)

    _lm._reject_draft_graph_write_on_xml_session(sess, data)

    diagram_changed_keys = sorted({key for key in data.keys() if key in _lm._DIAGRAM_TRUTH_PATCH_KEYS})
    diagram_write_requested = len(diagram_changed_keys) > 0
    client_base_diagram_state_version = _resolve_base_diagram_state_version(request=request, payload=data)
    if diagram_write_requested:
        _require_diagram_cas_or_409(
            sess=sess,
            session_id=session_id,
            request=request,
            client_base_version=client_base_diagram_state_version,
        )

    handled = False
    need_recompute = False
    auto_pass_state_write_requested = False

    if "title" in data and data["title"] is not None:
        if not _can_edit_workspace(role, is_admin=effective_is_admin):
            raise HTTPException(status_code=403, detail="forbidden")
        title = _clean_name(data["title"])
        if title:
            sibling_titles = {
                _clean_name(str((row or {}).get("title") or ""))
                for row in st.list(project_id=str(getattr(sess, "project_id", "") or "").strip(), limit=500, org_id=oid, is_admin=True)
                if str((row or {}).get("id") or "").strip() != str(session_id).strip()
            }
            if title in sibling_titles:
                raise HTTPException(status_code=409, detail="session title already exists")
            try:
                sess2 = st.rename(session_id, title, user_id=user_id, is_admin=True, org_id=oid)
            except _storage_mod.SessionTitleConflictError:
                raise HTTPException(status_code=409, detail="session title already exists")
            if not sess2:
                raise_session_not_found(session_id)
            sess = sess2
            handled = True

    if "roles" in data:
        if not _can_edit_workspace(role, is_admin=effective_is_admin):
            raise HTTPException(status_code=403, detail="forbidden")
        sess.roles = _norm_roles(data.get("roles"))
        if sess.start_role and sess.roles and sess.start_role not in sess.roles:
            sess.start_role = None
        handled = True
        need_recompute = True

    if "start_role" in data:
        if not _can_edit_workspace(role, is_admin=effective_is_admin):
            raise HTTPException(status_code=403, detail="forbidden")
        sr = data.get("start_role")
        if sr is None or str(sr).strip() == "":
            sess.start_role = None
        else:
            sr = str(sr).strip()
            if sess.roles and sr not in sess.roles:
                return {"error": "start_role must be one of roles", "start_role": sr, "roles": sess.roles}
            sess.start_role = sr
        handled = True
        need_recompute = True

    if "notes" in data:
        if not _can_edit_workspace(role, is_admin=effective_is_admin):
            raise HTTPException(status_code=403, detail="forbidden")
        sess.notes = _notes_encode(data.get("notes"))
        handled = True
        need_recompute = True

    if "notes_by_element" in data:
        if not _can_edit_workspace(role, is_admin=effective_is_admin):
            raise HTTPException(status_code=403, detail="forbidden")
        sess.notes_by_element = _norm_notes_by_element(data.get("notes_by_element"))
        handled = True

    if "interview" in data:
        if not _can_edit_workspace(role, is_admin=effective_is_admin):
            raise HTTPException(status_code=403, detail="forbidden")
        sess.interview = _lm._merge_interview_with_server_fields(sess.interview, data.get("interview"))
        handled = True

    if "nodes" in data:
        if not _can_edit_workspace(role, is_admin=effective_is_admin):
            raise HTTPException(status_code=403, detail="forbidden")
        sess.nodes = _norm_nodes(data.get("nodes"))
        handled = True
        need_recompute = True

    if "edges" in data:
        if not _can_edit_workspace(role, is_admin=effective_is_admin):
            raise HTTPException(status_code=403, detail="forbidden")
        sess.edges = _norm_edges(data.get("edges"))
        handled = True
        need_recompute = True

    if "questions" in data:
        if not _can_edit_workspace(role, is_admin=effective_is_admin):
            raise HTTPException(status_code=403, detail="forbidden")
        sess.questions = _norm_questions(data.get("questions"))
        handled = True
        need_recompute = True

    if "bpmn_meta" in data:
        if not _can_edit_workspace(role, is_admin=effective_is_admin):
            raise HTTPException(status_code=403, detail="forbidden")
        sess_xml = str(getattr(sess, "bpmn_xml", "") or "")
        flow_ctx = _lm._collect_sequence_flow_meta(sess_xml)
        normalized_meta, auto_pass_state_write_requested = _lm._merge_and_normalize_bpmn_meta(
            getattr(sess, "bpmn_meta", {}),
            data.get("bpmn_meta"),
            sess_xml,
            flow_ctx,
        )
        sess.bpmn_meta = normalized_meta
        handled = True

    # игнорируем любые extra поля без ошибки
    if need_recompute:
        sess = _lm._recompute_session(sess)
    if diagram_write_requested:
        _mark_diagram_truth_write(
            sess,
            changed_keys=diagram_changed_keys,
            actor_user_id=user_id,
            actor_label=_resolve_actor_label_from_user(user, user_id),
        )
    # SQL-CAS for diagram-truth writes (audit P2): loses the race -> 409,
    # never a silent mixed-path overwrite.
    _save_session_with_cas(
        st,
        sess,
        client_base_version=client_base_diagram_state_version if diagram_write_requested else None,
        user_id=user_id,
        org_id=oid,
        is_admin=True,
    )
    if auto_pass_state_write_requested:
        _lm._capture_persisted_auto_pass_failed_state(
            sess,
            request=request,
            route=f"/api/sessions/{session_id}",
            org_id=oid,
            user_id=user_id,
        )

    _audit_log_safe(
        request,
        org_id=oid or str(getattr(sess, "org_id", "") or get_default_org_id()),
        action="session.update",
        entity_type="session",
        entity_id=str(getattr(sess, "id", "") or session_id),
        project_id=str(getattr(sess, "project_id", "") or ""),
        session_id=str(getattr(sess, "id", "") or session_id),
        meta={"keys": sorted(list(data.keys()))},
    )
    _invalidate_session_caches(sess, org_id=oid or getattr(sess, "org_id", "") or get_default_org_id())
    from .save_services.analytics_aggregator import publish_session_saved
    publish_session_saved(
        str(getattr(sess, "id", "") or session_id),
        oid or str(getattr(sess, "org_id", "") or get_default_org_id()),
    )
    return _session_api_dump(sess)


def put_session(session_id: str, inp: UpdateSessionIn, request: Request = None) -> Dict[str, Any]:
    import app._legacy_main as _lm
    user = _request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    st = get_storage()
    sess, oid, _ = _legacy_load_session_scoped(session_id, request)
    if not sess:
        raise_session_not_found(session_id)
    _require_org_active_for_writes(request, oid)

    data = inp.model_dump()
    explicit_data = inp.model_dump(exclude_unset=True)
    _lm._reject_draft_graph_write_on_xml_session(sess, explicit_data)
    client_base_diagram_state_version = _resolve_base_diagram_state_version(request=request, payload=data)
    _require_diagram_cas_or_409(
        sess=sess,
        session_id=session_id,
        request=request,
        client_base_version=client_base_diagram_state_version,
    )

    if data.get("title") is not None:
        title = str(data["title"]).strip()
        if title:
            try:
                sess2 = st.rename(session_id, title, org_id=oid)
            except _storage_mod.SessionTitleConflictError:
                raise HTTPException(status_code=409, detail="session title already exists")
            if not sess2:
                raise_session_not_found(session_id)
            sess = sess2

    sess.roles = _norm_roles(data.get("roles"))

    sr = data.get("start_role")
    if sr is None or str(sr).strip() == "":
        sess.start_role = None
    else:
        sr = str(sr).strip()
        if sess.roles and sr not in sess.roles:
            return {"error": "start_role must be one of roles", "start_role": sr, "roles": sess.roles}
        sess.start_role = sr

    sess.notes = _notes_encode(data.get("notes"))
    sess.notes_by_element = _norm_notes_by_element(data.get("notes_by_element"))
    sess.interview = _lm._merge_interview_with_server_fields(sess.interview, data.get("interview"))
    sess.nodes = _norm_nodes(data.get("nodes"))
    sess.edges = _norm_edges(data.get("edges"))
    sess.questions = _norm_questions(data.get("questions"))
    sess_xml = str(getattr(sess, "bpmn_xml", "") or "")
    flow_ctx = _lm._collect_sequence_flow_meta(sess_xml)
    flow_ids = flow_ctx.get("flow_ids")
    node_ids = flow_ctx.get("node_ids")
    raw_bpmn_meta = data.get("bpmn_meta") if data.get("bpmn_meta") is not None else getattr(sess, "bpmn_meta", {})
    auto_pass_state_write_requested = (
        isinstance(data.get("bpmn_meta"), dict)
        and "auto_pass_v1" in data.get("bpmn_meta")
    )
    normalized_meta = _lm._normalize_bpmn_meta(
        raw_bpmn_meta,
        allowed_flow_ids=flow_ids if sess_xml.strip() else None,
        allowed_node_ids=node_ids if sess_xml.strip() else None,
    )
    normalized_meta["flow_meta"] = _lm._enforce_gateway_tier_constraints(
        dict(normalized_meta.get("flow_meta") or {}),
        outgoing_by_source=flow_ctx.get("outgoing_by_source"),
        gateway_mode_by_node=flow_ctx.get("gateway_mode_by_node"),
    )
    sess.bpmn_meta = normalized_meta

    sess = _lm._recompute_session(sess)
    _mark_diagram_truth_write(
        sess,
        changed_keys=list(_lm._DIAGRAM_TRUTH_PUT_CHANGED_KEYS),
        actor_user_id=user_id,
        actor_label=_resolve_actor_label_from_user(user, user_id),
    )
    # SQL-CAS (audit P2): PUT /sessions races with PUT /bpmn on the same row;
    # a lost race must surface 409 instead of silently dropping one of the writes.
    _save_session_with_cas(
        st,
        sess,
        client_base_version=client_base_diagram_state_version,
        user_id=user_id,
        org_id=oid,
        is_admin=True,
    )
    if auto_pass_state_write_requested:
        _lm._capture_persisted_auto_pass_failed_state(
            sess,
            request=request,
            route=f"/api/sessions/{session_id}",
            org_id=oid,
            user_id=user_id,
        )
    _audit_log_safe(
        request,
        org_id=oid or str(getattr(sess, "org_id", "") or get_default_org_id()),
        action="session.update",
        entity_type="session",
        entity_id=str(getattr(sess, "id", "") or session_id),
        project_id=str(getattr(sess, "project_id", "") or ""),
        session_id=str(getattr(sess, "id", "") or session_id),
        meta={"put": True},
    )
    _invalidate_session_caches(sess, org_id=oid or getattr(sess, "org_id", "") or get_default_org_id())
    from .save_services.analytics_aggregator import publish_session_saved
    publish_session_saved(
        str(getattr(sess, "id", "") or session_id),
        oid or str(getattr(sess, "org_id", "") or get_default_org_id()),
    )
    return _session_api_dump(sess)


def delete_session_api(session_id: str, request: Request = None):
    sid = str(session_id or "").strip()
    if not sid:
        return {"ok": False, "error": "session_not_found", "session_id": str(session_id)}
    sess, oid, _ = _legacy_load_session_scoped(sid, request)
    if not sess:
        return {"ok": False, "error": "session_not_found", "session_id": sid}
    role = _org_role_for_request(request, oid) if request is not None and oid else ""
    user = _request_auth_user(request) if request is not None else {}
    is_admin = bool(user.get("is_admin", False)) if isinstance(user, dict) else False
    if not _can_delete_workspace_content(role, is_admin=is_admin):
        raise HTTPException(status_code=403, detail="forbidden")
    st = get_storage()
    deleted = st.delete(sid, org_id=oid, is_admin=True)
    if not deleted:
        return {"ok": False, "error": "session_not_found", "session_id": sid}
    _audit_log_safe(
        request,
        org_id=oid or str(getattr(sess, "org_id", "") or get_default_org_id()),
        action="session.delete",
        entity_type="session",
        entity_id=sid,
        project_id=str(getattr(sess, "project_id", "") or ""),
        session_id=sid,
    )
    _invalidate_session_caches(sess, session_id=sid, org_id=oid or getattr(sess, "org_id", "") or get_default_org_id())
    _broadcast_session_deleted(sid)
    return {"ok": True, "session_id": sid, "deleted_files": 1}


def touch_session_presence_api(
    session_id: str,
    inp: SessionPresenceTouchIn,
    request: Request = None,
) -> Dict[str, Any]:
    user_id, is_admin = _request_user_meta(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="authentication required")
    sess, oid, _ = _legacy_load_session_scoped(session_id, request)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")
    client_id = _normalize_session_presence_client_id(getattr(inp, "client_id", ""))
    if not client_id:
        raise HTTPException(status_code=422, detail="client_id is required")
    surface = _normalize_session_presence_surface(getattr(inp, "surface", "process_stage"))
    sid = str(getattr(sess, "id", "") or session_id).strip()
    project_id = str(getattr(sess, "project_id", "") or "").strip()
    org_id = str(oid or getattr(sess, "org_id", "") or get_default_org_id()).strip()
    active_org_id = _request_active_org_id(request) if request is not None else org_id
    if active_org_id and org_id and active_org_id != org_id:
        raise HTTPException(status_code=404, detail="session not found")
    if not _user_is_member_of_org(user_id, org_id, is_admin=is_admin):
        raise HTTPException(status_code=404, detail="session not found")
    now = int(time.time())
    touch_session_presence(
        sid,
        user_id,
        client_id,
        org_id=org_id,
        project_id=project_id,
        surface=surface,
        now_ts=now,
    )
    prune_stale_session_presence(ttl_seconds=_SESSION_PRESENCE_TTL_SECONDS, now_ts=now)
    active_users = list_session_presence(
        sid,
        org_id=org_id,
        project_id=project_id,
        ttl_seconds=_SESSION_PRESENCE_TTL_SECONDS,
        now_ts=now,
        current_user_id=user_id,
    )
    return {
        "ok": True,
        "session_id": sid,
        "ttl_seconds": _SESSION_PRESENCE_TTL_SECONDS,
        "active_users": active_users,
        "diagram_state_version": int(getattr(sess, "diagram_state_version", 0) or 0),
    }


def leave_session_presence_api(
    session_id: str,
    inp: SessionPresenceTouchIn,
    request: Request = None,
) -> Dict[str, Any]:
    user_id, is_admin = _request_user_meta(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="authentication required")
    sess, oid, _ = _legacy_load_session_scoped(session_id, request)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")
    client_id = _normalize_session_presence_client_id(getattr(inp, "client_id", ""))
    if not client_id:
        raise HTTPException(status_code=422, detail="client_id is required")
    sid = str(getattr(sess, "id", "") or session_id).strip()
    project_id = str(getattr(sess, "project_id", "") or "").strip()
    org_id = str(oid or getattr(sess, "org_id", "") or get_default_org_id()).strip()
    active_org_id = _request_active_org_id(request) if request is not None else org_id
    if active_org_id and org_id and active_org_id != org_id:
        raise HTTPException(status_code=404, detail="session not found")
    if not _user_is_member_of_org(user_id, org_id, is_admin=is_admin):
        raise HTTPException(status_code=404, detail="session not found")
    removed = leave_session_presence(
        sid,
        user_id,
        client_id,
        org_id=org_id,
        project_id=project_id,
    )
    prune_stale_session_presence(ttl_seconds=_SESSION_PRESENCE_TTL_SECONDS)
    return {
        "ok": True,
        "session_id": sid,
        "removed": removed,
    }


