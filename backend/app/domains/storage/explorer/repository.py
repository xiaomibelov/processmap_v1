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

def _get_folder_descendant_ids(con: Any, org_id: str, workspace_id: str, folder_id: str) -> List[str]:
    """Return all descendant folder IDs (not including folder_id itself)."""
    cfg = get_db_runtime_config()
    if cfg.backend == "postgres":
        rows = con.execute(
            """
            WITH RECURSIVE desc_cte(id) AS (
              SELECT id FROM workspace_folders WHERE parent_id = ? AND org_id = ? AND workspace_id = ?
              UNION ALL
              SELECT f.id FROM workspace_folders f
              JOIN desc_cte d ON f.parent_id = d.id AND f.org_id = ? AND f.workspace_id = ?
            )
            SELECT id FROM desc_cte
            """,
            [folder_id, org_id, workspace_id, org_id, workspace_id],
        ).fetchall()
    else:
        rows = con.execute(
            """
            WITH RECURSIVE desc_cte(id) AS (
              SELECT id FROM workspace_folders WHERE parent_id = ? AND org_id = ? AND workspace_id = ?
              UNION ALL
              SELECT f.id FROM workspace_folders f
              JOIN desc_cte d ON f.parent_id = d.id AND f.org_id = ? AND f.workspace_id = ?
            )
            SELECT id FROM desc_cte
            """,
            [folder_id, org_id, workspace_id, org_id, workspace_id],
        ).fetchall()
    return [str(r["id"] or "") for r in rows if r["id"]]


def _validate_folder_parent(
    *,
    con: sqlite3.Connection,
    scope: str,
    owner_user_id: str,
    org_id: str,
    folder_id: str,
    parent_id: str,
) -> str:
    pid = str(parent_id or "").strip()
    if not pid:
        return ""
    if folder_id and pid == folder_id:
        raise ValueError("parent_id cannot reference folder itself")
    parent_row = con.execute(
        """
        SELECT id, scope, org_id, owner_user_id
          FROM template_folders
         WHERE id = ?
         LIMIT 1
        """,
        [pid],
    ).fetchone()
    if not parent_row:
        raise ValueError("parent_folder_not_found")
    parent_scope = _normalize_template_scope(parent_row["scope"])
    parent_org_id = str(parent_row["org_id"] or "")
    parent_owner_id = str(parent_row["owner_user_id"] or "")
    if parent_scope != scope:
        raise ValueError("parent_scope_mismatch")
    if scope == "org":
        if parent_org_id != org_id:
            raise ValueError("parent_org_mismatch")
    else:
        if parent_owner_id != owner_user_id:
            raise ValueError("parent_owner_mismatch")
    return pid


