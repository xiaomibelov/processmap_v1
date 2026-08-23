from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from ..storage import get_storage
from ..utils.session_helpers import (
    _diagram_state_conflict_payload,
    _mark_diagram_truth_write,
)

_ALLOWED_SUGGESTION_STATUSES = {"pending", "approved", "rejected"}
_ALLOWED_RAG_STATUSES = {"not_ready", "ready", "queued", "indexed"}


def _text(value: Any) -> str:
    return str(value or "").strip()


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _build_product_action_row(session_id: str, suggestion: Dict[str, Any]) -> Dict[str, Any]:
    """Convert an approved suggestion into the canonical registry row shape.

    Follows the contract of productActionsModel.js / product_actions_registry._registry_row.
    """
    action = _as_dict(suggestion.get("action"))
    binding = _as_dict(suggestion.get("binding"))
    row_id = _text(action.get("id") or suggestion.get("id")) or f"pa_{int(time.time())}_{uuid.uuid4().hex[:6]}"
    step_id = _text(action.get("step_id") or binding.get("step_id"))
    node_id = _text(action.get("node_id") or binding.get("node_id"))
    bpmn_element_id = _text(
        action.get("bpmn_element_id")
        or binding.get("bpmn_element_id")
        or node_id
    )
    row: Dict[str, Any] = {
        "id": row_id,
        "session_id": session_id,
        "step_id": step_id,
        "node_id": node_id,
        "bpmn_element_id": bpmn_element_id,
        "step_label": _text(action.get("step_label") or binding.get("step_label")),
        "product_name": _text(action.get("product_name")),
        "product_group": _text(action.get("product_group")),
        "action_type": _text(action.get("action_type")),
        "action_stage": _text(action.get("action_stage")),
        "action_object": _text(action.get("action_object")),
        "action_object_category": _text(action.get("action_object_category")),
        "action_method": _text(action.get("action_method")),
        "role": _text(action.get("role") or binding.get("role")),
        "source": _text(suggestion.get("source") or action.get("source")) or "llm_suggestion",
        "confidence": action.get("confidence") if isinstance(action.get("confidence"), (int, float)) else 1,
        "manual_corrected": False,
        "updated_at": _now_iso(),
    }
    work_duration = action.get("work_duration_sec")
    if isinstance(work_duration, (int, float)) and work_duration >= 0:
        row["work_duration_sec"] = int(work_duration)
    wait_duration = action.get("wait_duration_sec")
    if isinstance(wait_duration, (int, float)) and wait_duration >= 0:
        row["wait_duration_sec"] = int(wait_duration)
    return row


def _raise_not_found(session_id: str) -> None:
    raise HTTPException(
        status_code=404,
        detail={"code": "not_found", "session_id": str(session_id), "message": "session not found"},
    )


def list_suggestions(session_id: str) -> List[Dict[str, Any]]:
    storage = get_storage()
    return storage.list_product_action_suggestions(session_id, status=None)


