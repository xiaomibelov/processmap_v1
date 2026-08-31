"""Domain events for session lifecycle.

This module defines the events emitted by the assignment service and other
session-scoped flows.  Handlers are intentionally out of scope here — the event
bus is the single integration point for future consumers (notifications, audit,
webhooks).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Dict, List


@dataclass(frozen=True)
class SessionAssigneesChanged:
    """Emitted whenever the assignee list of a session is replaced."""

    session_id: str
    user_ids: List[str]
    actor_id: str

    def to_bus_event(self) -> Dict[str, Any]:
        return {
            "type": "session_assignees_changed",
            "data": {
                "session_id": self.session_id,
                "user_ids": list(self.user_ids),
                "actor_id": self.actor_id,
            },
        }
