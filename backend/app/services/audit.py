from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import Request

from ..legacy.request_context import (
    request_active_org_id as _request_active_org_id,
    request_user_meta as _request_user_meta,
)
from ..storage import append_audit_log


def _audit_log_safe(
    request: Optional[Request],
    *,
    org_id: str,
    action: str,
    entity_type: str,
    entity_id: str,
    status: str = "ok",
    project_id: Optional[str] = None,
    session_id: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> None:
    uid, _ = _request_user_meta(request)
    if not uid:
        return
    try:
        append_audit_log(
            actor_user_id=uid,
            org_id=str(org_id or "").strip() or _request_active_org_id(request),
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id or "").strip() or "-",
            status=status,
            project_id=project_id,
            session_id=session_id,
            meta=meta if isinstance(meta, dict) else {},
        )
    except Exception as exc:
        print(f"[AUDIT] write_failed action={action} entity={entity_type}:{entity_id} err={exc}")
