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
from ..compat.repository import SESSION_PRESENCE_TTL_SECONDS
from ..compat.repository import _BACKFILL_FOLDER_NAME
from ..compat.repository import _BACKFILL_META_KEY

def _build_diagram_truth_payload(sess: Session) -> Dict[str, Any]:
    return {
        "roles": list(getattr(sess, "roles", []) or []),
        "start_role": getattr(sess, "start_role", None),
        "notes": str(getattr(sess, "notes", "") or ""),
        "notes_by_element": getattr(sess, "notes_by_element", {}) or {},
        "interview": getattr(sess, "interview", {}) or {},
        "nodes": getattr(sess, "nodes", []) or [],
        "edges": getattr(sess, "edges", []) or [],
        "questions": getattr(sess, "questions", []) or [],
        "bpmn_xml": str(getattr(sess, "bpmn_xml", "") or ""),
        "bpmn_meta": getattr(sess, "bpmn_meta", {}) or {},
    }


def _count_bpmn_activities(xml: str) -> int:
    """Count BPMN flow nodes (tasks, events, gateways, subprocesses, call activities)."""
    if not xml:
        return 0
    try:
        return len(re.findall(
            r"<bpmn:(task|userTask|serviceTask|sendTask|receiveTask|manualTask|businessRuleTask|scriptTask|startEvent|endEvent|intermediateThrowEvent|intermediateCatchEvent|boundaryEvent|exclusiveGateway|parallelGateway|inclusiveGateway|eventBasedGateway|complexGateway|subProcess|callActivity|adHocSubProcess|transaction)",
            xml,
            flags=re.IGNORECASE,
        ))
    except Exception:
        return 0


