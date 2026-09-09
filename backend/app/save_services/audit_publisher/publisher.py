"""Enqueue asynchronous audit_log writes (hot save-path only).

Swallows enqueue errors so that a save operation is not blocked when the
Celery broker is temporarily unavailable (паритет publish_session_saved).
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from .tasks import append_audit_log_task

logger = logging.getLogger(__name__)


def publish_audit_log(
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
) -> None:
    try:
        append_audit_log_task.delay(
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
    except Exception:
        logger.exception(
            "failed to enqueue audit_log action=%s entity=%s:%s",
            action,
            entity_type,
            entity_id,
        )
