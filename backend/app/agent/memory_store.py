"""Durable memory store for AGENT-0 PROCESSMAN chat.

Uses the same storage connection (SQLite/Postgres) as the rest of the app.
Tables are created idempotently so tests without alembic still work.
"""
from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from ..db.config import get_db_runtime_config
from ..storage import _connect, _json_loads, _now_ts


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


_SCHEMA_READY: bool = False
_SCHEMA_DB_FILE: str = ""


def _column_exists(con: Any, table: str, column: str) -> bool:
    """Check whether a column exists (SQLite or PostgreSQL)."""
    table = str(table or "").strip()
    column = str(column or "").strip()
    if not table or not column:
        return False
    cfg = get_db_runtime_config()
    if cfg.backend == "sqlite":
        cur = con.execute(f"PRAGMA table_info({table})")
        return any(str(row["name"] or "").lower() == column.lower() for row in cur.fetchall())
    cur = con.execute(
        "SELECT 1 FROM information_schema.columns WHERE table_name = %s AND column_name = %s",
        [table, column],
    )
    return cur.fetchone() is not None


def _ensure_agent_schema() -> None:
    """Idempotent DDL for agent memory tables (mirrors migration 017)."""
    global _SCHEMA_READY, _SCHEMA_DB_FILE
    # For SQLite the connection comes from a fresh path per test; re-check when path changes.
    import os

    current_path = str(os.environ.get("PROCESS_DB_PATH", "") or "").strip()
    if _SCHEMA_READY and _SCHEMA_DB_FILE == current_path:
        return

    with _connect() as con:
        con.execute(
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
        con.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_agent_conversations_session_user
            ON agent_conversations(org_id, session_id, user_id)
            """
        )
        # ADD COLUMN IF NOT EXISTS: guard with explicit column check so a failed
        # ALTER does not leave a PostgreSQL transaction in aborted state.
        if not _column_exists(con, "agent_conversations", "summary"):
            con.execute("ALTER TABLE agent_conversations ADD COLUMN summary TEXT")
        con.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_agent_conversations_updated_at
            ON agent_conversations(updated_at)
            """
        )
        con.execute(
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
        con.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_agent_turns_conversation_created
            ON agent_turns(conversation_id, created_at)
            """
        )
        con.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_agent_turns_session_created
            ON agent_turns(org_id, session_id, created_at)
            """
        )
        con.commit()

    _SCHEMA_READY = True
    _SCHEMA_DB_FILE = current_path


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

    with _connect() as con:
        existing = con.execute(
            "SELECT 1 FROM agent_conversations WHERE id = ? LIMIT 1",
            [conv_id],
        ).fetchone()
        if not existing:
            con.execute(
                """
                INSERT INTO agent_conversations
                    (id, org_id, session_id, user_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                [conv_id, oid, sid, uid, now, now],
            )
            con.commit()
    return conv_id


def _row_to_turn(row: Any) -> AgentTurn:
    return AgentTurn(
        id=str(row["id"]),
        conversation_id=str(row["conversation_id"]),
        client_turn_id=(str(row["client_turn_id"]) if row["client_turn_id"] else None),
        org_id=str(row["org_id"]),
        session_id=str(row["session_id"]),
        user_id=str(row["user_id"]),
        role=str(row["role"]),
        content=_json_loads(row["content_json"], {}),
        action=(str(row["action"]) if row["action"] else None),
        action_payload=_json_loads(row["action_payload_json"], {}),
        projection_digest=(str(row["projection_digest"]) if row["projection_digest"] else None),
        usage=_json_loads(row["usage_json"], {}),
        created_at=int(row["created_at"] or 0),
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

    with _connect() as con:
        rows = con.execute(
            """
            SELECT * FROM agent_turns
            WHERE conversation_id = ? AND org_id = ? AND session_id = ? AND user_id = ?
            ORDER BY created_at ASC, id ASC
            LIMIT ?
            """,
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

    with _connect() as con:
        row = con.execute(
            """
            SELECT * FROM agent_turns
            WHERE conversation_id = ? AND client_turn_id = ? AND role = ?
            LIMIT 1
            """,
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

    with _connect() as con:
        # Enforce monotonic ordering within a conversation (second-granularity
        # timestamps can collide for rapid sequential turns).
        last_row = con.execute(
            "SELECT MAX(created_at) FROM agent_turns WHERE conversation_id = ?",
            [conv_id],
        ).fetchone()
        last_ts = int((last_row[0] if last_row and last_row[0] else 0) or 0)
        if last_ts >= now:
            now = last_ts + 1

        turn_id = _new_id()
        con.execute(
            """
            INSERT INTO agent_turns
                (id, conversation_id, client_turn_id, org_id, session_id, user_id,
                 role, content_json, action, action_payload_json, projection_digest,
                 usage_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
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
            "UPDATE agent_conversations SET updated_at = ? WHERE id = ?",
            [now, conv_id],
        )
        con.commit()
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
    with _connect() as con:
        con.execute(
            "DELETE FROM agent_conversations WHERE id = ? AND org_id = ? AND session_id = ? AND user_id = ?",
            [conv_id, oid, sid, uid],
        )
        con.commit()
