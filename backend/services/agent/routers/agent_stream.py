"""PROCESSMAN streaming chat router — SSE endpoint.

POST /sessions/{session_id}/agent/stream proxies through nginx
(location ~ ^/api/sessions/[^/]+/agent/(chat|history|stream)$).
Uses fetch() + ReadableStream on the frontend, NOT EventSource, because the
endpoint requires a POST body.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, Generator, Tuple

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

logger = logging.getLogger("agent.stream")

from memory.chat import run_turn_stream
from runners.monolith_client import MonolithError
from schemas import AgentChatIn
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


def _sse_event(event_type: str, payload: Dict[str, Any]) -> str:
    return f"event: {event_type}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _stream_response(
    session_id: str,
    user_id: str,
    org_id: str,
    payload: AgentChatIn,
    token: str,
    session_row: Dict[str, Any],
) -> Generator[str, None, None]:
    try:
        for event_type, event_data in run_turn_stream(
            session_id=session_id,
            user_id=user_id,
            org_id=org_id,
            payload=payload,
            token=token,
            session_row=session_row,
        ):
            if event_type == "error":
                logger.warning(
                    "agent_stream error event session=%s provider=%s model=%s status=%s error=%s",
                    session_id,
                    event_data.get("provider_id", ""),
                    event_data.get("model", ""),
                    event_data.get("status", ""),
                    event_data.get("error", ""),
                )
            yield _sse_event(event_type, event_data)
    except Exception as exc:
        logger.exception("agent_stream unhandled exception session=%s", session_id)
        yield _sse_event("error", {"status": "error", "error": f"{exc.__class__.__name__}: {exc}"})


@router.post("/sessions/{session_id}/agent/stream")
def agent_stream(session_id: str, body: AgentChatIn, request: Request) -> StreamingResponse:
    ctx = _session_gate(session_id, request)
    try:
        return StreamingResponse(
            _stream_response(
                session_id=session_id,
                user_id=ctx["user_id"],
                org_id=ctx["org_id"],
                payload=body,
                token=ctx["token"],
                session_row=ctx["session"],
            ),
            media_type="text/event-stream",
        )
    except MonolithError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
