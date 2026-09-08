"""Publisher for background agent-analysis runs.

Strict pattern of save_services.analytics_aggregator.publisher:
fire-and-forget Celery enqueue with swallowed errors, so a save operation is
never blocked and never slowed down by analysis work.
"""

from __future__ import annotations

import logging
import time

from ..ai import llm_store
from ..redis_client import get_client
from .settings import FEATURE, WATCH_ZSET_KEY, debounce_sec, save_trigger_enabled
from .tasks import run_agent_analysis_task

logger = logging.getLogger(__name__)


def _feature_enabled() -> bool:
    try:
        flag = llm_store.get_feature_flag(FEATURE)
    except Exception:
        logger.exception("agent_analysis: failed to read feature flag %s", FEATURE)
        return False
    return bool(flag and flag.get("enabled"))


def _watch_add(session_id: str, org_id: str) -> None:
    """Best-effort: remember the session for the nightly refresh.

    Redis ZADD is O(log N); any failure is swallowed — the watch list is an
    optimisation for the beat task, not a correctness requirement.
    """
    try:
        client = get_client()
        if client is None:
            return
        member = f"{org_id}:{session_id}"
        client.zadd(WATCH_ZSET_KEY, {member: time.time()})
    except Exception:
        logger.warning("agent_analysis: watch add failed for %s/%s", org_id, session_id)


def publish_agent_analysis_scheduled(session_id: str, org_id: str, *, user_id: str = "") -> None:
    """Schedule a debounced background agent-analysis run for a saved session.

    Called from the session save path. Must stay ~free: one SQLite feature-flag
    read and one Celery enqueue; debounce is countdown-based, so Redis is
    touched only for the best-effort nightly-watch ZADD.
    """
    try:
        if not save_trigger_enabled():
            return
        if not _feature_enabled():
            return
        run_agent_analysis_task.apply_async(
            args=[str(session_id or ""), str(org_id or ""), str(user_id or "")],
            countdown=debounce_sec(),
        )
        _watch_add(str(session_id or ""), str(org_id or ""))
    except Exception:
        logger.exception(
            "failed to enqueue agent analysis for %s/%s", session_id, org_id
        )
