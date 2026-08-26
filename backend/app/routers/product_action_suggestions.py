from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response
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
from ._product_action_export_utils import _csv_bytes, _xlsx_bytes

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


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


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


_SESSION_EXPORT_COLUMNS = [
    "process_title",
    "product_group",
    "product_name",
    "action_text",
    "action_type",
    "action_stage",
    "action_object",
    "action_method",
    "step_label",
    "role",
    "source",
    "updated_at",
]


def _build_export_rows(session: Any) -> List[Dict[str, Any]]:
    """Build session-scoped product action rows for CSV/XLSX export."""
    session_id = _text(getattr(session, "id", ""))
    process_title = _text(getattr(session, "title", "")) or "Без названия"
    interview = _as_dict(getattr(session, "interview", {}))
    analysis = _as_dict(interview.get("analysis"))
    product_actions = list(_as_dict(analysis).get("product_actions") or [])

    rows: List[Dict[str, Any]] = []
    if product_actions:
        for action_raw in product_actions:
            action = _as_dict(action_raw)
            rows.append(
                {
                    "process_title": process_title,
                    "product_group": _text(action.get("product_group")),
                    "product_name": _text(action.get("product_name")),
                    "action_text": _text(action.get("action_text")),
                    "action_type": _text(action.get("action_type")),
                    "action_stage": _text(action.get("action_stage")),
                    "action_object": _text(action.get("action_object")),
                    "action_method": _text(action.get("action_method")),
                    "step_label": _text(action.get("step_label")),
                    "role": _text(action.get("role")),
                    "source": _text(action.get("source")) or "manual",
                    "updated_at": _text(action.get("updated_at")),
                }
            )
        return rows

    approved = service.list_suggestions(session_id, status="approved")
    for suggestion in approved:
        row = service._build_product_action_row(session_id, suggestion)
        rows.append(
            {
                "process_title": process_title,
                "product_group": _text(row.get("product_group")),
                "product_name": _text(row.get("product_name")),
                "action_text": _text(row.get("action_text")),
                "action_type": _text(row.get("action_type")),
                "action_stage": _text(row.get("action_stage")),
                "action_object": _text(row.get("action_object")),
                "action_method": _text(row.get("action_method")),
                "step_label": _text(row.get("step_label")),
                "role": _text(row.get("role")),
                "source": _text(row.get("source")) or "llm_suggestion",
                "updated_at": _text(row.get("updated_at")),
            }
        )
    return rows


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


@router.get("/api/sessions/{session_id}/analysis/product-actions/export")
def export_product_actions(
    session_id: str,
    request: Request,
    format: str = Query("csv", pattern="^(csv|xlsx)$"),
) -> Response:
    if format not in ("csv", "xlsx"):
        raise HTTPException(status_code=422, detail="invalid format; allowed: csv, xlsx")
    org_id = _authorize(request, session_id)
    session = _load_session_for_request(request, session_id, org_id)
    rows = _build_export_rows(session)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    ext = "csv" if format == "csv" else "xlsx"
    filename = f"product-actions-{session_id}-{timestamp}.{ext}"
    if format == "csv":
        content = _csv_bytes(rows, _SESSION_EXPORT_COLUMNS)
        media_type = "text/csv; charset=utf-8"
    else:
        content = _xlsx_bytes(rows, _SESSION_EXPORT_COLUMNS)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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
