"""Хранилище телеметрии канваса (feature/canvas-telemetry-feed).

Две таблицы:
- canvas_event_raw — append-only сырые события ленты (retention 14 дней);
- canvas_event_read — витрина ошибочных групп (пишет агрегатор, читает admin UI).

DDL по каноническому паттерну error_events: CREATE TABLE IF NOT EXISTS в коде,
вне alembic. Идемпотентный приём: UNIQUE (session_id, event_id) +
INSERT ... ON CONFLICT (session_id, event_id) DO NOTHING (валидно для sqlite и
postgres — compat-слой транслирует `?` в `%s`).
"""

from __future__ import annotations

import json
import logging
import threading
import time
from typing import Any, Dict, List, Optional

from ..compat.repository import _column_exists, _connect, _now_ts

logger = logging.getLogger(__name__)

_SCHEMA_LOCK = threading.Lock()
_SCHEMA_READY = False

RAW_TABLE = "canvas_event_raw"
READ_TABLE = "canvas_event_read"

_RAW_RETENTION_DAYS = 14
_LAZY_CLEANUP_DENOMINATOR = 1000


def _ensure_schema() -> None:
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return
    with _SCHEMA_LOCK:
        if _SCHEMA_READY:
            return
        with _connect() as con:
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS canvas_event_raw (
                  session_id TEXT NOT NULL,
                  event_id TEXT NOT NULL,
                  seq BIGINT NOT NULL DEFAULT 0,
                  ts BIGINT NOT NULL DEFAULT 0,
                  kind TEXT NOT NULL DEFAULT '',
                  project_id TEXT,
                  user_id TEXT,
                  org_id TEXT,
                  tab_id TEXT,
                  runtime_id TEXT,
                  payload_json TEXT NOT NULL DEFAULT '{}',
                  created_at INTEGER NOT NULL DEFAULT 0,
                  PRIMARY KEY (session_id, event_id)
                )
                """
            )
            con.execute(
                "CREATE INDEX IF NOT EXISTS idx_canvas_event_raw_created_at "
                "ON canvas_event_raw(created_at)"
            )
            con.execute(
                "CREATE INDEX IF NOT EXISTS idx_canvas_event_raw_session_ts "
                "ON canvas_event_raw(session_id, ts)"
            )
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS canvas_event_read (
                  id TEXT PRIMARY KEY,
                  org_id TEXT,
                  session_id TEXT NOT NULL,
                  user_id TEXT,
                  project_id TEXT,
                  error_class TEXT NOT NULL DEFAULT 'unknown',
                  error_code TEXT NOT NULL DEFAULT '',
                  op_type TEXT NOT NULL DEFAULT '',
                  op_id TEXT NOT NULL DEFAULT '',
                  message TEXT NOT NULL DEFAULT '',
                  first_seen BIGINT NOT NULL DEFAULT 0,
                  last_seen BIGINT NOT NULL DEFAULT 0,
                  count INTEGER NOT NULL DEFAULT 1,
                  converged INTEGER NOT NULL DEFAULT 0,
                  classification TEXT NOT NULL DEFAULT 'data_loss',
                  context_json TEXT NOT NULL DEFAULT '[]',
                  updated_at INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            # F1 (fix/save-telemetry-full-coverage-v1): классификатор «потеря
            # данных vs шум» на группе. Guarded ALTER — существующие БД.
            if not _column_exists(con, READ_TABLE, "classification"):
                con.execute(
                    f"ALTER TABLE {READ_TABLE} ADD COLUMN classification "
                    "TEXT NOT NULL DEFAULT 'data_loss'"
                )
            con.execute(
                "CREATE INDEX IF NOT EXISTS idx_canvas_event_read_org_seen "
                "ON canvas_event_read(org_id, last_seen)"
            )
            con.execute(
                "CREATE INDEX IF NOT EXISTS idx_canvas_event_read_session "
                "ON canvas_event_read(session_id)"
            )
        _SCHEMA_READY = True


def _reset_schema_flag_for_tests() -> None:
    global _SCHEMA_READY
    with _SCHEMA_LOCK:
        _SCHEMA_READY = False


def _sanitize_value(value: Any, depth: int = 0) -> Any:
    """Redaction по allowlist-инверсии: запрещённые ключи вырезаются, строки
    обрезаются. Зеркалит политику telemetryClient.sanitizeContextValue."""
    if depth > 4:
        return "[max_depth]"
    if isinstance(value, dict):
        out: Dict[str, Any] = {}
        for key, item in list(value.items())[:40]:
            k = str(key or "")[:128]
            lowered = k.lower()
            if (
                lowered in ("authorization", "cookie", "cookies", "set-cookie")
                or lowered.endswith("token")
                or lowered == "bpmn_xml"
                or lowered.endswith("_bpmn_xml")
                or lowered in ("payload", "request_body", "response_body")
                or lowered.endswith("_payload")
            ):
                out[k] = "[REDACTED]"
                continue
            out[k] = _sanitize_value(item, depth + 1)
        return out
    if isinstance(value, list):
        return [_sanitize_value(item, depth + 1) for item in value[:20]]
    if isinstance(value, str):
        return value[:256]
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return str(value)[:256]


def sanitize_event_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    sanitized = _sanitize_value(payload if isinstance(payload, dict) else {})
    return sanitized if isinstance(sanitized, dict) else {}


def append_canvas_events(rows: List[Dict[str, Any]]) -> int:
    """Идемпотентный batch insert. Вернёт число реально вставленных строк."""
    if not rows:
        return 0
    _ensure_schema()
    now = _now_ts()
    placeholders = ", ".join(["(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"] * len(rows))
    sql = (
        f"INSERT INTO {RAW_TABLE} "
        "(session_id, event_id, seq, ts, kind, project_id, user_id, org_id, "
        "tab_id, runtime_id, payload_json, created_at) VALUES "
        f"{placeholders} "
        "ON CONFLICT (session_id, event_id) DO NOTHING"
    )
    params: List[Any] = []
    for row in rows:
        params.extend(
            [
                row.get("session_id"),
                row.get("event_id"),
                int(row.get("seq") or 0),
                int(row.get("ts") or 0),
                str(row.get("kind") or ""),
                row.get("project_id"),
                row.get("user_id"),
                row.get("org_id"),
                row.get("tab_id"),
                row.get("runtime_id"),
                json.dumps(row.get("payload") or {}, ensure_ascii=False),
                now,
            ]
        )
    with _connect() as con:
        result = con.execute(sql, params)
        con.commit()
        maybe_cleanup_raw_events_lazy(con)
        return int(getattr(result, "rowcount", 0) or 0)


def maybe_cleanup_raw_events_lazy(con: Any = None) -> int:
    """Lazy-fallback retention (~1/1000 вызовов), если celery cleanup недоступен."""
    if int(time.time() * 1000) % _LAZY_CLEANUP_DENOMINATOR != 0:
        return 0
    return cleanup_raw_events()


def cleanup_raw_events(retention_days: int = _RAW_RETENTION_DAYS, now_ts: Optional[int] = None) -> int:
    _ensure_schema()
    retention = max(1, int(retention_days or _RAW_RETENTION_DAYS))
    now = int(now_ts or 0) or _now_ts()
    threshold = now - retention * 24 * 3600
    with _connect() as con:
        cur = con.execute(
            f"DELETE FROM {RAW_TABLE} WHERE created_at > 0 AND created_at < ?",
            [threshold],
        )
        con.commit()
        return int(getattr(cur, "rowcount", 0) or 0)


def list_raw_events(
    session_id: str,
    *,
    kind: Optional[str] = None,
    from_ts: int = 0,
    to_ts: int = 0,
    limit: int = 1000,
) -> List[Dict[str, Any]]:
    _ensure_schema()
    sql = f"SELECT * FROM {RAW_TABLE} WHERE session_id = ?"
    params: List[Any] = [session_id]
    if kind:
        sql += " AND kind = ?"
        params.append(kind)
    if from_ts:
        sql += " AND ts >= ?"
        params.append(int(from_ts))
    if to_ts:
        sql += " AND ts <= ?"
        params.append(int(to_ts))
    sql += " ORDER BY ts ASC, seq ASC LIMIT ?"
    params.append(int(limit))
    with _connect() as con:
        rows = con.execute(sql, params).fetchall()
    return [_raw_row_to_dict(r) for r in rows]


def _raw_row_to_dict(row: Any) -> Dict[str, Any]:
    get = row.get if hasattr(row, "get") else None
    if get is None:
        keys = row.keys() if hasattr(row, "keys") else []
        get = lambda k, d=None: (row[k] if k in keys else d)  # noqa: E731
    return {
        "session_id": get("session_id"),
        "event_id": get("event_id"),
        "seq": int(get("seq") or 0),
        "ts": int(get("ts") or 0),
        "kind": get("kind") or "",
        "project_id": get("project_id"),
        "user_id": get("user_id"),
        "org_id": get("org_id"),
        "tab_id": get("tab_id"),
        "runtime_id": get("runtime_id"),
        "payload_json": get("payload_json") or "{}",
        "created_at": int(get("created_at") or 0),
    }


# ---------------------------------------------------------------------------
# Витрина canvas_event_read (пишет агрегатор, читает admin UI)
# ---------------------------------------------------------------------------


def upsert_error_group(group: Dict[str, Any]) -> str:
    """Создать или обновить группу по fingerprint сессии.

    Существующая группа (session_id, error_class, error_code, op_type)
    обновляется: id/first_seen сохраняются, last_seen/count/converged/context —
    перезаписываются (агрегатор детерминирован, повторный прогон даёт те же
    значения).
    """
    _ensure_schema()
    session_id = str(group.get("session_id") or "").strip()
    error_class = str(group.get("error_class") or "unknown")[:64]
    error_code = str(group.get("error_code") or "")[:128]
    op_type = str(group.get("op_type") or "")[:128]
    with _connect() as con:
        existing = con.execute(
            f"SELECT id, first_seen FROM {READ_TABLE} "
            "WHERE session_id = ? AND error_class = ? AND error_code = ? AND op_type = ?",
            [session_id, error_class, error_code, op_type],
        ).fetchone()
        if existing:
            gid = _row_value(existing, "id", 0)
            first_seen = int(_row_value(existing, "first_seen", 1) or 0)
            con.execute(
                f"UPDATE {READ_TABLE} SET last_seen = ?, count = ?, converged = ?, "
                "message = ?, op_id = ?, user_id = ?, org_id = ?, project_id = ?, "
                "classification = ?, context_json = ?, updated_at = ? WHERE id = ?",
                [
                    int(group.get("last_seen") or 0),
                    int(group.get("count") or 1),
                    int(group.get("converged") or 0),
                    str(group.get("message") or "")[:256],
                    str(group.get("op_id") or "")[:128],
                    group.get("user_id"),
                    group.get("org_id"),
                    group.get("project_id"),
                    str(group.get("classification") or "data_loss")[:32],
                    json.dumps(group.get("context") or [], ensure_ascii=False),
                    _now_ts(),
                    gid,
                ],
            )
            con.commit()
            return str(gid)
        gid = str(group.get("id") or "")[:64]
        con.execute(
            f"INSERT INTO {READ_TABLE} "
            "(id, org_id, session_id, user_id, project_id, error_class, error_code, "
            "op_type, op_id, message, first_seen, last_seen, count, converged, "
            "classification, context_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                gid,
                group.get("org_id"),
                session_id,
                group.get("user_id"),
                group.get("project_id"),
                error_class,
                error_code,
                op_type,
                str(group.get("op_id") or "")[:128],
                str(group.get("message") or "")[:256],
                int(group.get("first_seen") or 0),
                int(group.get("last_seen") or 0),
                int(group.get("count") or 1),
                int(group.get("converged") or 0),
                str(group.get("classification") or "data_loss")[:32],
                json.dumps(group.get("context") or [], ensure_ascii=False),
                _now_ts(),
            ],
        )
        con.commit()
        return gid


def _row_value(row: Any, key: str, index: int) -> Any:
    if hasattr(row, "get"):
        try:
            return row.get(key)
        except Exception:
            pass
    try:
        return row[index]
    except Exception:
        return None


def list_session_watermarks() -> Dict[str, int]:
    """max(last_seen) групп витрины по сессиям — watermark агрегатора."""
    _ensure_schema()
    with _connect() as con:
        rows = con.execute(
            f"SELECT session_id, MAX(last_seen) AS watermark FROM {READ_TABLE} GROUP BY session_id"
        ).fetchall()
    return {str(_row_value(r, "session_id", 0)): int(_row_value(r, "watermark", 1) or 0) for r in rows}


def list_error_groups(
    *,
    org_id: Optional[str] = None,
    session_id: Optional[str] = None,
    user_id: Optional[str] = None,
    error_class: Optional[str] = None,
    error_code: Optional[str] = None,
    converged: Optional[int] = None,
    last_seen_from: int = 0,
    last_seen_to: int = 0,
    limit: int = 50,
    offset: int = 0,
    order: str = "desc",
) -> List[Dict[str, Any]]:
    _ensure_schema()
    sql = f"SELECT * FROM {READ_TABLE} WHERE 1=1"
    params: List[Any] = []
    if org_id:
        sql += " AND org_id = ?"
        params.append(org_id)
    if session_id:
        sql += " AND session_id = ?"
        params.append(session_id)
    if user_id:
        sql += " AND user_id = ?"
        params.append(user_id)
    if error_class:
        sql += " AND error_class = ?"
        params.append(error_class)
    if error_code:
        sql += " AND error_code = ?"
        params.append(error_code)
    if converged is not None:
        sql += " AND converged = ?"
        params.append(int(converged))
    if last_seen_from:
        sql += " AND last_seen >= ?"
        params.append(int(last_seen_from))
    if last_seen_to:
        sql += " AND last_seen <= ?"
        params.append(int(last_seen_to))
    direction = "ASC" if str(order).lower() == "asc" else "DESC"
    sql += f" ORDER BY last_seen {direction}, id {direction} LIMIT ? OFFSET ?"
    params.extend([int(limit), int(offset)])
    with _connect() as con:
        rows = con.execute(sql, params).fetchall()
    return [_read_group_row_to_dict(r) for r in rows]


def count_error_groups(**filters: Any) -> int:
    _ensure_schema()
    sql = f"SELECT COUNT(*) AS c FROM {READ_TABLE} WHERE 1=1"
    params: List[Any] = []
    mapping = {
        "org_id": "org_id",
        "session_id": "session_id",
        "user_id": "user_id",
        "error_class": "error_class",
        "error_code": "error_code",
    }
    for key, column in mapping.items():
        value = filters.get(key)
        if value:
            sql += f" AND {column} = ?"
            params.append(value)
    if filters.get("converged") is not None:
        sql += " AND converged = ?"
        params.append(int(filters["converged"]))
    if filters.get("last_seen_from"):
        sql += " AND last_seen >= ?"
        params.append(int(filters["last_seen_from"]))
    if filters.get("last_seen_to"):
        sql += " AND last_seen <= ?"
        params.append(int(filters["last_seen_to"]))
    with _connect() as con:
        row = con.execute(sql, params).fetchone()
    return int(_row_value(row, "c", 0) or 0)


def get_error_group(group_id: str) -> Optional[Dict[str, Any]]:
    _ensure_schema()
    with _connect() as con:
        row = con.execute(f"SELECT * FROM {READ_TABLE} WHERE id = ?", [str(group_id or "")]).fetchone()
    if not row:
        return None
    return _read_group_row_to_dict(row)


def _read_group_row_to_dict(row: Any) -> Dict[str, Any]:
    return {
        "id": _row_value(row, "id", 0),
        "org_id": _row_value(row, "org_id", 1),
        "session_id": _row_value(row, "session_id", 2),
        "user_id": _row_value(row, "user_id", 3),
        "project_id": _row_value(row, "project_id", 4),
        "error_class": _row_value(row, "error_class", 5) or "unknown",
        "error_code": _row_value(row, "error_code", 6) or "",
        "op_type": _row_value(row, "op_type", 7) or "",
        "op_id": _row_value(row, "op_id", 8) or "",
        "message": _row_value(row, "message", 9) or "",
        "first_seen": int(_row_value(row, "first_seen", 10) or 0),
        "last_seen": int(_row_value(row, "last_seen", 11) or 0),
        "count": int(_row_value(row, "count", 12) or 0),
        "converged": int(_row_value(row, "converged", 13) or 0),
        "classification": _row_value(row, "classification", 14) or "data_loss",
        "context_json": _row_value(row, "context_json", 15) or "[]",
        "updated_at": int(_row_value(row, "updated_at", 16) or 0),
    }
