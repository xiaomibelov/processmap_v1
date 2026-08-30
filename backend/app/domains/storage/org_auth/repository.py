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
from ..compat.repository import _AUTH_USERS_BACKFILL_MARK
from ..compat.repository import _BACKFILL_FOLDER_NAME
from ..compat.repository import _BACKFILL_META_KEY
from ..compat.repository import _DEFAULT_ORG_ID
from ..compat.repository import _DEFAULT_ORG_NAME
from ..compat.repository import _DEFAULT_WORKSPACE_NAME
from ..compat.repository import _ORG_MEMBER_ROLES
from ..compat.repository import _PERMISSION_KEYS
from ..compat.repository import _PROJECT_MEMBER_ROLES

def _admin_entity_permission_defaults(entity_type: str, role: str) -> Dict[str, bool]:
    key = str(role or "").strip().lower()
    owner_admin = key in {"org_owner", "org_admin"}
    editor_pm = key in {"editor", "project_manager"}
    if entity_type == "users":
        return {"view": True, "edit": owner_admin or editor_pm, "manage": owner_admin, "admin": owner_admin}
    if entity_type == "sessions":
        return {"view": True, "edit": owner_admin or editor_pm, "manage": owner_admin}
    if entity_type == "folders":
        return {"view": True, "edit": owner_admin or editor_pm, "manage": owner_admin, "admin": owner_admin}
    if entity_type == "workspaces":
        return {"view": True, "edit": owner_admin or editor_pm, "manage": owner_admin, "admin": owner_admin}
    if entity_type == "analytics":
        return {
            "dk_view": True,
            "dk_export": owner_admin or editor_pm,
            "fk_view": True,
            "fk_export": owner_admin or editor_pm,
            "manage_dashboards": owner_admin,
        }
    return {"view": True}


def _admin_entity_permission_keys(entity_type: str) -> Tuple[str, ...]:
    if entity_type == "analytics":
        return ("dk_view", "dk_export", "fk_view", "fk_export", "manage_dashboards")
    if entity_type in {"users", "folders", "workspaces"}:
        return ("view", "edit", "manage", "admin")
    if entity_type == "sessions":
        return ("view", "edit", "manage")
    return ("view",)


def _as_int_bool(value: Any, *, default: bool = False) -> int:
    if isinstance(value, str):
        text = value.strip().lower()
        if text in {"1", "true", "yes", "on"}:
            return 1
        if text in {"0", "false", "no", "off", ""}:
            return 0
    if value is None:
        return 1 if default else 0
    return 1 if bool(value) else 0


def _auth_user_from_mapping(raw: Mapping[str, Any], *, now: Optional[int] = None) -> Dict[str, Any]:
    ts = int(now or _now_ts())
    created_at_raw = raw.get("created_at")
    try:
        created_at = int(created_at_raw or 0)
    except Exception:
        created_at = 0
    if created_at <= 0:
        created_at = ts
    try:
        updated_at = int(raw.get("updated_at") or 0)
    except Exception:
        updated_at = 0
    try:
        activated_at = int(raw.get("activated_at") or 0)
    except Exception:
        activated_at = 0
    try:
        activation_expires_at = int(raw.get("activation_expires_at") or 0)
    except Exception:
        activation_expires_at = 0
    return {
        "id": str(raw.get("id") or "").strip(),
        "email": _normalize_email(raw.get("email")),
        "password_hash": str(raw.get("password_hash") or ""),
        "is_active": bool(_as_int_bool(raw.get("is_active"), default=True)),
        "is_admin": bool(_as_int_bool(raw.get("is_admin"), default=False)),
        "created_at": created_at,
        "updated_at": updated_at,
        "activation_pending": bool(_as_int_bool(raw.get("activation_pending"), default=False)),
        "activated_at": activated_at,
        "activation_required": bool(_as_int_bool(raw.get("activation_required"), default=False)),
        "activation_token_hash": str(raw.get("activation_token_hash") or ""),
        "activation_expires_at": activation_expires_at,
        "full_name": str(raw.get("full_name") or "").strip(),
        "job_title": str(raw.get("job_title") or "").strip(),
    }


def _auth_user_insert_params(user: Mapping[str, Any]) -> List[Any]:
    normalized = _auth_user_from_mapping(user)
    return [
        normalized["id"],
        normalized["email"],
        normalized["password_hash"],
        _as_int_bool(normalized["is_active"], default=True),
        _as_int_bool(normalized["is_admin"], default=False),
        int(normalized["created_at"] or 0),
        int(normalized["updated_at"] or 0),
        _as_int_bool(normalized["activation_pending"], default=False),
        int(normalized["activated_at"] or 0),
        _as_int_bool(normalized["activation_required"], default=False),
        str(normalized["activation_token_hash"] or ""),
        int(normalized["activation_expires_at"] or 0),
        str(normalized["full_name"] or ""),
        str(normalized["job_title"] or ""),
    ]


def _auth_user_row_to_dict(row: Any) -> Dict[str, Any]:
    return {
        "id": str(_row_value(row, "id") or "").strip(),
        "email": _normalize_email(_row_value(row, "email")),
        "password_hash": str(_row_value(row, "password_hash") or ""),
        "is_active": bool(int(_row_value(row, "is_active") or 0)),
        "is_admin": bool(int(_row_value(row, "is_admin") or 0)),
        "created_at": int(_row_value(row, "created_at") or 0),
        "updated_at": int(_row_value(row, "updated_at") or 0),
        "activation_pending": bool(int(_row_value(row, "activation_pending") or 0)),
        "activated_at": int(_row_value(row, "activated_at") or 0),
        "activation_required": bool(int(_row_value(row, "activation_required") or 0)),
        "activation_token_hash": str(_row_value(row, "activation_token_hash") or ""),
        "activation_expires_at": int(_row_value(row, "activation_expires_at") or 0),
        "full_name": str(_row_value(row, "full_name") or "").strip(),
        "job_title": str(_row_value(row, "job_title") or "").strip(),
        "role": str(_row_value(row, "role") or "analyst").strip() or "analyst",
    }


def _default_org_id() -> str:
    return _DEFAULT_ORG_ID


def _default_org_name() -> str:
    return _DEFAULT_ORG_NAME


def _default_workspace_id(org_id: str) -> str:
    oid = str(org_id or "").strip() or _default_org_id()
    return f"ws_{oid}_main"


def _default_workspace_name() -> str:
    return _DEFAULT_WORKSPACE_NAME


def _ensure_auth_users_backfill(con: Any) -> None:
    if _meta_get(con, _AUTH_USERS_BACKFILL_MARK) == "done":
        return
    rows = _read_auth_users_rows()
    if not rows:
        return
    for row in rows:
        _insert_auth_user_ignore(con, row)
    _meta_set(con, _AUTH_USERS_BACKFILL_MARK, "done")


def _ensure_org_workspaces_bootstrap(con: Any) -> None:
    rows = con.execute("SELECT id, created_by FROM orgs ORDER BY created_at ASC, id ASC").fetchall()
    org_ids: List[str] = []
    for row in rows:
        oid = str(_row_value(row, "id", 0) or "").strip()
        if not oid:
            continue
        org_ids.append(oid)
        _ensure_workspace_record(
            con,
            oid,
            created_by=str(_row_value(row, "created_by", 1) or "").strip(),
        )
        default_wid = _default_workspace_id(oid)
        con.execute(
            """
            UPDATE workspace_folders
               SET workspace_id = ?
             WHERE org_id = ?
               AND COALESCE(workspace_id, '') = ''
            """,
            [default_wid, oid],
        )
        con.execute(
            """
            UPDATE projects
               SET workspace_id = (
                 SELECT COALESCE(NULLIF(wf.workspace_id, ''), ?)
                   FROM workspace_folders wf
                  WHERE wf.id = projects.folder_id
                  LIMIT 1
               )
             WHERE org_id = ?
               AND COALESCE(workspace_id, '') = ''
               AND COALESCE(folder_id, '') <> ''
            """,
            [default_wid, oid],
        )
        con.execute(
            """
            UPDATE projects
               SET workspace_id = ?
             WHERE org_id = ?
               AND COALESCE(workspace_id, '') = ''
            """,
            [default_wid, oid],
        )


