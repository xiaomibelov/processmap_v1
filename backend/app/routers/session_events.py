from __future__ import annotations

import asyncio
import contextlib
import json
import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from .. import redis_client
from ..services.session_event_bus import SESSION_EVENTS_CHANNEL, get_session_event_bus

logger = logging.getLogger(__name__)

router = APIRouter()

SSE_KEEPALIVE_INTERVAL = 25.0  # seconds — below typical LB/proxy 60s idle timeout

_REDIS_RELAY_POLL_TIMEOUT = 1.0  # seconds — get_message timeout in worker thread


async def _redis_relay_task(session_id: str, queue: "asyncio.Queue") -> None:
    """Fan-in из redis pub/sub (API.md §2): релеим сообщения своей сессии
    в локальную очередь SSE-подписчика. Redis down → таск выходит сразу
    (in-process bus продолжает работать — текущее поведение).
    """
    pubsub = await asyncio.to_thread(redis_client.subscribe_channel, SESSION_EVENTS_CHANNEL)
    if pubsub is None:
        return
    try:
        while True:
            message = await asyncio.to_thread(
                pubsub.get_message, timeout=_REDIS_RELAY_POLL_TIMEOUT
            )
            if not message:
                continue
            try:
                payload = json.loads(message.get("data") or "")
            except Exception:
                continue
            if not isinstance(payload, dict):
                continue
            if str(payload.get("session_id") or "") != session_id:
                continue
            event = payload.get("event")
            if not isinstance(event, dict):
                continue
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning(
                    "session_events redis relay queue full for %s, dropping event %s",
                    session_id,
                    event.get("type"),
                )
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.warning("session_events redis relay failed for %s: %s", session_id, exc)
    finally:
        with contextlib.suppress(Exception):
            await asyncio.to_thread(pubsub.close)


async def _sse_event_stream(session_id: str, request: Request) -> None:
    """
    Yield SSE-formatted events for a session.

    Reads from an asyncio.Queue subscribed to the session event bus.
    Sends periodic heartbeat comments to keep the connection alive.
    """
    bus = get_session_event_bus()
    queue = bus.subscribe(session_id)
    redis_relay = asyncio.create_task(_redis_relay_task(session_id, queue))
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
        redis_relay.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await redis_relay
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
