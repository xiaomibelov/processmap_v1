from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Tuple

from ..db import adapt_sql, get_conn, row_to_dict
from ..shared.dto.notification_dto import NotificationIn, NotificationOut, NotificationPatchIn


def _now_ts() -> int:
    from ..shared.dto.notification_dto import _now_ts as _nt

    return _nt()


def _generate_id() -> str:
    from ..shared.dto.notification_dto import _generate_notification_id

    return _generate_notification_id()


def _normalize_nullable_id(value: Any) -> Optional[str]:
    from ..shared.dto.error_event_helpers import _normalize_nullable_id as _n

    return _n(value)


def _row_to_out(row: Optional[Any]) -> Optional[NotificationOut]:
    if not row:
        return None
    data = row_to_dict(row)
    if isinstance(data.get("payload"), str):
        try:
            data["payload"] = json.loads(data["payload"])
        except Exception:
            data["payload"] = {}
    return NotificationOut(**data)


def append_notification(
    dto: NotificationIn,
    *,
    trusted_user_id: Optional[str] = None,
    trusted_org_id: Optional[str] = None,
) -> NotificationOut:
    record_id = _generate_id()
    now = _now_ts()
    payload = json.dumps(dto.payload if isinstance(dto.payload, dict) else {}, ensure_ascii=False)
    sql = """
        INSERT INTO notifications (
            id, schema_version, created_at, type, title, message, user_id, org_id,
            priority, link, read_at, dismissed_at, payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    params = [
        record_id,
        dto.schema_version,
        now,
        dto.type,
        dto.title,
        dto.message,
        _normalize_nullable_id(dto.user_id) or _normalize_nullable_id(trusted_user_id),
        _normalize_nullable_id(dto.org_id) or _normalize_nullable_id(trusted_org_id),
        dto.priority,
        _normalize_nullable_id(dto.link),
        None,
        None,
        payload,
    ]
    with get_conn() as conn:
        conn.execute(adapt_sql(sql), params)
    return get_notification(record_id)


def get_notification(notification_id: str) -> Optional[NotificationOut]:
    eid = str(notification_id or "").strip()
    if not eid:
        return None
    sql = "SELECT * FROM notifications WHERE id = ? LIMIT 1"
    with get_conn() as conn:
        row = conn.execute(adapt_sql(sql), [eid]).fetchone()
    return _row_to_out(row)


def _build_where(filters: Dict[str, Any]) -> Tuple[str, List[Any]]:
    conditions = []
    params: List[Any] = []
    for key in ("user_id", "org_id", "type", "priority"):
        value = filters.get(key)
        if value is not None:
            conditions.append(f"{key} = ?")
            params.append(value)
    if filters.get("is_read") is True:
        conditions.append("read_at IS NOT NULL")
    elif filters.get("is_read") is False:
        conditions.append("read_at IS NULL")
    if filters.get("is_dismissed") is True:
        conditions.append("dismissed_at IS NOT NULL")
    elif filters.get("is_dismissed") is False:
        conditions.append("dismissed_at IS NULL")
    where = " AND ".join(conditions) if conditions else "1=1"
    return where, params


def list_notifications(
    *,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    type: Optional[str] = None,
    priority: Optional[str] = None,
    is_read: Optional[bool] = None,
    is_dismissed: Optional[bool] = None,
    limit: int = 50,
    offset: int = 0,
    order: str = "desc",
) -> List[NotificationOut]:
    filters = {
        "user_id": _normalize_nullable_id(user_id),
        "org_id": _normalize_nullable_id(org_id),
        "type": _normalize_nullable_id(type),
        "priority": _normalize_nullable_id(priority),
        "is_read": is_read,
        "is_dismissed": is_dismissed,
    }
    where, params = _build_where(filters)
    direction = "DESC" if str(order).strip().lower() == "desc" else "ASC"
    sql = f"SELECT * FROM notifications WHERE {where} ORDER BY created_at {direction} LIMIT ? OFFSET ?"
    params = params + [int(limit), int(offset)]
    with get_conn() as conn:
        rows = conn.execute(adapt_sql(sql), params).fetchall()
    return [_row_to_out(row) for row in rows if row is not None]


def count_notifications(
    *,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    type: Optional[str] = None,
    priority: Optional[str] = None,
    is_read: Optional[bool] = None,
    is_dismissed: Optional[bool] = None,
) -> int:
    filters = {
        "user_id": _normalize_nullable_id(user_id),
        "org_id": _normalize_nullable_id(org_id),
        "type": _normalize_nullable_id(type),
        "priority": _normalize_nullable_id(priority),
        "is_read": is_read,
        "is_dismissed": is_dismissed,
    }
    where, params = _build_where(filters)
    sql = f"SELECT COUNT(*) FROM notifications WHERE {where}"
    with get_conn() as conn:
        row = conn.execute(adapt_sql(sql), params).fetchone()
    if not row:
        return 0
    return int(row_to_dict(row).get("count", 0) or row[0])


def update_notification(notification_id: str, patch: NotificationPatchIn) -> Optional[NotificationOut]:
    eid = str(notification_id or "").strip()
    if not eid:
        return None
    updates: Dict[str, Any] = {}
    if patch.title is not None:
        updates["title"] = patch.title
    if patch.message is not None:
        updates["message"] = patch.message
    if patch.priority is not None:
        updates["priority"] = patch.priority
    if patch.link is not None:
        updates["link"] = _normalize_nullable_id(patch.link)
    if patch.read_at is not None:
        updates["read_at"] = int(patch.read_at)
    if patch.dismissed_at is not None:
        updates["dismissed_at"] = int(patch.dismissed_at)
    if patch.payload is not None:
        updates["payload"] = json.dumps(patch.payload if isinstance(patch.payload, dict) else {}, ensure_ascii=False)
    if not updates:
        return get_notification(eid)

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    params = list(updates.values()) + [eid]
    sql = f"UPDATE notifications SET {set_clause} WHERE id = ?"
    with get_conn() as conn:
        conn.execute(adapt_sql(sql), params)
    return get_notification(eid)


def delete_notification(notification_id: str) -> bool:
    eid = str(notification_id or "").strip()
    if not eid:
        return False
    sql = "DELETE FROM notifications WHERE id = ?"
    with get_conn() as conn:
        cur = conn.execute(adapt_sql(sql), [eid])
        return int(getattr(cur, "rowcount", 0) or 0) > 0
