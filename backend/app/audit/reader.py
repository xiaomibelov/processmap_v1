"""E8.2 — чтение audit_log с фильтрами и разрешением актора (E8.5).

Использует тот же compat-паттерн, что и ``recipe/repository.py``
(``storage._connect`` с ``?``-плейсхолдерами, транслируемыми для Postgres).
Таблица audit_log не изменяется — только SELECT.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from ..storage import _connect
from .writer import ACTOR_UNKNOWN_LABEL

_COLUMNS = (
    "id, ts, actor_user_id, org_id, project_id, session_id, "
    "action, entity_type, entity_id, status, meta_json"
)


def _as_dict(row: Any) -> Dict[str, Any]:
    """sqlite3.Row не имеет .get() (postgres-строки — dict-like): нормализуем."""
    return row if isinstance(row, dict) else dict(row)


def _row_to_dict(row: Any) -> Dict[str, Any]:
    row = _as_dict(row)
    meta_raw = row.get("meta_json")
    if isinstance(meta_raw, dict):
        meta = meta_raw
    else:
        try:
            meta = json.loads(meta_raw or "{}")
        except Exception:
            meta = {}
    return {
        "id": str(row.get("id") or ""),
        "ts": int(row.get("ts") or 0),
        "actor_user_id": str(row.get("actor_user_id") or ""),
        "org_id": str(row.get("org_id") or ""),
        "project_id": str(row.get("project_id") or "") if row.get("project_id") is not None else "",
        "session_id": str(row.get("session_id") or "") if row.get("session_id") is not None else "",
        "action": str(row.get("action") or ""),
        "entity_type": str(row.get("entity_type") or ""),
        "entity_id": str(row.get("entity_id") or ""),
        "status": str(row.get("status") or "ok"),
        "meta": meta if isinstance(meta, dict) else {},
    }


def _build_where(
    org_id: str,
    *,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    actor_user_id: Optional[str] = None,
    action: Optional[str] = None,
    ts_from: int = 0,
    ts_to: int = 0,
) -> tuple[str, List[Any]]:
    clauses = ["org_id = ?"]
    params: List[Any] = [org_id]
    if entity_type:
        clauses.append("entity_type = ?")
        params.append(str(entity_type))
    if entity_id:
        clauses.append("entity_id = ?")
        params.append(str(entity_id))
    if actor_user_id:
        clauses.append("actor_user_id = ?")
        params.append(str(actor_user_id))
    if action:
        clauses.append("action = ?")
        params.append(str(action))
    if int(ts_from or 0) > 0:
        clauses.append("ts >= ?")
        params.append(int(ts_from))
    if int(ts_to or 0) > 0:
        clauses.append("ts <= ?")
        params.append(int(ts_to))
    return " AND ".join(clauses), params


def list_events(
    org_id: str,
    *,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    actor_user_id: Optional[str] = None,
    action: Optional[str] = None,
    ts_from: int = 0,
    ts_to: int = 0,
    limit: int = 100,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    where, params = _build_where(
        org_id,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_user_id=actor_user_id,
        action=action,
        ts_from=ts_from,
        ts_to=ts_to,
    )
    lim = max(1, min(int(limit or 100), 500))
    off = max(0, int(offset or 0))
    with _connect() as con:
        rows = con.execute(
            f"SELECT {_COLUMNS} FROM audit_log WHERE {where} "
            "ORDER BY ts DESC, id DESC LIMIT ? OFFSET ?",
            [*params, lim, off],
        ).fetchall()
    return [_row_to_dict(row) for row in rows]


def resolve_actors(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """E8.5 — actor_user_id → email; неразрешённый актор → ACTOR_UNKNOWN_LABEL."""
    ids = sorted({str(e.get("actor_user_id") or "") for e in events if e.get("actor_user_id")})
    emails: Dict[str, str] = {}
    if ids:
        placeholders = ", ".join(["?"] * len(ids))
        with _connect() as con:
            rows = con.execute(
                f"SELECT id, email FROM users WHERE id IN ({placeholders})", ids
            ).fetchall()
        for row in rows:
            row = _as_dict(row)
            emails[str(row.get("id") or "")] = str(row.get("email") or "")
    out: List[Dict[str, Any]] = []
    for event in events:
        actor_id = str(event.get("actor_user_id") or "")
        email = emails.get(actor_id, "")
        out.append(
            {
                **event,
                "actor_email": email or None,
                "actor_display": email or ACTOR_UNKNOWN_LABEL,
                "actor_resolved": bool(email),
            }
        )
    return out


def find_user_id_by_email(email: str) -> Optional[str]:
    em = str(email or "").strip().lower()
    if not em:
        return None
    with _connect() as con:
        row = con.execute("SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1", [em]).fetchone()
    return str(_as_dict(row).get("id")) if row else None
