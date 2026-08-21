"""LLM4 — POST /api/llm/feedback (viewer+): оценка 👍/👎 ответа панели PROCESSMAN.

Записывает строку в llm_usage БЕЗ обращения к LLM (0 токенов, feature
`processman_feedback`, status `feedback_up`/`feedback_down`). Комментарий к 👎 —
вне v1 (решение владельца, спека LLM4 «Футер»).
"""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict

from .. import _legacy_main
from ..ai import llm_store

router = APIRouter()

FEEDBACK_FEATURE = "processman_feedback"
ALLOWED_RATINGS = {"up", "down"}


class LlmFeedbackIn(BaseModel):
    rating: str
    session_id: Optional[str] = ""
    # Контекст действия панели (suggest-next/explain-step/step-qa/analysis) —
    # только для аналитики, не обязателен.
    action: Optional[str] = ""
    model_config = ConfigDict(extra="ignore")


@router.post("/api/llm/feedback")
def llm_feedback(request: Request, body: LlmFeedbackIn) -> Any:
    oid = _legacy_main._request_active_org_id(request)
    _role, err = _legacy_main._enterprise_require_org_member(request, oid)
    if err is not None:
        return err

    rating = str(body.rating or "").strip().lower()
    if rating not in ALLOWED_RATINGS:
        return _legacy_main._enterprise_error(422, "invalid_rating", "rating must be 'up' or 'down'")

    user = _legacy_main._request_auth_user(request) or {}
    llm_store.record_usage(
        org_id=oid or "org_default",
        feature=FEEDBACK_FEATURE,
        model=str(body.action or "")[:120],
        provider_id="",
        prompt_tokens=0,
        completion_tokens=0,
        cached=False,
        user_id=str(user.get("id") or user.get("user_id") or ""),
        session_id=str(body.session_id or "")[:64],
        latency_ms=0,
        status=f"feedback_{rating}",
    )
    return {"ok": True, "recorded": f"feedback_{rating}", "tokens": 0}
