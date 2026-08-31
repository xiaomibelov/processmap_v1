"""Durable memory store for PROCESSMAN chat — КОПИЯ backend/app/agent/memory_store.py.

Адаптация под сервис: storage._connect → db.get_conn + adapt_sql (общая БД,
таблицы agent_conversations/agent_turns принадлежат сервисному домену, прямой
SQL — решение владельца). Локальные _now_ts/_json_loads вместо app.storage.
DDL идемпотентен (зеркалит миграцию 017) — тесты без alembic работают.
"""
from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from db import adapt_sql, get_conn, is_sqlite


@dataclass
class AgentTurn:
    id: str
    conversation_id: str
    client_turn_id: Optional[str]
    org_id: str
    session_id: str
    user_id: str
    role: str
    content: Dict[str, Any]
    action: Optional[str]
    action_payload: Dict[str, Any]
    projection_digest: Optional[str]
    usage: Dict[str, Any]
    created_at: int


def _now_ts() -> int:
    return int(time.time())


def _json_loads(value: Any, fallback: Any) -> Any:
    raw = str(value or "")
    if not raw:
        return fallback
    try:
        parsed = json.loads(raw)
        if parsed is None:
            return fallback
        return parsed
    except Exception:
        return fallback


_SCHEMA_READY: bool = False
_SCHEMA_DB_URL: str = ""


def _column_exists(con: Any, table: str, column: str) -> bool:
    """Check whether a column exists (SQLite or PostgreSQL)."""
    table = str(table or "").strip()
    column = str(column or "").strip()
    if not table or not column:
        return False
    if is_sqlite():
        cur = con.execute(f"PRAGMA table_info({table})")
        return any(str(row["name"] or "").lower() == column.lower() for row in cur.fetchall())
    cur = con.execute(
        adapt_sql(
            "SELECT 1 FROM information_schema.columns WHERE table_name = %s AND column_name = %s"
        ),
        [table, column],
    )
    return cur.fetchone() is not None


def _ensure_agent_schema() -> None:
    """Idempotent DDL for agent memory tables (mirrors migration 017)."""
    global _SCHEMA_READY, _SCHEMA_DB_URL
    # For SQLite the connection comes from a fresh path per test; re-check when path changes.
    import os

    current_url = str(os.environ.get("DATABASE_URL", "") or "").strip()
    if _SCHEMA_READY and _SCHEMA_DB_URL == current_url:
        return

    with get_conn() as con:
        con.execute(
            adapt_sql(
                """
                CREATE TABLE IF NOT EXISTS agent_conversations (
                    id TEXT PRIMARY KEY,
                    org_id TEXT NOT NULL DEFAULT 'org_default',
                    session_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    created_at BIGINT NOT NULL,
                    updated_at BIGINT NOT NULL
                )
                """
            )
        )
        con.execute(
            adapt_sql(
                """
                CREATE INDEX IF NOT EXISTS idx_agent_conversations_session_user
                ON agent_conversations(org_id, session_id, user_id)
                """
            )
        )
        # ADD COLUMN IF NOT EXISTS: guard with explicit column check so a failed
        # ALTER does not leave a PostgreSQL transaction in aborted state.
        if not _column_exists(con, "agent_conversations", "summary"):
            con.execute(adapt_sql("ALTER TABLE agent_conversations ADD COLUMN summary TEXT"))
        con.execute(
            adapt_sql(
                """
                CREATE INDEX IF NOT EXISTS idx_agent_conversations_updated_at
                ON agent_conversations(updated_at)
                """
            )
        )
        con.execute(
            adapt_sql(
                """
                CREATE TABLE IF NOT EXISTS agent_turns (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
                    client_turn_id TEXT,
                    org_id TEXT NOT NULL DEFAULT 'org_default',
                    session_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
                    content_json TEXT NOT NULL DEFAULT '{}',
                    action TEXT,
                    action_payload_json TEXT NOT NULL DEFAULT '{}',
                    projection_digest TEXT,
                    usage_json TEXT NOT NULL DEFAULT '{}',
                    created_at BIGINT NOT NULL,
                    UNIQUE(conversation_id, client_turn_id, role)
                )
                """
            )
        )
        con.execute(
            adapt_sql(
                """
                CREATE INDEX IF NOT EXISTS idx_agent_turns_conversation_created
                ON agent_turns(conversation_id, created_at)
                """
            )
        )
        con.execute(
            adapt_sql(
                """
                CREATE INDEX IF NOT EXISTS idx_agent_turns_session_created
                ON agent_turns(org_id, session_id, created_at)
                """
            )
        )

    _SCHEMA_READY = True
    _SCHEMA_DB_URL = current_url


