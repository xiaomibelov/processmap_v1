from __future__ import annotations

import logging
import datetime
import uuid
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, Request

from fastapi import HTTPException, Request, Response

from ..cache import session_cache
from ..legacy.request_context import request_user_meta, request_active_org_id
from ..redis_cache import explorer_invalidate_sessions
from ..models import Session
from ..repositories import session_repo
from ..storage import get_storage, list_session_presence
from ..utils.authz import session_access_from_request
from ..services.bpmn_navigation import (
    called_element_id,
    extract_subprocess_xml,
    resolve_target_element_id,
    element_type,
)

logger = logging.getLogger(__name__)


class SessionAccessDenied(HTTPException):
    def __init__(self):
        super().__init__(status_code=403, detail="Недостаточно прав для открытия этой сессии.")


def _request_context(request: Optional[Request] = None) -> Dict[str, Any]:
    if request is not None:
        user_id, is_admin = request_user_meta(request)
        org_id = request_active_org_id(request)
        return {"user_id": user_id, "is_admin": is_admin, "org_id": org_id}
    return {"user_id": None, "is_admin": None, "org_id": None}


def create_session(
    title: str,
    roles: List[str] | None = None,
    *,
    start_role: Optional[str] = None,
    prep_questions: Optional[List[Dict[str, Any]]] = None,
    project_id: Optional[str] = None,
    mode: Optional[str] = None,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> Dict[str, Any]:
    """Create a new session."""
    st = get_storage()
    sid = session_repo.create(
        title=title,
        roles=roles,
        start_role=start_role,
        project_id=project_id,
        mode=mode,
        user_id=user_id,
        org_id=org_id,
    )
    sess = session_repo.load(sid, user_id=user_id, org_id=org_id, is_admin=is_admin)
    if sess is None:
        raise RuntimeError("session not persisted")
    if prep_questions:
        sess.interview = {**(sess.interview or {}), "prep_questions": prep_questions}
        session_repo.save(sess, user_id=user_id, org_id=org_id, is_admin=is_admin)
    # Note: _recompute_session and _session_api_dump are still in _legacy_main.py
    # Full extraction requires moving those helpers first.
    import app._legacy_main as _lm
    sess = _lm._recompute_session(sess)
    session_repo.save(sess, user_id=user_id, org_id=org_id, is_admin=is_admin)
    _lm._invalidate_session_caches(sess, org_id=org_id or getattr(sess, "org_id", "") or "")
    return _lm._session_api_dump(sess)


def _build_session_projection(row: Dict[str, Any]) -> Dict[str, Any]:
    import app._legacy_main as _lm
    sid = str(row.get("id") or "").strip()
    return session_cache.build_projection(
        sid,
        row,
        normalize_bpmn_meta=_lm._normalize_bpmn_meta,
        extract_publish_git_mirror=_lm._extract_publish_git_mirror,
        notes_decode=_lm._notes_decode,
    )


def get_session(
    session_id: str,
    *,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    request: Optional[Any] = None,
) -> Dict[str, Any]:
    """Load a single session by id (cached lightweight projection)."""
    ctx = _request_context(request)
    ctx_user_id = user_id if user_id is not None else ctx.get("user_id")
    ctx_org_id = org_id if org_id is not None else ctx.get("org_id")
    ctx_is_admin = is_admin if is_admin is not None else ctx.get("is_admin")

    sid = str(session_id or "").strip()
    if not sid:
        return {"error": "not found"}

    # Try cached projection first.
    cached = session_cache.get_projection(sid)
    if isinstance(cached, dict) and str(cached.get("id") or "").strip() == sid:
        return cached

    st = get_storage()
    row = st.load_session_projection(
        sid,
        user_id=ctx_user_id,
        org_id=ctx_org_id,
        is_admin=ctx_is_admin,
    )
    if not row:
        if not ctx_is_admin and ctx_user_id and ctx_org_id:
            candidate = st.load(sid, org_id=ctx_org_id, is_admin=True)
            if candidate:
                raise SessionAccessDenied()
        return {"error": "not found"}

    projection = _build_session_projection(row)
    session_cache.set_projection(sid, projection)
    return projection


def list_sessions(
    query: Optional[str] = None,
    limit: int = 200,
    *,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    allowed_project_ids: Optional[List[str]] = None,
    request: Optional[Any] = None,
) -> Dict[str, Any]:
    """List sessions with optional filtering."""
    ctx = _request_context(request)
    ctx_user_id = user_id if user_id is not None else ctx.get("user_id")
    ctx_org_id = org_id if org_id is not None else ctx.get("org_id")
    ctx_is_admin = is_admin if is_admin is not None else ctx.get("is_admin")
    items = session_repo.list_sessions(
        query=query,
        limit=min(max(int(limit), 1), 500),
        user_id=ctx_user_id,
        org_id=ctx_org_id,
        is_admin=ctx_is_admin,
    )
    if allowed_project_ids:
        items = [
            item for item in items
            if str((item or {}).get("project_id") or "").strip() in allowed_project_ids
        ]
    return {"items": items, "count": len(items)}


def list_project_sessions(
    project_id: str,
    mode: Optional[str] = None,
    view: str = "full",
    *,
    root_only: bool = False,
    include_children_meta: bool = False,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    request: Optional[Any] = None,
) -> List[Dict[str, Any]]:
    """List sessions scoped to a project."""
    ctx = _request_context(request)
    ctx_user_id = user_id if user_id is not None else ctx.get("user_id")
    ctx_org_id = org_id if org_id is not None else ctx.get("org_id")
    ctx_is_admin = is_admin if is_admin is not None else ctx.get("is_admin")
    if view == "summary":
        return session_repo.list_project_session_summaries(
            project_id=project_id,
            mode=mode,
            limit=500,
            user_id=ctx_user_id,
            org_id=ctx_org_id,
            is_admin=ctx_is_admin,
        )
    if root_only or include_children_meta:
        return session_repo.list_project_sessions(
            project_id=project_id,
            root_only=root_only,
            include_children_meta=include_children_meta,
            user_id=ctx_user_id,
            org_id=ctx_org_id,
            is_admin=ctx_is_admin,
        )
    rows = session_repo.list_sessions(
        query=None,
        limit=500,
        user_id=ctx_user_id,
        org_id=ctx_org_id,
        is_admin=ctx_is_admin,
    )
    # Filter by project_id in memory (storage.list does not support project_id filter directly)
    rows = [r for r in rows if str((r or {}).get("project_id") or "").strip() == project_id]
    out = []
    import app._legacy_main as _lm
    for row in rows:
        if isinstance(row, dict):
            out.append(_lm._session_api_dump(Session.model_validate(row)))
    return out


def list_session_children(
    session_id: str,
    *,
    request: Optional[Any] = None,
) -> List[Dict[str, Any]]:
    """Return immediate child sessions of a parent session."""
    ctx = _request_context(request)
    return session_repo.list_session_children(
        session_id,
        user_id=ctx.get("user_id"),
        org_id=ctx.get("org_id"),
        is_admin=ctx.get("is_admin"),
    )


def delete_session_api(session_id: str, request: Any = None):
    """Delete a session using workspace-content delete authz (org admin/owner + platform admin)."""
    import app._legacy_main as _lm
    return _lm.delete_session_api(session_id, request)


def delete_session(
    session_id: str,
    *,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    request: Optional[Any] = None,
) -> bool:
    """Delete a session."""
    ctx = _request_context(request)
    ctx_user_id = user_id if user_id is not None else ctx.get("user_id")
    ctx_org_id = org_id if org_id is not None else ctx.get("org_id")
    ctx_is_admin = is_admin if is_admin is not None else ctx.get("is_admin")
    sess = session_repo.load(session_id, org_id=ctx_org_id, is_admin=True)
    if not sess:
        return False
    if not ctx_is_admin:
        owner_id = str(getattr(sess, "owner_user_id", "") or "").strip()
        if not ctx_user_id or not owner_id or owner_id != str(ctx_user_id or "").strip():
            raise HTTPException(status_code=403, detail="Только владелец сессии может её удалить.")
    return session_repo.delete(
        session_id,
        user_id=ctx_user_id,
        org_id=ctx_org_id,
        is_admin=ctx_is_admin,
    )


# ── BPMN subdomain ────────────────────────────────────────────────

def bpmn_meta_get(session_id: str) -> Dict[str, Any]:
    """Get BPMN metadata for a session."""
    # CROSS-DOMAIN: depends on _collect_sequence_flow_meta, _normalize_bpmn_meta,
    # _enforce_gateway_tier_constraints in _legacy_main.py.
    # Full extraction requires migrating those helpers first.
    import app._legacy_main as _lm
    return _lm.session_bpmn_meta_get(session_id)


def bpmn_meta_patch(
    session_id: str,
    inp: Any,
    request: Any = None,
) -> Dict[str, Any]:
    """Patch BPMN metadata."""
    # CROSS-DOMAIN: depends on _require_diagram_cas_or_409, _mark_diagram_truth_write.
    import app._legacy_main as _lm
    return _lm.session_bpmn_meta_patch(session_id, inp, request)


def bpmn_meta_infer_rtiers(
    session_id: str,
    inp: Any,
    request: Any = None,
) -> Dict[str, Any]:
    """Infer RTIers from BPMN meta."""
    # CROSS-DOMAIN: depends on infer_rtiers pipeline in _legacy_main.py.
    import app._legacy_main as _lm
    return _lm.session_bpmn_meta_infer_rtiers(session_id, inp, request)


def bpmn_export(
    session_id: str,
    *,
    raw: int = 0,
    include_overlay: int = 1,
    zoom: float = 1.0,
    pan_x: float = 0.0,
    pan_y: float = 0.0,
    request: Any = None,
) -> Any:
    """Export session BPMN XML (raw XML is Redis-cached)."""
    import app._legacy_main as _lm
    sid = str(session_id or "").strip()
    raw_mode = bool(int(raw or 0))

    if raw_mode and sid:
        cached_xml = session_cache.get_bpmn_raw(sid)
        if isinstance(cached_xml, str):
            return Response(content=cached_xml, media_type="application/xml")

    response = _lm.session_bpmn_export(
        session_id,
        raw=raw,
        include_overlay=include_overlay,
        zoom=zoom,
        pan_x=pan_x,
        pan_y=pan_y,
        request=request,
    )

    if raw_mode and sid and isinstance(response, Response):
        try:
            xml_body = response.body.decode("utf-8") if isinstance(response.body, bytes) else str(response.body or "")
            session_cache.set_bpmn_raw(sid, xml_body)
        except Exception as exc:
            logger.warning("bpmn_export: failed to cache raw XML for %s: %s", sid, exc)

    return response


def get_session_meta(
    session_id: str,
    *,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    request: Optional[Any] = None,
) -> Dict[str, Any]:
    """Return aggregated metadata for a session (versions/presence/notes/auto-pass).

    This is a single batched read intended to replace the parallel calls the
    canvas currently fires on open.
    """
    ctx = _request_context(request)
    ctx_user_id = user_id if user_id is not None else ctx.get("user_id")
    ctx_org_id = org_id if org_id is not None else ctx.get("org_id")
    ctx_is_admin = is_admin if is_admin is not None else ctx.get("is_admin")

    sid = str(session_id or "").strip()
    if not sid:
        return {"error": "not found"}

    cached = session_cache.get_meta(sid)
    if isinstance(cached, dict) and str(cached.get("session_id") or "").strip() == sid:
        return cached

    st = get_storage()
    row = st.load_session_projection(
        sid,
        user_id=ctx_user_id,
        org_id=ctx_org_id,
        is_admin=ctx_is_admin,
    )
    if not row:
        return {"error": "not found"}

    session_org_id = str(row.get("org_id") or ctx_org_id or "").strip() or None
    projection = _build_session_projection(row)

    versions_count = st.count_bpmn_versions(sid, org_id=session_org_id)
    notes_count = st.count_note_threads(sid, org_id=session_org_id, status="open")

    # Include the latest BPMN version header for conflict detection (same shape as /bpmn/versions?limit=1).
    versions_payload: Dict[str, Any] = {}
    try:
        import app._legacy_main as _lm
        versions_payload = _lm.session_bpmn_versions_list(sid, request=None, limit=1, include_xml=0) or {}
    except Exception as exc:
        logger.warning("get_session_meta: versions list failed for %s: %s", sid, exc)

    active_users: List[Dict[str, Any]] = []
    try:
        active_users = list_session_presence(
            sid,
            org_id=session_org_id or "",
            project_id=str(row.get("project_id") or "").strip(),
            current_user_id=ctx_user_id or "",
        )
    except Exception as exc:
        logger.warning("get_session_meta: presence load failed for %s: %s", sid, exc)

    bpmn_meta = projection.get("bpmn_meta") or {}
    auto_pass_v1 = bpmn_meta.get("auto_pass_v1") or {}
    auto_pass_status = str(auto_pass_v1.get("status") or "").strip() or None

    version_items = versions_payload.get("items") or []
    latest_version = version_items[0] if version_items else None
    meta = {
        "session_id": sid,
        "versions_count": versions_count,
        "notes_count": notes_count,
        "presence_ttl_seconds": 60,
        "active_users": active_users,
        "auto_pass_status": auto_pass_status,
        "bpmn_xml_version": projection.get("bpmn_xml_version"),
        "diagram_state_version": projection.get("diagram_state_version"),
        "version": projection.get("version"),
        "versions": version_items,
        "items": version_items,
        "count": versions_payload.get("count") or versions_count,
        "user_facing_count": versions_payload.get("user_facing_count") or 0,
        "latest_user_facing_revision_number": versions_payload.get("latest_user_facing_revision_number") or 0,
        "current_session_payload_hash": versions_payload.get("current_session_payload_hash") or "",
        "latest_user_version_session_payload_hash": versions_payload.get("latest_user_version_session_payload_hash") or "",
        "has_session_changes_since_latest_bpmn_version": versions_payload.get("has_session_changes_since_latest_bpmn_version") or False,
        "latest_version": latest_version,
    }
    session_cache.set_meta(sid, meta)
    return meta


def get_session_graph(
    session_id: str,
    *,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    request: Optional[Any] = None,
) -> Dict[str, Any]:
    """Return only nodes/edges for a session (used by graph analysis / AI)."""
    ctx = _request_context(request)
    ctx_user_id = user_id if user_id is not None else ctx.get("user_id")
    ctx_org_id = org_id if org_id is not None else ctx.get("org_id")
    ctx_is_admin = is_admin if is_admin is not None else ctx.get("is_admin")

    sid = str(session_id or "").strip()
    if not sid:
        return {"error": "not found"}

    sess = session_repo.load(sid, user_id=ctx_user_id, org_id=ctx_org_id, is_admin=ctx_is_admin)
    if not sess:
        return {"error": "not found"}

    return {
        "session_id": sid,
        "nodes": [n.model_dump() if hasattr(n, "model_dump") else dict(n) for n in (getattr(sess, "nodes", None) or [])],
        "edges": [e.model_dump() if hasattr(e, "model_dump") else dict(e) for e in (getattr(sess, "edges", None) or [])],
        "bpmn_graph_fingerprint": str(getattr(sess, "bpmn_graph_fingerprint", "") or ""),
        "version": int(getattr(sess, "version", 0) or 0),
        "diagram_state_version": int(getattr(sess, "diagram_state_version", 0) or 0),
    }


def session_bpmn_save(session_id: str, inp: Any, request: Any = None) -> Dict[str, Any]:
    """Router-facing alias for bpmn_save that accepts request."""
    return bpmn_save(session_id, inp, request)


def meta_patch(session_id: str, inp: Any, request: Any = None) -> Dict[str, Any]:
    """Router-facing alias for session_meta_patch that accepts request."""
    import app._legacy_main as _lm
    return _lm.session_meta_patch(session_id, inp, request)


def bpmn_save(
    session_id: str,
    inp: Any,
    request: Any = None,
) -> Dict[str, Any]:
    """Save BPMN XML to session."""
    # CROSS-DOMAIN: depends on _require_diagram_cas_or_409, _mark_diagram_truth_write,
    # _create_bpmn_revision_snapshot_if_needed, _resolve_base_diagram_state_version.
    import app._legacy_main as _lm
    return _lm.session_bpmn_save(session_id, inp, request)


def bpmn_versions_list(
    session_id: str,
    *,
    request: Any = None,
    limit: int = 100,
    include_xml: int = 0,
) -> Dict[str, Any]:
    """List BPMN version snapshots for a session."""
    import app._legacy_main as _lm
    return _lm.session_bpmn_versions_list(session_id, request=request, limit=limit, include_xml=include_xml)


def bpmn_version_detail(
    session_id: str,
    version_id: str,
    request: Any = None,
) -> Dict[str, Any]:
    """Get a single BPMN version snapshot."""
    import app._legacy_main as _lm
    return _lm.session_bpmn_version_detail(session_id, version_id, request)


def bpmn_restore(
    session_id: str,
    version_id: str,
    request: Any = None,
) -> Dict[str, Any]:
    """Restore a BPMN version snapshot."""
    # CROSS-DOMAIN: depends on _latest_user_facing_bpmn_version,
    # _create_bpmn_revision_snapshot_if_needed, _mark_diagram_truth_write.
    import app._legacy_main as _lm
    return _lm.session_bpmn_restore(session_id, version_id, request)


def bpmn_clear(
    session_id: str,
    request: Any = None,
) -> Dict[str, Any]:
    """Clear BPMN XML from session."""
    # CROSS-DOMAIN: depends on _require_diagram_cas_or_409, _mark_diagram_truth_write.
    import app._legacy_main as _lm
    return _lm.session_bpmn_clear(session_id, request)


def overlays(session_id: str) -> Any:
    """Return lightweight JSON overlays for a session."""
    from ..overlay_cache import get_overlays_json
    return get_overlays_json(session_id)


# ── Node / Edge subdomain ─────────────────────────────────────────

from ..models import Node, Edge
from ..utils.session_helpers import (
    _require_diagram_cas_or_409,
    _resolve_base_diagram_state_version,
    _resolve_actor_context,
    _mark_diagram_truth_write,
)


def patch_node(session_id: str, node_id: str, inp, request=None) -> Dict[str, Any]:
    """Patch a single node in a session."""
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}

    node = next((n for n in s.nodes if n.id == node_id), None)
    if not node:
        return {"error": "node not found"}

    _require_diagram_cas_or_409(
        sess=s,
        session_id=session_id,
        request=request,
        client_base_version=_resolve_base_diagram_state_version(
            request=request,
            payload=inp.model_dump(exclude_unset=True),
        ),
    )
    _, actor_user_id, actor_label = _resolve_actor_context(request)

    data = inp.model_dump(exclude_unset=True)

    if "title" in data:
        node.title = data["title"] or node.title
        node.parameters["_manual_title"] = True
    if "type" in data:
        node.type = data["type"] or node.type
        node.parameters["_manual_type"] = True
    if "actor_role" in data:
        node.actor_role = data["actor_role"] or None
        node.parameters["_manual_actor"] = True
    if "recipient_role" in data:
        node.recipient_role = data["recipient_role"] or None
        node.parameters["_manual_recipient"] = True
    if "equipment" in data and data["equipment"] is not None:
        node.equipment = data["equipment"]
        node.parameters["_manual_equipment"] = True
    if "duration_min" in data:
        node.duration_min = data["duration_min"]
        node.parameters["_manual_duration"] = True
    if "parameters" in data and data["parameters"] is not None:
        node.parameters = data["parameters"]
        node.parameters["_manual_parameters"] = True
    if "disposition" in data and data["disposition"] is not None:
        node.disposition = data["disposition"]
        node.parameters["_manual_disposition"] = True

    import app._legacy_main as _lm
    s = _lm._recompute_session(s)
    _mark_diagram_truth_write(
        s,
        changed_keys=["nodes"],
        actor_user_id=actor_user_id,
        actor_label=actor_label,
    )
    st.save(s)
    session_cache.invalidate_session(session_id)
    return s.model_dump()


