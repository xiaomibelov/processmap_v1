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
from ..compat.repository import NOTE_THREAD_PRIORITIES
from ..compat.repository import NOTE_THREAD_STATUSES

def _apply_note_author_profiles(thread: Dict[str, Any], profiles_by_id: Mapping[str, Mapping[str, str]]) -> Dict[str, Any]:
    created_by = str(thread.get("created_by") or "").strip()
    created_profile = profiles_by_id.get(created_by) or {}
    thread["created_by_email"] = str(created_profile.get("email") or "").strip()
    thread["created_by_full_name"] = str(created_profile.get("full_name") or "").strip()
    thread["created_by_job_title"] = str(created_profile.get("job_title") or "").strip()

    resolved_by = str(thread.get("resolved_by") or "").strip()
    resolved_profile = profiles_by_id.get(resolved_by) or {}
    thread["resolved_by_email"] = str(resolved_profile.get("email") or "").strip()
    thread["resolved_by_full_name"] = str(resolved_profile.get("full_name") or "").strip()
    thread["resolved_by_job_title"] = str(resolved_profile.get("job_title") or "").strip()

    for comment in thread.get("comments") or []:
        if not isinstance(comment, dict):
            continue
        author_id = str(comment.get("author_user_id") or "").strip()
        author_profile = profiles_by_id.get(author_id) or {}
        comment["author_email"] = str(author_profile.get("email") or "").strip()
        comment["author_full_name"] = str(author_profile.get("full_name") or "").strip()
        comment["author_job_title"] = str(author_profile.get("job_title") or "").strip()
    return thread


def _apply_note_comment_reply_summaries(
    comments: List[Dict[str, Any]],
    profiles_by_id: Mapping[str, Mapping[str, str]],
) -> List[Dict[str, Any]]:
    by_id = {str(comment.get("id") or ""): comment for comment in comments if str(comment.get("id") or "")}
    for comment in comments:
        reply_to_comment_id = str(comment.get("reply_to_comment_id") or "").strip()
        if not reply_to_comment_id:
            comment["reply_to"] = None
            continue
        target = by_id.get(reply_to_comment_id)
        if not target:
            comment["reply_to"] = None
            continue
        comment["reply_to"] = {
            "id": str(target.get("id") or ""),
            "author_user_id": str(target.get("author_user_id") or ""),
            "author_display": _comment_author_display(target, profiles_by_id),
            "body_preview": _note_comment_body_preview(target.get("body")),
            "created_at": int(target.get("created_at") or 0),
        }
    return comments


def _auth_user_profiles_by_id_with_connection(con: Any, user_ids: Iterable[Any]) -> Dict[str, Dict[str, str]]:
    out: Dict[str, Dict[str, str]] = {}
    for raw_user_id in user_ids or []:
        user_id = str(raw_user_id or "").strip()
        if not user_id or user_id in out:
            continue
        user = _get_auth_user_by_id_with_connection(con, user_id)
        if not user:
            continue
        out[user_id] = {
            "email": str(user.get("email") or "").strip(),
            "full_name": str(user.get("full_name") or "").strip(),
            "job_title": str(user.get("job_title") or "").strip(),
        }
    return out


def _comment_author_display(comment: Mapping[str, Any], profiles_by_id: Mapping[str, Mapping[str, str]]) -> str:
    author_id = str(comment.get("author_user_id") or "").strip()
    profile = profiles_by_id.get(author_id) or {}
    return str(profile.get("full_name") or profile.get("email") or author_id or "Пользователь").strip()


def _normalize_bool_flag(value: Any, *, field_name: str) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "y", "on"}:
            return True
        if normalized in {"0", "false", "no", "n", "off", ""}:
            return False
    raise ValueError(f"invalid {field_name}")


def _normalize_note_priority(priority: Any) -> str:
    normalized = str(priority or "normal").strip().lower()
    if normalized not in NOTE_THREAD_PRIORITIES:
        raise ValueError("invalid priority")
    return normalized


def _normalize_note_status(status: Any) -> str:
    normalized = str(status or "").strip().lower()
    if normalized not in NOTE_THREAD_STATUSES:
        raise ValueError("invalid status")
    return normalized