def create_or_update_suggestion(session_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    storage = get_storage()
    session = storage.load(session_id, is_admin=True)
    if session is None:
        _raise_not_found(session_id)

    status = _text(payload.get("status")) or "pending"
    if status not in _ALLOWED_SUGGESTION_STATUSES:
        status = "pending"

    suggestion_payload = {
        "id": _text(payload.get("id")) or uuid.uuid4().hex,
        "status": status,
        "source": _text(payload.get("source")) or "llm",
        "original_llm_output": _as_dict(payload.get("original_llm_output")),
        "action": _as_dict(payload.get("action")),
        "binding": _as_dict(payload.get("binding")),
        "edited_by_user": int(payload.get("edited_by_user") or 0),
    }
    return storage.upsert_product_action_suggestion(session_id, suggestion_payload)


def apply_approved_suggestions(
    session_id: str,
    base_diagram_state_version: Optional[int],
    actor_user_id: str,
) -> Dict[str, Any]:
    storage = get_storage()
    session = storage.load(session_id, is_admin=True)
    if session is None:
        _raise_not_found(session_id)

    current_version = int(session.diagram_state_version or 0)
    if base_diagram_state_version is None:
        raise HTTPException(
            status_code=409,
            detail=_diagram_state_conflict_payload(
                code="DIAGRAM_STATE_BASE_VERSION_REQUIRED",
                session_id=session_id,
                client_base_version=None,
                server_current_version=current_version,
                sess=session,
            ),
        )
    if int(base_diagram_state_version) != current_version:
        raise HTTPException(
            status_code=409,
            detail=_diagram_state_conflict_payload(
                code="DIAGRAM_STATE_CONFLICT",
                session_id=session_id,
                client_base_version=int(base_diagram_state_version),
                server_current_version=current_version,
                sess=session,
            ),
        )

    approved = storage.list_product_action_suggestions(session_id, status="approved")
    if not approved:
        readiness = storage.get_rag_readiness(session_id, org_id=session.org_id)
        return {
            "applied_count": 0,
            "new_diagram_state_version": current_version,
            "rag_readiness_status": readiness.get("rag_readiness_status") if readiness else session.rag_readiness_status,
        }

    interview = session.interview if isinstance(session.interview, dict) else {}
    analysis = interview.get("analysis") if isinstance(interview.get("analysis"), dict) else {}
    product_actions = list(analysis.get("product_actions") or [])

    applied_count = 0
    for suggestion in approved:
        product_actions.append(_build_product_action_row(session_id, suggestion))
        applied_count += 1

    analysis["product_actions"] = product_actions
    interview["analysis"] = analysis
    session.interview = interview

    # Applying approved suggestions makes the session a valid source for RAG indexing.
    session.rag_readiness_status = "ready"

    _mark_diagram_truth_write(
        session,
        changed_keys=["interview.analysis.product_actions"],
        actor_user_id=str(actor_user_id),
        actor_label=str(actor_user_id),
    )

    storage.save(
        session,
        user_id=str(actor_user_id),
        org_id=session.org_id,
        is_admin=True,
        expected_diagram_state_version=current_version,
    )

    # After successful application the approved suggestions are removed.
    # This keeps the suggestion table bounded and avoids double-application.
    storage.delete_product_action_suggestions(session_id, status="approved")

    new_version = int(session.diagram_state_version or 0)
    readiness = storage.get_rag_readiness(session_id, org_id=session.org_id)
    return {
        "applied_count": applied_count,
        "new_diagram_state_version": new_version,
        "rag_readiness_status": readiness.get("rag_readiness_status") if readiness else session.rag_readiness_status,
    }


def get_rag_readiness(session_id: str) -> Dict[str, Any]:
    storage = get_storage()
    readiness = storage.get_rag_readiness(session_id, org_id=None)
    if readiness is None:
        _raise_not_found(session_id)
    return readiness


def transition_rag_readiness(
    session_id: str,
    new_status: str,
    actor_user_id: str,
) -> Dict[str, Any]:
    storage = get_storage()
    session = storage.load(session_id, is_admin=True)
    if session is None:
        _raise_not_found(session_id)

    current_status = _text(session.rag_readiness_status) or "not_ready"
    target_status = _text(new_status) or ""

    if target_status not in _ALLOWED_RAG_STATUSES:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_request",
                "message": f"invalid rag_readiness_status: {target_status}",
                "allowed": sorted(_ALLOWED_RAG_STATUSES),
            },
        )

    # Current contract only allows manual transition ready -> queued.
    if not (current_status == "ready" and target_status == "queued"):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "RAG_READINESS_INVALID_TRANSITION",
                "session_id": session_id,
                "current_status": current_status,
                "requested_status": target_status,
                "message": "only ready -> queued transition is allowed",
            },
        )

    updated = storage.set_rag_readiness(session_id, target_status, org_id=session.org_id)
    if updated is None:
        _raise_not_found(session_id)
    return updated