def _new_id() -> str:
    return f"agt_{uuid.uuid4().hex}"


def _to_json(value: Any) -> str:
    try:
        return json.dumps(value if value is not None else {}, ensure_ascii=False)
    except Exception:
        return "{}"


def _conversation_id(session_id: str, user_id: str) -> str:
    """Stable conversation key for (session, user).

    Kept simple for AGENT-0; future template-mode can switch to a different
    key without changing the table schema.
    """
    return f"conv:{session_id}:{user_id}"


def get_or_create_conversation(
    session_id: str,
    user_id: str,
    org_id: str,
    now_ms: Optional[int] = None,
) -> str:
    _ensure_agent_schema()
    sid = str(session_id or "").strip()
    uid = str(user_id or "").strip()
    oid = str(org_id or "").strip() or "org_default"
    conv_id = _conversation_id(sid, uid)
    now = now_ms if now_ms is not None else _now_ts()

    with get_conn() as con:
        existing = con.execute(
            adapt_sql("SELECT 1 FROM agent_conversations WHERE id = ? LIMIT 1"),
            [conv_id],
        ).fetchone()
        if not existing:
            con.execute(
                adapt_sql(
                    """
                    INSERT INTO agent_conversations
                        (id, org_id, session_id, user_id, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """
                ),
                [conv_id, oid, sid, uid, now, now],
            )
    return conv_id


def _row_to_turn(row: Any) -> AgentTurn:
    row_d = dict(row)
    return AgentTurn(
        id=str(row_d["id"]),
        conversation_id=str(row_d["conversation_id"]),
        client_turn_id=(str(row_d["client_turn_id"]) if row_d["client_turn_id"] else None),
        org_id=str(row_d["org_id"]),
        session_id=str(row_d["session_id"]),
        user_id=str(row_d["user_id"]),
        role=str(row_d["role"]),
        content=_json_loads(row_d["content_json"], {}),
        action=(str(row_d["action"]) if row_d["action"] else None),
        action_payload=_json_loads(row_d["action_payload_json"], {}),
        projection_digest=(str(row_d["projection_digest"]) if row_d["projection_digest"] else None),
        usage=_json_loads(row_d["usage_json"], {}),
        created_at=int(row_d["created_at"] or 0),
    )


def list_turns(
    session_id: str,
    user_id: str,
    org_id: str,
    limit: int = 100,
) -> List[AgentTurn]:
    _ensure_agent_schema()
    sid = str(session_id or "").strip()
    uid = str(user_id or "").strip()
    oid = str(org_id or "").strip() or "org_default"
    conv_id = _conversation_id(sid, uid)
    try:
        lim = int(limit)
    except Exception:
        lim = 100
    lim = max(1, min(lim, 1000))

    with get_conn() as con:
        rows = con.execute(
            adapt_sql(
                """
                SELECT * FROM agent_turns
                WHERE conversation_id = ? AND org_id = ? AND session_id = ? AND user_id = ?
                ORDER BY created_at ASC, id ASC
                LIMIT ?
                """
            ),
            [conv_id, oid, sid, uid, lim],
        ).fetchall()
    return [_row_to_turn(row) for row in rows]


