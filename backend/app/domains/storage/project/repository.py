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

def create_project_in_folder(
    org_id: str,
    workspace_id: str,
    folder_id: str,
    title: str,
    *,
    user_id: Optional[str] = None,
    passport: Optional[Dict[str, Any]] = None,
    executor_user_id: Optional[str] = None,
) -> str:
    """Create a project inside a folder. folder_id must be a valid non-empty folder id."""
    _ensure_schema()
    oid = str(org_id or "").strip()
    wid = str(workspace_id or "").strip()
    fid = str(folder_id or "").strip()
    if not oid:
        raise ValueError("org_id required")
    if not wid:
        raise ValueError("workspace_id required")
    if not fid:
        raise ValueError("folder_id required — projects must live in a folder")
    owner = _scope_user_id(user_id)
    pid = gen_project_id()
    now = _now_ts()
    pdata = dict(passport or {})
    executor = str(executor_user_id or "").strip() or None
    with _connect() as con:
        frow = con.execute(
            "SELECT id FROM workspace_folders WHERE id = ? AND org_id = ? AND workspace_id = ? AND archived_at IS NULL LIMIT 1",
            [fid, oid, wid],
        ).fetchone()
        if not frow:
            raise ValueError("folder not found")
        con.execute(
            """
            INSERT INTO projects (id, title, passport_json, folder_id, workspace_id, created_at, updated_at, version, owner_user_id, executor_user_id, org_id, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [pid, str(title or "").strip() or "Проект", _json_dumps(pdata, {}), fid, wid, now, now, 1, owner, executor, oid, owner, owner],
        )
        con.commit()
    return pid


def delete_project_membership(org_id: str, project_id: str, user_id: str) -> bool:
    oid = str(org_id or "").strip()
    pid = str(project_id or "").strip()
    uid = str(user_id or "").strip()
    if not oid or not pid or not uid:
        return False
    _ensure_schema()
    with _connect() as con:
        cur = con.execute(
            """
            DELETE FROM project_memberships
             WHERE org_id = ? AND project_id = ? AND user_id = ?
            """,
            [oid, pid, uid],
        )
        con.commit()
        return int(cur.rowcount or 0) > 0


def get_project_explorer_invalidation_targets(org_id: str, project_id: str) -> Optional[Dict[str, Any]]:
    """Return workspace + children-list keys to invalidate for project rollups.

    children_folder_ids always includes:
    - project folder id (for project row visibility) when non-empty
    - every ancestor parent_id up to root ('')
    """
    oid = str(org_id or "").strip()
    pid = str(project_id or "").strip()
    if not oid or not pid:
        return None
    details = get_project_workspace_details(oid, pid)
    if not details:
        return None
    wid = str(details.get("workspace_id") or "").strip()
    folder_id = str(details.get("folder_id") or "").strip()
    targets: List[str] = []
    seen: set[str] = set()

    def _add_target(raw: Any) -> None:
        key = str(raw or "").strip()
        if key in seen:
            return
        seen.add(key)
        targets.append(key)

    if folder_id:
        _add_target(folder_id)
        crumbs = get_workspace_folder_breadcrumb(oid, wid, folder_id)
        breadcrumb_parent_by_id = {
            str(item.get("id") or ""): str(item.get("parent_id") or "")
            for item in crumbs
            if str(item.get("id") or "").strip()
        }
        cursor = folder_id
        while cursor:
            parent = str(breadcrumb_parent_by_id.get(cursor) or "")
            _add_target(parent)
            if not parent:
                break
            cursor = parent
    else:
        _add_target("")
    if "" not in seen:
        _add_target("")
    return {
        "org_id": oid,
        "workspace_id": wid,
        "project_id": pid,
        "folder_id": folder_id,
        "children_folder_ids": targets,
    }


def get_project_workspace_details(org_id: str, project_id: str) -> Optional[Dict[str, str]]:
    _ensure_schema()
    oid = str(org_id or "").strip()
    pid = str(project_id or "").strip()
    if not oid or not pid:
        return None
    with _connect() as con:
        row = con.execute(
            """
            SELECT
              p.id AS project_id,
              p.org_id AS org_id,
              COALESCE(NULLIF(p.workspace_id, ''), NULLIF(wf.workspace_id, ''), ?) AS workspace_id,
              p.folder_id AS folder_id
            FROM projects p
            LEFT JOIN workspace_folders wf ON wf.id = p.folder_id
            WHERE p.id = ? AND p.org_id = ?
            LIMIT 1
            """,
            [_default_workspace_id(oid), pid, oid],
        ).fetchone()
    if not row:
        return None
    return {
        "project_id": str(row["project_id"] or ""),
        "org_id": str(row["org_id"] or oid),
        "workspace_id": str(row["workspace_id"] or _default_workspace_id(oid)),
        "folder_id": str(row["folder_id"] or ""),
    }


def list_project_memberships(
    org_id: str,
    *,
    project_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    oid = str(org_id or "").strip()
    if not oid:
        return []
    pid = str(project_id or "").strip()
    uid = str(user_id or "").strip()
    _ensure_schema()
    filters = ["org_id = ?"]
    params: List[Any] = [oid]
    if pid:
        filters.append("project_id = ?")
        params.append(pid)
    if uid:
        filters.append("user_id = ?")
        params.append(uid)
    where = f"WHERE {' AND '.join(filters)}"
    with _connect() as con:
        rows = con.execute(
            f"""
            SELECT org_id, project_id, user_id, role, created_at, updated_at
              FROM project_memberships
              {where}
             ORDER BY project_id ASC, user_id ASC
            """,
            params,
        ).fetchall()
    out: List[Dict[str, Any]] = []
    for row in rows:
        out.append(
            {
                "org_id": str(row["org_id"] or ""),
                "project_id": str(row["project_id"] or ""),
                "user_id": str(row["user_id"] or ""),
                "role": _normalize_project_membership_role(row["role"]),
                "created_at": int(row["created_at"] or 0),
                "updated_at": int(row["updated_at"] or 0),
            }
        )
    return out


def move_project_to_folder(
    org_id: str,
    workspace_id: str,
    project_id: str,
    target_folder_id: str,
    *,
    user_id: Optional[str] = None,
) -> "Project":
    """Move a project to another folder in the same org/workspace."""
    _ensure_schema()
    oid = str(org_id or "").strip()
    wid = str(workspace_id or "").strip()
    pid = str(project_id or "").strip()
    fid = str(target_folder_id or "").strip()
    actor = _scope_user_id(user_id)
    if not oid or not wid or not pid:
        raise ValueError("org_id, workspace_id and project_id required")
    if not fid:
        raise ValueError("folder_id required")

    now = _now_ts()
    with _connect() as con:
        project_row = con.execute(
            """
            SELECT *
            FROM projects
            WHERE id = ? AND org_id = ? AND workspace_id = ?
            LIMIT 1
            """,
            [pid, oid, wid],
        ).fetchone()
        if not project_row:
            raise ValueError("project not found")

        target_row = con.execute(
            """
            SELECT id
            FROM workspace_folders
            WHERE id = ? AND org_id = ? AND workspace_id = ? AND archived_at IS NULL
            LIMIT 1
            """,
            [fid, oid, wid],
        ).fetchone()
        if not target_row:
            raise ValueError("target folder not found")

        current_folder_id = str(project_row["folder_id"] or "")
        if current_folder_id != fid:
            con.execute(
                """
                UPDATE projects
                   SET folder_id = ?,
                       updated_at = ?,
                       updated_by = ?,
                       version = COALESCE(version, 0) + 1
                 WHERE id = ? AND org_id = ? AND workspace_id = ?
                """,
                [fid, now, actor, pid, oid, wid],
            )
            con.commit()

        row = con.execute(
            "SELECT * FROM projects WHERE id = ? AND org_id = ? AND workspace_id = ? LIMIT 1",
            [pid, oid, wid],
        ).fetchone()
    if not row:
        raise ValueError("project not found")
    return _project_row_to_model(row)


def upsert_project_membership(
    org_id: str,
    project_id: str,
    user_id: str,
    role: str,
) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    pid = str(project_id or "").strip()
    uid = str(user_id or "").strip()
    if not oid or not pid or not uid:
        raise ValueError("org_id, project_id and user_id are required")
    normalized_role = _normalize_project_membership_role(role)
    now = _now_ts()
    _ensure_schema()
    with _connect() as con:
        con.execute(
            """
            INSERT INTO project_memberships (org_id, project_id, user_id, role, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(org_id, project_id, user_id) DO UPDATE SET
              role = excluded.role,
              updated_at = excluded.updated_at
            """,
            [oid, pid, uid, normalized_role, now, now],
        )
        con.commit()
    rows = list_project_memberships(oid, project_id=pid, user_id=uid)
    if rows:
        return rows[0]
    return {
        "org_id": oid,
        "project_id": pid,
        "user_id": uid,
        "role": normalized_role,
        "created_at": now,
        "updated_at": now,
    }

from ..compat.repository import _connect
from ..compat.repository import _ensure_schema
from ..compat.repository import _json_dumps
from ..compat.repository import _now_ts
from ..compat.repository import _project_row_to_model
from ..compat.repository import _scope_user_id
from ..compat.repository import gen_project_id
from ..explorer import get_workspace_folder_breadcrumb
from ..org_auth.repository import _default_workspace_id
from ..org_auth.repository import _normalize_project_membership_role
