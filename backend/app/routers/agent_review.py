"""Endpoint ревьюера техкарты (feature/session-doc-attachments).

POST /api/sessions/{session_id}/agent/review — запускается ТОЛЬКО явно
(иконка UI или текстовые алиасы «ревью:» / «/review» на фронтенде).
Agent chat этот endpoint не вызывает (контрактный тест в test_agent_review_api).
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from ..agent.review import run_review
from ..services.session_docs_service import require_session_access
from ..sessions_graph import _request_context

router = APIRouter(tags=["agent"])


class AgentReviewIn(BaseModel):
    text: str = Field(default="")
    client_review_id: Optional[str] = Field(default=None, description="Опциональный id идемпотентности (v1: не персистится)")


@router.post(
    "/api/sessions/{session_id}/agent/review",
    responses={
        401: {"description": "Не аутентифицирован (нет bearer-токена)"},
        403: {"description": "Сессия существует, но недоступна (чужой org)"},
        404: {"description": "Сессия не найдена"},
        502: {"description": "LLM недоступен или ответ не распарсился (review_parse_failed / review_llm_error)"},
        504: {"description": "Таймаут LLM-вызова"},
    },
)
def agent_review(session_id: str, body: AgentReviewIn, request: Request) -> Dict[str, Any]:
    ctx = _request_context(request)
    require_session_access(
        session_id,
        user_id=ctx.get("user_id"),
        org_id=ctx.get("org_id"),
        is_admin=ctx.get("is_admin"),
    )
    return run_review(
        session_id=session_id,
        org_id=str(ctx.get("org_id") or "org_default"),
        user_id=str(ctx.get("user_id") or ""),
        text=body.text,
        client_review_id=body.client_review_id,
    )
