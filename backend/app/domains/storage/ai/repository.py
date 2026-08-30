from __future__ import annotations

import json
import logging
import os
import re
import sqlite3
import threading
import time
import uuid
import hashlib
import secrets
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Tuple, Set
import xml.etree.ElementTree as ET
from ....db import get_db_runtime_config, redact_database_url
from ....models import Project, Session
from ....session_status import derive_session_status
logger = logging.getLogger(__name__)
try:
    import psycopg
    from psycopg.errors import IntegrityError as PsycopgIntegrityError
    from psycopg_pool import ConnectionPool
except Exception:
    psycopg = None
    PsycopgIntegrityError = None
    ConnectionPool = None
from ..compat.repository import _AI_PROMPT_SCOPE_LEVELS
from ..compat.repository import _AI_PROMPT_STATUSES

def _build_ai_execution_log_where(
    *,
    org_id: str = "",
    module_id: Optional[str] = None,
    status: Optional[str] = None,
    actor_user_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    project_id: Optional[str] = None,
    session_id: Optional[str] = None,
    created_from: Optional[int] = None,
    created_to: Optional[int] = None,
) -> tuple[str, List[Any]]:
    clauses: List[str] = []
    params: List[Any] = []
    oid = str(org_id or "").strip()
    if oid:
        clauses.append("org_id = ?")
        params.append(oid)
    filters = {
        "module_id": module_id,
        "status": _normalize_ai_execution_status(status) if status else "",
        "actor_user_id": actor_user_id,
        "workspace_id": workspace_id,
        "project_id": project_id,
        "session_id": session_id,
    }
    for column, raw in filters.items():
        value = str(raw or "").strip()
        if value:
            clauses.append(f"{column} = ?")
            params.append(value)
    from_ts = int(created_from or 0)
    if from_ts > 0:
        clauses.append("created_at >= ?")
        params.append(from_ts)
    to_ts = int(created_to or 0)
    if to_ts > 0:
        clauses.append("created_at <= ?")
        params.append(to_ts)
    return (" AND ".join(clauses) if clauses else "1 = 1"), params


def _build_ai_prompt_where(
    *,
    module_id: Optional[str] = None,
    status: Optional[str] = None,
    scope_level: Optional[str] = None,
    scope_id: Optional[str] = None,
) -> tuple[str, List[Any]]:
    clauses: List[str] = []
    params: List[Any] = []
    mid = str(module_id or "").strip()
    if mid:
        clauses.append("module_id = ?")
        params.append(mid)
    state = _normalize_ai_prompt_status(status, allow_empty=True)
    if state:
        clauses.append("status = ?")
        params.append(state)
    level = str(scope_level or "").strip()
    if level:
        normalized_level = _normalize_ai_prompt_scope_level(level)
        clauses.append("scope_level = ?")
        params.append(normalized_level)
    sid = str(scope_id or "").strip()
    if sid:
        clauses.append("scope_id = ?")
        params.append(sid)
    return (" AND ".join(clauses) if clauses else "1 = 1"), params


def _normalize_ai_prompt_scope_level(scope_level: Any) -> str:
    value = str(scope_level or "global").strip().lower() or "global"
    if value not in _AI_PROMPT_SCOPE_LEVELS:
        raise ValueError("invalid prompt scope_level; allowed: global, org, workspace, project, session")
    return value


def _normalize_ai_prompt_status(status: Any, *, allow_empty: bool = False) -> str:
    value = str(status or "").strip().lower()
    if allow_empty and not value:
        return ""
    if value not in _AI_PROMPT_STATUSES:
        raise ValueError("invalid prompt status; allowed: draft, active, archived")
    return value


