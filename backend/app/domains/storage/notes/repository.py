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
from app.db import get_db_runtime_config, redact_database_url
from app.models import Project, Session
from app.session_status import derive_session_status
logger = logging.getLogger(__name__)
try:
    import psycopg
    from psycopg.errors import IntegrityError as PsycopgIntegrityError
    from psycopg_pool import ConnectionPool
except Exception:
    psycopg = None
    PsycopgIntegrityError = None
    ConnectionPool = None

def _apply_note_thread_read_state(
    thread: Dict[str, Any],
    comments: Iterable[Mapping[str, Any]],
    *,
    viewer_user_id: Optional[str],
    last_read_at: Any = 0,
) -> Dict[str, Any]:
    viewer = str(viewer_user_id or "").strip()
    read_at = int(last_read_at or 0)
    info = _latest_note_comment_info(comments)
    unread = 0
    if viewer:
        for comment in comments or []:
            created_at = int(comment.get("created_at") or 0)
            author = str(comment.get("author_user_id") or "").strip()
            if created_at > read_at and author != viewer:
                unread += 1
    thread["unread_count"] = int(unread)
    thread["last_read_at"] = read_at if viewer else 0
    thread["last_comment_at"] = int(info.get("last_comment_at") or 0)
    thread["last_comment_author_user_id"] = str(info.get("last_comment_author_user_id") or "")
    return thread


def _attention_count_case(table_ref: str, viewer_user_id: Optional[str]) -> tuple[str, List[Any]]:
    viewer = str(viewer_user_id or "").strip()
    if not viewer:
        return f"SUM(CASE WHEN {table_ref}.requires_attention = 1 THEN 1 ELSE 0 END) AS attention_discussions_count", []
    return (
        f"""
              SUM(CASE
                WHEN {table_ref}.requires_attention = 1
                  AND NOT EXISTS (
                    SELECT 1
                    FROM note_thread_attention_acknowledgements nta
                    WHERE nta.thread_id = {table_ref}.id
                      AND nta.org_id = {table_ref}.org_id
                      AND nta.user_id = ?
                  )
                THEN 1 ELSE 0
              END) AS attention_discussions_count
        """,
        [viewer],
    )