def find_turn_by_client_id(
    conversation_id: str,
    client_turn_id: str,
    role: str = "assistant",
) -> Optional[AgentTurn]:
    _ensure_agent_schema()
    cid = str(conversation_id or "").strip()
    ctid = str(client_turn_id or "").strip()
    r = str(role or "assistant").strip()
    if not cid or not ctid:
        return None

    with get_conn() as con:
        row = con.execute(
            adapt_sql(
                """
                SELECT * FROM agent_turns
                WHERE conversation_id = ? AND client_turn_id = ? AND role = ?
                LIMIT 1
                """
            ),
            [cid, ctid, r],
        ).fetchone()
    return _row_to_turn(row) if row else None


def append_turn(
    session_id: str,
    user_id: str,
    org_id: str,
    role: str,
    content_json: Dict[str, Any],
    *,
    client_turn_id: Optional[str] = None,
    action: Optional[str] = None,
    action_payload_json: Optional[Dict[str, Any]] = None,
    projection_digest: Optional[str] = None,
    usage_json: Optional[Dict[str, Any]] = None,
    now_ms: Optional[int] = None,
) -> str:
    _ensure_agent_schema()
    sid = str(session_id or "").strip()
    uid = str(user_id or "").strip()
    oid = str(org_id or "").strip() or "org_default"
    conv_id = get_or_create_conversation(sid, uid, oid, now_ms=now_ms)
    now = now_ms if now_ms is not None else _now_ts()

    with get_conn() as con:
        # Enforce monotonic ordering within a conversation (second-granularity
        # timestamps can collide for rapid sequential turns).
        last_row = con.execute(
            adapt_sql("SELECT MAX(created_at) AS m FROM agent_turns WHERE conversation_id = ?"),
            [conv_id],
        ).fetchone()
        last_ts = int((dict(last_row).get("m") if last_row else 0) or 0)
        if last_ts >= now:
            now = last_ts + 1

        turn_id = _new_id()
        con.execute(
            adapt_sql(
                """
                INSERT INTO agent_turns
                    (id, conversation_id, client_turn_id, org_id, session_id, user_id,
                     role, content_json, action, action_payload_json, projection_digest,
                     usage_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """
            ),
            [
                turn_id,
                conv_id,
                (str(client_turn_id).strip() if client_turn_id else None),
                oid,
                sid,
                uid,
                str(role or "assistant").strip(),
                _to_json(content_json),
                (str(action).strip() if action else None),
                _to_json(action_payload_json),
                (str(projection_digest).strip() if projection_digest else None),
                _to_json(usage_json),
                now,
            ],
        )
        con.execute(
            adapt_sql("UPDATE agent_conversations SET updated_at = ? WHERE id = ?"),
            [now, conv_id],
        )
    return turn_id


def delete_conversation(
    session_id: str,
    user_id: str,
    org_id: str,
) -> None:
    _ensure_agent_schema()
    sid = str(session_id or "").strip()
    uid = str(user_id or "").strip()
    oid = str(org_id or "").strip() or "org_default"
    conv_id = _conversation_id(sid, uid)
    with get_conn() as con:
        con.execute(
            adapt_sql("DELETE FROM agent_conversations WHERE id = ? AND org_id = ? AND session_id = ? AND user_id = ?"),
            [conv_id, oid, sid, uid],
        )


def get_conversation_summary(
    session_id: str,
    user_id: str,
    org_id: str,
) -> Optional[str]:
    """Load existing conversation summary for (session, user) or None."""
    _ensure_agent_schema()
    sid = str(session_id or "").strip()
    uid = str(user_id or "").strip()
    oid = str(org_id or "").strip() or "org_default"
    conv_id = _conversation_id(sid, uid)
    with get_conn() as con:
        row = con.execute(
            adapt_sql("SELECT summary FROM agent_conversations WHERE id = ? AND org_id = ? AND session_id = ? AND user_id = ? LIMIT 1"),
            [conv_id, oid, sid, uid],
        ).fetchone()
    if not row:
        return None
    summary = dict(row).get("summary")
    return str(summary).strip() if summary else None
