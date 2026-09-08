"""Celery tasks for the background agent-analysis pipeline."""

from __future__ import annotations

import logging

from ..celery_app import app
from ..ai import llm_store
from ..redis_client import get_client
from .processor import run_agent_analysis
from .settings import (
    FEATURE,
    WATCH_ZSET_KEY,
    beat_limit_sessions,
    beat_trigger_enabled,
)

logger = logging.getLogger(__name__)


@app.task(bind=True, max_retries=1, default_retry_delay=30, name="processmap.agent_analysis.run_agent_analysis_task")
def run_agent_analysis_task(self, session_id: str, org_id: str, user_id: str = ""):
    """Run one agent-analysis pass (see processor docstring for contracts)."""
    try:
        return run_agent_analysis(session_id, org_id, user_id=user_id)
    except Exception as exc:
        logger.exception("run_agent_analysis_task failed for %s/%s", session_id, org_id)
        try:
            from ..error_events.background import capture_backend_async_exception

            capture_backend_async_exception(
                exc,
                task_name="agent_analysis_worker",
                execution_scope="worker",
                user_id=str(user_id or "").strip() or None,
                org_id=str(org_id or "").strip() or None,
                session_id=str(session_id or "").strip() or None,
                correlation_id=str(getattr(self.request, "id", "") or "") or None,
                context_json={"session_id": session_id, "org_id": org_id},
            )
        except Exception:
            logger.exception("agent_analysis: failed to capture worker exception telemetry")
        raise self.retry(exc=exc, countdown=30)


@app.task(bind=True, max_retries=1, default_retry_delay=60, name="processmap.agent_analysis.nightly_refresh_task")
def nightly_refresh_task(self):
    """Nightly drain of the watch list: re-analyse up to N recently saved sessions.

    Bounded by beat_limit_sessions; no-op without Redis or when the feature /
    beat trigger is disabled. Processing is delegated to the standard task so
    freshness skipping still applies.
    """
    try:
        if not beat_trigger_enabled():
            return {"skipped": "trigger"}
        try:
            flag = llm_store.get_feature_flag(FEATURE)
        except Exception:
            logger.exception("nightly_refresh_task: feature flag read failed")
            return {"skipped": "feature_flag_error"}
        if not (flag and flag.get("enabled")):
            return {"skipped": "feature"}
        client = get_client()
        if client is None:
            return {"skipped": "redis_unavailable"}
        members = client.zrange(WATCH_ZSET_KEY, 0, beat_limit_sessions() - 1) or []
        scheduled = 0
        for raw in members:
            member = str(raw or "")
            if ":" not in member:
                client.zrem(WATCH_ZSET_KEY, member)
                continue
            org_id, session_id = member.split(":", 1)
            if not session_id:
                client.zrem(WATCH_ZSET_KEY, member)
                continue
            try:
                run_agent_analysis_task.apply_async(args=[session_id, org_id, ""], countdown=0)
                scheduled += 1
            except Exception:
                logger.exception("nightly_refresh_task: enqueue failed for %s", member)
            finally:
                client.zrem(WATCH_ZSET_KEY, member)
        return {"scheduled": scheduled}
    except Exception as exc:
        logger.exception("nightly_refresh_task failed")
        raise self.retry(exc=exc, countdown=60)
