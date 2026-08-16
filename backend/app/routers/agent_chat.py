"""AGENT-0 PROCESSMAN chat router."""
from __future__ import annotations

from fastapi import APIRouter, Request

from ..agent.chat import run_turn
from ..agent.memory_store import list_turns
from ..repositories import session_repo
from ..schemas.agent_chat import AgentChatIn, AgentChatOut, AgentHistoryOut, AgentTurnOut
from ..sessions_graph import _request_context
from ..utils.session_helpers import raise_session_not_found


router = APIRouter(tags=["agent"])


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


@router.post("/api/sessions/{session_id}/agent/chat", response_model=AgentChatOut)
def agent_chat(session_id: str, body: AgentChatIn, request: Request) -> AgentChatOut:
    ctx = _request_context(request)
    sess = session_repo.load(
        session_id,
        user_id=ctx.get("user_id"),
        org_id=ctx.get("org_id"),
        is_admin=ctx.get("is_admin"),
    )
    if not sess:
        raise_session_not_found(session_id)
    return run_turn(
        session_id=session_id,
        user_id=ctx["user_id"],
        org_id=ctx.get("org_id", "org_default"),
        payload=body,
        request=request,
    )


@router.get("/api/sessions/{session_id}/agent/history", response_model=AgentHistoryOut)
def agent_history(session_id: str, request: Request, limit: int = 100) -> AgentHistoryOut:
    ctx = _request_context(request)
    sess = session_repo.load(
        session_id,
        user_id=ctx.get("user_id"),
        org_id=ctx.get("org_id"),
        is_admin=ctx.get("is_admin"),
    )
    if not sess:
        raise_session_not_found(session_id)
    turns = list_turns(
        session_id,
        ctx["user_id"],
        ctx.get("org_id", "org_default"),
        limit=limit,
    )
    return AgentHistoryOut(turns=[_to_turn_out(t) for t in turns])
