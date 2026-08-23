from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..legacy.request_context import (
    require_authenticated_user,
    request_active_org_id,
)
from ..services.org_workspace import (
    project_access_allowed,
    require_org_member_for_enterprise,
)
from ..services import product_action_suggestions_service as service
from ..storage import get_storage

router = APIRouter(tags=["product-action-suggestions"])


class SuggestionIn(BaseModel):
    id: Optional[str] = None
    status: Optional[str] = "pending"
    source: Optional[str] = "llm"
    original_llm_output: Optional[Dict[str, Any]] = Field(default_factory=dict)
    action: Optional[Dict[str, Any]] = Field(default_factory=dict)
    binding: Optional[Dict[str, Any]] = Field(default_factory=dict)
    edited_by_user: Optional[int] = 0


class ApplySuggestionsIn(BaseModel):
    base_diagram_state_version: Optional[int] = None


class PatchRagReadinessIn(BaseModel):
    rag_readiness_status: str


def _text(value: Any) -> str:
    return str(value or "").strip()


def _actor_user_id(request: Request) -> str:
    user = getattr(getattr(request, "state", None), "auth_user", None)
    if isinstance(user, dict):
        return _text(user.get("id") or user.get("sub") or user.get("email"))
    return ""


def _success(data: Any, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return {"success": True, "data": data, "meta": meta or {}}


def _load_session_for_request(request: Request, session_id: str, org_id: str):
    storage = get_storage()
    session = storage.load(session_id, org_id=org_id, is_admin=True)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "session_id": str(session_id), "message": "session not found"},
        )
    project_id = _text(getattr(session, "project_id", ""))
    if project_id and not project_access_allowed(request, org_id, project_id):
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "session_id": str(session_id), "message": "session not found"},
        )
    return session


def _authorize(request: Request, session_id: str) -> str:
    require_authenticated_user(request)
    org_id = request_active_org_id(request)
    require_org_member_for_enterprise(request, org_id)
    _load_session_for_request(request, session_id, org_id)
    return org_id


def _suggestion_counts(suggestions: List[Dict[str, Any]]) -> Dict[str, int]:
    counts: Dict[str, int] = {"pending": 0, "approved": 0, "rejected": 0, "total": 0}
    for suggestion in suggestions:
        counts["total"] += 1
        status = _text(suggestion.get("status")) or "pending"
        if status in counts:
            counts[status] += 1
    return counts


@router.get("/api/sessions/{session_id}/analysis/product-actions/suggestions")
def list_suggestions(session_id: str, request: Request) -> Dict[str, Any]:
    _authorize(request, session_id)
    suggestions = service.list_suggestions(session_id)
    return _success(suggestions, meta={"counts": _suggestion_counts(suggestions)})


@router.post("/api/sessions/{session_id}/analysis/product-actions/suggestions")
def create_or_update_suggestion(session_id: str, inp: SuggestionIn, request: Request) -> Dict[str, Any]:
    _authorize(request, session_id)
    suggestion = service.create_or_update_suggestion(session_id, inp.model_dump(exclude_unset=True))
    return _success(suggestion)


@router.post("/api/sessions/{session_id}/analysis/product-actions/suggestions/apply")
def apply_approved_suggestions(session_id: str, inp: ApplySuggestionsIn, request: Request) -> Dict[str, Any]:
    _authorize(request, session_id)
    result = service.apply_approved_suggestions(
        session_id,
        inp.base_diagram_state_version,
        _actor_user_id(request),
    )
    return _success(result)


@router.get("/api/sessions/{session_id}/rag-readiness")
def get_rag_readiness(session_id: str, request: Request) -> Dict[str, Any]:
    _authorize(request, session_id)
    readiness = service.get_rag_readiness(session_id)
    return _success(readiness)


@router.patch("/api/sessions/{session_id}/rag-readiness")
def transition_rag_readiness(session_id: str, inp: PatchRagReadinessIn, request: Request) -> Dict[str, Any]:
    _authorize(request, session_id)
    result = service.transition_rag_readiness(
        session_id,
        inp.rag_readiness_status,
        _actor_user_id(request),
    )
    return _success(result)
