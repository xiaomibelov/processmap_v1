from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, List, Optional

from ..models import Session
from ..repositories import session_repo
from ..storage import get_storage

logger = logging.getLogger(__name__)


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
    sess = session_repo.load(sid, user_id=user_id, org_id=org_id, is_admin=True)
    if sess is None:
        raise RuntimeError("session not persisted")
    if prep_questions:
        sess.interview = {**(sess.interview or {}), "prep_questions": prep_questions}
        session_repo.save(sess, user_id=user_id, org_id=org_id, is_admin=True)
    # Note: _recompute_session and _session_api_dump are still in _legacy_main.py
    # Full extraction requires moving those helpers first.
    import app._legacy_main as _lm
    sess = _lm._recompute_session(sess)
    session_repo.save(sess, user_id=user_id, org_id=org_id, is_admin=True)
    _lm._invalidate_session_caches(sess, org_id=org_id or getattr(sess, "org_id", "") or "")
    return _lm._session_api_dump(sess)


def get_session(
    session_id: str,
    *,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> Dict[str, Any]:
    """Load a single session by id."""
    sess = session_repo.load(session_id, user_id=user_id, org_id=org_id, is_admin=is_admin)
    if not sess:
        return {"error": "not found"}
    import app._legacy_main as _lm
    return _lm._session_api_dump(sess)


def list_sessions(
    query: Optional[str] = None,
    limit: int = 200,
    *,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    allowed_project_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """List sessions with optional filtering."""
    items = session_repo.list_sessions(
        query=query,
        limit=min(max(int(limit), 1), 500),
        org_id=org_id,
        is_admin=is_admin,
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
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = True,
) -> List[Dict[str, Any]]:
    """List sessions scoped to a project."""
    if view == "summary":
        return session_repo.list_project_session_summaries(
            project_id=project_id,
            mode=mode,
            limit=500,
            org_id=org_id,
            is_admin=is_admin,
        )
    rows = session_repo.list_sessions(
        query=None,
        limit=500,
        org_id=org_id,
        is_admin=is_admin,
    )
    # Filter by project_id in memory (storage.list does not support project_id filter directly)
    rows = [r for r in rows if str((r or {}).get("project_id") or "").strip() == project_id]
    out = []
    import app._legacy_main as _lm
    for row in rows:
        if isinstance(row, dict):
            out.append(_lm._session_api_dump(Session.model_validate(row)))
    return out


def delete_session(
    session_id: str,
    *,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> bool:
    """Delete a session."""
    return session_repo.delete(
        session_id,
        user_id=user_id,
        org_id=org_id,
        is_admin=is_admin,
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
    """Export session BPMN XML."""
    # CROSS-DOMAIN: depends on _overlay_interview_annotations_on_bpmn_xml,
    # _session_graph_fingerprint, _create_bpmn_revision_snapshot_if_needed,
    # _mark_diagram_truth_write, exporters.bpmn in _legacy_main.py.
    import app._legacy_main as _lm
    return _lm.session_bpmn_export(
        session_id,
        raw=raw,
        include_overlay=include_overlay,
        zoom=zoom,
        pan_x=pan_x,
        pan_y=pan_y,
        request=request,
    )


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


def recompute_session(session_id: str):
    """Recompute derived fields for a session."""
    import app._legacy_main as _lm
    return _lm.recompute(session_id)
