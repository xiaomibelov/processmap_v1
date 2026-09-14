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
from ..compat.repository import _AI_EXECUTION_STATUSES
from ..compat.repository import _ORG_FULL_ACCESS_ROLES

_AUDIT_LOG_LIKE_COLUMNS = (
    "action",
    "actor_user_id",
    "project_id",
    "session_id",
    "entity_type",
    "entity_id",
)


def _audit_log_where(
    *,
    org_id: str,
    action: Optional[str] = None,
    project_id: Optional[str] = None,
    session_id: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    updated_from: Optional[int] = None,
    updated_to: Optional[int] = None,
) -> Tuple[str, List[Any]]:
    eq: Dict[str, Any] = {}
    action_value = str(action or "").strip()
    if action_value:
        eq["action"] = action_value
    project_value = str(project_id or "").strip()
    if project_value:
        eq["project_id"] = project_value
    session_value = str(session_id or "").strip()
    if session_value:
        eq["session_id"] = session_value
    status_value = str(status or "").strip().lower()
    if status_value:
        eq["status"] = status_value
    from_ts = int(updated_from or 0)
    to_ts = int(updated_to or 0)
    query = str(q or "").strip().lower()
    extra = ""
    extra_params: List[Any] = []
    if query:
        like = f"%{query}%"
        extra = " OR ".join(
            f"LOWER(COALESCE({base.check_ident(col)}, '')) LIKE ?"
            for col in _AUDIT_LOG_LIKE_COLUMNS
        )
        extra_params = [like] * len(_AUDIT_LOG_LIKE_COLUMNS)
    return base.build_where(
        eq,
        org_id=org_id,
        org_required=True,
        range_cols={"ts": (from_ts if from_ts > 0 else None, to_ts if to_ts > 0 else None)},
        extra=extra,
        extra_params=extra_params,
    )


def _error_events_where(
    *,
    session_id: Optional[str] = None,
    request_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    runtime_id: Optional[str] = None,
    event_type: Optional[str] = None,
    source: Optional[str] = None,
    severity: Optional[str] = None,
    occurred_from: Optional[int] = None,
    occurred_to: Optional[int] = None,
) -> Tuple[str, List[Any]]:
    eq: Dict[str, Any] = {}
    for col, val in (
        ("session_id", session_id),
        ("request_id", request_id),
        ("correlation_id", correlation_id),
        ("user_id", user_id),
        ("org_id", org_id),
        ("runtime_id", runtime_id),
        ("event_type", event_type),
        ("source", source),
        ("severity", severity),
    ):
        text = str(val or "").strip()
        if text:
            eq[col] = text
    from_ts = (
        _clamp_int64(occurred_from)
        if occurred_from is not None and int(occurred_from or 0) > 0
        else None
    )
    to_ts = (
        _clamp_int64(occurred_to)
        if occurred_to is not None and int(occurred_to or 0) > 0
        else None
    )
    return base.build_where(
        eq,
        range_cols={"occurred_at": (from_ts, to_ts)},
        extra="1 = 1",
    )


def _normalize_ai_execution_status(status: Any) -> str:
    value = str(status or "").strip().lower()
    return value if value in _AI_EXECUTION_STATUSES else "queued"


