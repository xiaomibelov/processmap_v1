from __future__ import annotations

import logging
from typing import Any, Dict, Mapping, Optional

from .schema import ErrorEventStored, build_backend_async_exception_event
from ..storage import append_error_event

logger = logging.getLogger(__name__)


def capture_backend_async_exception(
    exc: Exception,
    *,
    task_name: str,
    execution_scope: str = "background",
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    session_id: Optional[str] = None,
    project_id: Optional[str] = None,
    route: Optional[str] = None,
    request_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
    context_json: Optional[Mapping[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    try:
        stored: ErrorEventStored = build_backend_async_exception_event(
            exc,
            task_name=task_name,
            execution_scope=execution_scope,
            user_id=user_id,
            org_id=org_id,
            session_id=session_id,
            project_id=project_id,
            route=route,
            request_id=request_id,
            correlation_id=correlation_id,
            context_json=context_json,
        )
        return append_error_event(**stored.model_dump())
    except Exception as telemetry_exc:
        logger.error(
            "Background exception telemetry append failed: task=%s scope=%s type=%s",
            str(task_name or ""),
            str(execution_scope or ""),
            type(telemetry_exc).__name__,
        )
        return None


__all__ = ["capture_backend_async_exception"]