def _diagram_truth_payload_hash(sess: Session) -> str:
    payload = _build_diagram_truth_payload(sess)
    raw = _json_dumps(payload, {})
    try:
        normalized = json.dumps(json.loads(raw), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    except Exception:
        normalized = raw
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _folder_row_to_dict(row: Any) -> Dict[str, Any]:
    return {
        "id": str(row["id"] or ""),
        "org_id": str(row["org_id"] or ""),
        "workspace_id": str((_row_value(row, "workspace_id") or "") or ""),
        "parent_id": str(row["parent_id"] or ""),
        "name": str(row["name"] or ""),
        "sort_order": int(row["sort_order"] or 0),
        "responsible_user_id": str(_row_value(row, "responsible_user_id") or "").strip() or None,
        "context_status": str(_row_value(row, "context_status") or "none").strip() or "none",
        "responsible_assigned_at": _row_value(row, "responsible_assigned_at"),
        "responsible_assigned_by": _row_value(row, "responsible_assigned_by"),
        "created_by": str(row["created_by"] or ""),
        "created_at": int(row["created_at"] or 0),
        "updated_at": int(row["updated_at"] or 0),
        "archived_at": row["archived_at"],
    }


def _is_integrity_error(exc: Exception) -> bool:
    if isinstance(exc, sqlite3.IntegrityError):
        return True
    if PsycopgIntegrityError is not None and isinstance(exc, PsycopgIntegrityError):
        return True
    return False


def _org_clause(org_id: str) -> Tuple[str, List[Any]]:
    oid = str(org_id or "").strip()
    if not oid:
        return "", []
    return " AND org_id = ? ", [oid]


def _owner_clause(owner_user_id: str, is_admin: bool) -> Tuple[str, List[Any]]:
    if is_admin or not owner_user_id:
        return "", []
    return " AND owner_user_id = ? ", [owner_user_id]


def _parse_json_text(text: Any) -> Any:
    return _json_loads(text, None)


def _session_presence_display_name(user_id: str, email: str = "", full_name: str = "") -> str:
    name = str(full_name or "").strip()
    if name:
        return name
    mail = str(email or "").strip().lower()
    if mail:
        return mail
    uid = str(user_id or "").strip()
    if not uid:
        return "Пользователь"
    return f"Пользователь {uid[:8]}"


def _assignable_user_payload(row: Any) -> Dict[str, Any]:
    uid = str(row["user_id"] or "").strip()
    email = str(row["email"] or "").strip().lower()
    full_name = str(row["full_name"] or "").strip()
    job_title = str(row["job_title"] or "").strip()
    display_name = full_name or email or uid
    return {
        "user_id": uid,
        "email": email,
        "full_name": full_name,
        "job_title": job_title,
        "display_name": display_name,
    }


def _load_session_assignees(session_ids: Iterable[str]) -> Dict[str, List[Dict[str, Any]]]:
    """Load assignees for a set of sessions in one query."""
    ids: List[str] = []
    seen: Set[str] = set()
    for raw in session_ids or []:
        sid = str(raw or "").strip()
        if sid and sid not in seen:
            seen.add(sid)
            ids.append(sid)
    out: Dict[str, List[Dict[str, Any]]] = {sid: [] for sid in ids}
    if not ids:
        return out
    placeholders = ", ".join(["?"] * len(ids))
    sql = f"""
        SELECT sa.session_id, sa.user_id, sa.assigned_by, sa.assigned_at,
               u.email, u.full_name, u.job_title
          FROM session_assignees sa
          LEFT JOIN users u ON u.id = sa.user_id
         WHERE sa.session_id IN ({placeholders})
         ORDER BY sa.assigned_at ASC, sa.user_id ASC
    """
    _ensure_schema()
    with _connect() as con:
        rows = con.execute(sql, ids).fetchall()
    for row in rows:
        sid = str(row["session_id"] or "").strip()
        if not sid:
            continue
        out.setdefault(sid, []).append(_assignable_user_payload(row))
    return out


def _table_columns(con: Any, table: str) -> Set[str]:
    try:
        rows = con.execute(f"PRAGMA table_info({table})").fetchall()
    except Exception:
        logger.exception("failed to inspect table columns for %s", table)
        return set()
    columns: Set[str] = set()
    for row in rows:
        name = str(_row_value(row, "name", 1) or "").strip()
        if name:
            columns.add(name)
    return columns


def _replace_session_assignees(
    session_id: str,
    user_ids: Iterable[str],
    *,
    assigned_by: str,
    org_id: str = "",
    project_id: str = "",
    assigned_at: Optional[int] = None,
) -> List[str]:
    """Idempotently replace assignees for a session. Returns final user_ids."""
    sid = str(session_id or "").strip()
    actor = str(assigned_by or "").strip()
    now = int(assigned_at or 0) or _now_ts()
    final_ids: List[str] = []
    seen: Set[str] = set()
    for raw in user_ids or []:
        uid = str(raw or "").strip()
        if uid and uid not in seen:
            seen.add(uid)
            final_ids.append(uid)
    if not sid:
        return final_ids
    _ensure_schema()
    with _connect() as con:
        con.execute("DELETE FROM session_assignees WHERE session_id = ?", [sid])
        if final_ids:
            columns = _table_columns(con, "session_assignees")
            insert_columns = ["session_id", "user_id"]
            value_builders = [
                lambda uid: sid,
                lambda uid: uid,
            ]
            optional_values = {
                "assigned_by": actor,
                "assigned_at": now,
                "org_id": str(org_id or "").strip(),
                "project_id": str(project_id or "").strip(),
                "created_at": now,
                "updated_at": now,
            }
            if "id" in columns:
                insert_columns.append("id")
                value_builders.append(lambda uid: uuid.uuid4().hex)
            for column, value in optional_values.items():
                if column in columns:
                    insert_columns.append(column)
                    value_builders.append(lambda uid, v=value: v)
            placeholders = ", ".join(["?"] * len(insert_columns))
            con.executemany(
                f"""
                INSERT INTO session_assignees ({", ".join(insert_columns)})
                VALUES ({placeholders})
                """,
                [tuple(builder(uid) for builder in value_builders) for uid in final_ids],
            )
        con.commit()
    return final_ids


def _session_to_explorer_dict(s: "Session", has_children: bool = False, children_count: int = 0) -> Dict[str, Any]:
    """Convert a Session model to the explorer-friendly dict shape."""
    from ....services.bpmn_navigation import find_subprocess_elements
    subprocess_count = len(find_subprocess_elements(str(getattr(s, "bpmn_xml", "") or "")))
    return {
        "id": s.id,
        "title": s.title,
        "project_id": s.project_id or "",
        "parent_session_id": str(getattr(s, "parent_session_id", "") or ""),
        "element_id_in_parent": str(getattr(s, "element_id_in_parent", "") or ""),
        "subprocesses_count": subprocess_count,
        "owner_user_id": s.owner_user_id,
        "org_id": s.org_id,
        "status": str((s.interview or {}).get("status", "draft") or "draft"),
        "stage": str((s.interview or {}).get("stage", "") or ""),
        "dod_percent": int((s.analytics or {}).get("dod_percent", 0) or 0),
        "attention_count": int((s.analytics or {}).get("attention_count", 0) or 0),
        "reports_count": int((s.analytics or {}).get("reports_count", 0) or 0),
        "updated_at": s.updated_at,
        "created_at": s.created_at,
        "has_children": bool(has_children),
        "children_count": int(children_count),
        "activity_count": int(getattr(s, "activity_count", 0) or 0),
        "bpmn_xml": str(getattr(s, "bpmn_xml", "") or ""),
        "assignees": [],
    }


def _without_session_companion_meta(value: Any) -> Any:
    if not isinstance(value, dict):
        return value
    return {
        str(k): v
        for k, v in value.items()
        if str(k) != "session_companion_v1"
    }


def activate_ai_prompt_version(
    prompt_id: str,
    *,
    actor_user_id: str = "",
    activated_at: Optional[int] = None,
) -> Dict[str, Any]:
    current = get_ai_prompt_version(prompt_id)
    if not current:
        raise ValueError("prompt not found")
    if str(current.get("status") or "") == "archived":
        raise ValueError("archived prompt cannot be activated")
    now = int(activated_at or 0) or _now_ts()
    actor = str(actor_user_id or "").strip()
    pid = str(current.get("prompt_id") or "")
    mid = str(current.get("module_id") or "")
    level = str(current.get("scope_level") or "global")
    sid = str(current.get("scope_id") or "")
    _ensure_schema()
    with _connect() as con:
        con.execute(
            """
            UPDATE ai_prompt_versions
               SET status = 'archived', archived_at = ?, updated_by = ?, updated_at = ?
             WHERE module_id = ? AND scope_level = ? AND scope_id = ? AND status = 'active' AND prompt_id <> ?
            """,
            [now, actor, now, mid, level, sid, pid],
        )
        con.execute(
            """
            UPDATE ai_prompt_versions
               SET status = 'active', activated_at = CASE WHEN activated_at > 0 THEN activated_at ELSE ? END,
                   archived_at = 0, updated_by = ?, updated_at = ?
             WHERE prompt_id = ?
            """,
            [now, actor, now, pid],
        )
        con.commit()
    updated = get_ai_prompt_version(pid)
    if not updated:
        raise ValueError("prompt not found")
    return updated


def archive_ai_prompt_version(
    prompt_id: str,
    *,
    actor_user_id: str = "",
    archived_at: Optional[int] = None,
) -> Dict[str, Any]:
    current = get_ai_prompt_version(prompt_id)
    if not current:
        raise ValueError("prompt not found")
    now = int(archived_at or 0) or _now_ts()
    actor = str(actor_user_id or "").strip()
    pid = str(current.get("prompt_id") or "")
    _ensure_schema()
    with _connect() as con:
        con.execute(
            """
            UPDATE ai_prompt_versions
               SET status = 'archived', archived_at = CASE WHEN archived_at > 0 THEN archived_at ELSE ? END,
                   updated_by = ?, updated_at = ?
             WHERE prompt_id = ?
            """,
            [now, actor, now, pid],
        )
        con.commit()
    updated = get_ai_prompt_version(pid)
    if not updated:
        raise ValueError("prompt not found")
    return updated


def build_session_version_payload(sess: Session) -> Dict[str, Any]:
    return {
        "title": str(getattr(sess, "title", "") or ""),
        "roles": list(getattr(sess, "roles", []) or []),
        "start_role": getattr(sess, "start_role", None),
        "mode": getattr(sess, "mode", None),
        "notes": str(getattr(sess, "notes", "") or ""),
        "notes_by_element": getattr(sess, "notes_by_element", {}) or {},
        "interview": getattr(sess, "interview", {}) or {},
        "nodes": getattr(sess, "nodes", []) or [],
        "edges": getattr(sess, "edges", []) or [],
        "questions": getattr(sess, "questions", []) or [],
        "bpmn_xml": str(getattr(sess, "bpmn_xml", "") or ""),
        "bpmn_graph_fingerprint": str(getattr(sess, "bpmn_graph_fingerprint", "") or ""),
        "bpmn_meta": _without_session_companion_meta(getattr(sess, "bpmn_meta", {}) or {}),
    }


def count_ai_prompt_versions(
    *,
    module_id: Optional[str] = None,
    status: Optional[str] = None,
    scope_level: Optional[str] = None,
    scope_id: Optional[str] = None,
) -> int:
    where, params = _build_ai_prompt_where(
        module_id=module_id,
        status=status,
        scope_level=scope_level,
        scope_id=scope_id,
    )
    _ensure_schema()
    with _connect() as con:
        row = con.execute(f"SELECT COUNT(*) FROM ai_prompt_versions WHERE {where}", params).fetchone()
    if not row:
        return 0
    try:
        return int(row[0] or 0)
    except Exception:
        return 0


def get_active_ai_prompt_version(
    *,
    module_id: str,
    scope_level: str = "global",
    scope_id: str = "",
) -> Optional[Dict[str, Any]]:
    mid = str(module_id or "").strip()
    if not mid:
        return None
    level = _normalize_ai_prompt_scope_level(scope_level)
    sid = "" if level == "global" else str(scope_id or "").strip()
    _ensure_schema()
    with _connect() as con:
        row = con.execute(
            """
            SELECT prompt_id, module_id, version, status, scope_level, scope_id, template,
                   variables_schema_json, output_schema_json, created_by, created_at, updated_by, updated_at,
                   activated_at, archived_at
              FROM ai_prompt_versions
             WHERE module_id = ? AND scope_level = ? AND scope_id = ? AND status = 'active'
             LIMIT 1
            """,
            [mid, level, sid],
        ).fetchone()
    return _ai_prompt_version_row_to_dict(row) if row else None


def get_folder_open_notes_aggregate(
    folder_id: str,
    *,
    org_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    allowed_project_ids: Optional[Iterable[str]] = None,
    viewer_user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Read-time Notes MVP-1 aggregate for projects in a folder subtree."""
    _ensure_schema()
    fid = str(folder_id or "").strip()
    oid = str(org_id or "").strip()
    wid = str(workspace_id or "").strip()
    if not fid or not oid or not wid:
        return _notes_aggregate_payload(0)
    allowed_projects = None
    if allowed_project_ids is not None:
        allowed_projects = [str(item or "").strip() for item in allowed_project_ids if str(item or "").strip()]
        if not allowed_projects:
            return _notes_aggregate_payload(0)
    project_scope_sql = ""
    cte_params: List[Any] = [fid, oid, wid, oid, wid]
    where_params: List[Any] = [oid, wid]
    if allowed_projects is not None:
        placeholders = ", ".join(["?"] * len(allowed_projects))
        project_scope_sql = f" AND p.id IN ({placeholders})"
        where_params.extend(allowed_projects)
    attention_count_case, attention_params = _attention_count_case("nt", viewer_user_id)
    personal_count_case, personal_params = _personal_discussion_count_case("nt", viewer_user_id)
    with _connect() as con:
        row = con.execute(
            f"""
            WITH RECURSIVE folder_tree(id) AS (
              SELECT id
              FROM workspace_folders
              WHERE id = ? AND org_id = ? AND workspace_id = ? AND archived_at IS NULL
              UNION ALL
              SELECT wf.id
              FROM workspace_folders wf
              JOIN folder_tree ft ON wf.parent_id = ft.id
              WHERE wf.org_id = ? AND wf.workspace_id = ? AND wf.archived_at IS NULL
            )
            SELECT
              SUM(CASE WHEN nt.status = 'open' THEN 1 ELSE 0 END) AS open_notes_count,
              {attention_count_case},
              {personal_count_case}
            FROM note_threads nt
            JOIN sessions s ON s.id = nt.session_id AND s.org_id = nt.org_id
            JOIN projects p ON p.id = s.project_id AND p.org_id = s.org_id
            WHERE nt.org_id = ?
              AND nt.deleted_at = 0
              AND p.workspace_id = ?
              AND p.folder_id IN (SELECT id FROM folder_tree)
              {project_scope_sql}
            """,
            [*cte_params, *attention_params, *personal_params, *where_params],
        ).fetchone()
    return _notes_aggregate_payload(
        _row_value(row, "open_notes_count", 0),
        _row_value(row, "attention_discussions_count", 0),
        _row_value(row, "personal_discussions_count", 0),
    )


def get_project_open_notes_aggregate(
    project_id: str,
    *,
    org_id: Optional[str] = None,
    viewer_user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Read-time Notes MVP-1 aggregate for all sessions in a project."""
    _ensure_schema()
    pid = str(project_id or "").strip()
    if not pid:
        return _notes_aggregate_payload(0)
    oid = str(org_id or "").strip()
    filters = ["s.project_id = ?", "nt.deleted_at = 0"]
    params: List[Any] = [pid]
    if oid:
        filters.append("s.org_id = ?")
        filters.append("nt.org_id = ?")
        params.extend([oid, oid])
    attention_count_case, attention_params = _attention_count_case("nt", viewer_user_id)
    personal_count_case, personal_params = _personal_discussion_count_case("nt", viewer_user_id)
    with _connect() as con:
        row = con.execute(
            f"""
            SELECT
              SUM(CASE WHEN nt.status = 'open' THEN 1 ELSE 0 END) AS open_notes_count,
              {attention_count_case},
              {personal_count_case}
            FROM note_threads nt
            JOIN sessions s ON s.id = nt.session_id
            WHERE {' AND '.join(filters)}
            """,
            [*attention_params, *personal_params, *params],
        ).fetchone()
    return _notes_aggregate_payload(
        _row_value(row, "open_notes_count", 0),
        _row_value(row, "attention_discussions_count", 0),
        _row_value(row, "personal_discussions_count", 0),
    )


def get_project_session_tree(
    org_id: str,
    project_id: str,
    *,
    user_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    max_depth: int = 3,
) -> List[Dict[str, Any]]:
    """Return the full session tree for a project (roots + nested children).

    Loads all accessible sessions in one query, then builds the tree in memory.
    Depth is capped to avoid accidental deep recursion.
    """
    _ensure_schema()
    oid = str(org_id or "").strip()
    pid = str(project_id or "").strip()
    if not pid:
        return []

    filters = ["s.project_id = ?", "(s.deleted_at = 0 OR s.deleted_at IS NULL)"]
    params: List[Any] = [pid]
    if oid:
        filters.append("s.org_id = ?")
        params.append(oid)

    scope_filters, scope_params = _session_read_scope_filters(user_id, is_admin, oid)
    filters.extend(scope_filters)
    params.extend(scope_params)

    where = " AND ".join(filters)
    sql = f"""
        SELECT s.*,
          EXISTS(SELECT 1 FROM sessions c WHERE c.parent_session_id = s.id AND c.project_id = s.project_id AND (c.deleted_at = 0 OR c.deleted_at IS NULL)) AS has_children,
          (SELECT COUNT(*) FROM sessions c WHERE c.parent_session_id = s.id AND c.project_id = s.project_id AND (c.deleted_at = 0 OR c.deleted_at IS NULL)) AS children_count
        FROM sessions s
        WHERE {where}
        ORDER BY s.updated_at DESC
    """

    with _connect() as con:
        rows = con.execute(sql, params).fetchall()

    if oid and not rows:
        # Fallback for legacy org_id mismatches
        fallback_params = [pid]
        fallback_sql = f"""
            SELECT s.*,
              EXISTS(SELECT 1 FROM sessions c WHERE c.parent_session_id = s.id AND c.project_id = s.project_id AND (c.deleted_at = 0 OR c.deleted_at IS NULL)) AS has_children,
              (SELECT COUNT(*) FROM sessions c WHERE c.parent_session_id = s.id AND c.project_id = s.project_id AND (c.deleted_at = 0 OR c.deleted_at IS NULL)) AS children_count
            FROM sessions s
            WHERE s.project_id = ? AND (s.deleted_at = 0 OR s.deleted_at IS NULL)
            ORDER BY s.updated_at DESC
        """
        rows = con.execute(fallback_sql, fallback_params).fetchall()

    by_id: Dict[str, Dict[str, Any]] = {}
    roots: List[Dict[str, Any]] = []
    for row in rows:
        s = _session_row_to_model(row)
        item = _session_to_explorer_dict(s, bool(row["has_children"]), int(row["children_count"] or 0))
        item["children"] = []
        by_id[item["id"]] = item
        if not item.get("parent_session_id"):
            roots.append(item)

    if by_id:
        assignees_by_session = _load_session_assignees(by_id.keys())
        for sid, item in by_id.items():
            item["assignees"] = assignees_by_session.get(sid) or []

    # Attach children (only if within max_depth; current implementation loads all,
    # but nesting is limited by the recursive helper below).
    def attach(parent: Dict[str, Any], depth: int) -> None:
        if depth >= max_depth:
            return
        pid_local = parent["id"]
        for item in by_id.values():
            if item.get("parent_session_id") == pid_local:
                parent["children"].append(item)
                attach(item, depth + 1)

    for root in roots:
        attach(root, 1)

    return roots


def get_session_open_notes_aggregate(
    session_id: str,
    *,
    org_id: Optional[str] = None,
    viewer_user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Read-time Notes MVP-1 aggregate for a single session."""
    _ensure_schema()
    sid = str(session_id or "").strip()
    if not sid:
        return _notes_aggregate_payload(0)
    oid = str(org_id or "").strip()
    filters = ["nt.session_id = ?", "nt.deleted_at = 0"]
    params: List[Any] = [sid]
    if oid:
        filters.append("nt.org_id = ?")
        params.append(oid)
    attention_count_case, attention_params = _attention_count_case("nt", viewer_user_id)
    personal_count_case, personal_params = _personal_discussion_count_case("nt", viewer_user_id)
    with _connect() as con:
        row = con.execute(
            f"""
            SELECT
              SUM(CASE WHEN nt.status = 'open' THEN 1 ELSE 0 END) AS open_notes_count,
              {attention_count_case},
              {personal_count_case}
            FROM note_threads nt
            WHERE {' AND '.join(filters)}
            """,
            [*attention_params, *personal_params, *params],
        ).fetchone()
    return _notes_aggregate_payload(
        _row_value(row, "open_notes_count", 0),
        _row_value(row, "attention_discussions_count", 0),
        _row_value(row, "personal_discussions_count", 0),
    )


def get_sessions_open_notes_aggregates(
    session_ids: Iterable[str],
    *,
    org_id: Optional[str] = None,
    viewer_user_id: Optional[str] = None,
) -> Dict[str, Dict[str, Any]]:
    """Read-time Notes aggregate for multiple sessions in one query."""
    _ensure_schema()
    ids: List[str] = []
    seen: set[str] = set()
    for raw in session_ids or []:
        sid = str(raw or "").strip()
        if sid and sid not in seen:
            seen.add(sid)
            ids.append(sid)
    if not ids:
        return {}
    out: Dict[str, Dict[str, Any]] = {
        sid: _notes_aggregate_payload(0)
        for sid in ids
    }
    placeholders = ", ".join(["?"] * len(ids))
    filters = [f"nt.session_id IN ({placeholders})", "nt.deleted_at = 0"]
    params: List[Any] = [*ids]
    oid = str(org_id or "").strip()
    if oid:
        filters.append("nt.org_id = ?")
        params.append(oid)
    attention_count_case, attention_params = _attention_count_case("nt", viewer_user_id)
    personal_count_case, personal_params = _personal_discussion_count_case("nt", viewer_user_id)
    with _connect() as con:
        rows = con.execute(
            f"""
            SELECT
              nt.session_id AS session_id,
              SUM(CASE WHEN nt.status = 'open' THEN 1 ELSE 0 END) AS open_notes_count,
              {attention_count_case},
              {personal_count_case}
            FROM note_threads nt
            WHERE {' AND '.join(filters)}
            GROUP BY nt.session_id
            """,
            [*attention_params, *personal_params, *params],
        ).fetchall()
    for row in rows:
        sid = str(_row_value(row, "session_id") or "").strip()
        if not sid:
            continue
        out[sid] = _notes_aggregate_payload(
            _row_value(row, "open_notes_count", 0),
            _row_value(row, "attention_discussions_count", 0),
            _row_value(row, "personal_discussions_count", 0),
        )
    return out


def leave_session_presence(
    session_id: str,
    user_id: str,
    client_id: str,
    *,
    org_id: str = "",
    project_id: str = "",
) -> int:
    sid = str(session_id or "").strip()
    uid = str(user_id or "").strip()
    cid = str(client_id or "").strip()[:128]
    if not sid or not uid or not cid:
        return 0
    oid = str(org_id or "").strip() or _default_org_id()
    pid = str(project_id or "").strip()
    filters = ["session_id = ?", "user_id = ?", "client_id = ?", "org_id = ?"]
    params: List[Any] = [sid, uid, cid, oid]
    if pid:
        filters.append("project_id = ?")
        params.append(pid)
    _ensure_schema()
    with _connect() as con:
        cur = con.execute(
            f"DELETE FROM session_presence WHERE {' AND '.join(filters)}",
            params,
        )
        con.commit()
        return int(cur.rowcount or 0)


def list_ai_prompt_versions(
    *,
    module_id: Optional[str] = None,
    status: Optional[str] = None,
    scope_level: Optional[str] = None,
    scope_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    lim = max(1, min(int(limit or 50), 200))
    off = max(0, int(offset or 0))
    where, params = _build_ai_prompt_where(
        module_id=module_id,
        status=status,
        scope_level=scope_level,
        scope_id=scope_id,
    )
    _ensure_schema()
    with _connect() as con:
        rows = con.execute(
            f"""
            SELECT prompt_id, module_id, version, status, scope_level, scope_id, template,
                   variables_schema_json, output_schema_json, created_by, created_at, updated_by, updated_at,
                   activated_at, archived_at
              FROM ai_prompt_versions
             WHERE {where}
             ORDER BY updated_at DESC, created_at DESC, prompt_id DESC
             LIMIT ?
            OFFSET ?
            """,
            [*params, lim, off],
        ).fetchall()
    return [_ai_prompt_version_row_to_dict(row) for row in rows]


def list_project_sessions_for_explorer(
    org_id: str,
    project_id: str,
    root_only: bool = False,
    include_children_meta: bool = False,
) -> List[Dict[str, Any]]:
    """List sessions for a project, explorer-friendly format.

    Falls back to no-org-filter when org_id mismatches legacy data.
    When root_only=True only root sessions are returned.
    When include_children_meta=True each item includes has_children.
    """
    _ensure_schema()
    oid = str(org_id or "").strip()
    pid = str(project_id or "").strip()

    base_filters = ["project_id = ?"]
    params: List[Any] = [pid]
    if oid:
        base_filters.append("org_id = ?")
        params.append(oid)

    root_filter = " AND COALESCE(parent_session_id, '') = ''" if root_only else ""
    children_meta_sql = ""
    if include_children_meta:
        children_meta_sql = """,
          EXISTS(SELECT 1 FROM sessions c WHERE c.parent_session_id = s.id AND c.project_id = s.project_id AND (c.deleted_at = 0 OR c.deleted_at IS NULL)) AS has_children,
          (SELECT COUNT(*) FROM sessions c WHERE c.parent_session_id = s.id AND c.project_id = s.project_id AND (c.deleted_at = 0 OR c.deleted_at IS NULL)) AS children_count"""

    sql = f"""
        SELECT s.*{children_meta_sql}
        FROM sessions s
        WHERE {' AND '.join(base_filters)}{root_filter}
        ORDER BY s.updated_at DESC
    """

    def _run_query(query: str, query_params: List[Any]) -> List[Any]:
        with _connect() as con:
            return con.execute(query, query_params).fetchall()

    rows = _run_query(sql, params)
    if oid and not rows:
        # Fallback: legacy sessions may have wrong org_id
        fallback_params = [pid]
        fallback_sql = f"""
            SELECT s.*{children_meta_sql}
            FROM sessions s
            WHERE project_id = ?{root_filter}
            ORDER BY s.updated_at DESC
        """
        rows = _run_query(fallback_sql, fallback_params)

    result = []
    for row in rows:
        s = _session_row_to_model(row)
        has_children = bool(row["has_children"]) if include_children_meta else False
        children_count = int(row["children_count"] or 0) if include_children_meta else 0
        result.append(_session_to_explorer_dict(s, has_children, children_count))

    if result:
        assignees_by_session = _load_session_assignees(item["id"] for item in result)
        for item in result:
            item["assignees"] = assignees_by_session.get(item["id"]) or []

    return result


def list_session_children(
    org_id: str,
    project_id: str,
    parent_session_id: str,
    user_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> List[Dict[str, Any]]:
    """Return immediate child sessions of a parent session."""
    _ensure_schema()
    oid = str(org_id or "").strip()
    pid = str(project_id or "").strip()
    psid = str(parent_session_id or "").strip()
    if not psid:
        return []

    filters = ["project_id = ?", "parent_session_id = ?", "(s.deleted_at = 0 OR s.deleted_at IS NULL)"]
    params: List[Any] = [pid, psid]
    if oid:
        filters.append("org_id = ?")
        params.append(oid)

    scope_filters, scope_params = _session_read_scope_filters(user_id, is_admin, oid)
    filters.extend(scope_filters)
    params.extend(scope_params)

    where = " AND ".join(filters)
    sql = f"""
        SELECT s.*,
          EXISTS(SELECT 1 FROM sessions c WHERE c.parent_session_id = s.id AND c.project_id = s.project_id AND (c.deleted_at = 0 OR c.deleted_at IS NULL)) AS has_children,
          (SELECT COUNT(*) FROM sessions c WHERE c.parent_session_id = s.id AND c.project_id = s.project_id AND (c.deleted_at = 0 OR c.deleted_at IS NULL)) AS children_count
        FROM sessions s
        WHERE {where}
        ORDER BY s.updated_at DESC
    """

    with _connect() as con:
        rows = con.execute(sql, params).fetchall()

    result = []
    for row in rows:
        s = _session_row_to_model(row)
        result.append(_session_to_explorer_dict(s, bool(row["has_children"]), int(row["children_count"] or 0)))

    if result:
        assignees_by_session = _load_session_assignees(item["id"] for item in result)
        for item in result:
            item["assignees"] = assignees_by_session.get(item["id"]) or []

    return result


def list_session_presence(
    session_id: str,
    *,
    org_id: str = "",
    project_id: str = "",
    ttl_seconds: int = SESSION_PRESENCE_TTL_SECONDS,
    now_ts: Optional[int] = None,
    current_user_id: str = "",
) -> List[Dict[str, Any]]:
    sid = str(session_id or "").strip()
    if not sid:
        return []
    oid = str(org_id or "").strip() or _default_org_id()
    pid = str(project_id or "").strip()
    ttl = max(30, int(ttl_seconds or SESSION_PRESENCE_TTL_SECONDS))
    now = int(now_ts or 0) or _now_ts()
    cutoff = now - ttl
    current_uid = str(current_user_id or "").strip()
    _ensure_schema()
    filters = ["sp.session_id = ?", "sp.org_id = ?", "sp.last_seen_at >= ?"]
    params: List[Any] = [sid, oid, cutoff]
    if pid:
        filters.append("sp.project_id = ?")
        params.append(pid)
    where = " AND ".join(filters)
    with _connect() as con:
        rows = con.execute(
            f"""
            SELECT sp.user_id,
                   MAX(sp.last_seen_at) AS last_seen_at,
                   MAX(sp.updated_at) AS updated_at,
                   MAX(u.email) AS email,
                   MAX(u.full_name) AS full_name,
                   MAX(u.job_title) AS job_title
              FROM session_presence sp
              LEFT JOIN users u ON u.id = sp.user_id
             WHERE {where}
             GROUP BY sp.user_id
             ORDER BY last_seen_at DESC, sp.user_id ASC
            """,
            params,
        ).fetchall()
    out: List[Dict[str, Any]] = []
    for row in rows:
        uid = str(row["user_id"] or "")
        email = str(row["email"] or "").strip().lower()
        full_name = str(row["full_name"] or "").strip()
        job_title = str(row["job_title"] or "").strip()
        out.append(
            {
                "user_id": uid,
                "display_name": _session_presence_display_name(uid, email=email, full_name=full_name),
                "email": email,
                "full_name": full_name,
                "job_title": job_title,
                "last_seen_at": int(row["last_seen_at"] or 0),
                "is_current_user": bool(current_uid and uid == current_uid),
            }
        )
    return out


def prune_stale_session_presence(*, ttl_seconds: int = SESSION_PRESENCE_TTL_SECONDS, now_ts: Optional[int] = None) -> int:
    ttl = max(30, int(ttl_seconds or SESSION_PRESENCE_TTL_SECONDS))
    now = int(now_ts or 0) or _now_ts()
    cutoff = now - ttl
    _ensure_schema()
    with _connect() as con:
        cur = con.execute(
            "DELETE FROM session_presence WHERE last_seen_at < ?",
            [cutoff],
        )
        con.commit()
        return int(cur.rowcount or 0)


def run_workspace_folder_backfill(*, force: bool = False) -> Dict[str, Any]:
    """
    Public repair command: move all orphan projects (folder_id empty or invalid)
    into per-org 'Импортировано' folder.

    Set force=True to re-run even if already marked done.
    Returns summary dict.
    """
    _ensure_schema()
    with _connect() as con:
        if force:
            # Reset the completion mark so the backfill runs again
            con.execute(
                "DELETE FROM storage_meta WHERE key = ?",
                [_BACKFILL_META_KEY],
            )
        _ensure_workspace_folder_backfill(con)
        con.commit()

    # Count remaining orphans (should be 0 after backfill)
    with _connect() as con:
        remaining = con.execute(
            """
            SELECT COUNT(*) AS cnt FROM projects p
            WHERE p.folder_id = ''
               OR NOT EXISTS (
                   SELECT 1 FROM workspace_folders wf
                    WHERE wf.id = p.folder_id
                      AND wf.org_id = p.org_id
                      AND wf.archived_at IS NULL
               )
            """
        ).fetchone()
        remaining_count = int(remaining["cnt"] or 0) if remaining else 0

    return {
        "ok": True,
        "remaining_orphan_projects": remaining_count,
        "backfill_folder_name": _BACKFILL_FOLDER_NAME,
    }


def session_version_payload_hash(sess: Session) -> str:
    payload = build_session_version_payload(sess)
    raw = _json_dumps(payload, {})
    try:
        normalized = json.dumps(json.loads(raw), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    except Exception:
        normalized = raw
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def touch_session_presence(
    session_id: str,
    user_id: str,
    client_id: str,
    *,
    org_id: str = "",
    project_id: str = "",
    surface: str = "process_stage",
    now_ts: Optional[int] = None,
) -> Dict[str, Any]:
    sid = str(session_id or "").strip()
    uid = str(user_id or "").strip()
    cid = str(client_id or "").strip()[:128]
    if not sid or not uid or not cid:
        raise ValueError("session_id, user_id and client_id are required")
    oid = str(org_id or "").strip() or _default_org_id()
    pid = str(project_id or "").strip()
    surf = str(surface or "process_stage").strip()[:64] or "process_stage"
    now = int(now_ts or 0) or _now_ts()
    _ensure_schema()
    with _connect() as con:
        con.execute(
            """
            INSERT INTO session_presence (
              session_id, user_id, client_id, org_id, project_id, surface,
              last_seen_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id, user_id, client_id) DO UPDATE SET
              org_id = excluded.org_id,
              project_id = excluded.project_id,
              surface = excluded.surface,
              last_seen_at = excluded.last_seen_at,
              updated_at = excluded.updated_at
            """,
            [sid, uid, cid, oid, pid, surf, now, now, now],
        )
        con.commit()
    return {
        "session_id": sid,
        "user_id": uid,
        "client_id": cid,
        "org_id": oid,
        "project_id": pid,
        "surface": surf,
        "last_seen_at": now,
        "created_at": now,
        "updated_at": now,
    }

from ..ai.repository import _build_ai_prompt_where
from ..ai.repository import _normalize_ai_prompt_scope_level
from ..ai.repository import get_ai_prompt_version
from ..compat.repository import _ai_prompt_version_row_to_dict
from ..compat.repository import _connect
from ..compat.repository import _ensure_schema
from ..compat.repository import _json_dumps
from ..compat.repository import _json_loads
from ..compat.repository import _now_ts
from ..compat.repository import _row_value
from ..compat.repository import _session_read_scope_filters
from ..compat.repository import _session_row_to_model
from ..notes.repository import _attention_count_case
from ..notes.repository import _notes_aggregate_payload
from ..notes.repository import _personal_discussion_count_case
from ..org_auth.repository import _default_org_id
from ..org_auth.repository import _ensure_workspace_folder_backfill


# Public aliases for the session assignee helpers (kept private during module load).
load_session_assignees = _load_session_assignees
replace_session_assignees = _replace_session_assignees