def append_error_event(
    *,
    id: str,
    schema_version: int,
    occurred_at: int,
    ingested_at: int,
    source: str,
    event_type: str,
    severity: str,
    message: str,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    session_id: Optional[str] = None,
    project_id: Optional[str] = None,
    route: Optional[str] = None,
    runtime_id: Optional[str] = None,
    tab_id: Optional[str] = None,
    request_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
    app_version: Optional[str] = None,
    git_sha: Optional[str] = None,
    fingerprint: str = "",
    context_json: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    event_id = str(id or "").strip()
    src = str(source or "").strip()
    etype = str(event_type or "").strip()
    sev = str(severity or "").strip().lower() or "error"
    text = str(message or "").strip()
    fp = str(fingerprint or "").strip()
    if not event_id or not src or not etype or not text or not fp:
        raise ValueError("id, source, event_type, message and fingerprint are required")
    payload = _json_dumps(context_json if isinstance(context_json, dict) else {}, {})
    _ensure_schema()
    with _connect() as con:
        base.insert(
            con,
            "error_events",
            {
                "id": event_id,
                "schema_version": int(schema_version or 1),
                "occurred_at": int(occurred_at or 0),
                "ingested_at": int(ingested_at or 0),
                "source": src,
                "event_type": etype,
                "severity": sev,
                "message": text,
                "user_id": str(user_id or "").strip() or None,
                "org_id": str(org_id or "").strip() or None,
                "session_id": str(session_id or "").strip() or None,
                "project_id": str(project_id or "").strip() or None,
                "route": str(route or "").strip() or None,
                "runtime_id": str(runtime_id or "").strip() or None,
                "tab_id": str(tab_id or "").strip() or None,
                "request_id": str(request_id or "").strip() or None,
                "correlation_id": str(correlation_id or "").strip() or None,
                "app_version": str(app_version or "").strip() or None,
                "git_sha": str(git_sha or "").strip() or None,
                "fingerprint": fp,
                "context_json": payload,
            },
            commit=False,
        )
        con.commit()
        row = base.reselect(con, "error_events", "id", event_id)
    if not row:
        return {
            "id": event_id,
            "schema_version": int(schema_version or 1),
            "occurred_at": int(occurred_at or 0),
            "ingested_at": int(ingested_at or 0),
            "source": src,
            "event_type": etype,
            "severity": sev,
            "message": text,
            "user_id": str(user_id or ""),
            "org_id": str(org_id or ""),
            "session_id": str(session_id or ""),
            "project_id": str(project_id or ""),
            "route": str(route or ""),
            "runtime_id": str(runtime_id or ""),
            "tab_id": str(tab_id or ""),
            "request_id": str(request_id or ""),
            "correlation_id": str(correlation_id or ""),
            "app_version": str(app_version or ""),
            "git_sha": str(git_sha or ""),
            "fingerprint": fp,
            "context_json": context_json if isinstance(context_json, dict) else {},
        }
    return _error_event_row_to_dict(row)


def cleanup_audit_log(org_id: str, *, retention_days: int = 90, now_ts: Optional[int] = None) -> int:
    oid = str(org_id or "").strip()
    if not oid:
        return 0
    retention = max(1, int(retention_days or 90))
    now = int(now_ts or 0) or _now_ts()
    threshold = now - retention * 24 * 60 * 60
    _ensure_schema()
    with _connect() as con:
        where, params = base.build_where(
            {"org_id": oid}, extra="ts > 0 AND ts < ?", extra_params=[threshold]
        )
        cur = con.execute(f"DELETE FROM audit_log{where}", params)
        con.commit()
        return int(cur.rowcount or 0)


def cleanup_error_events(*, retention_days: int = 30, now_ts: Optional[int] = None) -> int:
    retention = max(1, int(retention_days or 30))
    now = int(now_ts or 0) or _now_ts()
    threshold = now - retention * 24 * 60 * 60
    _ensure_schema()
    with _connect() as con:
        where, params = base.build_where(
            extra="ingested_at > 0 AND ingested_at < ?", extra_params=[threshold]
        )
        cur = con.execute(f"DELETE FROM error_events{where}", params)
        con.commit()
        return int(cur.rowcount or 0)


def count_audit_log(
    org_id: str,
    *,
    action: Optional[str] = None,
    project_id: Optional[str] = None,
    session_id: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    updated_from: Optional[int] = None,
    updated_to: Optional[int] = None,
) -> int:
    oid = str(org_id or "").strip()
    if not oid:
        return 0
    where, params = _audit_log_where(
        org_id=oid,
        action=action,
        project_id=project_id,
        session_id=session_id,
        status=status,
        q=q,
        updated_from=updated_from,
        updated_to=updated_to,
    )
    _ensure_schema()
    with _connect() as con:
        return base.count(con, "audit_log", where=where, params=params)


def count_error_events(
    *,
    session_id: Optional[str] = None,
    request_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    runtime_id: Optional[str] = None,
    event_type: Optional[str] = None,
    source: Optional[str] = None,
    severity: Optional[str] = None,
    occurred_from: Optional[int] = None,
    occurred_to: Optional[int] = None,
) -> int:
    where, params = _error_events_where(
        session_id=session_id,
        request_id=request_id,
        correlation_id=correlation_id,
        user_id=user_id,
        org_id=org_id,
        runtime_id=runtime_id,
        event_type=event_type,
        source=source,
        severity=severity,
        occurred_from=occurred_from,
        occurred_to=occurred_to,
    )
    _ensure_schema()
    with _connect() as con:
        return base.count(con, "error_events", where=where, params=params)


def delete_error_event(event_id: str) -> bool:
    """Delete an error event by id. Returns True if a row was deleted."""
    eid = str(event_id or "").strip()
    if not eid:
        return False
    _ensure_schema()
    with _connect() as con:
        return base.hard_delete(con, "error_events", {"id": eid})


def get_effective_project_scope(
    user_id: str,
    org_id: str,
    *,
    is_admin: Optional[bool] = None,
) -> Dict[str, Any]:
    uid = str(user_id or "").strip()
    oid = str(org_id or "").strip()
    if not uid or not oid:
        return {"mode": "scoped", "project_ids": [], "org_role": ""}
    memberships = list_user_org_memberships(uid, is_admin=is_admin)
    org_role = ""
    for row in memberships:
        if str(row.get("org_id") or "") == oid:
            org_role = str(row.get("role") or "").strip().lower()
            break
    if bool(is_admin) or org_role in _ORG_FULL_ACCESS_ROLES:
        return {"mode": "all", "project_ids": [], "org_role": org_role}
    assigned = list_project_memberships(oid, user_id=uid)
    project_ids = sorted(
        {str(row.get("project_id") or "").strip() for row in assigned if str(row.get("project_id") or "").strip()}
    )
    if project_ids:
        return {"mode": "scoped", "project_ids": project_ids, "org_role": org_role}
    return {"mode": "all", "project_ids": [], "org_role": org_role}


def get_error_event(event_id: str) -> Optional[Dict[str, Any]]:
    eid = str(event_id or "").strip()
    if not eid:
        return None
    _ensure_schema()
    with _connect() as con:
        return base.get_by_id(
            con, "error_events", "id", eid, mapper=_error_event_row_to_dict
        )


def list_audit_log(
    org_id: str,
    *,
    limit: int = 100,
    offset: int = 0,
    action: Optional[str] = None,
    project_id: Optional[str] = None,
    session_id: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    updated_from: Optional[int] = None,
    updated_to: Optional[int] = None,
) -> List[Dict[str, Any]]:
    oid = str(org_id or "").strip()
    if not oid:
        return []
    lim = max(1, min(int(limit or 100), 500))
    off = max(0, int(offset or 0))
    where, params = _audit_log_where(
        org_id=oid,
        action=action,
        project_id=project_id,
        session_id=session_id,
        status=status,
        q=q,
        updated_from=updated_from,
        updated_to=updated_to,
    )
    order_by = ", ".join(f"{base.check_ident(col)} DESC" for col in ("ts", "id"))
    _ensure_schema()
    with _connect() as con:
        rows = con.execute(
            f"""
            SELECT id, ts, actor_user_id, org_id, project_id, session_id, action, entity_type, entity_id, status, meta_json
              FROM audit_log
             {where}
             ORDER BY {order_by}
             LIMIT ?
            OFFSET ?
            """,
            [*params, lim, off],
        ).fetchall()
    return [_audit_row_to_dict(row) for row in rows]


def list_error_events(
    *,
    session_id: Optional[str] = None,
    request_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    runtime_id: Optional[str] = None,
    event_type: Optional[str] = None,
    source: Optional[str] = None,
    severity: Optional[str] = None,
    occurred_from: Optional[int] = None,
    occurred_to: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
    order: str = "asc",
) -> List[Dict[str, Any]]:
    lim = max(1, min(int(limit or 50), 100))
    off = max(0, _clamp_int64(offset or 0))
    where, params = _error_events_where(
        session_id=session_id,
        request_id=request_id,
        correlation_id=correlation_id,
        user_id=user_id,
        org_id=org_id,
        runtime_id=runtime_id,
        event_type=event_type,
        source=source,
        severity=severity,
        occurred_from=occurred_from,
        occurred_to=occurred_to,
    )
    direction = "DESC" if str(order or "").strip().lower() == "desc" else "ASC"
    order_by = ", ".join(
        f"{base.check_ident(col)} {direction}" for col in ("occurred_at", "ingested_at", "id")
    )
    _ensure_schema()
    with _connect() as con:
        rows = con.execute(
            f"""
            SELECT id, schema_version, occurred_at, ingested_at, source, event_type, severity, message,
                   user_id, org_id, session_id, project_id, route, runtime_id, tab_id, request_id,
                   correlation_id, app_version, git_sha, fingerprint, context_json
              FROM error_events
             {where}
             ORDER BY {order_by}
             LIMIT ?
            OFFSET ?
            """,
            [*params, lim, off],
        ).fetchall()
    return [_error_event_row_to_dict(row) for row in rows]


def update_error_event(
    event_id: str,
    *,
    severity: Optional[str] = None,
    message: Optional[str] = None,
    context_json: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """Update selected mutable fields of an error event and return the updated row."""
    eid = str(event_id or "").strip()
    if not eid:
        return None

    updates: Dict[str, Any] = {}
    if severity is not None:
        sev = str(severity or "").strip().lower() or "error"
        updates["severity"] = sev
    if message is not None:
        msg = str(message or "").strip()
        if not msg:
            raise ValueError("message cannot be empty")
        updates["message"] = msg
    if context_json is not None:
        updates["context_json"] = _json_dumps(context_json if isinstance(context_json, dict) else {}, {})

    if not updates:
        return get_error_event(eid)

    _ensure_schema()
    with _connect() as con:
        base.update_fields(con, "error_events", updates, {"id": eid}, commit=False)
        con.commit()
        row = base.reselect(
            con, "error_events", "id", eid, mapper=_error_event_row_to_dict
        )
    if not row:
        return None
    return row


def user_has_project_access(
    user_id: str,
    org_id: str,
    project_id: str,
    *,
    is_admin: Optional[bool] = None,
) -> bool:
    pid = str(project_id or "").strip()
    if not pid:
        return False
    scope = get_effective_project_scope(user_id, org_id, is_admin=is_admin)
    if str(scope.get("mode") or "") == "all":
        return True
    allowed = {str(item or "").strip() for item in (scope.get("project_ids") or []) if str(item or "").strip()}
    return pid in allowed

from .. import base
from ..compat.repository import _audit_row_to_dict
from ..compat.repository import _clamp_int64
from ..compat.repository import _connect
from ..compat.repository import _ensure_schema
from ..compat.repository import _error_event_row_to_dict
from ..compat.repository import _json_dumps
from ..compat.repository import _now_ts
from ..org_auth.repository import list_user_org_memberships
from ..project import list_project_memberships
