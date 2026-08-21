"""
In-memory session event bus.

Provides publish/subscribe for session-scoped events (session_deleted,
session_updated, etc.) without Redis or external dependencies.

Single-process only — horizontal scale would require Redis pub/sub.
Each SSE subscriber gets an asyncio.Queue; when a session is deleted,
all queues for that session receive the event and the subscriber map
is cleaned up.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


class SessionEventBus:
    """In-process event bus keyed by session_id."""

    def __init__(self) -> None:
        # session_id -> list[asyncio.Queue]
        self._subscribers: dict[str, list[asyncio.Queue]] = {}

    def subscribe(self, session_id: str) -> asyncio.Queue:
        """Register a new queue for a session. Returns the queue."""
        q: asyncio.Queue = asyncio.Queue()
        self._subscribers.setdefault(session_id, []).append(q)
        return q

    def unsubscribe(self, session_id: str, queue: asyncio.Queue) -> None:
        """Remove a specific queue from a session's subscriber list."""
        queues = self._subscribers.get(session_id)
        if not queues:
            return
        try:
            queues.remove(queue)
        except ValueError:
            return
        if not queues:
            del self._subscribers[session_id]

    async def publish(self, session_id: str, event: dict[str, Any]) -> int:
        """
        Publish an event to all subscribers of a session.

        Returns the number of queues the event was put into.
        """
        queues = self._subscribers.get(session_id, [])
        if not queues:
            return 0

        # Snapshot the list so iteration is safe if a subscriber disconnects
        # during the loop.
        for q in list(queues):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning(
                    "session_event_bus queue full for %s, dropping event %s",
                    session_id,
                    event.get("type"),
                )
        return len(queues)

    def publish_nowait(self, session_id: str, event: dict[str, Any]) -> int:
        """
        Synchronous version of publish — uses put_nowait on each queue.

        Safe to call from sync FastAPI routes.  Returns the number of queues
        the event was put into.
        """
        queues = self._subscribers.get(session_id, [])
        if not queues:
            return 0
        for q in list(queues):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning(
                    "session_event_bus queue full for %s, dropping event %s",
                    session_id,
                    event.get("type"),
                )
        return len(queues)

    def subscriber_count(self, session_id: str) -> int:
        """Return the number of active subscribers for a session."""
        return len(self._subscribers.get(session_id, []))

    async def cleanup_session(self, session_id: str) -> None:
        """Remove all subscribers for a session (e.g. after deletion broadcast)."""
        queues = self._subscribers.pop(session_id, [])
        for q in queues:
            q.put_nowait({"type": "__closed__", "data": {"reason": "session_cleaned_up"}})

    @property
    def active_sessions(self) -> list[str]:
        return list(self._subscribers.keys())


# Singleton — same pattern as saveCoordinator on the frontend.
_session_event_bus: SessionEventBus | None = None


def get_session_event_bus() -> SessionEventBus:
    global _session_event_bus
    if _session_event_bus is None:
        _session_event_bus = SessionEventBus()
    return _session_event_bus


def reset_session_event_bus() -> None:
    """Reset the singleton (used in tests)."""
    global _session_event_bus
    _session_event_bus = None