def add_node(session_id: str, inp, request=None) -> Dict[str, Any]:
    """Add a new node to a session."""
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}

    _require_diagram_cas_or_409(
        sess=s,
        session_id=session_id,
        request=request,
        client_base_version=_resolve_base_diagram_state_version(
            request=request,
            payload=inp.model_dump(exclude_unset=True),
        ),
    )
    _, actor_user_id, actor_label = _resolve_actor_context(request)

    node_id = (inp.id or "").strip() or f"n_{uuid.uuid4().hex[:8]}"
    if any(n.id == node_id for n in s.nodes):
        return {"error": "node already exists", "node_id": node_id}

    node = Node(
        id=node_id,
        title=inp.title,
        type=inp.type or "step",
        actor_role=inp.actor_role,
        recipient_role=inp.recipient_role,
        equipment=list(inp.equipment or []),
        parameters=dict(inp.parameters or {}),
        duration_min=inp.duration_min,
        disposition=dict(inp.disposition or {}),
        qc=[],
        exceptions=[],
        evidence=[],
        confidence=0.0,
    )
    s.nodes.append(node)

    import app._legacy_main as _lm
    s = _lm._recompute_session(s)
    _mark_diagram_truth_write(
        s,
        changed_keys=["nodes"],
        actor_user_id=actor_user_id,
        actor_label=actor_label,
    )
    st.save(s)
    session_cache.invalidate_session(session_id)
    return s.model_dump()


