"""Internal LLM API: POST /internal/llm/complete и /internal/llm/complete_cached.

Вызывается монолитом (LLM1/LLM2/LLM3 через ai/llm_internal_client при
LLM_VIA_AGENT_SVC=1). Только внутренняя docker-сеть — nginx эти пути НЕ
публикует (Phase 3). Авторизация: заголовок X-Internal-Token должен совпадать
с env AGENT_SVC_INTERNAL_TOKEN (общий секрет с монолитом); env не задан или
токен не совпал → 401.

Ответ — поле-в-поле как gateway.complete()/complete_cached():
{ok, status, text, usage, provider_id, model, prompt_version, fallback, cached, latency_ms}.
"""
from __future__ import annotations

import os
from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from gateway import gateway


router = APIRouter(tags=["internal-llm"])


class InternalCompleteIn(BaseModel):
    feature: str
    payload: Any = None
    user_id: str = ""
    project_id: str = ""
    session_id: str = ""
    org_id: str = "org_default"
    max_tokens: Optional[int] = None
    timeout_sec: int = 30


class InternalCompleteCachedIn(BaseModel):
    feature: str
    cache_digest: str
    payload: Any = None
    user_id: str = ""
    project_id: str = ""
    session_id: str = ""
    org_id: str = "org_default"
    max_tokens: Optional[int] = None
    timeout_sec: int = 30


def _check_internal_token(x_internal_token: str) -> None:
    expected = str(os.environ.get("AGENT_SVC_INTERNAL_TOKEN") or "").strip()
    if not expected or str(x_internal_token or "").strip() != expected:
        raise HTTPException(status_code=401, detail="invalid internal token")


@router.post("/internal/llm/complete")
def internal_complete(
    body: InternalCompleteIn,
    x_internal_token: str = Header(default="", alias="X-Internal-Token"),
) -> Dict[str, Any]:
    _check_internal_token(x_internal_token)
    return gateway.complete(
        body.feature,
        body.payload,
        user_id=body.user_id,
        project_id=body.project_id,
        session_id=body.session_id,
        org_id=body.org_id,
        max_tokens=body.max_tokens,
        timeout_sec=body.timeout_sec,
    )


@router.post("/internal/llm/complete_cached")
def internal_complete_cached(
    body: InternalCompleteCachedIn,
    x_internal_token: str = Header(default="", alias="X-Internal-Token"),
) -> Dict[str, Any]:
    _check_internal_token(x_internal_token)
    return gateway.complete_cached(
        body.feature,
        body.cache_digest,
        body.payload,
        user_id=body.user_id,
        project_id=body.project_id,
        session_id=body.session_id,
        org_id=body.org_id,
        max_tokens=body.max_tokens,
        timeout_sec=body.timeout_sec,
    )