def append_ai_execution_log(
    *,
    execution_id: Optional[str] = None,
    module_id: str,
    actor_user_id: str = "",
    org_id: str = "",
    workspace_id: str = "",
    project_id: str = "",
    session_id: str = "",
    provider: str = "deepseek",
    model: str = "deepseek-chat",
    prompt_id: str = "",
    prompt_version: str = "",
    status: str = "queued",
    input_hash: str = "",
    output_summary: str = "",
    usage: Optional[Dict[str, Any]] = None,
    latency_ms: int = 0,
    error_code: str = "",
    error_message: str = "",
    created_at: Optional[int] = None,
    finished_at: Optional[int] = None,
) -> Dict[str, Any]:
    mid = str(module_id or "").strip()
    if not mid:
        raise ValueError("module_id is required")
    eid = str(execution_id or "").strip() or f"ai_exec_{uuid.uuid4().hex[:16]}"
    actor = str(actor_user_id or "").strip()
    oid = str(org_id or "").strip()
    created = int(created_at or 0) or _now_ts()
    finished = int(finished_at or 0)
    state = _normalize_ai_execution_status(status)
    summary = str(output_summary or "").strip()[:500]
    err_msg = str(error_message or "").strip()[:500]
    usage_raw = usage if isinstance(usage, dict) else {}
    usage_safe: Dict[str, Any] = {}
    for key, value in usage_raw.items():
        key_s = str(key or "").strip()
        if not key_s:
            continue
        if isinstance(value, bool):
            usage_safe[key_s] = bool(value)
        elif isinstance(value, int):
            usage_safe[key_s] = int(value)
        elif isinstance(value, float):
            usage_safe[key_s] = float(value)
        elif isinstance(value, str) and len(value) <= 120 and "key" not in key_s.lower() and "secret" not in key_s.lower():
            usage_safe[key_s] = value
    payload = _json_dumps(usage_safe, {})
    _ensure_schema()
    with _connect() as con:
        con.execute(
            """
            INSERT OR REPLACE INTO ai_execution_log (
              execution_id, module_id, actor_user_id, org_id, workspace_id, project_id, session_id,
              provider, model, prompt_id, prompt_version, status, input_hash, output_summary,
              usage_json, latency_ms, error_code, error_message, created_at, finished_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                eid,
                mid,
                actor,
                oid,
                str(workspace_id or "").strip(),
                str(project_id or "").strip(),
                str(session_id or "").strip(),
                str(provider or "").strip(),
                str(model or "").strip(),
                str(prompt_id or "").strip(),
                str(prompt_version or "").strip(),
                state,
                str(input_hash or "").strip(),
                summary,
                payload,
                max(0, int(latency_ms or 0)),
                str(error_code or "").strip()[:120],
                err_msg,
                created,
                max(0, finished),
            ],
        )
        con.commit()
        row = con.execute(
            """
            SELECT execution_id, module_id, actor_user_id, org_id, workspace_id, project_id, session_id,
                   provider, model, prompt_id, prompt_version, status, input_hash, output_summary,
                   usage_json, latency_ms, error_code, error_message, created_at, finished_at
              FROM ai_execution_log
             WHERE execution_id = ?
             LIMIT 1
            """,
            [eid],
        ).fetchone()
    if not row:
        return {"execution_id": eid, "module_id": mid, "status": state, "created_at": created}
    return _ai_execution_log_row_to_dict(row)


def count_ai_execution_log(
    *,
    org_id: str = "",
    module_id: Optional[str] = None,
    status: Optional[str] = None,
    actor_user_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    project_id: Optional[str] = None,
    session_id: Optional[str] = None,
    created_from: Optional[int] = None,
    created_to: Optional[int] = None,
) -> int:
    where, params = _build_ai_execution_log_where(
        org_id=org_id,
        module_id=module_id,
        status=status,
        actor_user_id=actor_user_id,
        workspace_id=workspace_id,
        project_id=project_id,
        session_id=session_id,
        created_from=created_from,
        created_to=created_to,
    )
    _ensure_schema()
    with _connect() as con:
        row = con.execute(f"SELECT COUNT(*) FROM ai_execution_log WHERE {where}", params).fetchone()
    if not row:
        return 0
    try:
        return int(row[0] or 0)
    except Exception:
        return 0


def create_ai_prompt_draft(
    *,
    module_id: str,
    version: str,
    template: str,
    variables_schema: Optional[Dict[str, Any]] = None,
    output_schema: Optional[Dict[str, Any]] = None,
    created_by: str = "",
    scope_level: str = "global",
    scope_id: str = "",
    prompt_id: Optional[str] = None,
    created_at: Optional[int] = None,
) -> Dict[str, Any]:
    mid = str(module_id or "").strip()
    ver = str(version or "").strip()
    body = str(template or "")
    if not mid or not ver or not body.strip():
        raise ValueError("module_id, version and template are required")
    level = _normalize_ai_prompt_scope_level(scope_level)
    sid = str(scope_id or "").strip()
    if level == "global":
        sid = ""
    pid = str(prompt_id or "").strip() or f"ai_prompt_{uuid.uuid4().hex[:16]}"
    now = int(created_at or 0) or _now_ts()
    variables_payload = _json_dumps(variables_schema if isinstance(variables_schema, dict) else {}, {})
    output_payload = _json_dumps(output_schema if isinstance(output_schema, dict) else {}, {})
    actor = str(created_by or "").strip()
    _ensure_schema()
    with _connect() as con:
        con.execute(
            """
            INSERT INTO ai_prompt_versions (
              prompt_id, module_id, version, status, scope_level, scope_id, template,
              variables_schema_json, output_schema_json, created_by, created_at, updated_by, updated_at,
              activated_at, archived_at
            ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
            """,
            [pid, mid, ver, level, sid, body, variables_payload, output_payload, actor, now, actor, now],
        )
        con.commit()
        row = con.execute(
            """
            SELECT prompt_id, module_id, version, status, scope_level, scope_id, template,
                   variables_schema_json, output_schema_json, created_by, created_at, updated_by, updated_at,
                   activated_at, archived_at
              FROM ai_prompt_versions
             WHERE prompt_id = ?
             LIMIT 1
            """,
            [pid],
        ).fetchone()
    if not row:
        return {"prompt_id": pid, "module_id": mid, "version": ver, "status": "draft"}
    return _ai_prompt_version_row_to_dict(row)


def get_agent_conversation(conversation_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a single conversation with aggregations for admin detail."""
    _ensure_agent_tables()
    cid = str(conversation_id or "").strip()
    if not cid:
        return None
    now_ts = _now_ts()

    with _connect() as con:
        row = con.execute(
            """
            SELECT
                c.*,
                COUNT(t.id) AS turn_count,
                COALESCE(MIN(t.created_at), c.created_at) AS first_activity_at,
                COALESCE((
                    SELECT SUM(prompt_tokens + completion_tokens)
                    FROM llm_usage
                    WHERE session_id = c.session_id
                ), 0) AS total_tokens,
                COALESCE((
                    SELECT COUNT(*)
                    FROM agent_pending_edits
                    WHERE session_id = c.session_id AND status = 'applied'
                ), 0) AS applied_count,
                COALESCE((
                    SELECT COUNT(*)
                    FROM agent_pending_edits
                    WHERE session_id = c.session_id AND status = 'rejected'
                ), 0) AS rejected_count
            FROM agent_conversations c
            LEFT JOIN agent_turns t ON t.conversation_id = c.id
            WHERE c.id = ?
            GROUP BY c.id
            LIMIT 1
            """,
            [cid],
        ).fetchone()
    return _conversation_row_to_dict(row, now_ts) if row else None


def get_ai_prompt_version(prompt_id: str) -> Optional[Dict[str, Any]]:
    pid = str(prompt_id or "").strip()
    if not pid:
        return None
    _ensure_schema()
    with _connect() as con:
        row = con.execute(
            """
            SELECT prompt_id, module_id, version, status, scope_level, scope_id, template,
                   variables_schema_json, output_schema_json, created_by, created_at, updated_by, updated_at,
                   activated_at, archived_at
              FROM ai_prompt_versions
             WHERE prompt_id = ?
             LIMIT 1
            """,
            [pid],
        ).fetchone()
    return _ai_prompt_version_row_to_dict(row) if row else None


def list_agent_conversation_turns(
    conversation_id: str,
    *,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    """Return turns for a conversation, newest last."""
    _ensure_agent_tables()
    cid = str(conversation_id or "").strip()
    lim = max(1, min(int(limit or 200), 1000))
    if not cid:
        return []

    with _connect() as con:
        rows = con.execute(
            """
            SELECT
                id,
                role,
                content_json,
                action,
                action_payload_json,
                usage_json,
                created_at
            FROM agent_turns
            WHERE conversation_id = ?
            ORDER BY created_at ASC, id ASC
            LIMIT ?
            """,
            [cid, lim],
        ).fetchall()

    out: List[Dict[str, Any]] = []
    for row in rows:
        content = _json_loads(row["content_json"], {})
        action_payload = _json_loads(row["action_payload_json"], {})
        usage = _json_loads(row["usage_json"], {})
        text = str(content.get("text") or "").strip()
        out.append({
            "id": str(row["id"]),
            "role": str(row["role"]),
            "text": text,
            "action": str(row["action"]) if row["action"] else None,
            "action_payload": action_payload,
            "usage": usage,
            "created_at": int(row["created_at"] or 0),
            "truncated": len(text) > 500,
        })
    return out


def list_agent_conversations(
    org_id: str,
    *,
    user_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Tuple[List[Dict[str, Any]], int]:
    """List agent conversations for admin observability.

    Returns (items, total_count). Each item includes aggregated turn count,
    first/last activity, token usage from llm_usage, applied/rejected edit
    counts, and computed active/closed status.
    """
    _ensure_agent_tables()
    oid = str(org_id or "").strip()
    uid = str(user_id or "").strip()
    lim = max(1, min(int(limit or 50), 200))
    off = max(0, int(offset or 0))
    now_ts = _now_ts()

    params: List[Any] = [oid]
    user_clause = ""
    if uid:
        user_clause = " AND c.user_id = ? "
        params.append(uid)

    with _connect() as con:
        total_row = con.execute(
            f"""
            SELECT COUNT(*) AS cnt
            FROM agent_conversations c
            WHERE c.org_id = ? {user_clause}
            """,
            params,
        ).fetchone()
        total = int(total_row["cnt"] or 0) if total_row else 0

        rows = con.execute(
            f"""
            SELECT
                c.*,
                COUNT(t.id) AS turn_count,
                COALESCE(MIN(t.created_at), c.created_at) AS first_activity_at,
                COALESCE((
                    SELECT SUM(prompt_tokens + completion_tokens)
                    FROM llm_usage
                    WHERE session_id = c.session_id
                ), 0) AS total_tokens,
                COALESCE((
                    SELECT COUNT(*)
                    FROM agent_pending_edits
                    WHERE session_id = c.session_id AND status = 'applied'
                ), 0) AS applied_count,
                COALESCE((
                    SELECT COUNT(*)
                    FROM agent_pending_edits
                    WHERE session_id = c.session_id AND status = 'rejected'
                ), 0) AS rejected_count
            FROM agent_conversations c
            LEFT JOIN agent_turns t ON t.conversation_id = c.id
            WHERE c.org_id = ? {user_clause}
            GROUP BY c.id
            ORDER BY c.updated_at DESC, c.id DESC
            LIMIT ? OFFSET ?
            """,
            params + [lim, off],
        ).fetchall()

    return [_conversation_row_to_dict(row, now_ts) for row in rows], total


def list_ai_execution_log(
    *,
    org_id: str = "",
    module_id: Optional[str] = None,
    status: Optional[str] = None,
    actor_user_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    project_id: Optional[str] = None,
    session_id: Optional[str] = None,
    created_from: Optional[int] = None,
    created_to: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    lim = max(1, min(int(limit or 50), 200))
    off = max(0, int(offset or 0))
    where, params = _build_ai_execution_log_where(
        org_id=org_id,
        module_id=module_id,
        status=status,
        actor_user_id=actor_user_id,
        workspace_id=workspace_id,
        project_id=project_id,
        session_id=session_id,
        created_from=created_from,
        created_to=created_to,
    )
    _ensure_schema()
    with _connect() as con:
        rows = con.execute(
            f"""
            SELECT execution_id, module_id, actor_user_id, org_id, workspace_id, project_id, session_id,
                   provider, model, prompt_id, prompt_version, status, input_hash, output_summary,
                   usage_json, latency_ms, error_code, error_message, created_at, finished_at
              FROM ai_execution_log
             WHERE {where}
             ORDER BY created_at DESC, execution_id DESC
             LIMIT ?
            OFFSET ?
            """,
            [*params, lim, off],
        ).fetchall()
    return [_ai_execution_log_row_to_dict(row) for row in rows]


def update_agent_conversation_summary(conversation_id: str, summary: str) -> None:
    """Persist generated summary for a closed conversation."""
    _ensure_agent_tables()
    cid = str(conversation_id or "").strip()
    if not cid:
        return
    with _connect() as con:
        con.execute(
            "UPDATE agent_conversations SET summary = ? WHERE id = ?",
            [str(summary or "").strip() or None, cid],
        )
        con.commit()

from ..audit_telemetry.repository import _normalize_ai_execution_status
from ..compat.repository import _ai_execution_log_row_to_dict
from ..compat.repository import _ai_prompt_version_row_to_dict
from ..compat.repository import _connect
from ..compat.repository import _conversation_row_to_dict
from ..compat.repository import _ensure_agent_tables
from ..compat.repository import _ensure_schema
from ..compat.repository import _json_dumps
from ..compat.repository import _json_loads
from ..compat.repository import _now_ts