def _ensure_workspace_folder_backfill(con: Any) -> None:
    """
    Backfill: move every project with an empty or non-existent folder_id into a
    per-org system folder called _BACKFILL_FOLDER_NAME so the explorer
    always has valid hierarchy (project must live in a folder).

    Idempotent: tracked via storage_meta key.  Safe to call repeatedly.
    """
    already_done = _meta_get(con, _BACKFILL_META_KEY)
    if already_done == "done":
        return

    now = _now_ts()

    # Collect all distinct org_ids that have orphan projects
    # (folder_id empty OR folder_id points to a non-existent/archived folder)
    orphan_rows = con.execute(
        """
        SELECT p.id, p.org_id, p.folder_id
        FROM projects p
        WHERE p.folder_id = ''
           OR NOT EXISTS (
               SELECT 1 FROM workspace_folders wf
                WHERE wf.id = p.folder_id
                  AND wf.org_id = p.org_id
                  AND wf.archived_at IS NULL
           )
        """
    ).fetchall()

    if not orphan_rows:
        _meta_set(con, _BACKFILL_META_KEY, "done")
        return

    # Group orphan project ids by org_id
    by_org: Dict[str, List[str]] = {}
    for row in orphan_rows:
        oid = str(row["org_id"] or "").strip()
        pid = str(row["id"] or "").strip()
        if oid and pid:
            by_org.setdefault(oid, []).append(pid)

    for org_id, project_ids in by_org.items():
        default_workspace_id = _default_workspace_id(org_id)
        # Find or create the "Импортировано" backfill folder at workspace root
        existing_bf = con.execute(
            """
            SELECT id FROM workspace_folders
            WHERE org_id = ? AND workspace_id = ? AND parent_id = '' AND name = ? AND archived_at IS NULL
            LIMIT 1
            """,
            [org_id, default_workspace_id, _BACKFILL_FOLDER_NAME],
        ).fetchone()

        if existing_bf:
            bf_folder_id = str(existing_bf["id"])
        else:
            bf_folder_id = uuid.uuid4().hex[:12]
            con.execute(
                """
                INSERT INTO workspace_folders (id, org_id, workspace_id, parent_id, name, sort_order, created_by, created_at, updated_at)
                VALUES (?, ?, ?, '', ?, 9999, 'system', ?, ?)
                """,
                [bf_folder_id, org_id, default_workspace_id, _BACKFILL_FOLDER_NAME, now, now],
            )

        # Move all orphan projects for this org into the backfill folder
        for pid in project_ids:
            con.execute(
                "UPDATE projects SET folder_id = ?, workspace_id = ?, updated_at = ? WHERE id = ? AND org_id = ?",
                [bf_folder_id, default_workspace_id, now, pid, org_id],
            )

    _meta_set(con, _BACKFILL_META_KEY, "done")


def _ensure_workspace_record(
    con: Any,
    org_id: str,
    *,
    created_by: str = "",
    workspace_id: Optional[str] = None,
    name: Optional[str] = None,
) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    if not oid:
        raise ValueError("org_id required")
    now = _now_ts()
    wid = str(workspace_id or "").strip() or _default_workspace_id(oid)
    title = str(name or "").strip() or _default_workspace_name()
    actor = str(created_by or "").strip()
    con.execute(
        """
        INSERT INTO workspaces (id, org_id, name, created_at, created_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          org_id = excluded.org_id,
          name = COALESCE(NULLIF(workspaces.name, ''), excluded.name),
          updated_at = excluded.updated_at
        """,
        [wid, oid, title, now, actor, now],
    )
    row = con.execute(
        """
        SELECT id, org_id, name, created_at, created_by, updated_at
          FROM workspaces
         WHERE id = ?
         LIMIT 1
        """,
        [wid],
    ).fetchone()
    return {
        "id": str(_row_value(row, "id", 0) or wid),
        "org_id": str(_row_value(row, "org_id", 1) or oid),
        "name": str(_row_value(row, "name", 2) or title),
        "created_at": int(_row_value(row, "created_at", 3) or now),
        "created_by": str(_row_value(row, "created_by", 4) or actor),
        "updated_at": int(_row_value(row, "updated_at", 5) or now),
    }


def _group_member_user_row(row: Any) -> Dict[str, Any]:
    return {
        "user_id": str(row["user_id"] or ""),
        "email": str(row["email"] or "").lower(),
        "full_name": str(row["full_name"] or ""),
        "job_title": str(row["job_title"] or ""),
        "created_at": int(row["created_at"] or 0),
        "created_by": str(row["created_by"] or ""),
    }


def _group_row_to_dict(row: Any) -> Dict[str, Any]:
    return {
        "id": str(row["id"] or ""),
        "org_id": str(row["org_id"] or ""),
        "name": str(row["name"] or ""),
        "description": str(row["description"] or ""),
        "created_at": int(row["created_at"] or 0),
        "updated_at": int(row["updated_at"] or 0),
        "created_by": str(row["created_by"] or ""),
        "updated_by": str(row["updated_by"] or ""),
    }


