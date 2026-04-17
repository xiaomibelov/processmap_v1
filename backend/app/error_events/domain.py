from __future__ import annotations

import logging
from typing import Any, Dict, Mapping, Optional

from .schema import ErrorEventStored, build_backend_domain_invariant_event
from ..storage import append_error_event

logger = logging.getLogger(__name__)


def capture_backend_domain_invariant_violation(
    *,
    domain: str,
    invariant_name: str,
    message: str,
    severity: str = "error",
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
        stored: ErrorEventStored = build_backend_domain_invariant_event(
            domain=domain,
            invariant_name=invariant_name,
            message=message,
            severity=severity,
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
            "Backend domain invariant telemetry append failed: domain=%s invariant=%s type=%s",
            str(domain or ""),
            str(invariant_name or ""),
            type(telemetry_exc).__name__,
        )
        return None


__all__ = ["capture_backend_domain_invariant_violation"]
