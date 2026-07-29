"""E8.2/E8.4/E8.5 — read-only API журнала аудита (GET /api/audit-log).

Фильтры: entity_type, entity_id, actor (user id или email), action,
date_from/date_to (unix ts или YYYY-MM-DD), пагинация limit/offset.
Аутентификация обязательна (401 без auth_user).

Иммутабельность (E8.4): роутер сознательно НЕ объявляет POST/PUT/DELETE —
любые попытки мутации получают 404/405 от FastAPI (negative test в
backend/tests/test_audit_log_e8.py).
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request

from ..audit import reader as audit_reader
from ..legacy.request_context import request_active_org_id

router = APIRouter(prefix="/api", tags=["audit-log"])

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _current_user(request: Request) -> Dict[str, Any]:
    user = getattr(request.state, "auth_user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def _parse_date(value: Optional[str], *, end_of_day: bool = False) -> int:
    """unix ts (int) или YYYY-MM-DD → unix ts; пусто → 0. Невалидно → 422."""
    src = str(value or "").strip()
    if not src:
        return 0
    if src.isdigit():
        return int(src)
    if _DATE_RE.match(src):
        try:
            dt = datetime.strptime(src, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Некорректная дата: {src}")
        ts = int(dt.timestamp())
        return ts + 86399 if end_of_day else ts
    raise HTTPException(status_code=422, detail=f"Некорректная дата: {src}")


def _resolve_actor_filter(actor: Optional[str]) -> Optional[str]:
    """actor = user id или email → user id. Незнакомый email → id, которого нет
    (пустой результат, а не ошибка)."""
    src = str(actor or "").strip()
    if not src:
        return None
    if "@" in src:
        found = audit_reader.find_user_id_by_email(src)
        return found or f"__unknown_email__:{src}"
    return src


@router.get("/audit-log")
def list_audit_log_endpoint(
    request: Request,
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),
    actor: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> Dict[str, Any]:
    _current_user(request)
    org_id = request_active_org_id(request)
    events = audit_reader.list_events(
        org_id,
        entity_type=(entity_type or "").strip() or None,
        entity_id=(entity_id or "").strip() or None,
        actor_user_id=_resolve_actor_filter(actor),
        action=(action or "").strip() or None,
        ts_from=_parse_date(date_from),
        ts_to=_parse_date(date_to, end_of_day=True),
        limit=limit,
        offset=offset,
    )
    items: List[Dict[str, Any]] = audit_reader.resolve_actors(events)
    return {"items": items, "limit": limit, "offset": offset, "count": len(items)}