def _insert_note_comment_mentions(
    con: Any,
    *,
    org_id: str,
    session_id: str,
    thread_id: str,
    comment_id: str,
    actor_user_id: str,
    created_at: int,
    mention_targets: Optional[Iterable[Mapping[str, Any]]] = None,
) -> None:
    oid = str(org_id or "").strip() or _default_org_id()
    sid = str(session_id or "").strip()
    tid = str(thread_id or "").strip()
    cid = str(comment_id or "").strip()
    actor = str(actor_user_id or "").strip()
    if not tid or not cid:
        return
    for target in _normalize_mention_targets(mention_targets):
        con.execute(
            """
            INSERT INTO note_comment_mentions (
              id, org_id, session_id, thread_id, comment_id, mentioned_user_id,
              mentioned_label, created_by, created_at, acknowledged_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            [
                uuid.uuid4().hex[:12],
                oid,
                sid,
                tid,
                cid,
                target["user_id"],
                target["label"],
                actor,
                int(created_at or _now_ts()),
            ],
        )


def _latest_note_comment_info(comments: Iterable[Mapping[str, Any]]) -> Dict[str, Any]:
    latest_at = 0
    latest_id = ""
    latest_author = ""
    for comment in comments or []:
        comment_id = str(comment.get("id") or "").strip()
        created_at = int(comment.get("created_at") or 0)
        if created_at > latest_at or (created_at == latest_at and comment_id > latest_id):
            latest_at = created_at
            latest_id = comment_id
            latest_author = str(comment.get("author_user_id") or "").strip()
    return {
        "last_comment_at": latest_at,
        "last_seen_comment_id": latest_id,
        "last_comment_author_user_id": latest_author,
    }


def _normalize_mention_targets(mention_targets: Optional[Iterable[Mapping[str, Any]]]) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    seen: set[str] = set()
    for item in mention_targets or []:
        if not isinstance(item, Mapping):
            continue
        user_id = str(item.get("user_id") or item.get("id") or "").strip()
        if not user_id or user_id in seen:
            continue
        seen.add(user_id)
        label = str(item.get("label") or item.get("email") or user_id).strip() or user_id
        out.append({"user_id": user_id, "label": label})
    return out


def _notes_aggregate_payload(count: Any, attention_count: Any = 0, personal_count: Any = 0) -> Dict[str, Any]:
    try:
        value = int(count or 0)
    except Exception:
        value = 0
    if value < 0:
        value = 0
    try:
        attention_value = int(attention_count or 0)
    except Exception:
        attention_value = 0
    if attention_value < 0:
        attention_value = 0
    try:
        personal_value = int(personal_count or 0)
    except Exception:
        personal_value = 0
    if personal_value < 0:
        personal_value = 0
    return {
        "open_notes_count": value,
        "has_open_notes": value > 0,
        "attention_discussions_count": attention_value,
        "has_attention_discussions": attention_value > 0,
        "personal_discussions_count": personal_value,
        "has_personal_discussions": personal_value > 0,
    }


def _personal_discussion_count_case(table_ref: str, viewer_user_id: Optional[str]) -> tuple[str, List[Any]]:
    viewer = str(viewer_user_id or "").strip()
    if not viewer:
        return "0 AS personal_discussions_count", []
    return (
        f"""
              SUM(CASE
                WHEN {table_ref}.status = 'open'
                  AND {table_ref}.requires_attention = 1
                  AND {table_ref}.created_by = ?
                  AND NOT EXISTS (
                    SELECT 1
                    FROM note_thread_attention_acknowledgements nta
                    WHERE nta.thread_id = {table_ref}.id
                      AND nta.org_id = {table_ref}.org_id
                      AND nta.user_id = ?
                  )
                THEN 1 ELSE 0
              END) AS personal_discussions_count
        """,
        [viewer, viewer],
    )


def _upsert_note_thread_read(
    con: Any,
    *,
    thread_id: str,
    user_id: str,
    last_read_at: int,
    last_seen_comment_id: str = "",
) -> None:
    tid = str(thread_id or "").strip()
    uid = str(user_id or "").strip()
    if not tid or not uid:
        return
    now = _now_ts()
    con.execute(
        """
        INSERT INTO note_thread_reads (thread_id, user_id, last_read_at, last_seen_comment_id, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(thread_id, user_id) DO UPDATE SET
          last_read_at = CASE
            WHEN excluded.last_read_at > note_thread_reads.last_read_at THEN excluded.last_read_at
            ELSE note_thread_reads.last_read_at
          END,
          last_seen_comment_id = CASE
            WHEN excluded.last_read_at >= note_thread_reads.last_read_at THEN excluded.last_seen_comment_id
            ELSE note_thread_reads.last_seen_comment_id
          END,
          updated_at = excluded.updated_at
        """,
        [tid, uid, int(last_read_at or 0), str(last_seen_comment_id or ""), now],
    )


def acknowledge_note_mention(
    mention_id: str,
    *,
    actor_user_id: str,
    org_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    _ensure_schema()
    mid = str(mention_id or "").strip()
    actor = str(actor_user_id or "").strip()
    if not mid or not actor:
        return None
    oid = str(org_id or "").strip()
    filters = ["id = ?", "mentioned_user_id = ?"]
    params: List[Any] = [mid, actor]
    if oid:
        filters.append("org_id = ?")
        params.append(oid)
    now = _now_ts()
    with _connect() as con:
        row = con.execute(
            f"SELECT * FROM note_comment_mentions WHERE {' AND '.join(filters)} LIMIT 1",
            params,
        ).fetchone()
        if not row:
            return None
        if int(_row_value(row, "acknowledged_at", 0) or 0) <= 0:
            con.execute(
                "UPDATE note_comment_mentions SET acknowledged_at = ? WHERE id = ?",
                [now, mid],
            )
            con.commit()
        refreshed = con.execute("SELECT * FROM note_comment_mentions WHERE id = ? LIMIT 1", [mid]).fetchone()
    return _note_mention_row_to_dict(refreshed) if refreshed else None


def acknowledge_note_thread_attention(
    thread_id: str,
    *,
    actor_user_id: str,
    org_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    _ensure_schema()
    tid = str(thread_id or "").strip()
    actor = str(actor_user_id or "").strip()
    if not tid or not actor:
        return None
    oid = str(org_id or "").strip()
    filters = ["id = ?", "deleted_at = 0"]
    params: List[Any] = [tid]
    if oid:
        filters.append("org_id = ?")
        params.append(oid)
    now = _now_ts()
    with _connect() as con:
        thread_row = con.execute(
            f"SELECT * FROM note_threads WHERE {' AND '.join(filters)} LIMIT 1",
            params,
        ).fetchone()
        if not thread_row:
            return None
        row_org_id = str(_row_value(thread_row, "org_id") or "").strip() or _default_org_id()
        con.execute(
            """
            DELETE FROM note_thread_attention_acknowledgements
            WHERE thread_id = ? AND org_id = ? AND user_id = ?
            """,
            [tid, row_org_id, actor],
        )
        if bool(int(_row_value(thread_row, "requires_attention") or 0)):
            con.execute(
                """
                INSERT INTO note_thread_attention_acknowledgements (org_id, thread_id, user_id, acknowledged_at)
                VALUES (?, ?, ?, ?)
                """,
                [row_org_id, tid, actor, now],
            )
        con.commit()
    return get_note_thread(tid, org_id=oid or None, viewer_user_id=actor)


def add_note_comment(
    thread_id: str,
    *,
    body: Any,
    mention_targets: Optional[Iterable[Mapping[str, Any]]] = None,
    reply_to_comment_id: Any = "",
    actor_user_id: str,
    org_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    _ensure_schema()
    text = str(body or "").strip()
    if not text:
        raise ValueError("body required")
    tid = str(thread_id or "").strip()
    if not tid:
        return None
    oid = str(org_id or "").strip()
    filters = ["id = ?"]
    params: List[Any] = [tid]
    if oid:
        filters.append("org_id = ?")
        params.append(oid)
    actor = str(actor_user_id or "").strip()
    reply_to_id = str(reply_to_comment_id or "").strip()
    now = _now_ts()
    comment_id = uuid.uuid4().hex[:12]
    filters.append("deleted_at = 0")
    with _connect() as con:
        thread_row = con.execute(
            f"SELECT id, session_id, org_id FROM note_threads WHERE {' AND '.join(filters)} LIMIT 1",
            params,
        ).fetchone()
        if not thread_row:
            return None
        if reply_to_id:
            reply_row = con.execute(
                "SELECT id, thread_id FROM note_comments WHERE id = ? AND deleted_at = 0 LIMIT 1",
                [reply_to_id],
            ).fetchone()
            if not reply_row:
                raise LookupError("reply target not found")
            if str(_row_value(reply_row, "thread_id") or "").strip() != tid:
                raise ValueError("reply target must belong to the same thread")
        con.execute(
            """
            INSERT INTO note_comments (id, thread_id, author_user_id, body, reply_to_comment_id, created_at, updated_at, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [comment_id, tid, actor, text, reply_to_id, now, now, actor],
        )
        _insert_note_comment_mentions(
            con,
            org_id=str(_row_value(thread_row, "org_id") or oid or _default_org_id()),
            session_id=str(_row_value(thread_row, "session_id") or ""),
            thread_id=tid,
            comment_id=comment_id,
            actor_user_id=actor,
            created_at=now,
            mention_targets=mention_targets,
        )
        _upsert_note_thread_read(
            con,
            thread_id=tid,
            user_id=actor,
            last_read_at=now,
            last_seen_comment_id=comment_id,
        )
        con.execute("UPDATE note_threads SET updated_at = ?, updated_by = ? WHERE id = ?", [now, actor, tid])
        con.commit()
    return get_note_thread(tid, org_id=oid or None, viewer_user_id=actor)


def create_note_thread(
    sess: Session,
    *,
    scope_type: Any,
    scope_ref: Any,
    body: Any,
    priority: Any = "normal",
    requires_attention: Any = False,
    mention_targets: Optional[Iterable[Mapping[str, Any]]] = None,
    actor_user_id: str,
    org_id: Optional[str] = None,
) -> Dict[str, Any]:
    _ensure_schema()
    text = str(body or "").strip()
    if not text:
        raise ValueError("body required")
    normalized_scope_type, normalized_scope_ref = _normalize_note_scope(scope_type, scope_ref)
    normalized_priority = _normalize_note_priority(priority)
    normalized_requires_attention = _normalize_bool_flag(requires_attention, field_name="requires_attention")
    sid = str(getattr(sess, "id", "") or "").strip()
    if not sid:
        raise ValueError("session_id required")
    oid = str(org_id or getattr(sess, "org_id", "") or "").strip() or _default_org_id()
    project_id = str(getattr(sess, "project_id", "") or "").strip()
    actor = str(actor_user_id or "").strip()
    now = _now_ts()
    thread_id = uuid.uuid4().hex[:12]
    comment_id = uuid.uuid4().hex[:12]
    with _connect() as con:
        workspace_id = _project_workspace_id_for_session(con, sess, oid)
        con.execute(
            """
            INSERT INTO note_threads (
              id, org_id, workspace_id, project_id, session_id, scope_type, scope_ref_json,
              status, priority, requires_attention, created_by, created_at, updated_at, updated_by, resolved_by, resolved_at, deleted_at, deleted_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, '', 0, 0, '')
            """,
            [
                thread_id,
                oid,
                workspace_id,
                project_id,
                sid,
                normalized_scope_type,
                _json_dumps(normalized_scope_ref, {}),
                normalized_priority,
                1 if normalized_requires_attention else 0,
                actor,
                now,
                now,
                actor,
            ],
        )
        con.execute(
            """
            INSERT INTO note_comments (id, thread_id, author_user_id, body, created_at, updated_at, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [comment_id, thread_id, actor, text, now, now, actor],
        )
        _insert_note_comment_mentions(
            con,
            org_id=oid,
            session_id=sid,
            thread_id=thread_id,
            comment_id=comment_id,
            actor_user_id=actor,
            created_at=now,
            mention_targets=mention_targets,
        )
        _upsert_note_thread_read(
            con,
            thread_id=thread_id,
            user_id=actor,
            last_read_at=now,
            last_seen_comment_id=comment_id,
        )
        con.commit()
    thread = get_note_thread(thread_id, org_id=oid, viewer_user_id=actor)
    if not thread:
        raise RuntimeError("note thread was not persisted")
    return thread


def delete_note_comment(
    comment_id: str,
    *,
    actor_user_id: str,
    org_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    _ensure_schema()
    cid = str(comment_id or "").strip()
    actor = str(actor_user_id or "").strip()
    if not cid or not actor:
        return None
    oid = str(org_id or "").strip()
    filters = ["c.id = ?", "c.deleted_at = 0", "t.deleted_at = 0"]
    params: List[Any] = [cid]
    if oid:
        filters.append("t.org_id = ?")
        params.append(oid)
    now = _now_ts()
    with _connect() as con:
        row = con.execute(
            f"""
            SELECT c.id, c.thread_id
            FROM note_comments c
            JOIN note_threads t ON t.id = c.thread_id
            WHERE {' AND '.join(filters)}
            LIMIT 1
            """,
            params,
        ).fetchone()
        if not row:
            return None
        tid = str(_row_value(row, "thread_id") or "").strip()
        con.execute(
            """
            UPDATE note_comments
               SET updated_at = ?, updated_by = ?, deleted_at = ?, deleted_by = ?
             WHERE id = ? AND deleted_at = 0
            """,
            [now, actor, now, actor, cid],
        )
        if tid:
            con.execute(
                "UPDATE note_threads SET updated_at = ?, updated_by = ? WHERE id = ?",
                [now, actor, tid],
            )
        con.commit()
    return {"comment_id": cid, "thread_id": tid, "deleted_at": now, "deleted_by": actor}


def delete_note_thread(
    thread_id: str,
    *,
    actor_user_id: str,
    org_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    _ensure_schema()
    tid = str(thread_id or "").strip()
    actor = str(actor_user_id or "").strip()
    if not tid or not actor:
        return None
    oid = str(org_id or "").strip()
    filters = ["id = ?", "deleted_at = 0"]
    params: List[Any] = [tid]
    if oid:
        filters.append("org_id = ?")
        params.append(oid)
    now = _now_ts()
    with _connect() as con:
        thread_row = con.execute(
            f"SELECT id FROM note_threads WHERE {' AND '.join(filters)} LIMIT 1",
            params,
        ).fetchone()
        if not thread_row:
            return None
        con.execute(
            """
            UPDATE note_threads
               SET updated_at = ?, updated_by = ?, deleted_at = ?, deleted_by = ?
             WHERE id = ?
            """,
            [now, actor, now, actor, tid],
        )
        con.execute(
            """
            UPDATE note_comments
               SET updated_at = ?, updated_by = ?, deleted_at = ?, deleted_by = ?
             WHERE thread_id = ? AND deleted_at = 0
            """,
            [now, actor, now, actor, tid],
        )
        con.commit()
    return {"thread_id": tid, "deleted_at": now, "deleted_by": actor}


def get_note_comment(comment_id: str, *, org_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    _ensure_schema()
    cid = str(comment_id or "").strip()
    if not cid:
        return None
    oid = str(org_id or "").strip()
    filters = ["c.id = ?"]
    params: List[Any] = [cid]
    if oid:
        filters.append("t.org_id = ?")
        params.append(oid)
    with _connect() as con:
        row = con.execute(
            f"""
            SELECT c.*, t.org_id AS thread_org_id, t.session_id AS session_id
            FROM note_comments c
            JOIN note_threads t ON t.id = c.thread_id
            WHERE {' AND '.join(filters)}
              AND c.deleted_at = 0
              AND t.deleted_at = 0
            LIMIT 1
            """,
            params,
        ).fetchone()
    if not row:
        return None
    comment = _note_comment_row_to_dict(row)
    comment["org_id"] = str(_row_value(row, "thread_org_id") or oid or "")
    comment["session_id"] = str(_row_value(row, "session_id") or "")
    return comment


def get_note_thread(
    thread_id: str,
    *,
    org_id: Optional[str] = None,
    viewer_user_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    _ensure_schema()
    tid = str(thread_id or "").strip()
    if not tid:
        return None
    oid = str(org_id or "").strip()
    filters = ["id = ?"]
    params: List[Any] = [tid]
    if oid:
        filters.append("org_id = ?")
        params.append(oid)
    with _connect() as con:
        filters.append("deleted_at = 0")
        thread_row = con.execute(
            f"SELECT * FROM note_threads WHERE {' AND '.join(filters)} LIMIT 1",
            params,
        ).fetchone()
        if not thread_row:
            return None
        row_org_id = str(_row_value(thread_row, "org_id") or "").strip()
        acknowledged_at = _thread_attention_acknowledged_at(con, tid, row_org_id, viewer_user_id)
        comment_rows = con.execute(
            "SELECT * FROM note_comments WHERE thread_id = ? AND deleted_at = 0 ORDER BY created_at ASC, id ASC",
            [tid],
        ).fetchall()
        comment_ids = [str(_row_value(row, "id") or "") for row in comment_rows]
        mention_rows: Dict[str, List[Dict[str, Any]]] = {cid: [] for cid in comment_ids if cid}
        if comment_ids:
            placeholders = ", ".join(["?"] * len(comment_ids))
            for row in con.execute(
                f"SELECT * FROM note_comment_mentions WHERE comment_id IN ({placeholders}) ORDER BY created_at ASC, id ASC",
                comment_ids,
            ).fetchall():
                mention = _note_mention_row_to_dict(row)
                mention_rows.setdefault(str(mention.get("comment_id") or ""), []).append(mention)
        author_ids = {
            str(_row_value(thread_row, "created_by") or "").strip(),
            str(_row_value(thread_row, "resolved_by") or "").strip(),
            *[str(_row_value(row, "author_user_id") or "").strip() for row in comment_rows],
        }
        profiles_by_id = _auth_user_profiles_by_id_with_connection(con, author_ids)
        read_at = 0
        viewer = str(viewer_user_id or "").strip()
        if viewer:
            read_row = con.execute(
                """
                SELECT last_read_at
                FROM note_thread_reads
                WHERE thread_id = ? AND user_id = ?
                LIMIT 1
                """,
                [tid, viewer],
            ).fetchone()
            read_at = int(_row_value(read_row, "last_read_at", 0) or 0)
    thread = _note_thread_row_to_dict(thread_row, attention_acknowledged_at=acknowledged_at)
    comments = []
    for row in comment_rows:
        comment = _note_comment_row_to_dict(row)
        comment["mentions"] = mention_rows.get(str(comment.get("id") or ""), [])
        comments.append(comment)
    thread["comments"] = comments
    thread = _apply_note_thread_read_state(thread, comments, viewer_user_id=viewer_user_id, last_read_at=read_at)
    thread = _apply_note_author_profiles(thread, profiles_by_id)
    thread["comments"] = _apply_note_comment_reply_summaries(thread.get("comments") or [], profiles_by_id)
    return thread


def list_active_note_mentions_for_user(
    user_id: str,
    *,
    org_id: Optional[str] = None,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    _ensure_schema()
    uid = str(user_id or "").strip()
    if not uid:
        return []
    oid = str(org_id or "").strip()
    filters = ["m.mentioned_user_id = ?", "m.acknowledged_at = 0"]
    params: List[Any] = [uid]
    if oid:
        filters.append("m.org_id = ?")
        params.append(oid)
    filters.append("nt.deleted_at = 0")
    filters.append("c.deleted_at = 0")
    lim = max(1, min(100, int(limit or 20)))
    with _connect() as con:
        rows = con.execute(
            f"""
            SELECT
              m.*,
              nt.project_id AS thread_project_id,
              nt.status AS thread_status,
              nt.scope_type AS thread_scope_type,
              nt.scope_ref_json AS thread_scope_ref_json,
              c.body AS comment_body
            FROM note_comment_mentions m
            JOIN note_threads nt ON nt.id = m.thread_id AND nt.org_id = m.org_id
            JOIN note_comments c ON c.id = m.comment_id AND c.deleted_at = 0
            WHERE {' AND '.join(filters)}
            ORDER BY m.created_at DESC, m.id DESC
            LIMIT ?
            """,
            [*params, lim],
        ).fetchall()
    out: List[Dict[str, Any]] = []
    for row in rows:
        item = _note_mention_row_to_dict(row)
        item["project_id"] = str(_row_value(row, "thread_project_id") or "")
        item["thread_status"] = str(_row_value(row, "thread_status") or "open")
        item["thread_scope_type"] = str(_row_value(row, "thread_scope_type") or "")
        item["thread_scope_ref"] = _json_loads(_row_value(row, "thread_scope_ref_json"), {})
        item["comment_body"] = str(_row_value(row, "comment_body") or "")
        out.append(item)
    return out


def list_note_notifications_for_user(
    user_id: str,
    *,
    org_id: Optional[str] = None,
    allowed_project_ids: Optional[Iterable[str]] = None,
    limit: int = 20,
    include_read: bool = False,
) -> List[Dict[str, Any]]:
    _ensure_schema()
    uid = str(user_id or "").strip()
    if not uid:
        return []
    oid = str(org_id or "").strip()
    lim = max(1, min(100, int(limit or 20)))
    allowed: Optional[List[str]] = None
    if allowed_project_ids is not None:
        seen: set[str] = set()
        allowed = []
        for raw in allowed_project_ids or []:
            pid = str(raw or "").strip()
            if pid and pid not in seen:
                seen.add(pid)
                allowed.append(pid)
        if not allowed:
            return []

    filters = ["nt.org_id = ?"] if oid else []
    params: List[Any] = [oid] if oid else []
    if allowed is not None:
        placeholders = ", ".join(["?"] * len(allowed))
        filters.append(f"nt.project_id IN ({placeholders})")
        params.extend(allowed)
    filters.append("nt.deleted_at = 0")
    where = f"WHERE {' AND '.join(filters)}" if filters else ""

    with _connect() as con:
        rows = con.execute(
            f"""
            WITH base AS (
              SELECT
                nt.id AS thread_id,
                nt.org_id AS org_id,
                nt.workspace_id AS workspace_id,
                nt.project_id AS project_id,
                nt.session_id AS session_id,
                nt.scope_type AS scope_type,
                nt.scope_ref_json AS scope_ref_json,
                nt.status AS status,
                nt.requires_attention AS requires_attention,
                nt.created_at AS thread_created_at,
                nt.updated_at AS thread_updated_at,
                COALESCE(ntr.last_read_at, 0) AS last_read_at,
                COALESCE(s.title, nt.session_id) AS session_title,
                COALESCE(p.title, nt.project_id) AS project_title
              FROM note_threads nt
              JOIN sessions s ON s.id = nt.session_id AND s.org_id = nt.org_id
              LEFT JOIN projects p ON p.id = nt.project_id AND p.org_id = nt.org_id
              LEFT JOIN note_thread_reads ntr ON ntr.thread_id = nt.id AND ntr.user_id = ?
              {where}
            ),
            feed AS (
              SELECT
                b.*,
                (
                  SELECT COUNT(*)
                  FROM note_comment_mentions m
                  WHERE m.thread_id = b.thread_id
                    AND m.org_id = b.org_id
                    AND m.mentioned_user_id = ?
                    AND m.acknowledged_at = 0
                ) AS mention_count,
                COALESCE(
                  (
                    SELECT m.id
                    FROM note_comment_mentions m
                    WHERE m.thread_id = b.thread_id
                      AND m.org_id = b.org_id
                      AND m.mentioned_user_id = ?
                      AND m.acknowledged_at = 0
                    ORDER BY m.created_at DESC, m.id DESC
                    LIMIT 1
                  ),
                  ''
                ) AS selected_mention_id,
                CASE
                  WHEN b.status = 'open'
                    AND b.requires_attention = 1
                    AND NOT EXISTS (
                      SELECT 1
                      FROM note_thread_attention_acknowledgements nta
                      WHERE nta.thread_id = b.thread_id
                        AND nta.org_id = b.org_id
                        AND nta.user_id = ?
                    )
                  THEN 1 ELSE 0
                END AS attention_count,
                (
                  SELECT COUNT(*)
                  FROM note_comments c
                  WHERE c.thread_id = b.thread_id AND c.deleted_at = 0
                    AND c.created_at > b.last_read_at
                    AND c.author_user_id != ?
                ) AS unread_count,
                COALESCE(
                  (
                    SELECT c.id
                    FROM note_comment_mentions m
                    JOIN note_comments c ON c.id = m.comment_id AND c.deleted_at = 0
                    WHERE m.thread_id = b.thread_id
                      AND m.org_id = b.org_id
                      AND m.mentioned_user_id = ?
                      AND m.acknowledged_at = 0
                    ORDER BY m.created_at DESC, m.id DESC
                    LIMIT 1
                  ),
                  (
                    SELECT c.id
                    FROM note_comments c
                    WHERE c.thread_id = b.thread_id AND c.deleted_at = 0
                      AND c.created_at > b.last_read_at
                      AND c.author_user_id != ?
                    ORDER BY c.created_at DESC, c.id DESC
                    LIMIT 1
                  ),
                  (
                    SELECT c.id
                    FROM note_comments c
                    WHERE c.thread_id = b.thread_id AND c.deleted_at = 0
                    ORDER BY c.created_at DESC, c.id DESC
                    LIMIT 1
                  )
                ) AS selected_comment_id,
                COALESCE(
                  (
                    SELECT c.body
                    FROM note_comment_mentions m
                    JOIN note_comments c ON c.id = m.comment_id AND c.deleted_at = 0
                    WHERE m.thread_id = b.thread_id
                      AND m.org_id = b.org_id
                      AND m.mentioned_user_id = ?
                      AND m.acknowledged_at = 0
                    ORDER BY m.created_at DESC, m.id DESC
                    LIMIT 1
                  ),
                  (
                    SELECT c.body
                    FROM note_comments c
                    WHERE c.thread_id = b.thread_id AND c.deleted_at = 0
                      AND c.created_at > b.last_read_at
                      AND c.author_user_id != ?
                    ORDER BY c.created_at DESC, c.id DESC
                    LIMIT 1
                  ),
                  (
                    SELECT c.body
                    FROM note_comments c
                    WHERE c.thread_id = b.thread_id AND c.deleted_at = 0
                    ORDER BY c.created_at DESC, c.id DESC
                    LIMIT 1
                  ),
                  ''
                ) AS selected_comment_body,
                COALESCE(
                  (
                    SELECT c.author_user_id
                    FROM note_comment_mentions m
                    JOIN note_comments c ON c.id = m.comment_id AND c.deleted_at = 0
                    WHERE m.thread_id = b.thread_id
                      AND m.org_id = b.org_id
                      AND m.mentioned_user_id = ?
                      AND m.acknowledged_at = 0
                    ORDER BY m.created_at DESC, m.id DESC
                    LIMIT 1
                  ),
                  (
                    SELECT c.author_user_id
                    FROM note_comments c
                    WHERE c.thread_id = b.thread_id AND c.deleted_at = 0
                      AND c.created_at > b.last_read_at
                      AND c.author_user_id != ?
                    ORDER BY c.created_at DESC, c.id DESC
                    LIMIT 1
                  ),
                  (
                    SELECT c.author_user_id
                    FROM note_comments c
                    WHERE c.thread_id = b.thread_id AND c.deleted_at = 0
                    ORDER BY c.created_at DESC, c.id DESC
                    LIMIT 1
                  ),
                  ''
                ) AS selected_author_user_id,
                COALESCE(
                  (
                    SELECT c.created_at
                    FROM note_comment_mentions m
                    JOIN note_comments c ON c.id = m.comment_id AND c.deleted_at = 0
                    WHERE m.thread_id = b.thread_id
                      AND m.org_id = b.org_id
                      AND m.mentioned_user_id = ?
                      AND m.acknowledged_at = 0
                    ORDER BY m.created_at DESC, m.id DESC
                    LIMIT 1
                  ),
                  (
                    SELECT c.created_at
                    FROM note_comments c
                    WHERE c.thread_id = b.thread_id AND c.deleted_at = 0
                      AND c.created_at > b.last_read_at
                      AND c.author_user_id != ?
                    ORDER BY c.created_at DESC, c.id DESC
                    LIMIT 1
                  ),
                  (
                    SELECT c.created_at
                    FROM note_comments c
                    WHERE c.thread_id = b.thread_id AND c.deleted_at = 0
                    ORDER BY c.created_at DESC, c.id DESC
                    LIMIT 1
                  ),
                  b.thread_updated_at,
                  b.thread_created_at
                ) AS selected_comment_at,
                COALESCE(
                  (
                    SELECT c.created_at
                    FROM note_comments c
                    WHERE c.thread_id = b.thread_id AND c.deleted_at = 0
                    ORDER BY c.created_at DESC, c.id DESC
                    LIMIT 1
                  ),
                  b.thread_updated_at,
                  b.thread_created_at
                ) AS last_comment_at
              FROM base b
            )
            SELECT *
            FROM feed
            WHERE ? = 1
               OR mention_count > 0
               OR attention_count > 0
               OR unread_count > 0
            ORDER BY
              CASE
                WHEN mention_count > 0 THEN 0
                WHEN attention_count > 0 THEN 1
                WHEN unread_count > 0 THEN 2
                ELSE 3
              END ASC,
              COALESCE(last_comment_at, selected_comment_at, thread_updated_at, thread_created_at) DESC,
              thread_id DESC
            LIMIT ?
            """,
            [uid, *params, *([uid] * 12), 1 if include_read else 0, lim],
        ).fetchall()
        author_ids = {
            str(_row_value(row, "selected_author_user_id") or "").strip()
            for row in rows
            if str(_row_value(row, "selected_author_user_id") or "").strip()
        }
        profiles_by_id = _auth_user_profiles_by_id_with_connection(con, author_ids)

    out: List[Dict[str, Any]] = []
    for row in rows:
        mention_count = max(0, int(_row_value(row, "mention_count", 0) or 0))
        attention_count = max(0, int(_row_value(row, "attention_count", 0) or 0))
        unread_count = max(0, int(_row_value(row, "unread_count", 0) or 0))
        reason = "activity"
        if mention_count > 0:
            reason = "mention"
        elif attention_count > 0:
            reason = "attention"
        elif unread_count > 0:
            reason = "unread"
        thread_id = str(_row_value(row, "thread_id") or "")
        session_id = str(_row_value(row, "session_id") or "")
        project_id = str(_row_value(row, "project_id") or "")
        comment_id = str(_row_value(row, "selected_comment_id") or "")
        author_id = str(_row_value(row, "selected_author_user_id") or "")
        profile = profiles_by_id.get(author_id) or {}
        author_display = str(profile.get("full_name") or profile.get("email") or author_id or "").strip()
        scope_ref = _json_loads(_row_value(row, "scope_ref_json"), {})
        item = {
            "id": f"{session_id}:{thread_id}:{comment_id or thread_id}",
            "type": "discussion",
            "reason": reason,
            "session_id": session_id,
            "session_title": str(_row_value(row, "session_title") or session_id or "Сессия"),
            "project_id": project_id,
            "project_title": str(_row_value(row, "project_title") or project_id or "Проект"),
            "thread_id": thread_id,
            "thread_title": _note_thread_title_from_scope(_row_value(row, "scope_type"), scope_ref),
            "mention_id": str(_row_value(row, "selected_mention_id") or ""),
            "comment_id": comment_id,
            "snippet": _note_notification_plain_preview(_row_value(row, "selected_comment_body"), limit=180),
            "author_user_id": author_id,
            "author_display": author_display,
            "created_at": int(_row_value(row, "selected_comment_at", 0) or 0),
            "unread_count": unread_count,
            "mention_count": mention_count,
            "requires_attention": bool(int(_row_value(row, "requires_attention", 0) or 0)),
            "attention_count": attention_count,
            "last_comment_at": int(_row_value(row, "last_comment_at", 0) or 0),
            "target": {
                "project_id": project_id,
                "session_id": session_id,
                "thread_id": thread_id,
                "comment_id": comment_id,
            },
        }
        out.append(item)
    return out


def list_note_threads(
    session_id: str,
    *,
    org_id: Optional[str] = None,
    viewer_user_id: Optional[str] = None,
    status: Optional[str] = None,
    scope_type: Optional[str] = None,
    element_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    _ensure_schema()
    sid = str(session_id or "").strip()
    if not sid:
        return []
    normalized_status = _normalize_note_status(status) if status is not None and str(status or "").strip() else None
    normalized_scope_type = None
    if scope_type is not None and str(scope_type or "").strip():
        normalized_scope_type, _ = _normalize_note_scope(scope_type, {"element_id": "__filter__"} if str(scope_type or "").strip().lower() == "diagram_element" else {})
    filters = ["session_id = ?"]
    params: List[Any] = [sid]
    oid = str(org_id or "").strip()
    if oid:
        filters.append("org_id = ?")
        params.append(oid)
    if normalized_status:
        filters.append("status = ?")
        params.append(normalized_status)
    if normalized_scope_type:
        filters.append("scope_type = ?")
        params.append(normalized_scope_type)
    filters.append("deleted_at = 0")
    with _connect() as con:
        thread_rows = con.execute(
            f"SELECT * FROM note_threads WHERE {' AND '.join(filters)} ORDER BY updated_at DESC, created_at DESC",
            params,
        ).fetchall()
        thread_ids = [str(_row_value(row, "id") or "") for row in thread_rows]
        comment_rows: Dict[str, List[Dict[str, Any]]] = {tid: [] for tid in thread_ids if tid}
        if thread_ids:
            placeholders = ", ".join(["?"] * len(thread_ids))
            for row in con.execute(
                f"SELECT * FROM note_comments WHERE thread_id IN ({placeholders}) AND deleted_at = 0 ORDER BY created_at ASC, id ASC",
                thread_ids,
            ).fetchall():
                comment = _note_comment_row_to_dict(row)
                comment_rows.setdefault(str(comment.get("thread_id") or ""), []).append(comment)
        comment_ids = [
            str(comment.get("id") or "")
            for comments in comment_rows.values()
            for comment in comments
            if str(comment.get("id") or "")
        ]
        mention_rows: Dict[str, List[Dict[str, Any]]] = {cid: [] for cid in comment_ids}
        if comment_ids:
            placeholders = ", ".join(["?"] * len(comment_ids))
            for row in con.execute(
                f"SELECT * FROM note_comment_mentions WHERE comment_id IN ({placeholders}) ORDER BY created_at ASC, id ASC",
                comment_ids,
            ).fetchall():
                mention = _note_mention_row_to_dict(row)
                mention_rows.setdefault(str(mention.get("comment_id") or ""), []).append(mention)
        viewer = str(viewer_user_id or "").strip()
        acknowledgement_rows: Dict[str, int] = {}
        read_rows: Dict[str, int] = {}
        if viewer and thread_ids:
            placeholders = ", ".join(["?"] * len(thread_ids))
            ack_filters = [f"thread_id IN ({placeholders})", "user_id = ?"]
            ack_params: List[Any] = [*thread_ids, viewer]
            if oid:
                ack_filters.append("org_id = ?")
                ack_params.append(oid)
            for row in con.execute(
                f"""
                SELECT thread_id, acknowledged_at
                FROM note_thread_attention_acknowledgements
                WHERE {' AND '.join(ack_filters)}
                """,
                ack_params,
            ).fetchall():
                acknowledgement_rows[str(_row_value(row, "thread_id") or "")] = int(_row_value(row, "acknowledged_at", 0) or 0)
            for row in con.execute(
                f"""
                SELECT thread_id, last_read_at
                FROM note_thread_reads
                WHERE thread_id IN ({placeholders}) AND user_id = ?
                """,
                [*thread_ids, viewer],
            ).fetchall():
                read_rows[str(_row_value(row, "thread_id") or "")] = int(_row_value(row, "last_read_at", 0) or 0)
        author_ids = {
            str(_row_value(row, "created_by") or "").strip()
            for row in thread_rows
        }
        author_ids.update(
            str(_row_value(row, "resolved_by") or "").strip()
            for row in thread_rows
        )
        author_ids.update(
            str(comment.get("author_user_id") or "").strip()
            for comments in comment_rows.values()
            for comment in comments
        )
        profiles_by_id = _auth_user_profiles_by_id_with_connection(con, author_ids)
    element_filter = str(element_id or "").strip()
    out: List[Dict[str, Any]] = []
    for row in thread_rows:
        thread_id = str(_row_value(row, "id") or "")
        thread = _note_thread_row_to_dict(row, attention_acknowledged_at=acknowledgement_rows.get(thread_id, 0))
        if element_filter:
            if thread.get("scope_type") != "diagram_element":
                continue
            scope_ref = thread.get("scope_ref") if isinstance(thread.get("scope_ref"), dict) else {}
            if str(scope_ref.get("element_id") or "").strip() != element_filter:
                continue
        comments = comment_rows.get(str(thread.get("id") or ""), [])
        for comment in comments:
            comment["mentions"] = mention_rows.get(str(comment.get("id") or ""), [])
        thread["comments"] = comments
        thread = _apply_note_thread_read_state(thread, comments, viewer_user_id=viewer_user_id, last_read_at=read_rows.get(thread_id, 0))
        thread = _apply_note_author_profiles(thread, profiles_by_id)
        thread["comments"] = _apply_note_comment_reply_summaries(thread.get("comments") or [], profiles_by_id)
        out.append(thread)
    return out


def mark_note_thread_read(
    thread_id: str,
    *,
    actor_user_id: str,
    org_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    _ensure_schema()
    tid = str(thread_id or "").strip()
    actor = str(actor_user_id or "").strip()
    if not tid or not actor:
        return None
    oid = str(org_id or "").strip()
    filters = ["id = ?", "deleted_at = 0"]
    params: List[Any] = [tid]
    if oid:
        filters.append("org_id = ?")
        params.append(oid)
    filters.append("deleted_at = 0")
    with _connect() as con:
        thread_row = con.execute(
            f"SELECT id FROM note_threads WHERE {' AND '.join(filters)} LIMIT 1",
            params,
        ).fetchone()
        if not thread_row:
            return None
        comment_rows = con.execute(
            "SELECT * FROM note_comments WHERE thread_id = ? AND deleted_at = 0 ORDER BY created_at ASC, id ASC",
            [tid],
        ).fetchall()
        comments = [_note_comment_row_to_dict(row) for row in comment_rows]
        latest = _latest_note_comment_info(comments)
        last_read_at = int(latest.get("last_comment_at") or _now_ts())
        last_seen_comment_id = str(latest.get("last_seen_comment_id") or "")
        _upsert_note_thread_read(
            con,
            thread_id=tid,
            user_id=actor,
            last_read_at=last_read_at,
            last_seen_comment_id=last_seen_comment_id,
        )
        con.commit()
    return {
        "ok": True,
        "thread_id": tid,
        "last_read_at": last_read_at,
        "last_seen_comment_id": last_seen_comment_id,
        "unread_count": 0,
    }


def patch_note_thread(
    thread_id: str,
    *,
    status: Any = None,
    priority: Any = None,
    requires_attention: Any = None,
    actor_user_id: str,
    org_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    _ensure_schema()
    tid = str(thread_id or "").strip()
    if not tid:
        return None
    oid = str(org_id or "").strip()
    filters = ["id = ?"]
    params: List[Any] = [tid]
    if oid:
        filters.append("org_id = ?")
        params.append(oid)
    actor = str(actor_user_id or "").strip()
    now = _now_ts()
    updates: List[str] = ["updated_at = ?", "updated_by = ?"]
    values: List[Any] = [now, actor]
    if status is not None:
        next_status = _normalize_note_status(status)
        updates.extend(["status = ?", "resolved_by = ?", "resolved_at = ?"])
        values.extend([
            next_status,
            actor if next_status == "resolved" else "",
            now if next_status == "resolved" else 0,
        ])
    if priority is not None:
        updates.append("priority = ?")
        values.append(_normalize_note_priority(priority))
    if requires_attention is not None:
        normalized_requires_attention = _normalize_bool_flag(requires_attention, field_name="requires_attention")
        updates.append("requires_attention = ?")
        values.append(1 if normalized_requires_attention else 0)
    if len(updates) == 1:
        raise ValueError("patch required")
    with _connect() as con:
        thread_row = con.execute(
            f"SELECT id FROM note_threads WHERE {' AND '.join(filters)} LIMIT 1",
            params,
        ).fetchone()
        if not thread_row:
            return None
        con.execute(f"UPDATE note_threads SET {', '.join(updates)} WHERE id = ?", [*values, tid])
        if requires_attention is not None:
            ack_filters = ["thread_id = ?"]
            ack_params: List[Any] = [tid]
            if oid:
                ack_filters.append("org_id = ?")
                ack_params.append(oid)
            con.execute(
                f"DELETE FROM note_thread_attention_acknowledgements WHERE {' AND '.join(ack_filters)}",
                ack_params,
            )
        con.commit()
    return get_note_thread(tid, org_id=oid or None, viewer_user_id=actor)


def patch_note_thread_status(
    thread_id: str,
    *,
    status: Any,
    actor_user_id: str,
    org_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    return patch_note_thread(
        thread_id,
        status=status,
        actor_user_id=actor_user_id,
        org_id=org_id,
    )


def update_note_comment(
    comment_id: str,
    *,
    body: Any,
    mention_targets: Optional[Iterable[Mapping[str, Any]]] = None,
    replace_mentions: bool = False,
    actor_user_id: str,
    org_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    _ensure_schema()
    cid = str(comment_id or "").strip()
    text = str(body or "").strip()
    if not cid:
        return None
    if not text:
        raise ValueError("body required")
    oid = str(org_id or "").strip()
    actor = str(actor_user_id or "").strip()
    now = _now_ts()
    filters = ["c.id = ?"]
    params: List[Any] = [cid]
    if oid:
        filters.append("t.org_id = ?")
        params.append(oid)
    with _connect() as con:
        row = con.execute(
            f"""
            SELECT c.*, t.org_id AS thread_org_id, t.session_id AS session_id
            FROM note_comments c
            JOIN note_threads t ON t.id = c.thread_id
            WHERE {' AND '.join(filters)}
            LIMIT 1
            """,
            params,
        ).fetchone()
        if not row:
            return None
        tid = str(_row_value(row, "thread_id") or "").strip()
        thread_org_id = str(_row_value(row, "thread_org_id") or oid or _default_org_id())
        session_id = str(_row_value(row, "session_id") or "")
        con.execute(
            """
            UPDATE note_comments
               SET body = ?, updated_at = ?, updated_by = ?, edited_at = ?, edited_by_user_id = ?
             WHERE id = ?
            """,
            [text, now, actor, now, actor, cid],
        )
        con.execute(
            "UPDATE note_threads SET updated_at = ?, updated_by = ? WHERE id = ?",
            [now, actor, tid],
        )
        if replace_mentions:
            con.execute("DELETE FROM note_comment_mentions WHERE comment_id = ? AND org_id = ?", [cid, thread_org_id])
            _insert_note_comment_mentions(
                con,
                org_id=thread_org_id,
                session_id=session_id,
                thread_id=tid,
                comment_id=cid,
                actor_user_id=actor,
                created_at=now,
                mention_targets=mention_targets,
            )
        con.commit()
    return get_note_thread(tid, org_id=oid or None, viewer_user_id=actor)

from ..compat.repository import _connect
from ..compat.repository import _ensure_schema
from ..compat.repository import _json_dumps
from ..compat.repository import _json_loads
from ..compat.repository import _normalize_note_scope
from ..compat.repository import _now_ts
from ..compat.repository import _row_value
from ..compat.repository import _thread_attention_acknowledged_at
from ..org_auth.repository import _default_org_id
from ..utils.repository import _apply_note_author_profiles
from ..utils.repository import _apply_note_comment_reply_summaries
from ..utils.repository import _auth_user_profiles_by_id_with_connection
from ..utils.repository import _normalize_bool_flag
from ..utils.repository import _normalize_note_priority
from ..utils.repository import _normalize_note_status
from ..utils.repository import _note_comment_row_to_dict
from ..utils.repository import _note_mention_row_to_dict
from ..utils.repository import _note_notification_plain_preview
from ..utils.repository import _note_thread_row_to_dict
from ..utils.repository import _note_thread_title_from_scope
from ..utils.repository import _project_workspace_id_for_session
