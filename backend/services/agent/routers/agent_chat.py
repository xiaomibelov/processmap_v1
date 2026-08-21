"""PROCESSMAN chat router — сервисная версия backend/app/routers/agent_chat.py.

Пути БЕЗ /api-префикса (внутренние пути сервиса): nginx на Phase 3 срежет
prefix /api при проксировании (location ~ ^/api/sessions/[^/]+/agent/(chat|history)).
Контракты запросов/ответов — те же, что у монолита (schemas.py = копия
app/schemas/agent_chat.py). Гейт — org member как у LLM3 (services/auth_service).
"""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request

from memory.chat import run_turn
from memory.memory_store import list_turns
from runners.monolith_client import MonolithError
from schemas import AgentChatIn, AgentChatOut, AgentHistoryOut, AgentTurnOut
from services.auth_service import AuthError, SessionNotFound, get_session_context


router = APIRouter(tags=["agent"])


def _extract_bearer(request: Request) -> str:
    auth = request.headers.get("authorization") or ""
    parts = str(auth).split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return ""


def _session_gate(session_id: str, request: Request) -> Dict[str, Any]:
    token = _extract_bearer(request)
    try:
        ctx = get_session_context(token, session_id)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except SessionNotFound as exc:
        raise HTTPException(status_code=404, detail="session not found") from exc
    ctx["token"] = token
    return ctx


def _to_turn_out(turn) -> AgentTurnOut:
    return AgentTurnOut(
        id=turn.id,
        role=turn.role,
        content=turn.content or {},
        action=turn.action,
        action_payload=turn.action_payload or {},
        projection_digest=turn.projection_digest,
        usage=turn.usage or {},
        created_at=turn.created_at,
        client_turn_id=turn.client_turn_id,
    )


@router.post("/sessions/{session_id}/agent/chat", response_model=AgentChatOut)
def agent_chat(session_id: str, body: AgentChatIn, request: Request) -> AgentChatOut:
    ctx = _session_gate(session_id, request)
    try:
        return run_turn(
            session_id=session_id,
            user_id=ctx["user_id"],
            org_id=ctx["org_id"],
            payload=body,
            token=ctx["token"],
            session_row=ctx["session"],
        )
    except MonolithError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/sessions/{session_id}/agent/history", response_model=AgentHistoryOut)
def agent_history(session_id: str, request: Request, limit: int = 100) -> AgentHistoryOut:
    ctx = _session_gate(session_id, request)
    turns = list_turns(session_id, ctx["user_id"], ctx["org_id"], limit=limit)
    return AgentHistoryOut(turns=[_to_turn_out(t) for t in turns])