def delete_node(session_id: str, node_id: str, request=None) -> Dict[str, Any]:
    """Delete a node (and incident edges) from a session."""
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}

    _require_diagram_cas_or_409(
        sess=s,
        session_id=session_id,
        request=request,
        client_base_version=_resolve_base_diagram_state_version(request=request),
    )
    _, actor_user_id, actor_label = _resolve_actor_context(request)

    before_n = len(s.nodes)
    s.nodes = [n for n in s.nodes if n.id != node_id]
    if len(s.nodes) == before_n:
        return {"error": "node not found"}

    s.edges = [e for e in s.edges if e.from_id != node_id and e.to_id != node_id]

    import app._legacy_main as _lm
    s = _lm._recompute_session(s)
    _mark_diagram_truth_write(
        s,
        changed_keys=["nodes", "edges"],
        actor_user_id=actor_user_id,
        actor_label=actor_label,
    )
    st.save(s)
    session_cache.invalidate_session(session_id)
    return s.model_dump()


def add_edge(session_id: str, inp, request=None) -> Dict[str, Any]:
    """Add a new edge to a session."""
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}

    _require_diagram_cas_or_409(
        sess=s,
        session_id=session_id,
        request=request,
        client_base_version=_resolve_base_diagram_state_version(
            request=request,
            payload=inp.model_dump(exclude_unset=True),
        ),
    )
    _, actor_user_id, actor_label = _resolve_actor_context(request)

    if not any(n.id == inp.from_id for n in s.nodes):
        return {"error": "from_id not found", "from_id": inp.from_id}
    if not any(n.id == inp.to_id for n in s.nodes):
        return {"error": "to_id not found", "to_id": inp.to_id}

    exists = any(
        (e.from_id == inp.from_id and e.to_id == inp.to_id and (e.when or None) == (inp.when or None))
        for e in s.edges
    )
    if exists:
        return {"error": "edge already exists"}

    s.edges.append(Edge(from_id=inp.from_id, to_id=inp.to_id, when=inp.when))

    import app._legacy_main as _lm
    s = _lm._recompute_session(s)
    _mark_diagram_truth_write(
        s,
        changed_keys=["edges"],
        actor_user_id=actor_user_id,
        actor_label=actor_label,
    )
    st.save(s)
    session_cache.invalidate_session(session_id)
    return s.model_dump()


