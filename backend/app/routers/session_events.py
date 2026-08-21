from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from ..services.session_event_bus import get_session_event_bus

logger = logging.getLogger(__name__)

router = APIRouter()

SSE_KEEPALIVE_INTERVAL = 25.0  # seconds — below typical LB/proxy 60s idle timeout


async def _sse_event_stream(session_id: str, request: Request) -> None:
    """
    Yield SSE-formatted events for a session.

    Reads from an asyncio.Queue subscribed to the session event bus.
    Sends periodic heartbeat comments to keep the connection alive.
    """
    bus = get_session_event_bus()
    queue = bus.subscribe(session_id)
    try:
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=SSE_KEEPALIVE_INTERVAL)
            except asyncio.TimeoutError:
                # Heartbeat — keeps the connection alive through proxies.
                yield ": heartbeat\n\n"
                continue

            event_type = event.get("type", "message")
            event_data = event.get("data", {})

            if event_type == "__closed__":
                # Session cleanup — tell the client and close.
                yield "event: closed\ndata: {}\n\n"
                break

            payload = json.dumps(event_data, ensure_ascii=False, default=str)
            yield f"event: {event_type}\ndata: {payload}\n\n"

            # After broadcasting session_deleted, there's no point keeping
            # the connection open — the client should reconnect on 404.
            if event_type == "session_deleted":
                break
    except asyncio.CancelledError:
        pass
    finally:
        bus.unsubscribe(session_id, queue)


@router.get("/api/sessions/{session_id}/events")
async def session_events(session_id: str, request: Request):
    """
    SSE endpoint for session-scoped events.

    The client must have access to the session (same auth check as GET /api/sessions/{id}).
    Emits: session_deleted, heartbeat.
    """
    sid = str(session_id or "").strip()
    if not sid:
        raise HTTPException(status_code=400, detail="Missing session_id")

    # Verify session access using the legacy loader which checks org membership.
    # We import lazily to avoid circular imports at module level.
    from .._legacy_main import _legacy_load_session_scoped

    sess, _oid, _scope = _legacy_load_session_scoped(sid, request)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")

    return StreamingResponse(
        _sse_event_stream(sid, request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
