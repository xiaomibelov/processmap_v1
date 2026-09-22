"""Ingest ленты телеметрии канваса (feature/canvas-telemetry-feed).

POST /api/telemetry/canvas-events — append-only batch insert в canvas_event_raw.
ЛОКАЛЬНАЯ запись в монолит: без проксирования в notifications-сервис, без
fallback-веток (single writer). Идемпотентность — UNIQUE (session_id, event_id)
+ ON CONFLICT DO NOTHING.
"""

from __future__ import annotations

import threading
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, field_validator

from ..domains.storage.canvas_telemetry.repository import (
    append_canvas_events,
    sanitize_event_payload,
)

router = APIRouter()

EVENT_KINDS = {"command", "op", "ack", "error", "save_status", "pageerror"}
MAX_EVENTS_PER_BATCH = 100
MAX_BODY_BYTES = 64 * 1024

_RATE_LIMIT_PER_MINUTE = 600
_RATE_LIMITER_LOCK = threading.Lock()
_RATE_LIMITER_WINDOWS: Dict[str, List[float]] = {}


def get_rate_limit_per_minute() -> int:
    return _RATE_LIMIT_PER_MINUTE


def set_rate_limit_per_minute(value: int) -> None:
    global _RATE_LIMIT_PER_MINUTE
    _RATE_LIMIT_PER_MINUTE = max(1, int(value))


def _rate_limit_check(session_id: str, count: int = 1) -> bool:
    """Sliding window per session (считаем события, не батчи). True — проходит."""
    limit = _RATE_LIMIT_PER_MINUTE
    now = time.monotonic()
    cutoff = now - 60.0
    with _RATE_LIMITER_LOCK:
        window = [t for t in _RATE_LIMITER_WINDOWS.get(session_id, []) if t >= cutoff]
        if len(window) + count > limit:
            _RATE_LIMITER_WINDOWS[session_id] = window
            return False
        window.extend([now] * max(1, int(count)))
        _RATE_LIMITER_WINDOWS[session_id] = window
        if len(_RATE_LIMITER_WINDOWS) > 10_000:
            for key in [k for k, v in _RATE_LIMITER_WINDOWS.items() if not v or v[-1] < cutoff]:
                _RATE_LIMITER_WINDOWS.pop(key, None)
    return True


def _reset_rate_limiter_for_tests() -> None:
    with _RATE_LIMITER_LOCK:
        _RATE_LIMITER_WINDOWS.clear()


class CanvasEventIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    event_id: str
    seq: int = 0
    ts: int = 0
    kind: str
    session_id: str
    project_id: Optional[str] = None
    user_id: Optional[str] = None
    org_id: Optional[str] = None
    tab_id: Optional[str] = None
    runtime_id: Optional[str] = None
    command: Optional[Dict[str, Any]] = None
    op: Optional[Dict[str, Any]] = None
    http: Optional[Dict[str, Any]] = None
    error: Optional[Dict[str, Any]] = None
    versions: Optional[Dict[str, Any]] = None
    ux: Optional[Dict[str, Any]] = None
    meta: Optional[Dict[str, Any]] = None

    @field_validator("event_id", "session_id")
    @classmethod
    def _required_text(cls, value: str) -> str:
        text = str(value or "").strip()
        if not text:
            raise ValueError("must not be empty")
        return text[:128]

    @field_validator("kind")
    @classmethod
    def _known_kind(cls, value: str) -> str:
        text = str(value or "").strip().lower()
        if text not in EVENT_KINDS:
            raise ValueError(f"kind must be one of {sorted(EVENT_KINDS)}")
        return text


class CanvasEventBatchIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    events: List[CanvasEventIn]


@router.post(
    "/api/telemetry/canvas-events",
    status_code=status.HTTP_201_CREATED,
    responses={
        401: {"description": "missing or invalid bearer token"},
        422: {"description": "batch validation failed (count/size/kind)"},
        429: {"description": "canvas events rate limit exceeded for session"},
    },
)
def ingest_canvas_events(payload: CanvasEventBatchIn, request: Request, response: Response) -> Any:
    events = list(payload.events or [])
    if not events or len(events) > MAX_EVENTS_PER_BATCH:
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_BATCH", "message": f"events count must be 1..{MAX_EVENTS_PER_BATCH}"},
        )

    session_id = str(events[0].session_id or "").strip()
    if any(str(ev.session_id or "").strip() != session_id for ev in events):
        raise HTTPException(
            status_code=422,
            detail={"code": "MIXED_SESSIONS", "message": "all events in a batch must share one session_id"},
        )

    body_size = len(str(payload.model_dump_json()).encode("utf-8"))
    if body_size > MAX_BODY_BYTES:
        raise HTTPException(
            status_code=422,
            detail={"code": "PAYLOAD_TOO_LARGE", "message": f"batch body must be <= {MAX_BODY_BYTES} bytes"},
        )

    if not _rate_limit_check(session_id, count=len(events)):
        raise HTTPException(
            status_code=429,
            detail={"code": "too_many_requests", "message": "canvas events rate limit exceeded for session"},
        )

    trusted_user = getattr(request.state, "auth_user", {}) or {}
    trusted_user_id = str(trusted_user.get("id") or "").strip() or None
    active_org_id = str(getattr(request.state, "active_org_id", "") or "").strip() or None

    rows = []
    for ev in events:
        raw = ev.model_dump(mode="json")
        payload_json = {k: v for k, v in raw.items() if k not in ("event_id", "seq", "ts", "kind", "session_id", "project_id", "user_id", "org_id", "tab_id", "runtime_id")}
        rows.append(
            {
                "session_id": ev.session_id,
                "event_id": str(ev.event_id)[:64],
                "seq": int(ev.seq or 0),
                "ts": int(ev.ts or 0),
                "kind": ev.kind,
                "project_id": ev.project_id or None,
                # доверенные значения сервера перекрывают advisory-поля клиента
                "user_id": trusted_user_id,
                "org_id": active_org_id,
                "tab_id": ev.tab_id or None,
                "runtime_id": ev.runtime_id or None,
                "payload": sanitize_event_payload(payload_json),
            }
        )

    accepted = append_canvas_events(rows)
    return {"ok": True, "accepted": accepted}