def delete_edge(session_id: str, inp, request=None) -> Dict[str, Any]:
    """Delete an edge from a session."""
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}

    _require_diagram_cas_or_409(
        sess=s,
        session_id=session_id,
        request=request,
        client_base_version=_resolve_base_diagram_state_version(
            request=request,
            payload=inp.model_dump(exclude_unset=True),
        ),
    )
    _, actor_user_id, actor_label = _resolve_actor_context(request)

    before = len(s.edges)
    s.edges = [
        e for e in s.edges
        if not (e.from_id == inp.from_id and e.to_id == inp.to_id and (e.when or None) == (inp.when or None))
    ]
    if len(s.edges) == before:
        return {"error": "edge not found"}

    import app._legacy_main as _lm
    s = _lm._recompute_session(s)
    _mark_diagram_truth_write(
        s,
        changed_keys=["edges"],
        actor_user_id=actor_user_id,
        actor_label=actor_label,
    )
    st.save(s)
    session_cache.invalidate_session(session_id)
    return s.model_dump()


# ── Notes / Answers / AI subdomain (thin extraction) ──────────────

# These endpoints are large and deeply coupled to legacy helpers.
# They are thin-wrapped here so routers/sessions.py no longer needs
# to import _legacy_main for the HTTP surface.

def post_notes(session_id: str, inp, request=None) -> Dict[str, Any]:
    """Save notes and run AI extraction."""
    import app._legacy_main as _lm
    return _lm.post_notes(session_id, inp, request)