def _insert_auth_user_ignore(con: Any, raw: Mapping[str, Any]) -> None:
    user = _auth_user_from_mapping(raw)
    if not user["id"] or not user["email"]:
        return
    con.execute(
        """
        INSERT OR IGNORE INTO users (
          id, email, password_hash, is_active, is_admin, created_at, updated_at,
          activation_pending, activated_at, activation_required, activation_token_hash,
          activation_expires_at, full_name, job_title
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        _auth_user_insert_params(user),
    )


def _normalize_admin_entity_permissions(entity_type: str, principal_type: str, principal_id: str, permissions_raw: Any) -> Dict[str, bool]:
    keys = _admin_entity_permission_keys(entity_type)
    if principal_type == "role":
        template = _admin_entity_permission_defaults(entity_type, principal_id)
    else:
        template = {k: False for k in keys}
    parsed = permissions_raw if isinstance(permissions_raw, dict) else _json_loads(permissions_raw, {})
    if not isinstance(parsed, dict):
        parsed = {}
    return {k: bool(parsed.get(k, template.get(k, False))) for k in keys}


def _normalize_membership_permissions(role: str, permissions_raw: Any) -> Dict[str, bool]:
    template = _permission_template_for_role(role)
    if isinstance(permissions_raw, dict):
        parsed = permissions_raw
    else:
        parsed = _json_loads(permissions_raw, {})
    if not isinstance(parsed, dict):
        parsed = {}
    out: Dict[str, bool] = {}
    for key in _PERMISSION_KEYS:
        if key == "view":
            out[key] = True
        else:
            out[key] = bool(parsed.get(key)) if key in parsed else template.get(key, False)
    return out


def _normalize_org_membership_role(raw: Any) -> str:
    role = str(raw or "").strip().lower()
    aliases = {
        "owner": "org_owner",
        "orgowner": "org_owner",
        "org_owner": "org_owner",
        "admin": "org_admin",
        "orgadmin": "org_admin",
        "org_admin": "org_admin",
        "projectmanager": "project_manager",
        "project_manager": "project_manager",
        "pm": "project_manager",
        "manager": "project_manager",
        "team_admin": "project_manager",
        "teamadmin": "project_manager",
        "editor": "editor",
        "edit": "editor",
        "viewer": "org_viewer",
        "orgviewer": "org_viewer",
        "org_viewer": "org_viewer",
        "read_only": "org_viewer",
        "auditor": "auditor",
        "audit": "auditor",
    }
    role = aliases.get(role, role)
    if role not in _ORG_MEMBER_ROLES:
        return "org_viewer"
    return role


def _normalize_project_membership_role(raw: Any) -> str:
    role = str(raw or "").strip().lower()
    aliases = {
        "projectmanager": "project_manager",
        "pm": "project_manager",
        "manager": "project_manager",
        "proj_manager": "project_manager",
        "project_manager": "project_manager",
        "team_admin": "project_manager",
        "teamadmin": "project_manager",
        "editor": "editor",
        "edit": "editor",
        "viewer": "viewer",
        "read_only": "viewer",
    }
    role = aliases.get(role, role)
    if role not in _PROJECT_MEMBER_ROLES:
        return "viewer"
    return role


def _normalize_template_folder_id(raw: Any) -> str:
    return str(raw or "").strip()


def _normalize_template_scope(raw: Any) -> str:
    scope = str(raw or "").strip().lower()
    return "org" if scope == "org" else "personal"


def _normalize_template_type(raw: Any) -> str:
    value = str(raw or "").strip().lower()
    if value == "hybrid_stencil_v1":
        return "hybrid_stencil_v1"
    if value == "bpmn_fragment_v1":
        return "bpmn_fragment_v1"
    return "bpmn_selection_v1"


def _permission_template_for_role(role: str) -> Dict[str, bool]:
    key = str(role or "").strip().lower()
    if key in {"org_owner", "org_admin"}:
        return {k: True for k in _PERMISSION_KEYS}
    if key == "project_manager":
        return {"view": True, "create": True, "edit": True, "export": True, "delete": False, "manage_users": False}
    if key == "editor":
        return {"view": True, "create": True, "edit": True, "export": True, "delete": False, "manage_users": False}
    return {"view": True, "create": False, "edit": False, "export": False, "delete": False, "manage_users": False}


def _read_auth_users_rows() -> List[Dict[str, Any]]:
    path = _db_base_dir() / "_auth_users.json"
    if not path.exists():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    if not isinstance(raw, list):
        return []
    out: List[Dict[str, Any]] = []
    for row in raw:
        if isinstance(row, dict):
            out.append(row)
    return out


def _template_folder_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": str(row["id"] or ""),
        "scope": _normalize_template_scope(row["scope"]),
        "org_id": str(row["org_id"] or ""),
        "owner_user_id": str(row["owner_user_id"] or ""),
        "name": str(row["name"] or ""),
        "parent_id": str(row["parent_id"] or ""),
        "sort_order": int(row["sort_order"] or 0),
        "created_at": int(row["created_at"] or 0),
        "updated_at": int(row["updated_at"] or 0),
    }


def _template_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    payload = _json_loads(row["payload_json"], {})
    if not isinstance(payload, dict):
        payload = {}
    bpmn_ids_raw = payload.get("bpmn_element_ids")
    bpmn_ids = [str(item or "").strip() for item in (bpmn_ids_raw if isinstance(bpmn_ids_raw, list) else []) if str(item or "").strip()]
    return {
        "id": str(row["id"] or ""),
        "scope": _normalize_template_scope(row["scope"]),
        "template_type": _normalize_template_type(row["template_type"] if "template_type" in row.keys() else ""),
        "org_id": str(row["org_id"] or ""),
        "owner_user_id": str(row["owner_user_id"] or ""),
        "folder_id": _normalize_template_folder_id(row["folder_id"] if "folder_id" in row.keys() else ""),
        "created_from_session_id": str(row["created_from_session_id"] if "created_from_session_id" in row.keys() else ""),
        "name": str(row["name"] or ""),
        "description": str(row["description"] or ""),
        "payload": payload,
        "bpmn_element_ids": bpmn_ids,
        "selection_count": int(len(bpmn_ids)),
        "created_at": int(row["created_at"] or 0),
        "updated_at": int(row["updated_at"] or 0),
    }


def _upsert_auth_user(con: Any, raw: Mapping[str, Any]) -> None:
    user = _auth_user_from_mapping(raw)
    if not user["id"] or not user["email"]:
        return
    con.execute(
        """
        INSERT INTO users (
          id, email, password_hash, is_active, is_admin, created_at, updated_at,
          activation_pending, activated_at, activation_required, activation_token_hash,
          activation_expires_at, full_name, job_title
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          email = excluded.email,
          password_hash = excluded.password_hash,
          is_active = excluded.is_active,
          is_admin = excluded.is_admin,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          activation_pending = excluded.activation_pending,
          activated_at = excluded.activated_at,
          activation_required = excluded.activation_required,
          activation_token_hash = excluded.activation_token_hash,
          activation_expires_at = excluded.activation_expires_at,
          full_name = excluded.full_name,
          job_title = excluded.job_title
        """,
        _auth_user_insert_params(user),
    )


def accept_org_invite(
    org_id: Optional[str],
    token: str,
    *,
    accepted_by: str,
    accepted_email: str,
) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    tok = str(token or "").strip()
    actor = str(accepted_by or "").strip()
    actor_email = _normalize_email(accepted_email)
    if not tok or not actor:
        raise ValueError("token and accepted_by are required")
    token_hash = _hash_invite_token(tok)
    now = _now_ts()
    _ensure_schema()
    with _connect() as con:
        if oid:
            row = con.execute(
                """
                SELECT i.id, i.org_id, o.name AS org_name, i.email, i.role, i.full_name, i.job_title, i.team_name, i.subgroup_name, i.invite_comment,
                       i.invite_key, i.token_hash, i.expires_at, i.created_at, i.created_by, i.used_at, i.used_by_user_id, i.accepted_at, i.accepted_by, i.revoked_at, i.revoked_by,
                       i.permissions_json
                  FROM org_invites i
                  LEFT JOIN orgs o ON o.id = i.org_id
                 WHERE i.org_id = ? AND i.token_hash = ?
                 ORDER BY i.created_at DESC
                 LIMIT 1
                """,
                [oid, token_hash],
            ).fetchone()
        else:
            row = con.execute(
                """
                SELECT i.id, i.org_id, o.name AS org_name, i.email, i.role, i.full_name, i.job_title, i.team_name, i.subgroup_name, i.invite_comment,
                       i.invite_key, i.token_hash, i.expires_at, i.created_at, i.created_by, i.used_at, i.used_by_user_id, i.accepted_at, i.accepted_by, i.revoked_at, i.revoked_by,
                       i.permissions_json
                  FROM org_invites i
                  LEFT JOIN orgs o ON o.id = i.org_id
                 WHERE i.token_hash = ?
                 ORDER BY i.created_at DESC
                 LIMIT 1
                """,
                [token_hash],
            ).fetchone()
        if not row:
            raise ValueError("invite_not_found")
        invite = _invite_row_to_dict(row)
        oid = str(invite.get("org_id") or "").strip()
        status = str(invite.get("status") or "")
        if status == "revoked":
            raise ValueError("invite_revoked")
        if status == "used":
            raise ValueError("invite_used")
        if status == "expired":
            raise ValueError("invite_expired")
        invite_email = _normalize_email(invite.get("email"))
        if not actor_email or actor_email != invite_email:
            raise ValueError("invite_email_mismatch")
        role = _normalize_org_invite_role(invite.get("role"))
        invite_permissions_json = _json_dumps(invite.get("permissions_json") or invite.get("permissions") or {}, {})
        con.execute(
            """
            INSERT INTO org_memberships (org_id, user_id, role, permissions_json, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(org_id, user_id) DO UPDATE SET role = excluded.role, permissions_json = excluded.permissions_json
            """,
            [oid, actor, role, invite_permissions_json, now],
        )
        _merge_auth_user_profile_with_connection(
            con,
            actor,
            full_name=str(invite.get("full_name") or ""),
            job_title=str(invite.get("job_title") or ""),
        )
        con.execute(
            """
            UPDATE org_invites
               SET used_at = ?, used_by_user_id = ?, accepted_at = ?, accepted_by = ?, revoked_at = NULL, revoked_by = NULL
             WHERE id = ?
            """,
            [now, actor, now, actor, str(invite.get("id") or "")],
        )
        con.commit()
        accepted_row = con.execute(
            """
            SELECT i.id, i.org_id, o.name AS org_name, i.email, i.role, i.full_name, i.job_title, i.team_name, i.subgroup_name, i.invite_comment,
                   i.invite_key, i.token_hash, i.expires_at, i.created_at, i.created_by, i.used_at, i.used_by_user_id, i.accepted_at, i.accepted_by, i.revoked_at, i.revoked_by,
                   i.permissions_json
              FROM org_invites i
              LEFT JOIN orgs o ON o.id = i.org_id
             WHERE i.id = ?
             LIMIT 1
            """,
            [str(invite.get("id") or "")],
        ).fetchone()
    if not accepted_row:
        raise ValueError("invite_accept_failed")
    return _invite_row_to_dict(accepted_row)


def add_group_member(
    org_id: str,
    group_id: str,
    user_id: str,
    created_by: str = "",
) -> bool:
    oid = str(org_id or "").strip()
    gid = str(group_id or "").strip()
    uid = str(user_id or "").strip()
    if not oid or not gid or not uid:
        return False
    _ensure_schema()
    now = _now_ts()
    with _connect() as con:
        group = con.execute(
            "SELECT id FROM groups WHERE org_id = ? AND id = ? LIMIT 1", [oid, gid]
        ).fetchone()
        if not group:
            raise ValueError("group not found")
        user = con.execute("SELECT id FROM users WHERE id = ? LIMIT 1", [uid]).fetchone()
        if not user:
            raise ValueError("user not found")
        con.execute(
            """
            INSERT INTO group_memberships (group_id, user_id, created_at, created_by)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(group_id, user_id) DO NOTHING
            """,
            [gid, uid, now, str(created_by or "")],
        )
        con.commit()
    return True


def append_audit_log(
    *,
    actor_user_id: str,
    org_id: str,
    action: str,
    entity_type: str,
    entity_id: str,
    status: str = "ok",
    project_id: Optional[str] = None,
    session_id: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
    ts: Optional[int] = None,
) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    actor = str(actor_user_id or "").strip()
    act = str(action or "").strip()
    etype = str(entity_type or "").strip()
    eid = str(entity_id or "").strip()
    state = str(status or "ok").strip().lower() or "ok"
    if not oid or not actor or not act or not etype or not eid:
        raise ValueError("actor_user_id, org_id, action, entity_type and entity_id are required")
    at = int(ts or 0) or _now_ts()
    payload = _json_dumps(meta if isinstance(meta, dict) else {}, {})
    audit_id = f"aud_{uuid.uuid4().hex[:12]}"
    _ensure_schema()
    with _connect() as con:
        con.execute(
            """
            INSERT INTO audit_log (
              id, ts, actor_user_id, org_id, project_id, session_id, action, entity_type, entity_id, status, meta_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                audit_id,
                at,
                actor,
                oid,
                str(project_id or "").strip() or None,
                str(session_id or "").strip() or None,
                act,
                etype,
                eid,
                state,
                payload,
            ],
        )
        con.commit()
        row = con.execute(
            """
            SELECT id, ts, actor_user_id, org_id, project_id, session_id, action, entity_type, entity_id, status, meta_json
              FROM audit_log
             WHERE id = ?
             LIMIT 1
            """,
            [audit_id],
        ).fetchone()
    if not row:
        return {
            "id": audit_id,
            "ts": at,
            "actor_user_id": actor,
            "org_id": oid,
            "project_id": str(project_id or ""),
            "session_id": str(session_id or ""),
            "action": act,
            "entity_type": etype,
            "entity_id": eid,
            "status": state,
            "meta": meta if isinstance(meta, dict) else {},
        }
    return _audit_row_to_dict(row)


def cleanup_org_invites(
    org_id: str,
    *,
    keep_days: int = 30,
    now_ts: Optional[int] = None,
) -> int:
    oid = str(org_id or "").strip()
    if not oid:
        return 0
    now = int(now_ts or 0) or _now_ts()
    keep = max(1, int(keep_days or 30))
    threshold = now - keep * 24 * 60 * 60
    _ensure_schema()
    with _connect() as con:
        cur = con.execute(
            """
            DELETE FROM org_invites
             WHERE org_id = ?
               AND (
                 (accepted_at IS NOT NULL AND accepted_at > 0 AND accepted_at < ?)
                 OR
                 (revoked_at IS NOT NULL AND revoked_at > 0 AND revoked_at < ?)
                 OR
                 (expires_at > 0 AND expires_at < ?)
               )
            """,
            [oid, threshold, threshold, now],
        )
        con.commit()
        return int(cur.rowcount or 0)


def count_org_records() -> int:
    _ensure_schema()
    with _connect() as con:
        row = con.execute("SELECT COUNT(1) AS cnt FROM orgs").fetchone()
    return int((row["cnt"] if row and row["cnt"] is not None else 0) or 0)


def create_auth_user(row: Dict[str, Any]) -> Dict[str, Any]:
    user = _auth_user_from_mapping(row)
    if not user["id"] or not user["email"]:
        raise ValueError("id and email are required")
    _ensure_schema()
    with _connect() as con:
        if _get_auth_user_by_email_with_connection(con, str(user.get("email") or "")):
            raise ValueError("email_exists")
        _upsert_auth_user(con, user)
        con.commit()
        created = _get_auth_user_by_id_with_connection(con, str(user.get("id") or ""))
    if not created:
        raise ValueError("user_create_failed")
    return created


def create_org_group(
    org_id: str,
    name: str,
    description: str = "",
    created_by: str = "",
) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    gname = " ".join(str(name or "").split()).strip()
    if not oid:
        raise ValueError("org_id is required")
    if not gname:
        raise ValueError("name is required")
    now = _now_ts()
    gid = uuid.uuid4().hex
    _ensure_schema()
    try:
        with _connect() as con:
            con.execute(
                """
                INSERT INTO groups (id, org_id, name, description, created_at, updated_at, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [gid, oid, gname, str(description or ""), now, now, str(created_by or ""), ""],
            )
            con.commit()
    except Exception as exc:
        marker = str(exc).lower()
        if "unique" in marker:
            raise ValueError("group name already exists") from exc
        raise
    return {
        "id": gid,
        "org_id": oid,
        "name": gname,
        "description": str(description or ""),
        "created_at": now,
        "updated_at": now,
        "created_by": str(created_by or ""),
        "updated_by": "",
        "members_count": 0,
    }


def create_org_invite(
    org_id: str,
    email: str,
    *,
    created_by: str,
    full_name: str = "",
    job_title: str = "",
    role: str = "org_viewer",
    team_name: str = "",
    subgroup_name: str = "",
    invite_comment: str = "",
    ttl_days: int = 7,
    regenerate: bool = False,
    activate_now: bool = True,
    permissions: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    em = _normalize_email(email)
    if not oid or not em:
        raise ValueError("org_id and email are required")
    normalized_role = _normalize_org_invite_role(role)
    normalized_full_name = str(full_name or "").strip()
    normalized_job_title = str(job_title or "").strip()
    normalized_team_name = str(team_name or "").strip()
    normalized_subgroup_name = str(subgroup_name or "").strip()
    normalized_comment = str(invite_comment or "").strip()
    actor = str(created_by or "").strip()
    ttl = int(ttl_days or 0)
    if ttl <= 0:
        ttl = 7
    ttl = max(1, min(ttl, 60))
    permissions_payload = _normalize_membership_permissions(normalized_role, permissions)
    permissions_json = _json_dumps(permissions_payload, {})
    now = _now_ts()
    expires_at = now + ttl * 24 * 60 * 60
    invite_id = f"inv_{uuid.uuid4().hex[:12]}"
    token = secrets.token_urlsafe(24)
    token_hash = _hash_invite_token(token)
    _ensure_schema()
    activate_immediately = bool(activate_now)
    with _connect() as con:
        con.execute(
            """
            UPDATE org_invites
               SET revoked_at = COALESCE(revoked_at, ?), revoked_by = COALESCE(revoked_by, 'system_expired')
             WHERE org_id = ?
               AND accepted_at IS NULL
               AND revoked_at IS NULL
               AND expires_at < ?
            """,
            [now, oid, now],
        )
        if bool(regenerate) and activate_immediately:
            con.execute(
                """
                UPDATE org_invites
                   SET revoked_at = ?, revoked_by = ?
                 WHERE org_id = ?
                   AND email = ?
                   AND accepted_at IS NULL
                   AND revoked_at IS NULL
                """,
                [now, actor or "system_regenerate", oid, em],
            )
        try:
            con.execute(
                """
                INSERT INTO org_invites (
                  id, org_id, email, role, full_name, job_title, team_name, subgroup_name, invite_comment, invite_key, token_hash, expires_at, created_at, created_by,
                  used_at, used_by_user_id, accepted_at, accepted_by, revoked_at, revoked_by, permissions_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?)
                """,
                [
                    invite_id,
                    oid,
                    em,
                    normalized_role,
                    normalized_full_name,
                    normalized_job_title,
                    normalized_team_name,
                    normalized_subgroup_name,
                    normalized_comment,
                    token,
                    token_hash,
                    expires_at,
                    now,
                    actor,
                    None if activate_immediately else now,
                    None if activate_immediately else "system_regenerate_pending",
                    permissions_json,
                ],
            )
        except Exception as exc:
            if isinstance(exc, sqlite3.IntegrityError) or (
                PsycopgIntegrityError is not None and isinstance(exc, PsycopgIntegrityError)
            ):
                raise ValueError("active invite already exists for this email") from exc
            raise
        con.commit()
        row = con.execute(
            """
            SELECT i.id, i.org_id, o.name AS org_name, i.email, i.role, i.full_name, i.job_title, i.team_name, i.subgroup_name, i.invite_comment,
                   i.invite_key, i.token_hash, i.expires_at, i.created_at, i.created_by, i.used_at, i.used_by_user_id, i.accepted_at, i.accepted_by, i.revoked_at, i.revoked_by,
                   i.permissions_json
              FROM org_invites i
              LEFT JOIN orgs o ON o.id = i.org_id
             WHERE i.id = ?
             LIMIT 1
            """,
            [invite_id],
        ).fetchone()
    if not row:
        raise ValueError("invite create failed")
    payload = _invite_row_to_dict(row)
    payload["token"] = token
    return payload


def create_org_record(name: str, *, created_by: str, org_id: Optional[str] = None) -> Dict[str, Any]:
    _ensure_schema()
    now = _now_ts()
    oid = str(org_id or "").strip() or uuid.uuid4().hex[:12]
    title = str(name or "").strip() or f"Org {oid[:6]}"
    actor = str(created_by or "").strip()
    with _connect() as con:
        con.execute(
            """
            INSERT INTO orgs (id, name, created_at, created_by)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name=excluded.name
            """,
            [oid, title, now, actor],
        )
        con.execute(
            """
            INSERT OR IGNORE INTO org_memberships (org_id, user_id, role, created_at)
            VALUES (?, ?, 'org_owner', ?)
            """,
            [oid, actor, now],
        )
        _ensure_workspace_record(con, oid, created_by=actor)
        con.commit()
        row = con.execute(
            """
            SELECT
              id,
              name,
              created_at,
              created_by,
              is_active,
              git_mirror_enabled,
              git_provider,
              git_repository,
              git_branch,
              git_base_path,
              git_health_status,
              git_health_message,
              git_updated_at,
              git_updated_by
            FROM orgs
            WHERE id = ? LIMIT 1
            """,
            [oid],
        ).fetchone()
    if not row:
        return {
            "id": oid,
            "name": title,
            "created_at": now,
            "created_by": actor,
            "is_active": True,
            **_org_git_mirror_payload({}),
        }
    is_active_raw = _row_value(row, "is_active")
    out = {
        "id": str(row["id"] or ""),
        "name": str(row["name"] or ""),
        "created_at": int(row["created_at"] or 0),
        "created_by": str(row["created_by"] or ""),
        "is_active": bool(1 if is_active_raw is None else is_active_raw),
    }
    out.update(_org_git_mirror_payload(row))
    return out


def create_workspace_record(org_id: str, name: str, *, created_by: str, workspace_id: Optional[str] = None) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    title = " ".join(str(name or "").split()).strip()
    actor = str(created_by or "").strip()
    if not oid:
        raise ValueError("org_id required")
    if not title:
        raise ValueError("name required")
    _ensure_schema()
    with _connect() as con:
        dup = con.execute(
            "SELECT id FROM workspaces WHERE org_id = ? AND lower(trim(name)) = lower(trim(?)) LIMIT 1",
            [oid, title],
        ).fetchone()
        if dup:
            raise ValueError("workspace name already exists")
        row = _ensure_workspace_record(
            con,
            oid,
            created_by=actor,
            workspace_id=str(workspace_id or "").strip() or uuid.uuid4().hex[:12],
            name=title,
        )
        con.commit()
    return row


def delete_org_group(org_id: str, group_id: str) -> bool:
    oid = str(org_id or "").strip()
    gid = str(group_id or "").strip()
    if not oid or not gid:
        return False
    _ensure_schema()
    with _connect() as con:
        con.execute("DELETE FROM group_memberships WHERE group_id = ?", [gid])
        cur = con.execute("DELETE FROM groups WHERE org_id = ? AND id = ?", [oid, gid])
        con.commit()
    return int(cur.rowcount or 0) > 0


def delete_org_invite(org_id: str, invite_id: str) -> bool:
    oid = str(org_id or "").strip()
    iid = str(invite_id or "").strip()
    if not oid or not iid:
        return False
    _ensure_schema()
    with _connect() as con:
        cur = con.execute(
            """
            DELETE FROM org_invites
             WHERE org_id = ? AND id = ?
            """,
            [oid, iid],
        )
        con.commit()
        return int(cur.rowcount or 0) > 0


def delete_org_membership(org_id: str, user_id: str) -> bool:
    oid = str(org_id or "").strip()
    uid = str(user_id or "").strip()
    if not oid or not uid:
        return False
    _ensure_schema()
    with _connect() as con:
        cur = con.execute(
            """
            DELETE FROM org_memberships
             WHERE org_id = ? AND user_id = ?
            """,
            [oid, uid],
        )
        con.commit()
    return int(cur.rowcount or 0) > 0


def get_auth_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    _ensure_schema()
    with _connect() as con:
        return _get_auth_user_by_id_with_connection(con, user_id)


def get_current_mirror_version(session_id: str, *, org_id: str | None = None) -> int:
    _ensure_schema()
    sid = str(session_id or "").strip()
    oid = _scope_org_id(org_id) or _default_org_id()
    if not sid:
        raise ValueError("session_id required")
    with _connect() as con:
        row = con.execute(
            "SELECT git_mirror_version_number FROM sessions WHERE id = ? AND org_id = ? LIMIT 1",
            [sid, oid],
        ).fetchone()
    if not row:
        raise ValueError("session not found")
    try:
        value = int(row["git_mirror_version_number"] or 0)
    except Exception:
        value = 0
    return max(0, value)


def get_default_org_id() -> str:
    return _default_org_id()


def get_org_git_mirror_config(org_id: str) -> Dict[str, Any]:
    _ensure_schema()
    oid = str(org_id or "").strip()
    if not oid:
        raise ValueError("org_id required")
    with _connect() as con:
        row = con.execute(
            """
            SELECT
              id,
              git_mirror_enabled,
              git_provider,
              git_repository,
              git_branch,
              git_base_path,
              git_health_status,
              git_health_message,
              git_updated_at,
              git_updated_by
            FROM orgs
            WHERE id = ? LIMIT 1
            """,
            [oid],
        ).fetchone()
    if not row:
        raise ValueError("org not found")
    out = {"org_id": str(row["id"] or oid)}
    out.update(_org_git_mirror_payload(row))
    return out


def get_org_group(org_id: str, group_id: str) -> Optional[Dict[str, Any]]:
    oid = str(org_id or "").strip()
    gid = str(group_id or "").strip()
    if not oid or not gid:
        return None
    _ensure_schema()
    with _connect() as con:
        row = con.execute(
            """
            SELECT
              g.id,
              g.org_id,
              g.name,
              g.description,
              g.created_at,
              g.updated_at,
              g.created_by,
              g.updated_by,
              COUNT(m.user_id) AS members_count
            FROM groups g
            LEFT JOIN group_memberships m ON m.group_id = g.id
            WHERE g.org_id = ? AND g.id = ?
            GROUP BY g.id, g.org_id, g.name, g.description,
                     g.created_at, g.updated_at, g.created_by, g.updated_by
            """,
            [oid, gid],
        ).fetchone()
    if not row:
        return None
    return {**_group_row_to_dict(row), "members_count": int(row["members_count"] or 0)}


def get_org_invite_by_id(org_id: str, invite_id: str) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    iid = str(invite_id or "").strip()
    if not oid or not iid:
        return {}
    _ensure_schema()
    with _connect() as con:
        row = con.execute(
            """
            SELECT i.id, i.org_id, o.name AS org_name, i.email, i.role, i.full_name, i.job_title, i.team_name, i.subgroup_name, i.invite_comment,
                   i.invite_key, i.token_hash, i.expires_at, i.created_at, i.created_by, i.used_at, i.used_by_user_id, i.accepted_at, i.accepted_by, i.revoked_at, i.revoked_by,
                   i.permissions_json
              FROM org_invites i
              LEFT JOIN orgs o ON o.id = i.org_id
             WHERE i.org_id = ? AND i.id = ?
             LIMIT 1
            """,
            [oid, iid],
        ).fetchone()
    if not row:
        return {}
    return _invite_row_to_dict(row)


def get_user_org_role(user_id: str, org_id: str, *, is_admin: Optional[bool] = None) -> str:
    uid = str(user_id or "").strip()
    oid = str(org_id or "").strip()
    if not uid or not oid:
        return ""
    memberships = list_user_org_memberships(uid, is_admin=is_admin)
    for item in memberships:
        if str(item.get("org_id") or "") == oid:
            return str(item.get("role") or "")
    return ""


def get_workspace_record(workspace_id: str, *, org_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    wid = str(workspace_id or "").strip()
    oid = str(org_id or "").strip()
    if not wid:
        return None
    _ensure_schema()
    with _connect() as con:
        if oid:
            row = con.execute(
                """
                SELECT id, org_id, name, created_at, created_by, updated_at
                  FROM workspaces
                 WHERE id = ? AND org_id = ?
                 LIMIT 1
                """,
                [wid, oid],
            ).fetchone()
        else:
            row = con.execute(
                """
                SELECT id, org_id, name, created_at, created_by, updated_at
                  FROM workspaces
                 WHERE id = ?
                 LIMIT 1
                """,
                [wid],
            ).fetchone()
    if not row:
        return None
    return {
        "id": str(row["id"] or ""),
        "org_id": str(row["org_id"] or ""),
        "name": str(row["name"] or ""),
        "created_at": int(row["created_at"] or 0),
        "created_by": str(row["created_by"] or ""),
        "updated_at": int(row["updated_at"] or 0),
    }


def increment_and_get_next_version(session_id: str, *, org_id: str | None = None) -> int:
    _ensure_schema()
    sid = str(session_id or "").strip()
    oid = _scope_org_id(org_id) or _default_org_id()
    if not sid:
        raise ValueError("session_id required")
    with _connect() as con:
        cur = con.execute(
            """
            UPDATE sessions
               SET git_mirror_version_number = CASE
                   WHEN COALESCE(git_mirror_version_number, 0) < 0 THEN 1
                   ELSE COALESCE(git_mirror_version_number, 0) + 1
               END
             WHERE id = ?
               AND org_id = ?
            """,
            [sid, oid],
        )
        if int(cur.rowcount or 0) <= 0:
            con.rollback()
            raise ValueError("session not found")
        row = con.execute(
            "SELECT git_mirror_version_number FROM sessions WHERE id = ? AND org_id = ? LIMIT 1",
            [sid, oid],
        ).fetchone()
        con.commit()
    if not row:
        raise ValueError("session not found")
    try:
        value = int(row["git_mirror_version_number"] or 0)
    except Exception:
        value = 0
    return max(0, value)


def is_org_active(org_id: str) -> bool:
    oid = str(org_id or "").strip()
    if not oid:
        return False
    try:
        with _connect() as con:
            row = con.execute(
                "SELECT is_active FROM orgs WHERE id = ? LIMIT 1", [oid]
            ).fetchone()
    except Exception:
        return False
    return bool(row["is_active"]) if row else False


def list_group_members(org_id: str, group_id: str) -> List[Dict[str, Any]]:
    oid = str(org_id or "").strip()
    gid = str(group_id or "").strip()
    if not oid or not gid:
        return []
    _ensure_schema()
    with _connect() as con:
        rows = con.execute(
            """
            SELECT
              m.user_id,
              u.email,
              u.full_name,
              u.job_title,
              m.created_at,
              m.created_by
            FROM group_memberships m
            JOIN users u ON u.id = m.user_id
            JOIN groups g ON g.id = m.group_id AND g.org_id = ?
            WHERE m.group_id = ?
            ORDER BY u.full_name ASC, u.email ASC, m.user_id ASC
            """,
            [oid, gid],
        ).fetchall()
    return [_group_member_user_row(row) for row in rows]


def list_org_groups(org_id: str) -> List[Dict[str, Any]]:
    oid = str(org_id or "").strip()
    if not oid:
        return []
    _ensure_schema()
    with _connect() as con:
        rows = con.execute(
            """
            SELECT
              g.id,
              g.org_id,
              g.name,
              g.description,
              g.created_at,
              g.updated_at,
              g.created_by,
              g.updated_by,
              COUNT(m.user_id) AS members_count
            FROM groups g
            LEFT JOIN group_memberships m ON m.group_id = g.id
            WHERE g.org_id = ?
            GROUP BY g.id, g.org_id, g.name, g.description,
                     g.created_at, g.updated_at, g.created_by, g.updated_by
            ORDER BY g.name ASC, g.id ASC
            """,
            [oid],
        ).fetchall()
    return [{**_group_row_to_dict(row), "members_count": int(row["members_count"] or 0)} for row in rows]


def list_org_invites(
    org_id: str,
    *,
    include_inactive: bool = True,
) -> List[Dict[str, Any]]:
    oid = str(org_id or "").strip()
    if not oid:
        return []
    _ensure_schema()
    with _connect() as con:
        rows = con.execute(
            """
            SELECT i.id, i.org_id, o.name AS org_name, i.email, i.role, i.full_name, i.job_title, i.team_name, i.subgroup_name, i.invite_comment,
                   i.invite_key, i.token_hash, i.expires_at, i.created_at, i.created_by, i.used_at, i.used_by_user_id, i.accepted_at, i.accepted_by, i.revoked_at, i.revoked_by,
                   i.permissions_json
              FROM org_invites i
              LEFT JOIN orgs o ON o.id = i.org_id
             WHERE i.org_id = ?
             ORDER BY i.created_at DESC, i.id DESC
            """,
            [oid],
        ).fetchall()
    out: List[Dict[str, Any]] = []
    for row in rows:
        payload = _invite_row_to_dict(row)
        if not include_inactive and payload.get("status") != "pending":
            continue
        out.append(payload)
    return out


def list_org_memberships(org_id: str) -> List[Dict[str, Any]]:
    oid = str(org_id or "").strip()
    if not oid:
        return []
    _ensure_schema()
    with _connect() as con:
        rows = con.execute(
            """
            SELECT org_id, user_id, role, permissions_json, created_at
              FROM org_memberships
             WHERE org_id = ?
             ORDER BY created_at ASC, user_id ASC
            """,
            [oid],
        ).fetchall()
    out: List[Dict[str, Any]] = []
    for row in rows:
        out.append(
            {
                "org_id": str(row["org_id"] or ""),
                "user_id": str(row["user_id"] or ""),
                "role": _normalize_org_membership_role(row["role"]),
                "permissions": _normalize_membership_permissions(row["role"], row["permissions_json"]),
                "created_at": int(row["created_at"] or 0),
            }
        )
    return out


def list_org_records() -> List[Dict[str, Any]]:
    _ensure_schema()
    with _connect() as con:
        rows = con.execute(
            """
            SELECT
              id,
              name,
              created_at,
              created_by,
              is_active,
              git_mirror_enabled,
              git_provider,
              git_repository,
              git_branch,
              git_base_path,
              git_health_status,
              git_health_message,
              git_updated_at,
              git_updated_by
              FROM orgs
             ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, lower(name) ASC, id ASC
            """,
            [_default_org_id()],
        ).fetchall()
    out: List[Dict[str, Any]] = []
    for row in rows:
        item = {
            "id": str(row["id"] or ""),
            "name": str(row["name"] or row["id"] or ""),
            "created_at": int(row["created_at"] or 0),
            "created_by": str(row["created_by"] or ""),
            "is_active": bool(dict(row).get("is_active", 1)),
        }
        item.update(_org_git_mirror_payload(row))
        out.append(item)
    return out


def list_user_groups(user_id: str, org_id: Optional[str] = None) -> List[Dict[str, Any]]:
    uid = str(user_id or "").strip()
    if not uid:
        return []
    oid = str(org_id or "").strip()
    _ensure_schema()
    with _connect() as con:
        params = [uid]
        where = "m.user_id = ?"
        if oid:
            where += " AND g.org_id = ?"
            params.append(oid)
        rows = con.execute(
            f"""
            SELECT
              g.id,
              g.org_id,
              g.name,
              g.description,
              g.created_at,
              g.updated_at,
              g.created_by,
              g.updated_by
            FROM groups g
            JOIN group_memberships m ON m.group_id = g.id
            WHERE {where}
            ORDER BY g.org_id ASC, g.name ASC, g.id ASC
            """,
            params,
        ).fetchall()
    return [_group_row_to_dict(row) for row in rows]


def list_user_org_memberships(user_id: str, *, is_admin: Optional[bool] = None) -> List[Dict[str, Any]]:
    uid = str(user_id or "").strip()
    if not uid:
        return []
    _ensure_schema()
    with _connect() as con:
        _ensure_enterprise_bootstrap(con)
        now = _now_ts()
        existing_count_row = con.execute(
            "SELECT COUNT(1) AS cnt FROM org_memberships WHERE user_id = ?",
            [uid],
        ).fetchone()
        existing_count = int((existing_count_row["cnt"] if existing_count_row and existing_count_row["cnt"] is not None else 0) or 0)
        org_rows = con.execute("SELECT id FROM orgs ORDER BY id ASC").fetchall()
        org_ids = [str(row["id"] or "") for row in org_rows]
        single_default_mode = len(org_ids) == 1 and org_ids[0] == _default_org_id()
        if existing_count <= 0 and single_default_mode and not bool(is_admin):
            con.execute(
                """
                INSERT OR IGNORE INTO org_memberships (org_id, user_id, role, created_at)
                VALUES (?, ?, 'editor', ?)
                """,
                [_default_org_id(), uid, now],
            )
            con.commit()
        rows = con.execute(
            """
            SELECT
              m.org_id AS org_id,
              o.name AS org_name,
              m.role AS role,
              m.permissions_json AS permissions_json,
              m.created_at AS created_at,
              o.is_active AS is_active,
              o.git_mirror_enabled AS git_mirror_enabled,
              o.git_provider AS git_provider,
              o.git_repository AS git_repository,
              o.git_branch AS git_branch,
              o.git_base_path AS git_base_path,
              o.git_health_status AS git_health_status,
              o.git_health_message AS git_health_message,
              o.git_updated_at AS git_updated_at,
              o.git_updated_by AS git_updated_by
              FROM org_memberships m
              JOIN orgs o ON o.id = m.org_id
                WHERE m.user_id = ?
             ORDER BY CASE WHEN m.org_id = ? THEN 0 ELSE 1 END, o.name ASC, m.org_id ASC
            """,
            [uid, _default_org_id()],
        ).fetchall()
    out: List[Dict[str, Any]] = []
    for row in rows:
        role = str(row["role"] or "org_viewer")
        item = {
            "org_id": str(row["org_id"] or ""),
            "name": str(row["org_name"] or row["org_id"] or ""),
            "role": role,
            "permissions": _normalize_membership_permissions(role, row["permissions_json"]),
            "is_active": bool(dict(row).get("is_active", 1)),
            "created_at": int(row["created_at"] or 0),
        }
        item.update(_org_git_mirror_payload(row))
        out.append(item)
    if not bool(is_admin):
        return out
    membership_by_org = {str(item.get("org_id") or ""): item for item in out}
    for row in list_org_records():
        org_id = str(row.get("id") or "")
        if org_id in membership_by_org:
            continue
        out.append(
            {
                "org_id": org_id,
                "name": str(row.get("name") or org_id),
                "role": "platform_admin",
                "permissions": _permission_template_for_role("org_admin"),
                "is_active": bool(dict(row).get("is_active", 1)),
                "created_at": int(row.get("created_at") or 0),
                "git_mirror_enabled": bool(row.get("git_mirror_enabled")),
                "git_provider": row.get("git_provider"),
                "git_repository": row.get("git_repository"),
                "git_branch": row.get("git_branch"),
                "git_base_path": row.get("git_base_path"),
                "git_health_status": row.get("git_health_status"),
                "git_health_message": row.get("git_health_message"),
                "git_updated_at": int(row.get("git_updated_at") or 0),
                "git_updated_by": row.get("git_updated_by"),
            }
        )
    out.sort(key=lambda item: (0 if str(item.get("org_id") or "") == _default_org_id() else 1, str(item.get("name") or "").lower(), str(item.get("org_id") or "")))
    return out


def list_users_group_memberships(
    user_ids: Iterable[str],
    org_id: Optional[str] = None,
) -> Dict[str, List[Dict[str, Any]]]:
    ids = [str(uid or "").strip() for uid in user_ids if str(uid or "").strip()]
    if not ids:
        return {}
    oid = str(org_id or "").strip()
    _ensure_schema()
    placeholders = ", ".join(["?"] * len(ids))
    with _connect() as con:
        if oid:
            rows = con.execute(
                f"""
                SELECT
                  m.user_id,
                  g.id,
                  g.org_id,
                  g.name,
                  g.description,
                  g.created_at,
                  g.updated_at,
                  g.created_by,
                  g.updated_by
                FROM group_memberships m
                JOIN groups g ON g.id = m.group_id
                WHERE m.user_id IN ({placeholders}) AND g.org_id = ?
                ORDER BY g.name ASC, g.id ASC
                """,
                [*ids, oid],
            ).fetchall()
        else:
            rows = con.execute(
                f"""
                SELECT
                  m.user_id,
                  g.id,
                  g.org_id,
                  g.name,
                  g.description,
                  g.created_at,
                  g.updated_at,
                  g.created_by,
                  g.updated_by
                FROM group_memberships m
                JOIN groups g ON g.id = m.group_id
                WHERE m.user_id IN ({placeholders})
                ORDER BY g.org_id ASC, g.name ASC, g.id ASC
                """,
                ids,
            ).fetchall()
    out: Dict[str, List[Dict[str, Any]]] = {uid: [] for uid in ids}
    for row in rows:
        uid = str(row["user_id"] or "").strip()
        if uid in out:
            out[uid].append(_group_row_to_dict(row))
    return out


def merge_auth_user_profile(user_id: str, *, full_name: str = "", job_title: str = "") -> Optional[Dict[str, Any]]:
    _ensure_schema()
    with _connect() as con:
        updated = _merge_auth_user_profile_with_connection(
            con,
            user_id,
            full_name=full_name,
            job_title=job_title,
        )
        con.commit()
        return updated


def preview_org_invite(
    token: str,
    *,
    org_id: Optional[str] = None,
) -> Dict[str, Any]:
    tok = str(token or "").strip()
    oid = str(org_id or "").strip()
    if not tok:
        raise ValueError("token is required")
    token_hash = _hash_invite_token(tok)
    _ensure_schema()
    with _connect() as con:
        if oid:
            row = con.execute(
                """
                SELECT i.id, i.org_id, o.name AS org_name, i.email, i.role, i.full_name, i.job_title, i.team_name, i.subgroup_name, i.invite_comment,
                       i.invite_key, i.token_hash, i.expires_at, i.created_at, i.created_by, i.used_at, i.used_by_user_id, i.accepted_at, i.accepted_by, i.revoked_at, i.revoked_by,
                       i.permissions_json
                  FROM org_invites i
                  LEFT JOIN orgs o ON o.id = i.org_id
                 WHERE i.org_id = ? AND i.token_hash = ?
                 ORDER BY i.created_at DESC
                 LIMIT 1
                """,
                [oid, token_hash],
            ).fetchone()
        else:
            row = con.execute(
                """
                SELECT i.id, i.org_id, o.name AS org_name, i.email, i.role, i.full_name, i.job_title, i.team_name, i.subgroup_name, i.invite_comment,
                       i.invite_key, i.token_hash, i.expires_at, i.created_at, i.created_by, i.used_at, i.used_by_user_id, i.accepted_at, i.accepted_by, i.revoked_at, i.revoked_by,
                       i.permissions_json
                  FROM org_invites i
                  LEFT JOIN orgs o ON o.id = i.org_id
                 WHERE i.token_hash = ?
                 ORDER BY i.created_at DESC
                 LIMIT 1
                """,
                [token_hash],
            ).fetchone()
    if not row:
        raise ValueError("invite_not_found")
    payload = _invite_row_to_dict(row)
    status = str(payload.get("status") or "")
    if status == "revoked":
        raise ValueError("invite_revoked")
    if status == "used":
        raise ValueError("invite_used")
    if status == "expired":
        raise ValueError("invite_expired")
    return payload


def promote_regenerated_org_invite(
    org_id: str,
    email: str,
    invite_id: str,
    *,
    actor: str,
) -> bool:
    oid = str(org_id or "").strip()
    em = _normalize_email(email)
    iid = str(invite_id or "").strip()
    who = str(actor or "").strip() or "system_regenerate"
    if not oid or not em or not iid:
        return False
    now = _now_ts()
    _ensure_schema()
    with _connect() as con:
        row = con.execute(
            """
            SELECT id
              FROM org_invites
             WHERE org_id = ?
               AND id = ?
               AND email = ?
               AND accepted_at IS NULL
               AND used_at IS NULL
               AND revoked_by = 'system_regenerate_pending'
             LIMIT 1
            """,
            [oid, iid, em],
        ).fetchone()
        if not row:
            return False
        con.execute(
            """
            UPDATE org_invites
               SET revoked_at = ?, revoked_by = ?
             WHERE org_id = ?
               AND email = ?
               AND id <> ?
               AND accepted_at IS NULL
               AND revoked_at IS NULL
            """,
            [now, who, oid, em, iid],
        )
        cur = con.execute(
            """
            UPDATE org_invites
               SET revoked_at = NULL, revoked_by = NULL
             WHERE org_id = ?
               AND id = ?
               AND email = ?
               AND accepted_at IS NULL
               AND used_at IS NULL
            """,
            [oid, iid, em],
        )
        con.commit()
    return int(cur.rowcount or 0) > 0


def read_user_org_memberships_fast(user_id: str, *, is_admin: Optional[bool] = None) -> List[Dict[str, Any]]:
    """Pure SELECT — no bootstrap, no INSERT, no commit.
    Used by Explorer read paths where writes must not happen.
    Falls back to [] if user has no memberships yet (first-login bootstrap
    hasn't run yet); caller should treat that as cache-miss and let the
    write-capable list_user_org_memberships() handle it on the auth path.
    """
    uid = str(user_id or "").strip()
    if not uid:
        return []
    _ensure_schema()
    if bool(is_admin):
        rows = list_org_records()
        memberships: List[Dict[str, Any]] = []
        with _connect() as con:
            membership_rows = con.execute(
                """
                SELECT org_id, role, created_at
                  FROM org_memberships
                 WHERE user_id = ?
                """,
                [uid],
            ).fetchall()
        membership_by_org = {
            str(row["org_id"] or ""): {
                "role": _normalize_org_membership_role(row["role"]),
                "created_at": int(row["created_at"] or 0),
            }
            for row in membership_rows
        }
        for row in rows:
            org_id = str(row.get("id") or "")
            current = membership_by_org.get(org_id) or {}
            memberships.append(
                {
                    "org_id": org_id,
                    "name": str(row.get("name") or org_id),
                    "role": str(current.get("role") or "platform_admin"),
                    "is_active": bool(dict(row).get("is_active", 1)),
                    "created_at": int(current.get("created_at") or row.get("created_at") or 0),
                }
            )
        return memberships
    with _connect() as con:
        rows = con.execute(
            """
            SELECT
              m.org_id AS org_id,
              o.name AS org_name,
              m.role AS role,
              m.created_at AS created_at,
              o.is_active AS is_active,
              o.git_mirror_enabled AS git_mirror_enabled,
              o.git_provider AS git_provider,
              o.git_repository AS git_repository,
              o.git_branch AS git_branch,
              o.git_base_path AS git_base_path,
              o.git_health_status AS git_health_status,
              o.git_health_message AS git_health_message,
              o.git_updated_at AS git_updated_at,
              o.git_updated_by AS git_updated_by
              FROM org_memberships m
              JOIN orgs o ON o.id = m.org_id
             WHERE m.user_id = ?
             ORDER BY CASE WHEN m.org_id = ? THEN 0 ELSE 1 END, o.name ASC, m.org_id ASC
            """,
            [uid, _default_org_id()],
        ).fetchall()
    out: List[Dict[str, Any]] = []
    for row in rows:
        item = {
            "org_id": str(row["org_id"] or ""),
            "name": str(row["org_name"] or row["org_id"] or ""),
            "role": str(row["role"] or "org_viewer"),
            "is_active": bool(dict(row).get("is_active", 1)),
            "created_at": int(row["created_at"] or 0),
        }
        item.update(_org_git_mirror_payload(row))
        out.append(item)
    return out


def remove_group_member(org_id: str, group_id: str, user_id: str) -> bool:
    oid = str(org_id or "").strip()
    gid = str(group_id or "").strip()
    uid = str(user_id or "").strip()
    if not oid or not gid or not uid:
        return False
    _ensure_schema()
    with _connect() as con:
        cur = con.execute(
            """
            DELETE FROM group_memberships
             WHERE group_id = ? AND user_id = ?
               AND group_id IN (SELECT id FROM groups WHERE org_id = ? AND id = ?)
            """,
            [gid, uid, oid, gid],
        )
        con.commit()
    return int(cur.rowcount or 0) > 0


def rename_org_record(org_id: str, name: str) -> Dict[str, Any]:
    _ensure_schema()
    oid = str(org_id or "").strip()
    title = " ".join(str(name or "").split()).strip()
    if not oid:
        raise ValueError("org_id required")
    if not title:
        raise ValueError("name required")
    with _connect() as con:
        exists = con.execute(
            "SELECT id FROM orgs WHERE lower(trim(name)) = lower(trim(?)) AND id != ? LIMIT 1",
            [title, oid],
        ).fetchone()
        if exists:
            raise ValueError("workspace name already exists")
        cur = con.execute(
            "UPDATE orgs SET name = ? WHERE id = ?",
            [title, oid],
        )
        con.commit()
        if int(cur.rowcount or 0) <= 0:
            raise ValueError("org not found")
        row = con.execute(
            """
            SELECT
              id,
              name,
              created_at,
              created_by,
              is_active,
              git_mirror_enabled,
              git_provider,
              git_repository,
              git_branch,
              git_base_path,
              git_health_status,
              git_health_message,
              git_updated_at,
              git_updated_by
            FROM orgs
            WHERE id = ? LIMIT 1
            """,
            [oid],
        ).fetchone()
    if not row:
        raise ValueError("org not found")
    is_active_raw = _row_value(row, "is_active")
    out = {
        "id": str(row["id"] or ""),
        "name": str(row["name"] or ""),
        "created_at": int(row["created_at"] or 0),
        "created_by": str(row["created_by"] or ""),
        "is_active": bool(1 if is_active_raw is None else is_active_raw),
    }
    out.update(_org_git_mirror_payload(row))
    return out


def rename_workspace_record(org_id: str, workspace_id: str, name: str) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    wid = str(workspace_id or "").strip()
    title = " ".join(str(name or "").split()).strip()
    if not oid:
        raise ValueError("org_id required")
    if not wid:
        raise ValueError("workspace_id required")
    if not title:
        raise ValueError("name required")
    _ensure_schema()
    with _connect() as con:
        exists = con.execute(
            "SELECT id FROM workspaces WHERE id = ? AND org_id = ? LIMIT 1",
            [wid, oid],
        ).fetchone()
        if not exists:
            raise ValueError("workspace not found")
        dup = con.execute(
            "SELECT id FROM workspaces WHERE org_id = ? AND lower(trim(name)) = lower(trim(?)) AND id != ? LIMIT 1",
            [oid, title, wid],
        ).fetchone()
        if dup:
            raise ValueError("workspace name already exists")
        now = _now_ts()
        con.execute(
            "UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ? AND org_id = ?",
            [title, now, wid, oid],
        )
        con.commit()
    row = get_workspace_record(wid, org_id=oid)
    if not row:
        raise ValueError("workspace not found")
    return row


def resolve_active_org_id(
    user_id: str,
    *,
    requested_org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> str:
    uid = str(user_id or "").strip()
    requested = str(requested_org_id or "").strip()
    memberships = list_user_org_memberships(uid, is_admin=is_admin) if uid else []
    admin = bool(is_admin)

    def _is_active(org_id: str) -> bool:
        for item in memberships:
            if str(item.get("org_id") or "") == org_id:
                return bool(item.get("is_active", True))
        return False

    if requested:
        if admin or _is_active(requested):
            return requested
    active_memberships = [item for item in memberships if bool(item.get("is_active", True))]
    if active_memberships:
        return str(active_memberships[0].get("org_id") or _default_org_id())
    if memberships:
        return str(memberships[0].get("org_id") or _default_org_id())
    return _default_org_id()


def revoke_org_invite(
    org_id: str,
    invite_id: str,
    *,
    revoked_by: str,
) -> bool:
    oid = str(org_id or "").strip()
    iid = str(invite_id or "").strip()
    actor = str(revoked_by or "").strip()
    if not oid or not iid:
        return False
    now = _now_ts()
    _ensure_schema()
    with _connect() as con:
        cur = con.execute(
            """
            UPDATE org_invites
               SET revoked_at = ?, revoked_by = ?
             WHERE org_id = ?
               AND id = ?
               AND accepted_at IS NULL
               AND revoked_at IS NULL
            """,
            [now, actor, oid, iid],
        )
        con.commit()
        return int(cur.rowcount or 0) > 0


def set_org_active(org_id: str, is_active: bool) -> Dict[str, Any]:
    _ensure_schema()
    oid = str(org_id or "").strip()
    if not oid:
        raise ValueError("org_id required")
    with _connect() as con:
        cur = con.execute(
            "UPDATE orgs SET is_active = ? WHERE id = ?",
            [1 if is_active else 0, oid],
        )
        con.commit()
        if int(cur.rowcount or 0) <= 0:
            raise ValueError("org not found")
        row = con.execute(
            """
            SELECT
              id,
              name,
              created_at,
              created_by,
              is_active,
              git_mirror_enabled,
              git_provider,
              git_repository,
              git_branch,
              git_base_path,
              git_health_status,
              git_health_message,
              git_updated_at,
              git_updated_by
            FROM orgs
            WHERE id = ? LIMIT 1
            """,
            [oid],
        ).fetchone()
    if not row:
        raise ValueError("org not found")
    is_active_raw = _row_value(row, "is_active")
    out = {
        "id": str(row["id"] or ""),
        "name": str(row["name"] or ""),
        "created_at": int(row["created_at"] or 0),
        "created_by": str(row["created_by"] or ""),
        "is_active": bool(1 if is_active_raw is None else is_active_raw),
    }
    out.update(_org_git_mirror_payload(row))
    return out


def update_auth_user(user_id: str, **fields: Any) -> Dict[str, Any]:
    uid = str(user_id or "").strip()
    if not uid:
        raise ValueError("user_id_required")
    _ensure_schema()
    with _connect() as con:
        current = _get_auth_user_by_id_with_connection(con, uid)
        if not current:
            raise ValueError("user_not_found")
        updated = dict(current)
        if "email" in fields and fields.get("email") is not None:
            em = _normalize_email(fields.get("email"))
            if not em:
                raise ValueError("email_required")
            duplicate = _get_auth_user_by_email_with_connection(con, em)
            if duplicate and str(duplicate.get("id") or "") != uid:
                raise ValueError("email_exists")
            updated["email"] = em
        for key in (
            "password_hash",
            "is_active",
            "is_admin",
            "activation_pending",
            "activated_at",
            "activation_required",
            "activation_token_hash",
            "activation_expires_at",
            "full_name",
            "job_title",
        ):
            if key in fields and fields.get(key) is not None:
                value = fields.get(key)
                if key in {"is_active", "is_admin", "activation_pending", "activation_required"}:
                    updated[key] = bool(value)
                elif key in {"activated_at", "activation_expires_at"}:
                    updated[key] = int(value or 0)
                else:
                    updated[key] = str(value or "").strip() if key in {"full_name", "job_title"} else str(value or "")
        updated["updated_at"] = _now_ts()
        _upsert_auth_user(con, updated)
        con.commit()
        saved = _get_auth_user_by_id_with_connection(con, uid)
    if not saved:
        raise ValueError("user_update_failed")
    return saved


def update_org_git_mirror_config(
    org_id: str,
    *,
    git_mirror_enabled: bool,
    git_provider: Any,
    git_repository: Any,
    git_branch: Any,
    git_base_path: Any,
    git_health_status: Any,
    git_health_message: Any,
    git_updated_at: Any = None,
    git_updated_by: Any = "",
) -> Dict[str, Any]:
    _ensure_schema()
    oid = str(org_id or "").strip()
    if not oid:
        raise ValueError("org_id required")
    provider = _normalize_git_mirror_provider(git_provider)
    repository = str(git_repository or "").strip()
    branch = str(git_branch or "").strip()
    base_path = str(git_base_path or "").strip()
    health_status = _normalize_git_mirror_health_status(git_health_status)
    health_message = str(git_health_message or "").strip()
    updated_by = str(git_updated_by or "").strip()
    try:
        updated_at = int(git_updated_at or 0)
    except Exception:
        updated_at = 0
    if updated_at <= 0:
        updated_at = _now_ts()
    with _connect() as con:
        cur = con.execute(
            """
            UPDATE orgs
               SET git_mirror_enabled = ?,
                   git_provider = ?,
                   git_repository = ?,
                   git_branch = ?,
                   git_base_path = ?,
                   git_health_status = ?,
                   git_health_message = ?,
                   git_updated_at = ?,
                   git_updated_by = ?
             WHERE id = ?
            """,
            [
                1 if bool(git_mirror_enabled) else 0,
                provider,
                repository,
                branch,
                base_path,
                health_status,
                health_message,
                max(0, int(updated_at)),
                updated_by,
                oid,
            ],
        )
        con.commit()
        if int(cur.rowcount or 0) <= 0:
            raise ValueError("org not found")
    return get_org_git_mirror_config(oid)


def update_org_group(
    org_id: str,
    group_id: str,
    *,
    name: Optional[str] = None,
    description: Optional[str] = None,
    updated_by: str = "",
) -> Optional[Dict[str, Any]]:
    oid = str(org_id or "").strip()
    gid = str(group_id or "").strip()
    if not oid or not gid:
        return None
    _ensure_schema()
    with _connect() as con:
        row = con.execute(
            "SELECT id, org_id, name, description, created_at, updated_at, created_by, updated_by FROM groups WHERE org_id = ? AND id = ? LIMIT 1",
            [oid, gid],
        ).fetchone()
        if not row:
            raise ValueError("group not found")
        current = _group_row_to_dict(row)
        next_name = current["name"]
        next_description = current["description"]
        changed = False
        if name is not None:
            normalized = " ".join(str(name).split()).strip()
            if not normalized:
                raise ValueError("name is required")
            if normalized != next_name:
                next_name = normalized
                changed = True
        if description is not None and str(description) != next_description:
            next_description = str(description)
            changed = True
        if changed:
            now = _now_ts()
            try:
                con.execute(
                    """
                    UPDATE groups
                       SET name = ?,
                           description = ?,
                           updated_at = ?,
                           updated_by = ?
                     WHERE org_id = ? AND id = ?
                    """,
                    [next_name, next_description, now, str(updated_by or ""), oid, gid],
                )
                con.commit()
            except Exception as exc:
                marker = str(exc).lower()
                if "unique" in marker:
                    raise ValueError("group name already exists") from exc
                raise
            return get_org_group(oid, gid)
        return current


def upsert_org_membership(
    org_id: str,
    user_id: str,
    role: str,
    permissions: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    uid = str(user_id or "").strip()
    if not oid or not uid:
        raise ValueError("org_id and user_id are required")
    normalized_role = _normalize_org_membership_role(role)
    permissions_payload = _normalize_membership_permissions(normalized_role, permissions)
    permissions_json = _json_dumps(permissions_payload, {})
    now = _now_ts()
    _ensure_schema()
    with _connect() as con:
        con.execute(
            """
            INSERT INTO org_memberships (org_id, user_id, role, permissions_json, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(org_id, user_id) DO UPDATE SET
              role = excluded.role,
              permissions_json = excluded.permissions_json
            """,
            [oid, uid, normalized_role, permissions_json, now],
        )
        con.commit()
        row = con.execute(
            """
            SELECT org_id, user_id, role, permissions_json, created_at
              FROM org_memberships
             WHERE org_id = ? AND user_id = ?
             LIMIT 1
            """,
            [oid, uid],
        ).fetchone()
    if not row:
        return {
            "org_id": oid,
            "user_id": uid,
            "role": normalized_role,
            "permissions": permissions_payload,
            "created_at": now,
        }
    return {
        "org_id": str(row["org_id"] or ""),
        "user_id": str(row["user_id"] or ""),
        "role": _normalize_org_membership_role(row["role"]),
        "permissions": _normalize_membership_permissions(row["role"], row["permissions_json"]),
        "created_at": int(row["created_at"] or 0),
    }


def user_has_org_membership(user_id: str, org_id: str, *, is_admin: Optional[bool] = None) -> bool:
    uid = str(user_id or "").strip()
    oid = str(org_id or "").strip()
    if not uid or not oid:
        return False
    memberships = list_user_org_memberships(uid, is_admin=is_admin)
    return any(str(item.get("org_id") or "") == oid for item in memberships)

from ..compat.repository import _audit_row_to_dict
from ..compat.repository import _connect
from ..compat.repository import _db_base_dir
from ..compat.repository import _ensure_enterprise_bootstrap
from ..compat.repository import _ensure_schema
from ..compat.repository import _get_auth_user_by_email_with_connection
from ..compat.repository import _get_auth_user_by_id_with_connection
from ..compat.repository import _hash_invite_token
from ..compat.repository import _invite_row_to_dict
from ..compat.repository import _json_dumps
from ..compat.repository import _json_loads
from ..compat.repository import _merge_auth_user_profile_with_connection
from ..compat.repository import _normalize_email
from ..compat.repository import _normalize_git_mirror_health_status
from ..compat.repository import _normalize_git_mirror_provider
from ..compat.repository import _normalize_org_invite_role
from ..compat.repository import _now_ts
from ..compat.repository import _row_value
from ..compat.repository import _scope_org_id
from ..platform.repository import _meta_get
from ..platform.repository import _meta_set
from ..utils.repository import _org_git_mirror_payload