def _normalize_org_property_dictionary_bool(value: Any, *, default: bool = True) -> int:
    if value is None:
        return 1 if default else 0
    if isinstance(value, bool):
        return 1 if value else 0
    text = str(value or "").strip().lower()
    if text in {"0", "false", "no", "off"}:
        return 0
    if text in {"1", "true", "yes", "on"}:
        return 1
    return 1 if default else 0


def _normalize_org_property_dictionary_input_mode(value: Any) -> str:
    mode = str(value or "").strip().lower()
    if mode == "free_text":
        return "free_text"
    return "autocomplete"


def _normalize_org_property_dictionary_key(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return ""
    normalized = re.sub(r"\s+", "_", raw)
    normalized = re.sub(r"[^a-z0-9_-]+", "_", normalized)
    normalized = re.sub(r"_+", "_", normalized).strip("_")
    return normalized[:120]


def _normalize_org_property_dictionary_label(value: Any, fallback: str = "") -> str:
    text = str(value or "").strip()
    if text:
        return text[:200]
    return str(fallback or "").strip()[:200]


def _note_comment_body_preview(value: Any, *, limit: int = 160) -> str:
    body = str(value or "").strip()
    first_line = ""
    for raw_line in body.splitlines():
        line = raw_line.strip()
        if line:
            first_line = line
            break
    preview = first_line or body
    max_len = max(20, int(limit or 160))
    if len(preview) <= max_len:
        return preview
    return f"{preview[:max_len - 1].rstrip()}…"


def _note_comment_row_to_dict(row: Any) -> Dict[str, Any]:
    return {
        "id": str(_row_value(row, "id") or ""),
        "thread_id": str(_row_value(row, "thread_id") or ""),
        "author_user_id": str(_row_value(row, "author_user_id") or ""),
        "body": str(_row_value(row, "body") or ""),
        "reply_to_comment_id": str(_row_value(row, "reply_to_comment_id") or ""),
        "created_at": int(_row_value(row, "created_at") or 0),
        "updated_at": int(_row_value(row, "updated_at") or 0),
        "updated_by": str(_row_value(row, "updated_by") or ""),
        "edited_at": int(_row_value(row, "edited_at") or 0),
        "edited_by_user_id": str(_row_value(row, "edited_by_user_id") or ""),
        "deleted_at": int(_row_value(row, "deleted_at") or 0),
        "deleted_by": str(_row_value(row, "deleted_by") or ""),
        "is_deleted": bool(int(_row_value(row, "deleted_at") or 0)),
    }


def _note_mention_row_to_dict(row: Any) -> Dict[str, Any]:
    return {
        "id": str(_row_value(row, "id") or ""),
        "org_id": str(_row_value(row, "org_id") or ""),
        "session_id": str(_row_value(row, "session_id") or ""),
        "thread_id": str(_row_value(row, "thread_id") or ""),
        "comment_id": str(_row_value(row, "comment_id") or ""),
        "mentioned_user_id": str(_row_value(row, "mentioned_user_id") or ""),
        "mentioned_label": str(_row_value(row, "mentioned_label") or ""),
        "created_by": str(_row_value(row, "created_by") or ""),
        "created_at": int(_row_value(row, "created_at") or 0),
        "acknowledged_at": int(_row_value(row, "acknowledged_at") or 0),
    }


def _note_notification_plain_preview(value: Any, *, limit: int = 180) -> str:
    text = re.sub(r"<[^>]*>", "", str(value or ""))
    text = re.sub(r"\s+", " ", text).strip()
    max_len = max(20, min(240, int(limit or 180)))
    if len(text) <= max_len:
        return text
    return f"{text[:max_len - 1].rstrip()}…"


def _note_thread_row_to_dict(row: Any, *, attention_acknowledged_at: Any = 0) -> Dict[str, Any]:
    acknowledged_at = int(attention_acknowledged_at or 0)
    return {
        "id": str(_row_value(row, "id") or ""),
        "org_id": str(_row_value(row, "org_id") or ""),
        "workspace_id": str(_row_value(row, "workspace_id") or ""),
        "project_id": str(_row_value(row, "project_id") or ""),
        "session_id": str(_row_value(row, "session_id") or ""),
        "scope_type": str(_row_value(row, "scope_type") or ""),
        "scope_ref": _json_loads(_row_value(row, "scope_ref_json"), {}),
        "status": str(_row_value(row, "status") or "open"),
        "priority": _normalize_note_priority(_row_value(row, "priority") or "normal"),
        "requires_attention": bool(int(_row_value(row, "requires_attention") or 0)),
        "attention_acknowledged_by_me": acknowledged_at > 0,
        "attention_acknowledged_at": acknowledged_at,
        "unread_count": 0,
        "last_read_at": 0,
        "last_comment_at": 0,
        "last_comment_author_user_id": "",
        "created_by": str(_row_value(row, "created_by") or ""),
        "created_at": int(_row_value(row, "created_at") or 0),
        "updated_at": int(_row_value(row, "updated_at") or 0),
        "updated_by": str(_row_value(row, "updated_by") or ""),
        "resolved_by": str(_row_value(row, "resolved_by") or ""),
        "resolved_at": int(_row_value(row, "resolved_at") or 0),
        "deleted_at": int(_row_value(row, "deleted_at") or 0),
        "deleted_by": str(_row_value(row, "deleted_by") or ""),
        "is_deleted": bool(int(_row_value(row, "deleted_at") or 0)),
    }


def _note_thread_title_from_scope(scope_type: Any, scope_ref: Any) -> str:
    kind = str(scope_type or "").strip()
    ref = scope_ref if isinstance(scope_ref, Mapping) else {}
    title = str(
        ref.get("element_name")
        or ref.get("element_title")
        or ref.get("name")
        or ref.get("title")
        or ref.get("element_id")
        or ""
    ).strip()
    if title:
        return title
    if kind == "diagram":
        return "Диаграмма"
    if kind == "session":
        return "Общий вопрос"
    if kind == "diagram_element":
        return "Элемент диаграммы"
    return "Обсуждение"


def _opt_text(value: Any) -> Optional[str]:
    text = str(value or "").strip()
    return text or None


def _org_git_mirror_payload(row: Any) -> Dict[str, Any]:
    enabled_raw = _row_value(row, "git_mirror_enabled")
    try:
        enabled = bool(int(enabled_raw or 0))
    except Exception:
        enabled = bool(enabled_raw)
    provider = _normalize_git_mirror_provider(_row_value(row, "git_provider"))
    repository = str(_row_value(row, "git_repository") or "").strip()
    branch = str(_row_value(row, "git_branch") or "").strip()
    base_path = str(_row_value(row, "git_base_path") or "").strip()
    health_status = _normalize_git_mirror_health_status(_row_value(row, "git_health_status"))
    health_message = str(_row_value(row, "git_health_message") or "").strip()
    try:
        updated_at = int(_row_value(row, "git_updated_at") or 0)
    except Exception:
        updated_at = 0
    updated_by = str(_row_value(row, "git_updated_by") or "").strip()
    return {
        "git_mirror_enabled": bool(enabled),
        "git_provider": provider or None,
        "git_repository": _opt_text(repository),
        "git_branch": _opt_text(branch),
        "git_base_path": _opt_text(base_path),
        "git_health_status": health_status,
        "git_health_message": _opt_text(health_message),
        "git_updated_at": max(0, updated_at),
        "git_updated_by": _opt_text(updated_by),
    }


def _project_workspace_id_for_session(con: Any, sess: Session, org_id: str) -> str:
    project_id = str(getattr(sess, "project_id", "") or "").strip()
    if not project_id:
        return ""
    row = con.execute(
        "SELECT workspace_id FROM projects WHERE id = ? AND org_id = ? LIMIT 1",
        [project_id, str(org_id or "").strip() or _default_org_id()],
    ).fetchone()
    if not row:
        return ""
    return str(_row_value(row, "workspace_id") or "").strip()

from ..compat.repository import _get_auth_user_by_id_with_connection
from ..compat.repository import _json_loads
from ..compat.repository import _normalize_git_mirror_health_status
from ..compat.repository import _normalize_git_mirror_provider
from ..compat.repository import _row_value
from ..org_auth.repository import _default_org_id