def post_notes_extraction_apply(session_id: str, inp, request=None) -> Dict[str, Any]:
    """Apply a note-extraction result to the session."""
    import app._legacy_main as _lm
    return _lm.post_notes_extraction_apply(session_id, inp, request)


def post_notes_extraction_preview(session_id: str, inp, request=None) -> Dict[str, Any]:
    """Preview a note-extraction result without saving."""
    import app._legacy_main as _lm
    return _lm.post_notes_extraction_preview(session_id, inp, request)


def answer(session_id: str, inp, request=None) -> Dict[str, Any]:
    """Apply an answer to a session question."""
    import app._legacy_main as _lm
    return _lm.answer(session_id, inp, request)


def answer_v2(session_id: str, inp, request=None) -> Dict[str, Any]:
    """Apply an answer to a session question (v2)."""
    import app._legacy_main as _lm
    return _lm.answer_v2(session_id, inp, request)


def ai_questions(session_id: str, inp, request=None) -> Dict[str, Any]:
    """Generate AI questions for a session."""
    import app._legacy_main as _lm
    return _lm.ai_questions(session_id, inp, request)


# ── Export subdomain (thin extraction) ────────────────────────────

def export(session_id: str) -> Dict[str, Any]:
    """Export session as JSON."""
    import app._legacy_main as _lm
    return _lm.export(session_id)


