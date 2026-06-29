"""Publisher for analytics refresh events."""

from __future__ import annotations

import logging

from .tasks import refresh_session_analytics_task

logger = logging.getLogger(__name__)


def publish_session_saved(session_id: str, org_id: str) -> None:
    """Enqueue an asynchronous analytics refresh for a saved session.

    Swallows enqueue errors so that a save operation is not blocked when the
    Celery broker/result backend is temporarily unavailable.
    """
    try:
        refresh_session_analytics_task.delay(session_id, org_id)
    except Exception:
        logger.exception("failed to enqueue analytics refresh for %s/%s", session_id, org_id)
