"""Property-only save service.

Handles saves that mutate ``bpmn_meta_json`` (Camunda extension properties,
flow/path meta, etc.) without changing ``bpmn_xml``. Uses a CAS grace window so
that stale ``diagram_state_version`` values from the frontend do not produce
unnecessary 409 conflicts.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import HTTPException, Request

from ..._legacy_main import (
    _can_edit_workspace,
    _invalidate_session_caches,
    _legacy_load_session_scoped,
    _normalize_bpmn_meta,
    get_default_org_id,
)
from ...legacy.request_context import request_auth_user as _request_auth_user
from ...services.org_workspace import org_role_for_request as _org_role_for_request
from ...storage import get_storage
from ...utils.session_helpers import _diagram_state_conflict_payload

PROPERTY_SAVE_GRACE_WINDOW = 1


def _deduplicate_camunda_extension_properties(camunda_map: Any) -> Dict[str, Any]:
    """Keep the last value for each property name per element.

    This prevents duplicate ``camunda:property`` rows when the frontend sends
    repeated property names.
    """
    src = camunda_map if isinstance(camunda_map, dict) else {}
    out: Dict[str, Any] = {}
    for element_id_raw, state_raw in src.items():
        element_id = str(element_id_raw or "").strip()
        if not element_id or not isinstance(state_raw, dict):
            continue
        state = dict(state_raw)
        properties = state.get("properties")
        if isinstance(properties, dict):
            rows = properties.get("extensionProperties")
            if isinstance(rows, list):
                seen: Dict[str, Dict[str, Any]] = {}
                for row in reversed(rows):
                    if not isinstance(row, dict):
                        continue
                    name = str(row.get("name") or "").strip()
                    if not name:
                        continue
                    if name not in seen:
                        seen[name] = row
                state["properties"] = {
                    **properties,
                    "extensionProperties": list(reversed(seen.values())),
                }
        out[element_id] = state
    return out


def _extract_user_context(request: Optional[Request]) -> Dict[str, Any]:
    user = _request_auth_user(request) if request is not None else {}
    return user if isinstance(user, dict) else {}


def _resolve_meta_from_input(inp: Any) -> Dict[str, Any]:
    meta = getattr(inp, "bpmn_meta_json", None)
    if not isinstance(meta, dict):
        meta = getattr(inp, "bpmn_meta", None)
    if not isinstance(meta, dict):
        raise HTTPException(status_code=400, detail="bpmn_meta_json must be an object")
    return dict(meta)


def _merge_meta(current: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
    merged = {**current, **incoming}
    camunda_incoming = incoming.get("camunda_extensions_by_element_id")
    if isinstance(camunda_incoming, dict):
        merged["camunda_extensions_by_element_id"] = _deduplicate_camunda_extension_properties(
            camunda_incoming
        )
    return _normalize_bpmn_meta(merged)


def patch_session_properties(
    session_id: str,
    inp: Any,
    request: Optional[Request] = None,
) -> Dict[str, Any]:
    """Patch session meta with a grace window for ``diagram_state_version``.

    This is the primary entry point for property-only saves. It never touches
    ``bpmn_xml``. The grace window allows the frontend's base version to be
    slightly stale without rejecting the save.
    """
    sess, oid, _ = _legacy_load_session_scoped(session_id, request)
    if not sess:
        return {"error": "not found"}

    user = _extract_user_context(request)
    role = _org_role_for_request(request, oid) if request is not None and oid else ""
    is_admin = bool(user.get("is_admin", False))
    if not _can_edit_workspace(role, is_admin=is_admin):
        raise HTTPException(status_code=403, detail="forbidden")

    incoming_meta = _resolve_meta_from_input(inp)
    base_version_raw = getattr(inp, "base_diagram_state_version", None)
    if base_version_raw is None:
        server_current = int(getattr(sess, "diagram_state_version", 0) or 0)
        raise HTTPException(
            status_code=409,
            detail=_diagram_state_conflict_payload(
                code="DIAGRAM_STATE_BASE_VERSION_REQUIRED",
                session_id=session_id,
                client_base_version=None,
                server_current_version=server_current,
                sess=sess,
            ),
        )

    client_base_version = int(base_version_raw or 0)
    current_meta = _normalize_bpmn_meta(getattr(sess, "bpmn_meta", {}))
    normalized_meta = _merge_meta(current_meta, incoming_meta)

    st = get_storage()
    user_id = str(user.get("id") or "").strip()
    # Org scoping and edit permission already verified above.
    updated = st.patch_session_meta_grace(
        session_id,
        normalized_meta,
        client_base_version,
        grace_window=PROPERTY_SAVE_GRACE_WINDOW,
        user_id=user_id,
        org_id=oid,
        is_admin=True,
    )

    if updated is None:
        server_current_version = int(getattr(sess, "diagram_state_version", 0) or 0)
        try:
            fresh = st.load(
                session_id,
                user_id=user_id,
                org_id=oid,
                is_admin=True,
            )
            if fresh:
                server_current_version = int(getattr(fresh, "diagram_state_version", 0) or 0)
        except Exception:
            pass
        raise HTTPException(
            status_code=409,
            detail=_diagram_state_conflict_payload(
                code="DIAGRAM_STATE_CONFLICT",
                session_id=session_id,
                client_base_version=client_base_version,
                server_current_version=server_current_version,
                sess=sess,
            ),
        )

    _invalidate_session_caches(
        updated,
        session_id=session_id,
        org_id=str(getattr(updated, "org_id", "") or get_default_org_id()),
    )

    from ..analytics_aggregator import publish_session_saved
    publish_session_saved(
        str(getattr(updated, "id", "") or session_id),
        str(getattr(updated, "org_id", "") or oid or get_default_org_id()),
    )

    return {
        "ok": True,
        "id": updated.id,
        "rev": int(getattr(updated, "bpmn_xml_version", 0) or 0),
        "diagram_state_version": int(getattr(updated, "diagram_state_version", 0) or 0),
        "bpmn_meta_json": getattr(updated, "bpmn_meta", {}) or {},
    }