def export_zip(session_id: str):
    """Export session as ZIP."""
    import app._legacy_main as _lm
    return _lm.export_zip(session_id)


# ── Org-scoped reports subdomain (thin extraction) ────────────────

def list_org_session_report_versions(org_id: str, session_id: str, request=None, path_id: str = "", steps_hash: str = ""):
    """List report versions for an org-scoped session."""
    import app._legacy_main as _lm
    return _lm.list_org_session_report_versions(org_id, session_id, request, path_id, steps_hash)


def build_org_session_report(org_id: str, session_id: str, inp, request=None):
    """Build a report for an org-scoped session."""
    import app._legacy_main as _lm
    return _lm.build_org_session_report(org_id, session_id, inp, request)


def get_org_session_report_version(org_id: str, session_id: str, version_id: str, request=None, path_id: str = ""):
    """Get a specific report version for an org-scoped session."""
    import app._legacy_main as _lm
    return _lm.get_org_session_report_version(org_id, session_id, version_id, request, path_id)


def delete_org_session_report_version(org_id: str, session_id: str, version_id: str, request=None, path_id: str = ""):
    """Delete a report version for an org-scoped session."""
    import app._legacy_main as _lm
    return _lm.delete_org_session_report_version(org_id, session_id, version_id, request, path_id)


# ── Presence / TLDR / Analytics / Patch / Put / Recompute (thin) ──

def create_project_session(project_id: str, inp, mode: str = "quick_skeleton", request=None):
    """Create a session inside a project."""
    import app._legacy_main as _lm
    return _lm.create_project_session(project_id, inp, mode, request)


def touch_session_presence(session_id: str, inp, request=None):
    """Touch session presence."""
    import app._legacy_main as _lm
    return _lm.touch_session_presence_api(session_id, inp, request)


def leave_session_presence(session_id: str, inp, request=None):
    """Leave session presence."""
    import app._legacy_main as _lm
    return _lm.leave_session_presence_api(session_id, inp, request)


