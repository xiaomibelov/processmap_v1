"""Celery tasks for analytics aggregation."""

from __future__ import annotations

import logging

from ...analytics_read_model import refresh_analytics_for_session
from ...celery_app import app

logger = logging.getLogger(__name__)


@app.task(bind=True, max_retries=1, default_retry_delay=5)
def refresh_session_analytics_task(self, session_id: str, org_id: str):
    """Recompute session, project, and workspace analytics snapshots."""
    try:
        return refresh_analytics_for_session(session_id, org_id)
    except Exception as exc:
        logger.exception("refresh_session_analytics_task failed for %s/%s", session_id, org_id)
        raise self.retry(exc=exc, countdown=5)
