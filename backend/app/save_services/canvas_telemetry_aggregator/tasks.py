"""Celery-задачи витрины телеметрии канваса (feature/canvas-telemetry-feed)."""

from __future__ import annotations

import logging
import random

from ...celery_app import app
from ...domains.storage.canvas_telemetry.repository import cleanup_raw_events
from .aggregate import aggregate_pending_sessions

logger = logging.getLogger(__name__)


@app.task(bind=True, max_retries=1, default_retry_delay=60, name="processmap.canvas_telemetry.aggregate_task")
def aggregate_task(self):
    """raw → canvas_event_read каждые 5 мин (beat-расписание в celery_app)."""
    try:
        return aggregate_pending_sessions()
    except Exception as exc:
        logger.exception("canvas_telemetry.aggregate_task failed")
        raise self.retry(exc=exc, countdown=60)


@app.task(bind=True, max_retries=1, default_retry_delay=300, name="processmap.canvas_telemetry.cleanup_task")
def cleanup_task(self, retention_days: int = 14):
    """Retention canvas_event_raw (TTL 14 дней)."""
    try:
        return {"deleted": cleanup_raw_events(retention_days=retention_days)}
    except Exception as exc:
        logger.exception("canvas_telemetry.cleanup_task failed")
        raise self.retry(exc=exc, countdown=300)


def maybe_cleanup_raw_events_lazy() -> int:
    """Lazy-fallback retention (~1/1000), если celery cleanup недоступен."""
    if random.randint(1, 1000) != 1:
        return 0
    try:
        return cleanup_raw_events()
    except Exception:
        logger.exception("lazy cleanup_raw_events failed")
        return 0