def get_session_tldr(session_id: str, request=None):
    """Get session TLDR."""
    import app._legacy_main as _lm
    return _lm.get_session_tldr(session_id, request)


def get_session_analytics(session_id: str, request=None):
    """Get session analytics."""
    import app._legacy_main as _lm
    return _lm.get_session_analytics(session_id, request)


def patch_session(session_id: str, inp, request=None):
    """Patch session metadata."""
    import app._legacy_main as _lm
    return _lm.patch_session(session_id, inp, request)


def put_session(session_id: str, inp, request=None):
    """Replace session metadata."""
    import app._legacy_main as _lm
    return _lm.put_session(session_id, inp, request)


def patch_session_meta(session_id: str, inp, request=None):
    """Patch only session bpmn_meta_json without touching bpmn_xml."""
    import app._legacy_main as _lm
    return _lm.session_meta_patch(session_id, inp, request)


def recompute_session(session_id: str, request: Optional[Request] = None):
    """Recompute derived fields for a session."""
    import app._legacy_main as _lm
    from app.storage import get_storage, get_default_org_id
    from app.analytics_read_model import refresh_analytics_for_session

    sess, oid, _ = _lm._legacy_load_session_scoped(session_id, request)
    if not sess:
        return {"error": "not found"}
    sess = _lm._recompute_session(sess)
    get_storage().save(sess)
    try:
        refresh_analytics_for_session(
            str(getattr(sess, "id", "") or session_id),
            str(getattr(sess, "org_id", "") or oid or get_default_org_id()),
        )
    except Exception:
        pass
    return sess.model_dump()


def _subprocess_request_context(request: Optional[Request]):
    if request is None:
        return "", "", False
    auth_user = getattr(request.state, "auth_user", None) or {}
    if isinstance(auth_user, dict):
        uid = str(auth_user.get("id") or "").strip()
        admin = bool(auth_user.get("is_admin", False))
    else:
        uid = str(getattr(auth_user, "id", "") or "").strip()
        admin = bool(getattr(auth_user, "is_admin", False))
    oid = str(getattr(request.state, "active_org_id", "") or "").strip()
    return uid, oid, admin


def _resolve_child_bpmn_xml(
    parent_session: Session,
    element_id: str,
    called: Optional[str],
    request: Optional[Request],
) -> str:
    """Resolve the BPMN XML for a subprocess/call activity child session."""
    xml = str(getattr(parent_session, "bpmn_xml", "") or "").strip()
    project_id = str(getattr(parent_session, "project_id", "") or "").strip()
    child_xml = None

    uid, oid, admin = _subprocess_request_context(request)
    org_id = getattr(parent_session, "org_id", None)

    if called and project_id:
        candidates = session_repo.list_project_session_summaries(
            project_id, org_id=org_id
        )
        for c in candidates:
            meta = (c or {}).get("bpmn_meta") or {}
            if str(meta.get("process_id") or "").strip() == called:
                cand = session_repo.load(
                    str((c or {}).get("id") or ""),
                    user_id=uid,
                    org_id=org_id,
                    is_admin=admin,
                )
                if cand:
                    child_xml = str(getattr(cand, "bpmn_xml", "") or "").strip()
                    break

        if not child_xml:
            for c in candidates:
                cand = session_repo.load(
                    str((c or {}).get("id") or ""),
                    user_id=uid,
                    org_id=org_id,
                    is_admin=admin,
                )
                if cand and called in str(getattr(cand, "bpmn_xml", "") or ""):
                    child_xml = str(getattr(cand, "bpmn_xml", "") or "").strip()
                    break

    if not child_xml:
        child_xml = extract_subprocess_xml(xml, element_id)

    if not child_xml:
        raise HTTPException(status_code=404, detail="Subprocess BPMN not found")

    return child_xml


def _create_child_session(
    parent_session: Session,
    element_id: str,
    child_xml: str,
    request: Optional[Request],
) -> Session:
    """Create and persist a new child subprocess session."""
    uid, oid, admin = _subprocess_request_context(request)
    parent_id = str(getattr(parent_session, "id", "") or "").strip()
    project_id = str(getattr(parent_session, "project_id", "") or "").strip()

    parent_bpmn = str(getattr(parent_session, "bpmn_xml", "") or "").strip()
    called = called_element_id(parent_bpmn, element_id) if parent_bpmn else None
    title = f"Подпроцесс: {called or element_id}"

    now_iso = datetime.datetime.utcnow().isoformat() + "Z"
    parent_stack = [dict(f) for f in (getattr(parent_session, "navigation_stack", []) or [])]
    if parent_stack:
        parent_stack[-1]["element_id_in_parent"] = element_id
    else:
        parent_stack = [
            {
                "session_id": parent_id,
                "parent_session_id": "",
                "element_id_in_parent": element_id,
                "entered_at": now_iso,
            }
        ]

    navigation_stack = parent_stack + [
        {
            "session_id": "",
            "parent_session_id": parent_id,
            "element_id_in_parent": "",
            "entered_at": now_iso,
        }
    ]

    child = session_repo.find_or_create_child_session(
        parent_session,
        element_id,
        child_xml,
        navigation_stack,
        title,
        user_id=uid,
        org_id=oid,
        is_admin=admin,
    )
    if project_id:
        try:
            explorer_invalidate_sessions(project_id)
        except Exception:
            logger.exception("failed to invalidate explorer sessions cache for project %s", project_id)
    return child


