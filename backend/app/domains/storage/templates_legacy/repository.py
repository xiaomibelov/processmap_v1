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

def create_template(
    *,
    scope: str,
    template_type: str = "bpmn_selection_v1",
    owner_user_id: str,
    org_id: str = "",
    folder_id: str = "",
    name: str,
    description: str = "",
    payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    normalized_scope = _normalize_template_scope(scope)
    normalized_template_type = _normalize_template_type(template_type)
    owner_id = str(owner_user_id or "").strip()
    oid = str(org_id or "").strip() if normalized_scope == "org" else ""
    fid = _normalize_template_folder_id(folder_id)
    template_name = str(name or "").strip()
    template_description = str(description or "").strip()
    payload_obj = payload if isinstance(payload, dict) else {}
    if not owner_id:
        raise ValueError("owner_user_id is required")
    if not template_name:
        raise ValueError("name is required")
    if normalized_scope == "org" and not oid:
        raise ValueError("org_id is required for org scope")
    now = _now_ts()
    tid = f"tpl_{uuid.uuid4().hex[:12]}"
    _ensure_schema()
    with _connect() as con:
        con.execute(
            """
            INSERT INTO templates (
              id, scope, template_type, org_id, owner_user_id, folder_id, name, description, payload_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                tid,
                normalized_scope,
                normalized_template_type,
                oid,
                owner_id,
                fid,
                template_name,
                template_description,
                _json_dumps(payload_obj, {}),
                now,
                now,
            ],
        )
        con.commit()
    created = get_template(tid)
    if not created:
        raise ValueError("template_create_failed")
    return created


def delete_template(template_id: str) -> bool:
    tid = str(template_id or "").strip()
    if not tid:
        return False
    _ensure_schema()
    with _connect() as con:
        cur = con.execute("DELETE FROM templates WHERE id = ?", [tid])
        con.commit()
    return int(cur.rowcount or 0) > 0


def get_template(template_id: str) -> Optional[Dict[str, Any]]:
    tid = str(template_id or "").strip()
    if not tid:
        return None
    _ensure_schema()
    with _connect() as con:
        row = con.execute(
            """
            SELECT id, scope, template_type, org_id, owner_user_id, folder_id, name, description, payload_json, created_from_session_id, created_at, updated_at
              FROM templates
             WHERE id = ?
             LIMIT 1
            """,
            [tid],
        ).fetchone()
    if not row:
        return None
    return _template_row_to_dict(row)


def list_templates(
    *,
    scope: str,
    owner_user_id: str = "",
    org_id: str = "",
    limit: int = 200,
) -> List[Dict[str, Any]]:
    normalized_scope = _normalize_template_scope(scope)
    owner_id = str(owner_user_id or "").strip()
    oid = str(org_id or "").strip()
    lim = max(1, min(int(limit or 200), 1000))
    _ensure_schema()
    clauses = ["scope = ?"]
    params: List[Any] = [normalized_scope]
    if normalized_scope == "personal":
        clauses.append("owner_user_id = ?")
        params.append(owner_id)
    else:
        clauses.append("org_id = ?")
        params.append(oid)
    with _connect() as con:
        rows = con.execute(
            f"""
            SELECT id, scope, template_type, org_id, owner_user_id, folder_id, name, description, payload_json, created_from_session_id, created_at, updated_at
              FROM templates
             WHERE {' AND '.join(clauses)}
             ORDER BY updated_at DESC, id DESC
             LIMIT ?
            """,
            [*params, lim],
        ).fetchall()
    return [_template_row_to_dict(row) for row in rows]


def update_template(
    template_id: str,
    *,
    template_type: Optional[str] = None,
    name: Optional[str] = None,
    description: Optional[str] = None,
    folder_id: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    tid = str(template_id or "").strip()
    if not tid:
        return None
    current = get_template(tid)
    if not current:
        return None
    next_name = str(name if name is not None else current.get("name") or "").strip()
    next_template_type = _normalize_template_type(template_type if template_type is not None else current.get("template_type"))
    next_description = str(description if description is not None else current.get("description") or "").strip()
    next_folder_id = _normalize_template_folder_id(folder_id if folder_id is not None else current.get("folder_id"))
    next_payload = payload if isinstance(payload, dict) else (current.get("payload") if isinstance(current.get("payload"), dict) else {})
    if not next_name:
        raise ValueError("name is required")
    now = _now_ts()
    _ensure_schema()
    with _connect() as con:
        con.execute(
            """
            UPDATE templates
               SET name = ?,
                   description = ?,
                   template_type = ?,
                   folder_id = ?,
                   payload_json = ?,
                   updated_at = ?
             WHERE id = ?
            """,
            [
                next_name,
                next_description,
                next_template_type,
                next_folder_id,
                _json_dumps(next_payload, {}),
                now,
                tid,
            ],
        )
        con.commit()
    return get_template(tid)

from ..compat.repository import _connect
from ..compat.repository import _ensure_schema
from ..compat.repository import _json_dumps
from ..compat.repository import _now_ts
from ..org_auth.repository import _normalize_template_folder_id
from ..org_auth.repository import _normalize_template_scope
from ..org_auth.repository import _normalize_template_type
from ..org_auth.repository import _template_row_to_dict
