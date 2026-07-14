from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Tuple

from ..db import adapt_sql, get_conn, row_to_dict
from ..shared.dto.system_event_dto import SystemEventIn, SystemEventOut, SystemEventPatchIn


def _now_ts() -> int:
    from ..shared.dto.system_event_dto import _now_ts as _nt

    return _nt()


def _generate_id() -> str:
    from ..shared.dto.system_event_dto import _generate_system_event_id

    return _generate_system_event_id()


def _normalize_nullable_id(value: Any) -> Optional[str]:
    from ..shared.dto.error_event_helpers import _normalize_nullable_id as _n

    return _n(value)


def _row_to_out(row: Optional[Any]) -> Optional[SystemEventOut]:
    if not row:
        return None
    data = row_to_dict(row)
    if isinstance(data.get("payload"), str):
        try:
            data["payload"] = json.loads(data["payload"])
        except Exception:
            data["payload"] = {}
    return SystemEventOut(**data)


def append_system_event(
    dto: SystemEventIn,
    *,
    trusted_user_id: Optional[str] = None,
    trusted_org_id: Optional[str] = None,
) -> SystemEventOut:
    record_id = _generate_id()
    now = _now_ts()
    payload = json.dumps(dto.payload if isinstance(dto.payload, dict) else {}, ensure_ascii=False)
    sql = """
        INSERT INTO system_events (
            id, schema_version, created_at, event_type, severity, message, source,
            org_id, user_id, payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    params = [
        record_id,
        dto.schema_version,
        now,
        dto.event_type,
        dto.severity,
        dto.message,
        dto.source,
        _normalize_nullable_id(dto.org_id) or _normalize_nullable_id(trusted_org_id),
        _normalize_nullable_id(dto.user_id) or _normalize_nullable_id(trusted_user_id),
        payload,
    ]
    with get_conn() as conn:
        conn.execute(adapt_sql(sql), params)
    return get_system_event(record_id)  # type: ignore[return-value]


def get_system_event(event_id: str) -> Optional[SystemEventOut]:
    eid = str(event_id or "").strip()
    if not eid:
        return None
    sql = "SELECT * FROM system_events WHERE id = ? LIMIT 1"
    with get_conn() as conn:
        row = conn.execute(adapt_sql(sql), [eid]).fetchone()
    return _row_to_out(row)


def _build_where(filters: Dict[str, Any]) -> Tuple[str, List[Any]]:
    conditions = []
    params: List[Any] = []
    for key in ("org_id", "user_id", "event_type", "source", "severity"):
        value = filters.get(key)
        if value is not None:
            conditions.append(f"{key} = ?")
            params.append(value)
    created_from = filters.get("created_from")
    if created_from is not None:
        conditions.append("created_at >= ?")
        params.append(int(created_from))
    created_to = filters.get("created_to")
    if created_to is not None:
        conditions.append("created_at <= ?")
        params.append(int(created_to))
    where = " AND ".join(conditions) if conditions else "1=1"
    return where, params


def list_system_events(
    *,
    org_id: Optional[str] = None,
    user_id: Optional[str] = None,
    event_type: Optional[str] = None,
    source: Optional[str] = None,
    severity: Optional[str] = None,
    created_from: Optional[int] = None,
    created_to: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
    order: str = "desc",
) -> List[SystemEventOut]:
    filters = {
        "org_id": _normalize_nullable_id(org_id),
        "user_id": _normalize_nullable_id(user_id),
        "event_type": _normalize_nullable_id(event_type),
        "source": _normalize_nullable_id(source),
        "severity": _normalize_nullable_id(severity),
        "created_from": created_from,
        "created_to": created_to,
    }
    where, params = _build_where(filters)
    direction = "DESC" if str(order).strip().lower() == "desc" else "ASC"
    sql = f"SELECT * FROM system_events WHERE {where} ORDER BY created_at {direction} LIMIT ? OFFSET ?"
    params = params + [int(limit), int(offset)]
    with get_conn() as conn:
        rows = conn.execute(adapt_sql(sql), params).fetchall()
    return [_row_to_out(row) for row in rows if row is not None]


def count_system_events(
    *,
    org_id: Optional[str] = None,
    user_id: Optional[str] = None,
    event_type: Optional[str] = None,
    source: Optional[str] = None,
    severity: Optional[str] = None,
    created_from: Optional[int] = None,
    created_to: Optional[int] = None,
) -> int:
    filters = {
        "org_id": _normalize_nullable_id(org_id),
        "user_id": _normalize_nullable_id(user_id),
        "event_type": _normalize_nullable_id(event_type),
        "source": _normalize_nullable_id(source),
        "severity": _normalize_nullable_id(severity),
        "created_from": created_from,
        "created_to": created_to,
    }
    where, params = _build_where(filters)
    sql = f"SELECT COUNT(*) FROM system_events WHERE {where}"
    with get_conn() as conn:
        row = conn.execute(adapt_sql(sql), params).fetchone()
    if not row:
        return 0
    return int(row_to_dict(row).get("count", 0) or row[0])


def update_system_event(event_id: str, patch: SystemEventPatchIn) -> Optional[SystemEventOut]:
    eid = str(event_id or "").strip()
    if not eid:
        return None
    updates: Dict[str, Any] = {}
    if patch.severity is not None:
        updates["severity"] = patch.severity
    if patch.message is not None:
        updates["message"] = patch.message
    if patch.payload is not None:
        updates["payload"] = json.dumps(patch.payload if isinstance(patch.payload, dict) else {}, ensure_ascii=False)
    if not updates:
        return get_system_event(eid)

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    params = list(updates.values()) + [eid]
    sql = f"UPDATE system_events SET {set_clause} WHERE id = ?"
    with get_conn() as conn:
        conn.execute(adapt_sql(sql), params)
    return get_system_event(eid)


def delete_system_event(event_id: str) -> bool:
    eid = str(event_id or "").strip()
    if not eid:
        return False
    sql = "DELETE FROM system_events WHERE id = ?"
    with get_conn() as conn:
        cur = conn.execute(adapt_sql(sql), [eid])
        return int(getattr(cur, "rowcount", 0) or 0) > 0
