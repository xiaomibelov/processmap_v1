"""Celery task for asynchronous audit_log writes."""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from ...celery_app import app
from ...storage import append_audit_log

logger = logging.getLogger(__name__)


# Каноническое имя: не зависит от import-контекста (app.* vs backend.app.*).
@app.task(bind=True, max_retries=1, default_retry_delay=5, name="processmap.audit.append_audit_log_task")
def append_audit_log_task(
    self,
    *,
    actor_user_id: str,
    org_id: str,
    action: str,
    entity_type: str,
    entity_id: str,
    status: str = "ok",
    project_id: Optional[str] = None,
    session_id: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
):
    """Write one audit_log row; retry once on failure."""
    try:
        return append_audit_log(
            actor_user_id=actor_user_id,
            org_id=org_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            status=status,
            project_id=project_id,
            session_id=session_id,
            meta=meta,
        )
    except Exception as exc:
        logger.exception("append_audit_log_task failed action=%s entity=%s:%s", action, entity_type, entity_id)
        raise self.retry(exc=exc, countdown=5)