def create_template_folder(
    *,
    scope: str,
    owner_user_id: str,
    org_id: str = "",
    name: str,
    parent_id: str = "",
    sort_order: int = 0,
) -> Dict[str, Any]:
    normalized_scope = _normalize_template_scope(scope)
    owner_id = str(owner_user_id or "").strip()
    oid = str(org_id or "").strip() if normalized_scope == "org" else ""
    folder_name = str(name or "").strip()
    if not owner_id:
        raise ValueError("owner_user_id is required")
    if not folder_name:
        raise ValueError("name is required")
    if normalized_scope == "org" and not oid:
        raise ValueError("org_id is required for org scope")
    now = _now_ts()
    fid = f"tpf_{uuid.uuid4().hex[:12]}"
    _ensure_schema()
    with _connect() as con:
        pid = _validate_folder_parent(
            con=con,
            scope=normalized_scope,
            owner_user_id=owner_id,
            org_id=oid,
            folder_id=fid,
            parent_id=parent_id,
        )
        con.execute(
            """
            INSERT INTO template_folders (
              id, scope, org_id, owner_user_id, name, parent_id, sort_order, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [fid, normalized_scope, oid, owner_id, folder_name, pid, int(sort_order or 0), now, now],
        )
        con.commit()
    created = get_template_folder(fid)
    if not created:
        raise ValueError("template_folder_create_failed")
    return created


def create_workspace_folder(
    org_id: str,
    workspace_id: str,
    name: str,
    parent_id: str = "",
    *,
    user_id: Optional[str] = None,
    sort_order: int = 0,
    responsible_user_id: Optional[str] = None,
    context_status: str = "none",
) -> Dict[str, Any]:
    """Create a folder inside the given workspace. parent_id='' means workspace root."""
    _ensure_schema()
    oid = str(org_id or "").strip()
    wid = str(workspace_id or "").strip()
    pid = str(parent_id or "").strip()
    fname = str(name or "").strip()
    if not oid:
        raise ValueError("org_id required")
    if not wid:
        raise ValueError("workspace_id required")
    if not fname:
        raise ValueError("name required")
    owner = _scope_user_id(user_id)
    now = _now_ts()
    responsible = str(responsible_user_id or "").strip() or None
    status = str(context_status or "none").strip() or "none"
    assigned_at = now if responsible else None
    assigned_by = owner if responsible else None
    fid = uuid.uuid4().hex[:12]
    with _connect() as con:
        if not get_workspace_record(wid, org_id=oid):
            raise ValueError("workspace not found")
        # Validate parent exists (if not root)
        if pid:
            prow = con.execute(
                "SELECT id FROM workspace_folders WHERE id = ? AND org_id = ? AND workspace_id = ? AND archived_at IS NULL LIMIT 1",
                [pid, oid, wid],
            ).fetchone()
            if not prow:
                raise ValueError(f"parent folder '{pid}' not found in workspace")
        # Unique name within parent
        dup = con.execute(
            "SELECT id FROM workspace_folders WHERE org_id = ? AND workspace_id = ? AND parent_id = ? AND name = ? AND archived_at IS NULL LIMIT 1",
            [oid, wid, pid, fname],
        ).fetchone()
        if dup:
            raise ValueError(f"A folder named '{fname}' already exists here")
        con.execute(
            """
            INSERT INTO workspace_folders (
              id, org_id, workspace_id, parent_id, name, sort_order,
              responsible_user_id, context_status, responsible_assigned_at, responsible_assigned_by,
              created_by, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [fid, oid, wid, pid, fname, sort_order, responsible, status, assigned_at, assigned_by, owner, now, now],
        )
        con.commit()
        row = con.execute("SELECT * FROM workspace_folders WHERE id = ? LIMIT 1", [fid]).fetchone()
    return folder_row_to_dict(row)


def delete_template_folder(folder_id: str) -> bool:
    fid = str(folder_id or "").strip()
    if not fid:
        return False
    _ensure_schema()
    with _connect() as con:
        con.execute("UPDATE templates SET folder_id = '' WHERE folder_id = ?", [fid])
        con.execute("UPDATE template_folders SET parent_id = '' WHERE parent_id = ?", [fid])
        cur = con.execute("DELETE FROM template_folders WHERE id = ?", [fid])
        con.commit()
    return int(cur.rowcount or 0) > 0


def delete_workspace_folder(
    org_id: str,
    workspace_id: str,
    folder_id: str,
    *,
    cascade: bool = False,
    user_id: Optional[str] = None,
) -> bool:
    """Delete a folder. If cascade=False (default), reject if non-empty."""
    _ensure_schema()
    oid = str(org_id or "").strip()
    wid = str(workspace_id or "").strip()
    fid = str(folder_id or "").strip()
    if not oid or not wid or not fid:
        return False
    with _connect() as con:
        existing = con.execute(
            "SELECT id FROM workspace_folders WHERE id = ? AND org_id = ? AND workspace_id = ? AND archived_at IS NULL LIMIT 1",
            [fid, oid, wid],
        ).fetchone()
        if not existing:
            return False
        if not cascade:
            child_folders = con.execute(
                "SELECT id FROM workspace_folders WHERE parent_id = ? AND org_id = ? AND workspace_id = ? AND archived_at IS NULL LIMIT 1",
                [fid, oid, wid],
            ).fetchone()
            child_projects = con.execute(
                "SELECT id FROM projects WHERE folder_id = ? AND org_id = ? AND workspace_id = ? LIMIT 1",
                [fid, oid, wid],
            ).fetchone()
            if child_folders or child_projects:
                raise ValueError("folder_not_empty")
            con.execute("DELETE FROM workspace_folders WHERE id = ? AND org_id = ? AND workspace_id = ?", [fid, oid, wid])
        else:
            # Cascade: delete all descendants then self
            descendant_ids = _get_folder_descendant_ids(con, oid, wid, fid)
            all_ids = descendant_ids + [fid]
            # Move projects in deleted folders to workspace root
            for did in all_ids:
                con.execute(
                    "UPDATE projects SET folder_id = '' WHERE folder_id = ? AND org_id = ? AND workspace_id = ?",
                    [did, oid, wid],
                )
            # Delete all folders
            for did in all_ids:
                con.execute(
                    "DELETE FROM workspace_folders WHERE id = ? AND org_id = ? AND workspace_id = ?",
                    [did, oid, wid],
                )
        con.commit()
    return True


def get_template_folder(folder_id: str) -> Optional[Dict[str, Any]]:
    fid = str(folder_id or "").strip()
    if not fid:
        return None
    _ensure_schema()
    with _connect() as con:
        row = con.execute(
            """
            SELECT id, scope, org_id, owner_user_id, name, parent_id, sort_order, created_at, updated_at
              FROM template_folders
             WHERE id = ?
             LIMIT 1
            """,
            [fid],
        ).fetchone()
    if not row:
        return None
    return _template_folder_row_to_dict(row)


def get_workspace_folder(org_id: str, workspace_id: str, folder_id: str) -> Optional[Dict[str, Any]]:
    _ensure_schema()
    oid = str(org_id or "").strip()
    wid = str(workspace_id or "").strip()
    fid = str(folder_id or "").strip()
    if not oid or not wid or not fid:
        return None
    with _connect() as con:
        row = con.execute(
            "SELECT * FROM workspace_folders WHERE id = ? AND org_id = ? AND workspace_id = ? AND archived_at IS NULL LIMIT 1",
            [fid, oid, wid],
        ).fetchone()
    return folder_row_to_dict(row) if row else None


def get_workspace_folder_breadcrumb(org_id: str, workspace_id: str, folder_id: str) -> List[Dict[str, Any]]:
    """Return path from workspace root to folder_id (exclusive of workspace itself)."""
    _ensure_schema()
    oid = str(org_id or "").strip()
    wid = str(workspace_id or "").strip()
    fid = str(folder_id or "").strip()
    if not fid:
        return []
    crumbs = []
    visited = set()
    with _connect() as con:
        current_id = fid
        while current_id and current_id not in visited:
            visited.add(current_id)
            row = con.execute(
                "SELECT * FROM workspace_folders WHERE id = ? AND org_id = ? AND workspace_id = ? LIMIT 1",
                [current_id, oid, wid],
            ).fetchone()
            if not row:
                break
            crumbs.append({
                "id": str(row["id"]),
                "name": str(row["name"]),
                "parent_id": str(row["parent_id"] or ""),
                # Аддитивно (nav-headers part A): статус/дата раздела для хедера explorer.
                "context_status": str(row["context_status"] or "none"),
                "updated_at": int(row["updated_at"] or 0),
            })
            current_id = str(row["parent_id"] or "")
    crumbs.reverse()
    return crumbs


def list_template_folders(
    *,
    scope: str,
    owner_user_id: str = "",
    org_id: str = "",
) -> List[Dict[str, Any]]:
    normalized_scope = _normalize_template_scope(scope)
    owner_id = str(owner_user_id or "").strip()
    oid = str(org_id or "").strip()
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
            SELECT id, scope, org_id, owner_user_id, name, parent_id, sort_order, created_at, updated_at
              FROM template_folders
             WHERE {' AND '.join(clauses)}
             ORDER BY sort_order ASC, lower(name) ASC, updated_at DESC, id DESC
            """,
            params,
        ).fetchall()
    return [_template_folder_row_to_dict(row) for row in rows]


def list_workspace_folder_children(org_id: str, workspace_id: str, parent_id: str) -> Dict[str, Any]:
    """Return direct child folders and projects for given parent ('' = workspace root).

    Includes rollup activity and rollup DoD for folder rows so parent lists can
    show truthful descendant state.
    """
    _ensure_schema()
    oid = str(org_id or "").strip()
    wid = str(workspace_id or "").strip()
    pid = str(parent_id or "").strip()

    def _safe_int(v: Any, default: int = 0) -> int:
        try:
            return int(v)
        except Exception:
            return int(default)

    def _clamp_percent(v: Any) -> int:
        n = _safe_int(v, 0)
        if n < 0:
            return 0
        if n > 100:
            return 100
        return n

    with _connect() as con:
        folder_rows_all = con.execute(
            """
            SELECT *
            FROM workspace_folders
            WHERE org_id = ? AND workspace_id = ? AND archived_at IS NULL
            ORDER BY sort_order ASC, name ASC
            """,
            [oid, wid],
        ).fetchall()
        project_rows_all = con.execute(
            """
            SELECT p.*,
              (SELECT COUNT(*) FROM sessions s WHERE s.project_id = p.id) AS sessions_count
            FROM projects p
            WHERE p.org_id = ? AND p.workspace_id = ?
            ORDER BY p.updated_at DESC, p.title ASC
            """,
            [oid, wid],
        ).fetchall()
        session_rows = con.execute(
            """
            SELECT s.project_id, s.id, s.title, s.updated_at, s.version, s.bpmn_xml_version, s.interview_json, s.deleted_at
            FROM sessions s
            JOIN projects p ON p.id = s.project_id
            WHERE p.org_id = ? AND p.workspace_id = ?
            ORDER BY s.project_id ASC, s.updated_at DESC, s.id DESC
            """,
            [oid, wid],
        ).fetchall()

    folders_by_id: Dict[str, Dict[str, Any]] = {}
    folder_children: Dict[str, List[str]] = {}
    for row in folder_rows_all:
        folder_dict = folder_row_to_dict(row)
        fid = str(folder_dict.get("id") or "")
        if not fid:
            continue
        folders_by_id[fid] = folder_dict
        parent = str(folder_dict.get("parent_id") or "")
        folder_children.setdefault(parent, []).append(fid)

    for children in folder_children.values():
        children.sort(
            key=lambda child_id: (
                _safe_int((folders_by_id.get(child_id) or {}).get("sort_order"), 0),
                str((folders_by_id.get(child_id) or {}).get("name") or "").lower(),
            )
        )

    session_latest_by_project: Dict[str, Dict[str, Any]] = {}
    done_sessions_by_project: Dict[str, int] = {}
    trackable_sessions_by_project: Dict[str, int] = {}
    for row in session_rows:
        project_id = str(row["project_id"] or "")
        if not project_id:
            continue
        if project_id not in session_latest_by_project:
            session_latest_by_project[project_id] = {
                "id": str(row["id"] or ""),
                "title": str(row["title"] or "") or "Сессия",
                "updated_at": _safe_int(row["updated_at"], 0),
            }
        # Прогресс-пара done/total: архивные и мягко удалённые сессии
        # исключаются из ОБОИХ чисел, иначе прогресс никогда не достигнет 100%.
        if _safe_int(row["deleted_at"], 0) > 0:
            continue
        try:
            interview = json.loads(str(row["interview_json"] or "{}"))
            if not isinstance(interview, dict):
                interview = {}
        except Exception:
            interview = {}
        session_status = derive_session_status(
            version=row["version"],
            bpmn_xml_version=row["bpmn_xml_version"],
            interview_raw=interview,
        )
        if session_status == "archived":
            continue
        trackable_sessions_by_project[project_id] = trackable_sessions_by_project.get(project_id, 0) + 1
        if session_status == "ready":
            done_sessions_by_project[project_id] = done_sessions_by_project.get(project_id, 0) + 1

    projects_by_folder: Dict[str, List[Dict[str, Any]]] = {}
    projects_by_id: Dict[str, Dict[str, Any]] = {}
    for row in project_rows_all:
        project_model = _project_row_to_model(row)
        passport = dict(project_model.passport or {})
        project_id = str(project_model.id or "")
        folder_id = str(getattr(project_model, "folder_id", "") or "")
        project_updated_at = _safe_int(project_model.updated_at, 0)
        latest_session = session_latest_by_project.get(project_id)
        latest_session_at = _safe_int((latest_session or {}).get("updated_at"), 0)
        use_session_source = latest_session_at > project_updated_at
        rollup_activity_at = latest_session_at if use_session_source else project_updated_at
        source_type = "session" if use_session_source else "project"
        source_id = str((latest_session or {}).get("id") or project_id)
        source_title = str((latest_session or {}).get("title") or project_model.title or "Проект")
        dod_percent = _clamp_percent(passport.get("dod_percent", 0))
        project_payload: Dict[str, Any] = {
            "id": project_id,
            "title": str(project_model.title or ""),
            "folder_id": folder_id,
            "workspace_id": str((_row_value(row, "workspace_id") or "") or wid),
            "owner_user_id": str(project_model.owner_user_id or ""),
            "executor_user_id": str(getattr(project_model, "executor_user_id", "") or "").strip() or None,
            "org_id": str(project_model.org_id or oid),
            "sessions_count": _safe_int(row["sessions_count"], 0),
            "status": str(passport.get("status", "active") or "active"),
            "dod_percent": dod_percent,
            "attention_count": _safe_int(passport.get("attention_count", 0), 0),
            "reports_count": _safe_int(passport.get("reports_count", 0), 0),
            "description": str(passport.get("description", "") or ""),
            "updated_at": project_updated_at,
            "created_at": _safe_int(project_model.created_at, 0),
            "self_activity_at": project_updated_at,
            "rollup_activity_at": rollup_activity_at,
            "last_activity_source_type": source_type,
            "last_activity_source_id": source_id,
            "last_activity_source_title": source_title,
            "descendant_sessions_count": _safe_int(row["sessions_count"], 0),
            "done_sessions_count": _safe_int(done_sessions_by_project.get(project_id), 0),
            "trackable_sessions_count": _safe_int(trackable_sessions_by_project.get(project_id), 0),
            # Project-level canonical truth remains dod_percent.
            "rollup_dod_percent": dod_percent,
        }
        projects_by_folder.setdefault(folder_id, []).append(project_payload)
        projects_by_id[project_id] = project_payload

    for plist in projects_by_folder.values():
        plist.sort(
            key=lambda p: (
                -_safe_int(p.get("rollup_activity_at"), 0),
                str(p.get("title") or "").lower(),
            )
        )

    folder_metrics: Dict[str, Dict[str, Any]] = {}

    def _compute_folder_metrics(folder_id: str) -> Dict[str, Any]:
        existing = folder_metrics.get(folder_id)
        if existing is not None:
            return existing
        folder = folders_by_id.get(folder_id)
        if folder is None:
            result = {
                "rollup_activity_at": 0,
                "last_activity_source_type": "folder",
                "last_activity_source_id": "",
                "last_activity_source_title": "",
                "descendant_projects_count": 0,
                "descendant_sessions_count": 0,
                "descendant_done_sessions_count": 0,
                "descendant_trackable_sessions_count": 0,
                "dod_sum": 0.0,
                "dod_count": 0,
            }
            folder_metrics[folder_id] = result
            return result

        best_activity_at = _safe_int(folder.get("updated_at"), 0)
        best_type = "folder"
        best_id = str(folder.get("id") or "")
        best_title = str(folder.get("name") or "Папка")
        descendant_projects_count = 0
        descendant_sessions_count = 0
        descendant_done_sessions_count = 0
        descendant_trackable_sessions_count = 0
        dod_sum = 0.0
        dod_count = 0

        for child_folder_id in folder_children.get(folder_id, []):
            child_metrics = _compute_folder_metrics(child_folder_id)
            descendant_projects_count += _safe_int(child_metrics.get("descendant_projects_count"), 0)
            descendant_sessions_count += _safe_int(child_metrics.get("descendant_sessions_count"), 0)
            descendant_done_sessions_count += _safe_int(child_metrics.get("descendant_done_sessions_count"), 0)
            descendant_trackable_sessions_count += _safe_int(child_metrics.get("descendant_trackable_sessions_count"), 0)
            dod_sum += float(child_metrics.get("dod_sum") or 0.0)
            dod_count += _safe_int(child_metrics.get("dod_count"), 0)
            child_rollup_at = _safe_int(child_metrics.get("rollup_activity_at"), 0)
            if child_rollup_at > best_activity_at:
                best_activity_at = child_rollup_at
                best_type = str(child_metrics.get("last_activity_source_type") or "folder")
                best_id = str(child_metrics.get("last_activity_source_id") or child_folder_id)
                best_title = str(child_metrics.get("last_activity_source_title") or "")

        for project in projects_by_folder.get(folder_id, []):
            descendant_projects_count += 1
            descendant_sessions_count += _safe_int(project.get("sessions_count"), 0)
            descendant_done_sessions_count += _safe_int(project.get("done_sessions_count"), 0)
            descendant_trackable_sessions_count += _safe_int(project.get("trackable_sessions_count"), 0)
            dod_sum += float(_safe_int(project.get("dod_percent"), 0))
            dod_count += 1
            project_rollup_at = _safe_int(project.get("rollup_activity_at"), 0)
            if project_rollup_at > best_activity_at:
                best_activity_at = project_rollup_at
                best_type = str(project.get("last_activity_source_type") or "project")
                best_id = str(project.get("last_activity_source_id") or project.get("id") or "")
                best_title = str(project.get("last_activity_source_title") or project.get("title") or "")

        result = {
            "rollup_activity_at": best_activity_at,
            "last_activity_source_type": best_type,
            "last_activity_source_id": best_id,
            "last_activity_source_title": best_title,
            "descendant_projects_count": descendant_projects_count,
            "descendant_sessions_count": descendant_sessions_count,
            "descendant_done_sessions_count": descendant_done_sessions_count,
            "descendant_trackable_sessions_count": descendant_trackable_sessions_count,
            "dod_sum": dod_sum,
            "dod_count": dod_count,
        }
        folder_metrics[folder_id] = result
        return result

    for folder_id in folders_by_id.keys():
        _compute_folder_metrics(folder_id)

    folder_items: List[Dict[str, Any]] = []
    for folder_id in folder_children.get(pid, []):
        folder = folders_by_id.get(folder_id)
        if folder is None:
            continue
        metrics = folder_metrics.get(folder_id) or {}
        dod_count = _safe_int(metrics.get("dod_count"), 0)
        rollup_dod_percent = None
        if dod_count > 0:
            rollup_dod_percent = _clamp_percent(round(float(metrics.get("dod_sum") or 0.0) / float(dod_count)))
        folder_items.append({
            **folder,
            "child_folder_count": len(folder_children.get(folder_id, [])),
            "child_project_count": len(projects_by_folder.get(folder_id, [])),
            "descendant_projects_count": _safe_int(metrics.get("descendant_projects_count"), 0),
            "descendant_sessions_count": _safe_int(metrics.get("descendant_sessions_count"), 0),
            "descendant_done_sessions_count": _safe_int(metrics.get("descendant_done_sessions_count"), 0),
            "descendant_trackable_sessions_count": _safe_int(metrics.get("descendant_trackable_sessions_count"), 0),
            "self_activity_at": _safe_int(folder.get("updated_at"), 0),
            "rollup_activity_at": _safe_int(metrics.get("rollup_activity_at"), _safe_int(folder.get("updated_at"), 0)),
            "last_activity_source_type": str(metrics.get("last_activity_source_type") or "folder"),
            "last_activity_source_id": str(metrics.get("last_activity_source_id") or folder_id),
            "last_activity_source_title": str(metrics.get("last_activity_source_title") or folder.get("name") or "Папка"),
            "rollup_dod_percent": rollup_dod_percent,
        })

    project_items = list(projects_by_folder.get(pid, []))
    return {"folders": folder_items, "projects": project_items}


def move_workspace_folder(
    org_id: str,
    workspace_id: str,
    folder_id: str,
    new_parent_id: str,
    *,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Move folder to new_parent_id ('' = workspace root). Validates no cycles."""
    _ensure_schema()
    oid = str(org_id or "").strip()
    wid = str(workspace_id or "").strip()
    fid = str(folder_id or "").strip()
    npid = str(new_parent_id or "").strip()
    if not oid or not wid or not fid:
        raise ValueError("org_id, workspace_id and folder_id required")
    if fid == npid:
        raise ValueError("Cannot move a folder into itself")
    now = _now_ts()
    with _connect() as con:
        existing = con.execute(
            "SELECT * FROM workspace_folders WHERE id = ? AND org_id = ? AND workspace_id = ? AND archived_at IS NULL LIMIT 1",
            [fid, oid, wid],
        ).fetchone()
        if not existing:
            raise ValueError("folder not found")
        # Validate new parent exists if not root
        if npid:
            prow = con.execute(
                "SELECT id FROM workspace_folders WHERE id = ? AND org_id = ? AND workspace_id = ? AND archived_at IS NULL LIMIT 1",
                [npid, oid, wid],
            ).fetchone()
            if not prow:
                raise ValueError("target parent folder not found")
            # Cycle check: new_parent must not be a descendant of folder
            descendant_ids = _get_folder_descendant_ids(con, oid, wid, fid)
            if npid in descendant_ids:
                raise ValueError("Cannot move a folder into one of its descendants")
        # Name uniqueness in new parent
        fname = str(existing["name"] or "")
        dup = con.execute(
            "SELECT id FROM workspace_folders WHERE org_id = ? AND workspace_id = ? AND parent_id = ? AND name = ? AND id != ? AND archived_at IS NULL LIMIT 1",
            [oid, wid, npid, fname, fid],
        ).fetchone()
        if dup:
            raise ValueError(f"A folder named '{fname}' already exists in the target location")
        con.execute(
            "UPDATE workspace_folders SET parent_id = ?, updated_at = ? WHERE id = ? AND org_id = ? AND workspace_id = ?",
            [npid, now, fid, oid, wid],
        )
        con.commit()
        row = con.execute("SELECT * FROM workspace_folders WHERE id = ? LIMIT 1", [fid]).fetchone()
    return folder_row_to_dict(row)


def rename_workspace_folder(
    org_id: str,
    workspace_id: str,
    folder_id: str,
    new_name: str,
    *,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    _ensure_schema()
    oid = str(org_id or "").strip()
    wid = str(workspace_id or "").strip()
    fid = str(folder_id or "").strip()
    fname = str(new_name or "").strip()
    if not oid or not wid or not fid or not fname:
        raise ValueError("org_id, workspace_id, folder_id, new_name required")
    now = _now_ts()
    with _connect() as con:
        existing = con.execute(
            "SELECT * FROM workspace_folders WHERE id = ? AND org_id = ? AND workspace_id = ? AND archived_at IS NULL LIMIT 1",
            [fid, oid, wid],
        ).fetchone()
        if not existing:
            raise ValueError("folder not found")
        pid = str(existing["parent_id"] or "")
        dup = con.execute(
            "SELECT id FROM workspace_folders WHERE org_id = ? AND workspace_id = ? AND parent_id = ? AND name = ? AND id != ? AND archived_at IS NULL LIMIT 1",
            [oid, wid, pid, fname, fid],
        ).fetchone()
        if dup:
            raise ValueError(f"A folder named '{fname}' already exists here")
        con.execute(
            "UPDATE workspace_folders SET name = ?, updated_at = ? WHERE id = ? AND org_id = ? AND workspace_id = ?",
            [fname, now, fid, oid, wid],
        )
        con.commit()
        row = con.execute("SELECT * FROM workspace_folders WHERE id = ? LIMIT 1", [fid]).fetchone()
    return folder_row_to_dict(row)


def search_workspace_explorer(
    org_id: str,
    workspace_id: str,
    query: str,
    *,
    limit: int = 50,
    allowed_project_ids: Optional[Iterable[str]] = None,
) -> Dict[str, Any]:
    """Search lightweight Explorer metadata across one workspace.

    The result intentionally avoids diagram/session payload columns such as
    BPMN XML and node/edge JSON.  Project scope is enforced by the caller via
    allowed_project_ids; when provided, folders are limited to ancestors of
    accessible projects.
    """
    _ensure_schema()
    oid = str(org_id or "").strip()
    wid = str(workspace_id or "").strip()
    q = str(query or "").strip()
    normalized_query = q.lower()
    max_limit = max(1, min(int(limit or 50), 100))
    allowed_projects: Optional[set[str]] = None
    if allowed_project_ids is not None:
        allowed_projects = {str(item or "").strip() for item in allowed_project_ids if str(item or "").strip()}
        if not allowed_projects:
            return {"workspace_id": wid, "query": q, "limit": max_limit, "groups": {"sections": [], "folders": [], "projects": [], "sessions": []}, "items": []}
    if not oid or not wid or len(normalized_query) < 2:
        return {"workspace_id": wid, "query": q, "limit": max_limit, "groups": {"sections": [], "folders": [], "projects": [], "sessions": []}, "items": []}

    def user_display(row: Any, prefix: str) -> str:
        if not row:
            return ""
        full_name = str((row[f"{prefix}_full_name"] if f"{prefix}_full_name" in row.keys() else "") or "").strip()
        email = str((row[f"{prefix}_email"] if f"{prefix}_email" in row.keys() else "") or "").strip()
        user_id = str((row[f"{prefix}_user_id"] if f"{prefix}_user_id" in row.keys() else "") or "").strip()
        return full_name or email or user_id

    def matches(*parts: Any) -> bool:
        haystack = " ".join(str(part or "") for part in parts).lower()
        return normalized_query in haystack

    def folder_path(folder_id: str) -> List[Dict[str, str]]:
        path: List[Dict[str, str]] = [{"type": "workspace", "id": wid, "title": workspace_name}]
        chain: List[Dict[str, Any]] = []
        cursor = str(folder_id or "").strip()
        seen: set[str] = set()
        while cursor and cursor not in seen:
            seen.add(cursor)
            folder = folders_by_id.get(cursor)
            if not folder:
                break
            chain.append(folder)
            cursor = str(folder.get("parent_id") or "")
        chain.reverse()
        for folder in chain:
            parent_id = str(folder.get("parent_id") or "")
            path.append({
                "type": "section" if not parent_id else "folder",
                "id": str(folder.get("id") or ""),
                "title": str(folder.get("name") or ""),
            })
        return path

    def append_item(item: Dict[str, Any]) -> None:
        if len(items) >= max_limit:
            return
        kind = str(item.get("type") or "")
        groups.setdefault(f"{kind}s", []).append(item)
        items.append(item)

    with _connect() as con:
        workspace_row = con.execute(
            "SELECT id, name FROM workspaces WHERE id = ? AND org_id = ? LIMIT 1",
            [wid, oid],
        ).fetchone()
        workspace_name = str((workspace_row["name"] if workspace_row else "") or wid or "Workspace")
        folder_rows = con.execute(
            """
            SELECT wf.*, ru.id AS responsible_user_id_lookup, ru.email AS responsible_email, ru.full_name AS responsible_full_name
            FROM workspace_folders wf
            LEFT JOIN users ru ON ru.id = wf.responsible_user_id
            WHERE wf.org_id = ? AND wf.workspace_id = ? AND wf.archived_at IS NULL
            ORDER BY wf.sort_order ASC, wf.name ASC
            """,
            [oid, wid],
        ).fetchall()
        project_rows = con.execute(
            """
            SELECT p.*, eu.id AS executor_user_id_lookup, eu.email AS executor_email, eu.full_name AS executor_full_name
            FROM projects p
            LEFT JOIN users eu ON eu.id = p.executor_user_id
            WHERE p.org_id = ? AND p.workspace_id = ?
            ORDER BY p.updated_at DESC, p.title ASC
            """,
            [oid, wid],
        ).fetchall()
        session_rows = con.execute(
            """
            SELECT s.id, s.title, s.project_id, s.interview_json, s.updated_at, s.created_at,
                   p.title AS project_title, p.folder_id AS folder_id
            FROM sessions s
            JOIN projects p ON p.id = s.project_id
            WHERE p.org_id = ? AND p.workspace_id = ?
            ORDER BY s.updated_at DESC, s.title ASC
            """,
            [oid, wid],
        ).fetchall()

    folders_by_id: Dict[str, Dict[str, Any]] = {}
    for row in folder_rows:
        folder = folder_row_to_dict(row)
        fid = str(folder.get("id") or "")
        if fid:
            folders_by_id[fid] = folder

    accessible_folder_ids: Optional[set[str]] = None
    if allowed_projects is not None:
        accessible_folder_ids = set()
        for row in project_rows:
            pid = str(row["id"] or "")
            if pid not in allowed_projects:
                continue
            cursor = str(row["folder_id"] or "")
            seen: set[str] = set()
            while cursor and cursor not in seen:
                seen.add(cursor)
                accessible_folder_ids.add(cursor)
                cursor = str((folders_by_id.get(cursor) or {}).get("parent_id") or "")

    groups: Dict[str, List[Dict[str, Any]]] = {"sections": [], "folders": [], "projects": [], "sessions": []}
    items: List[Dict[str, Any]] = []

    for row in folder_rows:
        folder = folder_row_to_dict(row)
        fid = str(folder.get("id") or "")
        if not fid:
            continue
        if accessible_folder_ids is not None and fid not in accessible_folder_ids:
            continue
        responsible_label = user_display(row, "responsible")
        context_status = str(folder.get("context_status") or "none")
        if not matches(folder.get("name"), context_status, responsible_label):
            continue
        parent_id = str(folder.get("parent_id") or "")
        kind = "section" if not parent_id else "folder"
        append_item({
            "type": kind,
            "id": fid,
            "title": str(folder.get("name") or ""),
            "subtitle": "Раздел" if kind == "section" else "Папка",
            "workspace_id": wid,
            "folder_id": fid,
            "project_id": "",
            "session_id": "",
            "path": folder_path(fid),
            "updated_at": int(folder.get("updated_at") or 0),
            "status": "",
            "context_status": context_status,
            "responsible_user_id": str(folder.get("responsible_user_id") or "").strip() or None,
            "executor_user_id": None,
        })

    for row in project_rows:
        pid = str(row["id"] or "")
        if not pid:
            continue
        if allowed_projects is not None and pid not in allowed_projects:
            continue
        passport = _json_loads(row["passport_json"], {})
        if not isinstance(passport, dict):
            passport = {}
        executor_label = user_display(row, "executor")
        status = str(passport.get("status", "active") or "active")
        title = str(row["title"] or "")
        if not matches(title, status, executor_label):
            continue
        folder_id = str(row["folder_id"] or "")
        path = folder_path(folder_id) if folder_id else [{"type": "workspace", "id": wid, "title": workspace_name}]
        path = [*path, {"type": "project", "id": pid, "title": title}]
        append_item({
            "type": "project",
            "id": pid,
            "title": title,
            "subtitle": "Проект",
            "workspace_id": wid,
            "folder_id": folder_id,
            "project_id": pid,
            "session_id": "",
            "path": path,
            "updated_at": int(row["updated_at"] or 0),
            "status": status,
            "context_status": "",
            "responsible_user_id": None,
            "executor_user_id": str(row["executor_user_id"] or "").strip() or None,
        })

    for row in session_rows:
        project_id = str(row["project_id"] or "")
        if not project_id:
            continue
        if allowed_projects is not None and project_id not in allowed_projects:
            continue
        interview = _json_loads(row["interview_json"], {})
        if not isinstance(interview, dict):
            interview = {}
        status = str(interview.get("status", "draft") or "draft")
        stage = str(interview.get("stage", "") or "")
        title = str(row["title"] or "")
        project_title = str(row["project_title"] or "")
        if not matches(title, status, stage, project_title):
            continue
        folder_id = str(row["folder_id"] or "")
        path = folder_path(folder_id) if folder_id else [{"type": "workspace", "id": wid, "title": workspace_name}]
        if project_id:
            path = [*path, {"type": "project", "id": project_id, "title": project_title or "Проект"}]
        append_item({
            "type": "session",
            "id": str(row["id"] or ""),
            "title": title,
            "subtitle": "Сессия",
            "workspace_id": wid,
            "folder_id": folder_id,
            "project_id": project_id,
            "session_id": str(row["id"] or ""),
            "path": path,
            "updated_at": int(row["updated_at"] or 0),
            "status": status,
            "stage": stage,
            "context_status": "",
            "responsible_user_id": None,
            "executor_user_id": None,
        })

    return {
        "workspace_id": wid,
        "query": q,
        "limit": max_limit,
        "groups": groups,
        "items": items,
    }


def update_template_folder(
    folder_id: str,
    *,
    name: Optional[str] = None,
    parent_id: Optional[str] = None,
    sort_order: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    fid = str(folder_id or "").strip()
    if not fid:
        return None
    current = get_template_folder(fid)
    if not current:
        return None
    next_name = str(name if name is not None else current.get("name") or "").strip()
    if not next_name:
        raise ValueError("name is required")
    next_sort_order = int(sort_order if sort_order is not None else current.get("sort_order") or 0)
    now = _now_ts()
    _ensure_schema()
    with _connect() as con:
        next_parent_id = (
            _validate_folder_parent(
                con=con,
                scope=_normalize_template_scope(current.get("scope")),
                owner_user_id=str(current.get("owner_user_id") or ""),
                org_id=str(current.get("org_id") or ""),
                folder_id=fid,
                parent_id=parent_id if parent_id is not None else current.get("parent_id"),
            )
        )
        con.execute(
            """
            UPDATE template_folders
               SET name = ?,
                   parent_id = ?,
                   sort_order = ?,
                   updated_at = ?
             WHERE id = ?
            """,
            [next_name, next_parent_id, next_sort_order, now, fid],
        )
        con.commit()
    return get_template_folder(fid)


def update_workspace_folder_business_fields(
    org_id: str,
    workspace_id: str,
    folder_id: str,
    *,
    responsible_user_id: Optional[str] = None,
    update_responsible: bool = False,
    context_status: Optional[str] = None,
    update_context_status: bool = False,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    _ensure_schema()
    oid = str(org_id or "").strip()
    wid = str(workspace_id or "").strip()
    fid = str(folder_id or "").strip()
    if not oid or not wid or not fid:
        raise ValueError("org_id, workspace_id and folder_id required")
    actor = _scope_user_id(user_id)
    now = _now_ts()
    with _connect() as con:
        existing = con.execute(
            "SELECT * FROM workspace_folders WHERE id = ? AND org_id = ? AND workspace_id = ? AND archived_at IS NULL LIMIT 1",
            [fid, oid, wid],
        ).fetchone()
        if not existing:
            raise ValueError("folder not found")
        sets: List[str] = []
        params: List[Any] = []
        if update_responsible:
            current_responsible = str(_row_value(existing, "responsible_user_id") or "").strip()
            next_responsible = str(responsible_user_id or "").strip() or None
            sets.append("responsible_user_id = ?")
            params.append(next_responsible)
            if current_responsible != (next_responsible or ""):
                sets.append("responsible_assigned_at = ?")
                params.append(now if next_responsible else None)
                sets.append("responsible_assigned_by = ?")
                params.append(actor if next_responsible else None)
        if update_context_status:
            sets.append("context_status = ?")
            params.append(str(context_status or "none").strip() or "none")
        if sets:
            sets.append("updated_at = ?")
            params.append(now)
            con.execute(
                f"UPDATE workspace_folders SET {', '.join(sets)} WHERE id = ? AND org_id = ? AND workspace_id = ?",
                [*params, fid, oid, wid],
            )
            con.commit()
        row = con.execute("SELECT * FROM workspace_folders WHERE id = ? LIMIT 1", [fid]).fetchone()
    return folder_row_to_dict(row)

from ..canvas_session import folder_row_to_dict
from ..compat.repository import _connect
from ..compat.repository import _ensure_schema
from ..compat.repository import _json_loads
from ..compat.repository import _now_ts
from ..compat.repository import _project_row_to_model
from ..compat.repository import _row_value
from ..compat.repository import _scope_user_id
from ..org_auth.repository import _normalize_template_scope
from ..org_auth.repository import _template_folder_row_to_dict
from ..org_auth.repository import get_workspace_record
