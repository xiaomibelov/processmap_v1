"""CRUD для agent_pending_edits (AGENT-3 HITL).

Сервис не импортирует backend.app.*.
"""
from __future__ import annotations

import json
import time
import uuid
from typing import Any, Dict, List, Optional

from db import adapt_sql, get_conn


CONFIRM_TIMEOUT_SEC = 900  # 15 minutes


def _now_ts() -> int:
    return int(time.time())


def _new_id() -> str:
    return f"ape_{uuid.uuid4().hex}"


def _to_json(value: Any) -> str:
    try:
        return json.dumps(value if value is not None else {}, ensure_ascii=False)
    except Exception:
        return "{}"


def _json_loads(value: Any, fallback: Any) -> Any:
    raw = str(value or "")
    if not raw:
        return fallback
    try:
        parsed = json.loads(raw)
        return parsed if parsed is not None else fallback
    except Exception:
        return fallback


def create_pending_edit(
    session_id: str,
    org_id: str,
    turn_id: str,
    edit_plan: Dict[str, Any],
    *,
    status: str = "pending",
    expires_at: Optional[int] = None,
    now_ms: Optional[int] = None,
) -> str:
    """Создать запись agent_pending_edits, вернуть id."""
    sid = str(session_id or "").strip()
    oid = str(org_id or "").strip() or "org_default"
    tid = str(turn_id or "").strip()
    now = now_ms if now_ms is not None else _now_ts()
    exp = expires_at if expires_at is not None else (now + CONFIRM_TIMEOUT_SEC)

    edit_plan = edit_plan if isinstance(edit_plan, dict) else {}
    pending_id = _new_id()

    with get_conn() as con:
        con.execute(
            adapt_sql(
                """
                INSERT INTO agent_pending_edits
                    (id, org_id, session_id, turn_id, edit_plan_json, status,
                     expires_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """
            ),
            [pending_id, oid, sid, tid, _to_json(edit_plan), status, exp, now],
        )
    return pending_id


def get_pending_edit(pending_edit_id: str, org_id: str = "") -> Optional[Dict[str, Any]]:
    """Загрузить pending_edit по id (с проверкой org_id, если передан)."""
    peid = str(pending_edit_id or "").strip()
    if not peid:
        return None
    oid = str(org_id or "").strip()
    with get_conn() as con:
        if oid:
            row = con.execute(
                adapt_sql(
                    "SELECT * FROM agent_pending_edits WHERE id = ? AND org_id = ? LIMIT 1"
                ),
                [peid, oid],
            ).fetchone()
        else:
            row = con.execute(
                adapt_sql("SELECT * FROM agent_pending_edits WHERE id = ? LIMIT 1"),
                [peid],
            ).fetchone()
    if not row:
        return None
    row_d = dict(row)
    return {
        "id": str(row_d.get("id") or ""),
        "org_id": str(row_d.get("org_id") or ""),
        "session_id": str(row_d.get("session_id") or ""),
        "turn_id": str(row_d.get("turn_id") or ""),
        "edit_plan": _json_loads(row_d.get("edit_plan_json"), {}),
        "status": str(row_d.get("status") or ""),
        "expires_at": int(row_d.get("expires_at") or 0),
        "created_at": int(row_d.get("created_at") or 0),
        "resumed_by_user_id": str(row_d.get("resumed_by_user_id") or "") if row_d.get("resumed_by_user_id") else None,
        "resumed_at": int(row_d.get("resumed_at") or 0) if row_d.get("resumed_at") else None,
    }


def update_pending_edit_status(
    pending_edit_id: str,
    status: str,
    *,
    resumed_by_user_id: Optional[str] = None,
    now_ms: Optional[int] = None,
) -> bool:
    """Обновить статус pending_edit. Возвращает True если запись найдена."""
    peid = str(pending_edit_id or "").strip()
    if not peid:
        return False
    now = now_ms if now_ms is not None else _now_ts()
    with get_conn() as con:
        cur = con.execute(
            adapt_sql(
                """
                UPDATE agent_pending_edits
                SET status = ?, resumed_by_user_id = ?, resumed_at = ?
                WHERE id = ?
                """
            ),
            [status, resumed_by_user_id, now, peid],
        )
        return cur.rowcount > 0


def list_session_pending_edits(
    session_id: str,
    org_id: str,
    *,
    status: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """Список pending_edits для сессии."""
    sid = str(session_id or "").strip()
    oid = str(org_id or "").strip() or "org_default"
    sql = (
        "SELECT * FROM agent_pending_edits "
        "WHERE org_id = ? AND session_id = ?"
    )
    params: List[Any] = [oid, sid]
    if status:
        sql += " AND status = ?"
        params.append(status)
    sql += " ORDER BY created_at DESC LIMIT ?"
    params.append(max(1, min(int(limit), 1000)))

    with get_conn() as con:
        rows = con.execute(adapt_sql(sql), params).fetchall()
    return [get_pending_edit(str(dict(row).get("id")), oid) for row in rows]