# ---------------------------------------------------------------------------
# Admin read (витрина canvas_event_read; UI читает ТОЛЬКО её)
# ---------------------------------------------------------------------------


def _group_item(group: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": group.get("id"),
        "session_id": group.get("session_id"),
        "user_id": group.get("user_id"),
        "project_id": group.get("project_id"),
        "org_id": group.get("org_id"),
        "error_class": group.get("error_class"),
        "error_code": group.get("error_code"),
        "op_type": group.get("op_type"),
        "op_id": group.get("op_id"),
        "message": group.get("message"),
        "first_seen": group.get("first_seen"),
        "last_seen": group.get("last_seen"),
        "count": group.get("count"),
        "converged": group.get("converged"),
        "updated_at": group.get("updated_at"),
    }


@router.get(
    "/api/admin/canvas-telemetry/errors",
    responses={
        401: {"description": "missing or invalid bearer token"},
        403: {"description": "insufficient permissions (admin or telemetry role required)"},
    },
)
def admin_canvas_telemetry_errors(
    request: Request,
    session_id: str = "",
    user_id: str = "",
    error_class: str = "",
    error_code: str = "",
    converged: int = -1,
    last_seen_from: int = 0,
    last_seen_to: int = 0,
    limit: int = 50,
    offset: int = 0,
    order: str = "desc",
) -> Any:
    from .admin import _telemetry_read_context
    from ..domains.storage.canvas_telemetry.repository import (
        count_error_groups,
        list_error_groups,
    )

    _uid, is_admin, active_org_id, _role, err = _telemetry_read_context(request)
    if err is not None:
        return err
    # platform admin без явного org-фильтра видит все организации;
    # не-admin — только свою активную org.
    effective_org = str(active_org_id or "") if not is_admin else ""
    if not effective_org and not is_admin:
        return {"items": [], "page": {"limit": limit, "offset": offset, "total": 0}}

    filters = {
        "org_id": effective_org or None,
        "session_id": session_id or None,
        "user_id": user_id or None,
        "error_class": error_class or None,
        "error_code": error_code or None,
        "converged": converged if converged in (0, 1) else None,
        "last_seen_from": int(last_seen_from or 0),
        "last_seen_to": int(last_seen_to or 0),
    }
    effective_limit = max(1, min(int(limit or 50), 100))
    effective_offset = max(0, int(offset or 0))
    items = list_error_groups(
        **filters,
        limit=effective_limit,
        offset=effective_offset,
        order="asc" if str(order).lower() == "asc" else "desc",
    )
    total = count_error_groups(**filters)
    return {
        "items": [_group_item(g) for g in items],
        "page": {"limit": effective_limit, "offset": effective_offset, "total": total},
    }


@router.get(
    "/api/admin/canvas-telemetry/errors/{group_id}/context",
    responses={
        401: {"description": "missing or invalid bearer token"},
        403: {"description": "insufficient permissions (admin or telemetry role required)"},
        404: {"description": "Group not found or belongs to another org"},
    },
)
def admin_canvas_telemetry_context(group_id: str, request: Request) -> Any:
    import json as _json

    from fastapi.responses import JSONResponse

    from .admin import _telemetry_read_context
    from ..domains.storage.canvas_telemetry.repository import get_error_group

    _uid, is_admin, active_org_id, _role, err = _telemetry_read_context(request)
    if err is not None:
        return err
    group = get_error_group(group_id)
    if not group:
        return JSONResponse(status_code=404, content={"detail": "group not found"})
    group_org = str(group.get("org_id") or "")
    active_org = str(active_org_id or "")
    if active_org and group_org and group_org != active_org and not is_admin:
        return JSONResponse(status_code=404, content={"detail": "group not found"})

    try:
        timeline = _json.loads(group.get("context_json") or "[]")
    except Exception:
        timeline = []
    session_id = str(group.get("session_id") or "")
    project_id = str(group.get("project_id") or "")
    session_url = f"/?session={session_id}" + (f"&project={project_id}" if project_id else "")
    return {"item": _group_item(group), "timeline": timeline, "session_url": session_url}
