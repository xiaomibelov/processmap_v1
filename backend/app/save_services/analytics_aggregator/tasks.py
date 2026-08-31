"""Celery tasks for analytics aggregation."""

from __future__ import annotations

import logging

from ...analytics_read_model import (
    refresh_analytics_for_session,
    refresh_workspace_analytics_snapshot,
)
from ...celery_app import app
from ...storage import _connect

logger = logging.getLogger(__name__)


# Канонические имена: не зависят от import-контекста (app.* vs backend.app.*).
@app.task(bind=True, max_retries=1, default_retry_delay=5, name="processmap.analytics.refresh_session_analytics_task")
def refresh_session_analytics_task(self, session_id: str, org_id: str):
    """Recompute session, project, and workspace analytics snapshots."""
    try:
        return refresh_analytics_for_session(session_id, org_id)
    except Exception as exc:
        logger.exception("refresh_session_analytics_task failed for %s/%s", session_id, org_id)
        raise self.retry(exc=exc, countdown=5)


@app.task(bind=True, max_retries=1, default_retry_delay=60, name="processmap.analytics.refresh_all_workspaces_analytics_task")
def refresh_all_workspaces_analytics_task(self):
    """Nightly refresh of analytics snapshots for all active workspaces.

    Iterates over workspace snapshots that have been computed at least once and
    refreshes the workspace aggregate. Session-level snapshots are recomputed
    when a dashboard is requested and missing; this task keeps the workspace
    rollups up to date for the morning overview.
    """
    try:
        with _connect() as con:
            rows = con.execute(
                "SELECT DISTINCT workspace_id, org_id FROM analytics_workspace_snapshots"
            ).fetchall()
        for row in rows:
            workspace_id = row["workspace_id"]
            org_id = row["org_id"]
            try:
                refresh_workspace_analytics_snapshot(workspace_id, org_id)
            except Exception:
                logger.exception(
                    "refresh_all_workspaces_analytics_task: failed workspace %s/%s",
                    workspace_id,
                    org_id,
                )
        return {"refreshed": len(rows)}
    except Exception as exc:
        logger.exception("refresh_all_workspaces_analytics_task failed")
        raise self.retry(exc=exc, countdown=60)