def _build_breadcrumbs(
    child_session: Session,
    request: Optional[Request],
) -> List[Dict[str, Any]]:
    """Build the navigation breadcrumb list with readable session names."""
    uid, oid, admin = _subprocess_request_context(request)
    org_id = getattr(child_session, "org_id", None)

    def _session_title(sess: Any) -> str:
        if isinstance(sess, dict):
            return str(sess.get("title") or "").strip()
        return str(getattr(sess, "title", "") or "").strip()

    breadcrumbs = [
        {"session_id": f["session_id"], "name": "", "element_id": f.get("element_id_in_parent")}
        for f in (getattr(child_session, "navigation_stack", []) or [])
    ]
    for crumb in breadcrumbs:
        crumb_sess = session_repo.load(
            crumb["session_id"],
            user_id=uid,
            org_id=org_id,
            is_admin=admin,
        )
        crumb["name"] = _session_title(crumb_sess) if crumb_sess else ""
    return breadcrumbs


def navigate_to_subprocess(
    session_id: str,
    element_id: str,
    target_element_id: Optional[str] = None,
    request: Optional[Request] = None,
) -> Dict[str, Any]:
    sess, scope, err = session_access_from_request(request, session_id)
    if err:
        raise HTTPException(status_code=err.status_code, detail=err.body)

    uid, oid, admin = _subprocess_request_context(request)

    xml = str(getattr(sess, "bpmn_xml", "") or "").strip()
    if not xml:
        raise HTTPException(status_code=404, detail="Session has no BPMN diagram")

    el_type = element_type(xml, element_id)
    if el_type not in {"callactivity", "subprocess"}:
        raise HTTPException(status_code=400, detail="Element is not a subprocess or call activity")

    called = called_element_id(xml, element_id) if el_type == "callactivity" else None

    def _xml_has_definitions(child_xml: str) -> bool:
        lower = child_xml.lower()
        return "<bpmn:definitions" in lower or "<definitions" in lower

    def _xml_has_minimal_di(child_xml: str) -> bool:
        lower = child_xml.lower()
        return "<bpmndi:bpmnshape" in lower or "<bpmndi:bpmnedge" in lower

    # Try existing child session
    existing = session_repo.find_by_parent_element(session_id, element_id, org_id=getattr(sess, "org_id", None))
    if existing:
        child_check, _, child_err = session_access_from_request(request, existing.id)
        if child_err:
            raise HTTPException(status_code=child_err.status_code, detail=child_err.body)
        child = child_check
        child_xml = str(getattr(child, "bpmn_xml", "") or "").strip()
        if not _xml_has_definitions(child_xml) or not _xml_has_minimal_di(child_xml):
            child_xml = _resolve_child_bpmn_xml(sess, element_id, called, request)
            child.bpmn_xml = child_xml
            session_repo.save(child, user_id=uid, org_id=oid, is_admin=admin)
    else:
        child_xml = _resolve_child_bpmn_xml(sess, element_id, called, request)
        child = _create_child_session(sess, element_id, child_xml, request)

    child_xml = str(getattr(child, "bpmn_xml", "") or "").strip()
    target_id = resolve_target_element_id(child_xml, target_element_id)
    breadcrumbs = _build_breadcrumbs(child, request)

    return {
        "subprocess_session_id": getattr(child, "id", ""),
        "target_element_id": target_id,
        "breadcrumbs": breadcrumbs,
        "bpmn_xml": child_xml,
    }


def return_to_parent(subprocess_session_id: str, request: Optional[Request] = None) -> Dict[str, Any]:
    sess, scope, err = session_access_from_request(request, subprocess_session_id)
    if err:
        raise HTTPException(status_code=err.status_code, detail=err.body)

    stack = list(getattr(sess, "navigation_stack", []) or [])
    if len(stack) < 2:
        raise HTTPException(status_code=404, detail="No parent session in navigation stack")

    parent_frame = stack[-2]
    parent_session_id = str(parent_frame.get("session_id") or "").strip()
    element_id_in_parent = str(parent_frame.get("element_id_in_parent") or "").strip()
    if not parent_session_id:
        raise HTTPException(status_code=404, detail="Parent session not found")

    return {
        "parent_session_id": parent_session_id,
        "element_id_in_parent": element_id_in_parent,
    }
