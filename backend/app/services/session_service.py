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
    import backend.app._legacy_main as _lm
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
    import backend.app._legacy_main as _lm
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
    import backend.app._legacy_main as _lm
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
    import backend.app._legacy_main as _lm
    return _lm.session_bpmn_meta_get(session_id)


def bpmn_meta_patch(
    session_id: str,
    inp: Any,
    request: Any = None,
) -> Dict[str, Any]:
    """Patch BPMN metadata."""
    # CROSS-DOMAIN: depends on _require_diagram_cas_or_409, _mark_diagram_truth_write.
    import backend.app._legacy_main as _lm
    return _lm.session_bpmn_meta_patch(session_id, inp, request)


def bpmn_meta_infer_rtiers(
    session_id: str,
    inp: Any,
    request: Any = None,
) -> Dict[str, Any]:
    """Infer RTIers from BPMN meta."""
    # CROSS-DOMAIN: depends on infer_rtiers pipeline in _legacy_main.py.
    import backend.app._legacy_main as _lm
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
    import backend.app._legacy_main as _lm
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
    import backend.app._legacy_main as _lm
    return _lm.session_bpmn_save(session_id, inp, request)


def bpmn_versions_list(
    session_id: str,
    *,
    request: Any = None,
) -> Dict[str, Any]:
    """List BPMN version snapshots for a session."""
    import backend.app._legacy_main as _lm
    return _lm.session_bpmn_versions_list(session_id, request=request)


def bpmn_version_detail(
    session_id: str,
    version_id: str,
    request: Any = None,
) -> Dict[str, Any]:
    """Get a single BPMN version snapshot."""
    import backend.app._legacy_main as _lm
    return _lm.session_bpmn_version_detail(session_id, version_id, request)


def bpmn_restore(
    session_id: str,
    version_id: str,
    request: Any = None,
) -> Dict[str, Any]:
    """Restore a BPMN version snapshot."""
    # CROSS-DOMAIN: depends on _latest_user_facing_bpmn_version,
    # _create_bpmn_revision_snapshot_if_needed, _mark_diagram_truth_write.
    import backend.app._legacy_main as _lm
    return _lm.session_bpmn_restore(session_id, version_id, request)


def bpmn_clear(
    session_id: str,
    request: Any = None,
) -> Dict[str, Any]:
    """Clear BPMN XML from session."""
    # CROSS-DOMAIN: depends on _require_diagram_cas_or_409, _mark_diagram_truth_write.
    import backend.app._legacy_main as _lm
    return _lm.session_bpmn_clear(session_id, request)


def overlays(session_id: str) -> Any:
    """Return lightweight JSON overlays for a session."""
    from ..overlay_cache import get_overlays_json
    return get_overlays_json(session_id)
