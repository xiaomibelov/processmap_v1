from __future__ import annotations

import json
import os
import re
import sqlite3
import threading
import uuid
import hashlib
import secrets
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Tuple

from .db import get_db_runtime_config, redact_database_url
from .models import Project, Session

try:
    import psycopg
    from psycopg.errors import IntegrityError as PsycopgIntegrityError
    from psycopg_pool import ConnectionPool
except Exception:
    psycopg = None
    PsycopgIntegrityError = None
    ConnectionPool = None

_REQ_USER_ID: ContextVar[str] = ContextVar("fpc_req_user_id", default="")
_REQ_IS_ADMIN: ContextVar[bool] = ContextVar("fpc_req_is_admin", default=False)
_REQ_ORG_ID: ContextVar[str] = ContextVar("fpc_req_org_id", default="")

_DB_LOCK = threading.RLock()
_SCHEMA_READY = False
_SCHEMA_DB_FILE = ""
_MIGRATION_MARK = "legacy_file_to_sqlite_v1"
_ENTERPRISE_BOOTSTRAP_MARK = "enterprise_org_bootstrap_v1"
_DEFAULT_ORG_ID = str(os.environ.get("FPC_DEFAULT_ORG_ID", "org_default") or "org_default").strip() or "org_default"
_DEFAULT_ORG_NAME = str(os.environ.get("FPC_DEFAULT_ORG_NAME", "Default") or "Default").strip() or "Default"
_DEFAULT_WORKSPACE_NAME = (
    str(os.environ.get("FPC_DEFAULT_WORKSPACE_NAME", "Main Workspace") or "Main Workspace").strip()
    or "Main Workspace"
)
_ORG_FULL_ACCESS_ROLES = {"org_owner", "org_admin", "auditor"}
_PROJECT_MEMBER_ROLES = {"project_manager", "editor", "viewer"}
_ORG_MEMBER_ROLES = {"org_owner", "org_admin", "project_manager", "editor", "viewer", "org_viewer", "auditor"}
_ORG_INVITE_ROLES = {"org_admin", "project_manager", "editor", "viewer", "org_viewer", "auditor"}
_GIT_MIRROR_PROVIDERS = {"github", "gitlab"}
_GIT_MIRROR_HEALTH_STATUSES = {"unknown", "valid", "invalid"}
_PG_POOL_LOCK = threading.RLock()
_PG_POOL: Any = None


def _now_ts() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def push_storage_request_scope(user_id: str | None, is_admin: bool = False, org_id: str | None = None) -> Tuple[Any, Any, Any]:
    token_uid = _REQ_USER_ID.set(str(user_id or "").strip())
    token_admin = _REQ_IS_ADMIN.set(bool(is_admin))
    token_org = _REQ_ORG_ID.set(str(org_id or "").strip())
    return token_uid, token_admin, token_org


def pop_storage_request_scope(tokens: Tuple[Any, Any, Any] | None) -> None:
    if not tokens:
        return
    tok_uid, tok_admin, tok_org = tokens
    try:
        _REQ_USER_ID.reset(tok_uid)
    except Exception:
        pass
    try:
        _REQ_IS_ADMIN.reset(tok_admin)
    except Exception:
        pass
    try:
        _REQ_ORG_ID.reset(tok_org)
    except Exception:
        pass


def _scope_user_id(override_user_id: str | None = None) -> str:
    if override_user_id is not None:
        return str(override_user_id or "").strip()
    return str(_REQ_USER_ID.get("") or "").strip()


def _scope_is_admin(override_is_admin: Optional[bool] = None) -> bool:
    if override_is_admin is not None:
        return bool(override_is_admin)
    return bool(_REQ_IS_ADMIN.get(False))


def _scope_org_id(override_org_id: str | None = None) -> str:
    if override_org_id is not None:
        return str(override_org_id or "").strip()
    return str(_REQ_ORG_ID.get("") or "").strip()


def _db_base_dir() -> Path:
    base = os.environ.get("PROCESS_STORAGE_DIR", "workspace/.session_store")
    p = Path(base)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _db_path() -> Path:
    explicit = str(os.environ.get("PROCESS_DB_PATH", "") or "").strip()
    if explicit:
        p = Path(explicit)
        p.parent.mkdir(parents=True, exist_ok=True)
        return p
    return _db_base_dir() / "processmap.sqlite3"


class _RowCompat:
    __slots__ = ("_columns", "_values", "_mapping")

    def __init__(self, columns: Iterable[str], values: Iterable[Any]) -> None:
        self._columns = list(columns)
        self._values = list(values)
        self._mapping = {name: self._values[idx] for idx, name in enumerate(self._columns)}

    def __getitem__(self, key: Any) -> Any:
        if isinstance(key, int):
            return self._values[key]
        return self._mapping[str(key)]

    def keys(self) -> List[str]:
        return list(self._columns)


class _PgResult:
    __slots__ = ("_rows", "_offset", "rowcount")

    def __init__(self, rows: List[_RowCompat], rowcount: int) -> None:
        self._rows = rows
        self._offset = 0
        self.rowcount = int(rowcount or 0)

    def fetchone(self) -> Any:
        if self._offset >= len(self._rows):
            return None
        row = self._rows[self._offset]
        self._offset += 1
        return row

    def fetchall(self) -> List[Any]:
        if self._offset >= len(self._rows):
            return []
        rows = self._rows[self._offset :]
        self._offset = len(self._rows)
        return rows


class _PgCompatConnection:
    def __init__(self, conn: Any, conn_ctx: Any = None) -> None:
        self._conn = conn
        self._conn_ctx = conn_ctx

    def __enter__(self) -> "_PgCompatConnection":
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        try:
            if exc_type is None:
                self._conn.commit()
            else:
                self._conn.rollback()
        finally:
            self.close()
        return False

    def close(self) -> None:
        if self._conn_ctx is not None:
            self._conn_ctx.__exit__(None, None, None)
            self._conn_ctx = None
            return
        try:
            self._conn.close()
        except Exception:
            pass

    def commit(self) -> None:
        self._conn.commit()

    def rollback(self) -> None:
        self._conn.rollback()

    def execute(self, query: str, params: Any = None) -> _PgResult:
        sql, bound = _translate_sql_for_postgres(query, params)
        with self._conn.cursor() as cur:
            cur.execute(sql, bound)
            if cur.description:
                rows_raw = cur.fetchall()
                columns = [str(col.name or "") for col in (cur.description or [])]
                rows: List[_RowCompat] = []
                for row_raw in rows_raw:
                    values = list(row_raw if isinstance(row_raw, tuple) else tuple(row_raw))
                    rows.append(_RowCompat(columns, values))
                rowcount = len(rows)
                return _PgResult(rows, rowcount=rowcount)
            rowcount = int(cur.rowcount or 0)
            return _PgResult([], rowcount=rowcount)


def _qmark_to_pyformat(sql: str) -> str:
    out: List[str] = []
    in_single = False
    in_double = False
    i = 0
    while i < len(sql):
        ch = sql[i]
        if ch == "'" and not in_double:
            in_single = not in_single
            out.append(ch)
            i += 1
            continue
        if ch == '"' and not in_single:
            in_double = not in_double
            out.append(ch)
            i += 1
            continue
        if ch == "?" and not in_single and not in_double:
            out.append("%s")
            i += 1
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def _named_to_pyformat(sql: str) -> str:
    # Keep PostgreSQL casts (::) intact.
    return re.sub(r"(?<!:):([A-Za-z_][A-Za-z0-9_]*)", r"%(\1)s", sql)


def _translate_sql_for_postgres(query: str, params: Any) -> Tuple[str, Any]:
    sql = str(query or "")
    pragma_match = re.match(r"^\s*PRAGMA\s+table_info\(([^)]+)\)\s*;?\s*$", sql, flags=re.IGNORECASE)
    if pragma_match:
        table = str(pragma_match.group(1) or "").strip().strip("'").strip('"')
        return (
            """
            SELECT
              (ordinal_position - 1) AS cid,
              column_name AS name,
              data_type AS type,
              CASE WHEN is_nullable = 'NO' THEN 1 ELSE 0 END AS notnull,
              column_default AS dflt_value,
              0 AS pk
            FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = %s
            ORDER BY ordinal_position
            """,
            [table],
        )

    had_insert_ignore = bool(re.search(r"\bINSERT\s+OR\s+IGNORE\s+INTO\b", sql, flags=re.IGNORECASE))
    if had_insert_ignore:
        sql = re.sub(r"\bINSERT\s+OR\s+IGNORE\s+INTO\b", "INSERT INTO", sql, flags=re.IGNORECASE)
        if "ON CONFLICT" not in sql.upper():
            stripped = sql.rstrip()
            if stripped.endswith(";"):
                stripped = stripped[:-1]
            sql = f"{stripped} ON CONFLICT DO NOTHING"

    if isinstance(params, Mapping):
        return _named_to_pyformat(sql), dict(params)
    return _qmark_to_pyformat(sql), (list(params) if params is not None else [])


def _get_pg_pool() -> Any:
    global _PG_POOL
    with _PG_POOL_LOCK:
        if _PG_POOL is not None:
            return _PG_POOL
        cfg = get_db_runtime_config()
        if cfg.backend != "postgres":
            return None
        if psycopg is None or ConnectionPool is None:
            raise RuntimeError("postgres backend selected but psycopg/psycopg_pool is not installed")
        _PG_POOL = ConnectionPool(
            conninfo=cfg.database_url,
            min_size=cfg.pool_min_size,
            max_size=cfg.pool_max_size,
            kwargs={"autocommit": False},
        )
        _PG_POOL.wait()
        return _PG_POOL


def _connect() -> Any:
    cfg = get_db_runtime_config()
    if cfg.backend == "postgres":
        pool = _get_pg_pool()
        if pool is None:
            raise RuntimeError("postgres backend selected but connection pool is unavailable")
        conn_ctx = pool.connection()
        conn = conn_ctx.__enter__()
        return _PgCompatConnection(conn, conn_ctx=conn_ctx)
    con = sqlite3.connect(str(_db_path()))
    con.row_factory = sqlite3.Row
    return con


def _legacy_sessions_dir() -> Path:
    base = str(os.environ.get("PROCESS_STORAGE_DIR", "workspace/.session_store") or "").strip()
    return Path(base)


def _legacy_projects_dir() -> Path:
    root = str(os.environ.get("PROJECT_STORAGE_DIR", "") or "").strip()
    if root:
        return Path(root)
    return Path("/app/workspace/projects")


def _json_dumps(value: Any, fallback: Any) -> str:
    source = value if value is not None else fallback
    def _to_jsonable(obj: Any) -> Any:
        if obj is None:
            return None
        if isinstance(obj, (str, int, float, bool)):
            return obj
        if isinstance(obj, dict):
            out: Dict[str, Any] = {}
            for k, v in obj.items():
                out[str(k)] = _to_jsonable(v)
            return out
        if isinstance(obj, (list, tuple, set)):
            return [_to_jsonable(v) for v in obj]
        if hasattr(obj, "model_dump") and callable(getattr(obj, "model_dump")):
            try:
                return _to_jsonable(obj.model_dump())
            except Exception:
                pass
        if hasattr(obj, "dict") and callable(getattr(obj, "dict")):
            try:
                return _to_jsonable(obj.dict())
            except Exception:
                pass
        return obj

    try:
        return json.dumps(_to_jsonable(source), ensure_ascii=False)
    except Exception:
        return json.dumps(_to_jsonable(fallback), ensure_ascii=False)


def _json_loads(value: Any, fallback: Any) -> Any:
    raw = str(value or "")
    if not raw:
        return fallback
    try:
        parsed = json.loads(raw)
        if parsed is None:
            return fallback
        return parsed
    except Exception:
        return fallback


def _owner_clause(owner_user_id: str, is_admin: bool) -> Tuple[str, List[Any]]:
    if is_admin or not owner_user_id:
        return "", []
    return " AND owner_user_id = ? ", [owner_user_id]


def _org_clause(org_id: str) -> Tuple[str, List[Any]]:
    oid = str(org_id or "").strip()
    if not oid:
        return "", []
    return " AND org_id = ? ", [oid]


def _row_value(row: Any, key: str, fallback_idx: Optional[int] = None) -> Any:
    if row is None:
        return None
    if isinstance(row, Mapping):
        return row.get(key)
    try:
        return row[key]
    except Exception:
        pass
    if fallback_idx is None:
        return None
    try:
        return row[fallback_idx]
    except Exception:
        return None


def _column_exists(con: Any, table: str, column: str) -> bool:
    try:
        rows = con.execute(f"PRAGMA table_info({table})").fetchall()
    except Exception:
        return False
    target = str(column or "").strip().lower()
    for row in rows:
        name = str(_row_value(row, "name", 1) or "").strip().lower()
        if name == target:
            return True
    return False


def _normalize_git_mirror_provider(value: Any) -> str:
    provider = str(value or "").strip().lower()
    return provider if provider in _GIT_MIRROR_PROVIDERS else ""


def _normalize_git_mirror_health_status(value: Any) -> str:
    status = str(value or "").strip().lower()
    return status if status in _GIT_MIRROR_HEALTH_STATUSES else "unknown"


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


def _ensure_schema() -> None:
    global _SCHEMA_READY, _SCHEMA_DB_FILE
    cfg = get_db_runtime_config()
    if cfg.backend == "postgres":
        db_file = f"postgres:{redact_database_url(cfg.database_url)}"
    else:
        db_file = f"sqlite:{_db_path()}"
    with _DB_LOCK:
        if _SCHEMA_READY and _SCHEMA_DB_FILE == db_file:
            return
        with _connect() as con:
            if cfg.backend == "postgres":
                # Guard schema/bootstrap against multi-process startup deadlocks.
                con.execute("SELECT pg_advisory_xact_lock(?)", [904120266])
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS storage_meta (
                  key TEXT PRIMARY KEY,
                  value TEXT NOT NULL DEFAULT ''
                )
                """
            )
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS projects (
                  id TEXT PRIMARY KEY,
                  title TEXT NOT NULL,
                  passport_json TEXT NOT NULL DEFAULT '{}',
                  created_at INTEGER NOT NULL DEFAULT 0,
                  updated_at INTEGER NOT NULL DEFAULT 0,
                  version INTEGER NOT NULL DEFAULT 1,
                  owner_user_id TEXT NOT NULL DEFAULT '',
                  org_id TEXT NOT NULL DEFAULT 'org_default',
                  created_by TEXT NOT NULL DEFAULT '',
                  updated_by TEXT NOT NULL DEFAULT ''
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_projects_owner_updated ON projects(owner_user_id, updated_at DESC)")
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                  id TEXT PRIMARY KEY,
                  title TEXT NOT NULL,
                  roles_json TEXT NOT NULL DEFAULT '[]',
                  start_role TEXT,
                  project_id TEXT,
                  mode TEXT,
                  notes TEXT NOT NULL DEFAULT '',
                  notes_by_element_json TEXT NOT NULL DEFAULT '{}',
                  interview_json TEXT NOT NULL DEFAULT '{}',
                  nodes_json TEXT NOT NULL DEFAULT '[]',
                  edges_json TEXT NOT NULL DEFAULT '[]',
                  questions_json TEXT NOT NULL DEFAULT '[]',
                  mermaid TEXT NOT NULL DEFAULT '',
                  mermaid_simple TEXT NOT NULL DEFAULT '',
                  mermaid_lanes TEXT NOT NULL DEFAULT '',
                  normalized_json TEXT NOT NULL DEFAULT '{}',
                  resources_json TEXT NOT NULL DEFAULT '{}',
                  analytics_json TEXT NOT NULL DEFAULT '{}',
                  ai_llm_state_json TEXT NOT NULL DEFAULT '{}',
                  bpmn_xml TEXT NOT NULL DEFAULT '',
                  bpmn_xml_version INTEGER NOT NULL DEFAULT 0,
                  bpmn_graph_fingerprint TEXT NOT NULL DEFAULT '',
                  git_mirror_version_number INTEGER NOT NULL DEFAULT 0,
                  bpmn_meta_json TEXT NOT NULL DEFAULT '{}',
                  version INTEGER NOT NULL DEFAULT 0,
                  owner_user_id TEXT NOT NULL DEFAULT '',
                  org_id TEXT NOT NULL DEFAULT 'org_default',
                  created_by TEXT NOT NULL DEFAULT '',
                  updated_by TEXT NOT NULL DEFAULT '',
                  created_at INTEGER NOT NULL DEFAULT 0,
                  updated_at INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_sessions_owner_updated ON sessions(owner_user_id, updated_at DESC)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id)")
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS bpmn_versions (
                  id TEXT PRIMARY KEY,
                  session_id TEXT NOT NULL,
                  org_id TEXT NOT NULL DEFAULT 'org_default',
                  version_number INTEGER NOT NULL,
                  bpmn_xml TEXT NOT NULL DEFAULT '',
                  source_action TEXT NOT NULL DEFAULT '',
                  import_note TEXT NOT NULL DEFAULT '',
                  created_at INTEGER NOT NULL DEFAULT 0,
                  created_by TEXT NOT NULL DEFAULT ''
                )
                """
            )
            con.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_bpmn_versions_session_version ON bpmn_versions(session_id, org_id, version_number)"
            )
            con.execute(
                "CREATE INDEX IF NOT EXISTS idx_bpmn_versions_session_created ON bpmn_versions(session_id, org_id, created_at DESC)"
            )
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS orgs (
                  id TEXT PRIMARY KEY,
                  name TEXT NOT NULL,
                  created_at INTEGER NOT NULL DEFAULT 0,
                  created_by TEXT NOT NULL DEFAULT '',
                  git_mirror_enabled INTEGER NOT NULL DEFAULT 0,
                  git_provider TEXT NOT NULL DEFAULT '',
                  git_repository TEXT NOT NULL DEFAULT '',
                  git_branch TEXT NOT NULL DEFAULT '',
                  git_base_path TEXT NOT NULL DEFAULT '',
                  git_health_status TEXT NOT NULL DEFAULT 'unknown',
                  git_health_message TEXT NOT NULL DEFAULT '',
                  git_updated_at INTEGER NOT NULL DEFAULT 0,
                  git_updated_by TEXT NOT NULL DEFAULT ''
                )
                """
            )
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS org_memberships (
                  org_id TEXT NOT NULL,
                  user_id TEXT NOT NULL,
                  role TEXT NOT NULL DEFAULT 'editor',
                  created_at INTEGER NOT NULL DEFAULT 0,
                  PRIMARY KEY (org_id, user_id)
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON org_memberships(user_id)")
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS project_memberships (
                  org_id TEXT NOT NULL,
                  project_id TEXT NOT NULL,
                  user_id TEXT NOT NULL,
                  role TEXT NOT NULL,
                  created_at INTEGER NOT NULL DEFAULT 0,
                  updated_at INTEGER NOT NULL DEFAULT 0,
                  PRIMARY KEY (org_id, project_id, user_id)
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_project_memberships_org_user ON project_memberships(org_id, user_id)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_project_memberships_org_project ON project_memberships(org_id, project_id)")
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS templates (
                  id TEXT PRIMARY KEY,
                  scope TEXT NOT NULL DEFAULT 'personal',
                  template_type TEXT NOT NULL DEFAULT 'bpmn_selection_v1',
                  org_id TEXT NOT NULL DEFAULT '',
                  owner_user_id TEXT NOT NULL DEFAULT '',
                  folder_id TEXT NOT NULL DEFAULT '',
                  name TEXT NOT NULL DEFAULT '',
                  description TEXT NOT NULL DEFAULT '',
                  payload_json TEXT NOT NULL DEFAULT '{}',
                  created_from_session_id TEXT NOT NULL DEFAULT '',
                  created_at INTEGER NOT NULL DEFAULT 0,
                  updated_at INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_templates_scope_owner_updated ON templates(scope, owner_user_id, updated_at DESC)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_templates_scope_org_updated ON templates(scope, org_id, updated_at DESC)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_templates_owner_updated ON templates(owner_user_id, updated_at DESC)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_templates_scope_updated ON templates(scope, updated_at DESC)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_templates_org_scope_updated ON templates(org_id, scope, updated_at DESC)")
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS template_folders (
                  id TEXT PRIMARY KEY,
                  scope TEXT NOT NULL DEFAULT 'personal',
                  org_id TEXT NOT NULL DEFAULT '',
                  owner_user_id TEXT NOT NULL DEFAULT '',
                  name TEXT NOT NULL DEFAULT '',
                  parent_id TEXT NOT NULL DEFAULT '',
                  sort_order INTEGER NOT NULL DEFAULT 0,
                  created_at INTEGER NOT NULL DEFAULT 0,
                  updated_at INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_template_folders_scope_owner ON template_folders(scope, owner_user_id, updated_at DESC)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_template_folders_scope_org ON template_folders(scope, org_id, updated_at DESC)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_template_folders_parent ON template_folders(parent_id)")
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS org_property_dictionary_operations (
                  id TEXT PRIMARY KEY,
                  org_id TEXT NOT NULL,
                  operation_key TEXT NOT NULL,
                  operation_label TEXT NOT NULL DEFAULT '',
                  is_active INTEGER NOT NULL DEFAULT 1,
                  sort_order INTEGER NOT NULL DEFAULT 0,
                  created_at INTEGER NOT NULL DEFAULT 0,
                  updated_at INTEGER NOT NULL DEFAULT 0,
                  created_by TEXT NOT NULL DEFAULT '',
                  updated_by TEXT NOT NULL DEFAULT ''
                )
                """
            )
            con.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_org_prop_dict_ops_unique
                ON org_property_dictionary_operations(org_id, operation_key)
                """
            )
            con.execute(
                "CREATE INDEX IF NOT EXISTS idx_org_prop_dict_ops_sort ON org_property_dictionary_operations(org_id, is_active, sort_order ASC, operation_key ASC)"
            )
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS org_property_dictionary_defs (
                  id TEXT PRIMARY KEY,
                  org_id TEXT NOT NULL,
                  operation_key TEXT NOT NULL,
                  property_key TEXT NOT NULL,
                  property_label TEXT NOT NULL DEFAULT '',
                  input_mode TEXT NOT NULL DEFAULT 'autocomplete',
                  allow_custom_value INTEGER NOT NULL DEFAULT 1,
                  required INTEGER NOT NULL DEFAULT 0,
                  is_active INTEGER NOT NULL DEFAULT 1,
                  sort_order INTEGER NOT NULL DEFAULT 0,
                  created_at INTEGER NOT NULL DEFAULT 0,
                  updated_at INTEGER NOT NULL DEFAULT 0,
                  created_by TEXT NOT NULL DEFAULT '',
                  updated_by TEXT NOT NULL DEFAULT ''
                )
                """
            )
            con.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_org_prop_dict_defs_unique
                ON org_property_dictionary_defs(org_id, operation_key, property_key)
                """
            )
            con.execute(
                "CREATE INDEX IF NOT EXISTS idx_org_prop_dict_defs_sort ON org_property_dictionary_defs(org_id, operation_key, is_active, sort_order ASC, property_key ASC)"
            )
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS org_property_dictionary_values (
                  id TEXT PRIMARY KEY,
                  org_id TEXT NOT NULL,
                  operation_key TEXT NOT NULL,
                  property_key TEXT NOT NULL,
                  option_value TEXT NOT NULL,
                  is_active INTEGER NOT NULL DEFAULT 1,
                  sort_order INTEGER NOT NULL DEFAULT 0,
                  created_at INTEGER NOT NULL DEFAULT 0,
                  updated_at INTEGER NOT NULL DEFAULT 0,
                  created_by TEXT NOT NULL DEFAULT '',
                  updated_by TEXT NOT NULL DEFAULT ''
                )
                """
            )
            con.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_org_prop_dict_values_unique
                ON org_property_dictionary_values(org_id, operation_key, property_key, option_value)
                """
            )
            con.execute(
                "CREATE INDEX IF NOT EXISTS idx_org_prop_dict_values_sort ON org_property_dictionary_values(org_id, operation_key, property_key, is_active, sort_order ASC, option_value ASC)"
            )
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS org_invites (
                  id TEXT PRIMARY KEY,
                  org_id TEXT NOT NULL,
                  email TEXT NOT NULL,
                  role TEXT NOT NULL,
                  full_name TEXT NOT NULL DEFAULT '',
                  job_title TEXT NOT NULL DEFAULT '',
                  team_name TEXT NOT NULL DEFAULT '',
                  subgroup_name TEXT NOT NULL DEFAULT '',
                  invite_comment TEXT NOT NULL DEFAULT '',
                  invite_key TEXT NOT NULL DEFAULT '',
                  token_hash TEXT NOT NULL,
                  expires_at INTEGER NOT NULL DEFAULT 0,
                  created_at INTEGER NOT NULL DEFAULT 0,
                  created_by TEXT NOT NULL DEFAULT '',
                  used_at INTEGER,
                  used_by_user_id TEXT,
                  accepted_at INTEGER,
                  accepted_by TEXT,
                  revoked_at INTEGER,
                  revoked_by TEXT
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_org_invites_org_created ON org_invites(org_id, created_at DESC)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_org_invites_token_hash ON org_invites(token_hash)")
            con.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_org_invites_active_unique
                ON org_invites(org_id, email)
                WHERE accepted_at IS NULL AND revoked_at IS NULL
                """
            )
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS audit_log (
                  id TEXT PRIMARY KEY,
                  ts INTEGER NOT NULL DEFAULT 0,
                  actor_user_id TEXT NOT NULL DEFAULT '',
                  org_id TEXT NOT NULL,
                  project_id TEXT,
                  session_id TEXT,
                  action TEXT NOT NULL,
                  entity_type TEXT NOT NULL,
                  entity_id TEXT NOT NULL,
                  status TEXT NOT NULL DEFAULT 'ok',
                  meta_json TEXT NOT NULL DEFAULT '{}'
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_audit_org_ts ON audit_log(org_id, ts DESC)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_audit_org_action ON audit_log(org_id, action)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_audit_project ON audit_log(project_id)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_log(session_id)")
            if not _column_exists(con, "projects", "org_id"):
                con.execute("ALTER TABLE projects ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_default'")
            if not _column_exists(con, "orgs", "git_mirror_enabled"):
                con.execute("ALTER TABLE orgs ADD COLUMN git_mirror_enabled INTEGER NOT NULL DEFAULT 0")
            if not _column_exists(con, "orgs", "git_provider"):
                con.execute("ALTER TABLE orgs ADD COLUMN git_provider TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "orgs", "git_repository"):
                con.execute("ALTER TABLE orgs ADD COLUMN git_repository TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "orgs", "git_branch"):
                con.execute("ALTER TABLE orgs ADD COLUMN git_branch TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "orgs", "git_base_path"):
                con.execute("ALTER TABLE orgs ADD COLUMN git_base_path TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "orgs", "git_health_status"):
                con.execute("ALTER TABLE orgs ADD COLUMN git_health_status TEXT NOT NULL DEFAULT 'unknown'")
            if not _column_exists(con, "orgs", "git_health_message"):
                con.execute("ALTER TABLE orgs ADD COLUMN git_health_message TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "orgs", "git_updated_at"):
                con.execute("ALTER TABLE orgs ADD COLUMN git_updated_at INTEGER NOT NULL DEFAULT 0")
            if not _column_exists(con, "orgs", "git_updated_by"):
                con.execute("ALTER TABLE orgs ADD COLUMN git_updated_by TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "templates", "template_type"):
                con.execute("ALTER TABLE templates ADD COLUMN template_type TEXT NOT NULL DEFAULT 'bpmn_selection_v1'")
            if not _column_exists(con, "templates", "folder_id"):
                con.execute("ALTER TABLE templates ADD COLUMN folder_id TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "templates", "created_from_session_id"):
                con.execute("ALTER TABLE templates ADD COLUMN created_from_session_id TEXT NOT NULL DEFAULT ''")
            con.execute("CREATE INDEX IF NOT EXISTS idx_templates_folder ON templates(folder_id)")
            if not _column_exists(con, "projects", "created_by"):
                con.execute("ALTER TABLE projects ADD COLUMN created_by TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "projects", "updated_by"):
                con.execute("ALTER TABLE projects ADD COLUMN updated_by TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "sessions", "org_id"):
                con.execute("ALTER TABLE sessions ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_default'")
            if not _column_exists(con, "sessions", "created_by"):
                con.execute("ALTER TABLE sessions ADD COLUMN created_by TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "sessions", "updated_by"):
                con.execute("ALTER TABLE sessions ADD COLUMN updated_by TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "sessions", "git_mirror_version_number"):
                con.execute("ALTER TABLE sessions ADD COLUMN git_mirror_version_number INTEGER NOT NULL DEFAULT 0")
            if not _column_exists(con, "org_invites", "team_name"):
                con.execute("ALTER TABLE org_invites ADD COLUMN team_name TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "org_invites", "subgroup_name"):
                con.execute("ALTER TABLE org_invites ADD COLUMN subgroup_name TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "org_invites", "invite_comment"):
                con.execute("ALTER TABLE org_invites ADD COLUMN invite_comment TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "org_invites", "full_name"):
                con.execute("ALTER TABLE org_invites ADD COLUMN full_name TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "org_invites", "job_title"):
                con.execute("ALTER TABLE org_invites ADD COLUMN job_title TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "org_invites", "invite_key"):
                con.execute("ALTER TABLE org_invites ADD COLUMN invite_key TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "org_invites", "used_at"):
                con.execute("ALTER TABLE org_invites ADD COLUMN used_at INTEGER")
            if not _column_exists(con, "org_invites", "used_by_user_id"):
                con.execute("ALTER TABLE org_invites ADD COLUMN used_by_user_id TEXT")
            con.execute("CREATE INDEX IF NOT EXISTS idx_projects_org_updated ON projects(org_id, updated_at DESC)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_sessions_org_project_updated ON sessions(org_id, project_id, updated_at DESC)")
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS workspaces (
                  id TEXT PRIMARY KEY,
                  org_id TEXT NOT NULL DEFAULT '',
                  name TEXT NOT NULL DEFAULT '',
                  created_at INTEGER NOT NULL DEFAULT 0,
                  created_by TEXT NOT NULL DEFAULT '',
                  updated_at INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_workspaces_org_name ON workspaces(org_id, name)")
            try:
                con.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_org_unique_name ON workspaces(org_id, name)")
            except Exception:
                pass
            # ── Workspace Folders (adjacency list; parent_id='' means workspace root) ──
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS workspace_folders (
                  id TEXT PRIMARY KEY,
                  org_id TEXT NOT NULL DEFAULT '',
                  workspace_id TEXT NOT NULL DEFAULT '',
                  parent_id TEXT NOT NULL DEFAULT '',
                  name TEXT NOT NULL DEFAULT '',
                  sort_order INTEGER NOT NULL DEFAULT 0,
                  created_by TEXT NOT NULL DEFAULT '',
                  created_at INTEGER NOT NULL DEFAULT 0,
                  updated_at INTEGER NOT NULL DEFAULT 0,
                  archived_at INTEGER
                )
                """
            )
            if not _column_exists(con, "workspace_folders", "workspace_id"):
                con.execute("ALTER TABLE workspace_folders ADD COLUMN workspace_id TEXT NOT NULL DEFAULT ''")
            con.execute("CREATE INDEX IF NOT EXISTS idx_wf_org_workspace_parent ON workspace_folders(org_id, workspace_id, parent_id)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_wf_org_updated ON workspace_folders(org_id, updated_at DESC)")
            try:
                con.execute("DROP INDEX IF EXISTS idx_wf_unique_name")
                con.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_wf_unique_name ON workspace_folders(org_id, workspace_id, parent_id, name)")
            except Exception:
                pass
            # ── Add folder_id to projects ('' = workspace root) ─────────────────────
            if not _column_exists(con, "projects", "folder_id"):
                con.execute("ALTER TABLE projects ADD COLUMN folder_id TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "projects", "workspace_id"):
                con.execute("ALTER TABLE projects ADD COLUMN workspace_id TEXT NOT NULL DEFAULT ''")
            con.execute("CREATE INDEX IF NOT EXISTS idx_projects_org_workspace_folder ON projects(org_id, workspace_id, folder_id)")
            _maybe_migrate_legacy_files(con)
            _ensure_enterprise_bootstrap(con)
            _ensure_org_workspaces_bootstrap(con)
            _ensure_workspace_folder_backfill(con)
            con.commit()
        _SCHEMA_READY = True
        _SCHEMA_DB_FILE = db_file


def _meta_get(con: sqlite3.Connection, key: str) -> str:
    row = con.execute("SELECT value FROM storage_meta WHERE key = ? LIMIT 1", [str(key or "")]).fetchone()
    if not row:
        return ""
    return str(row["value"] or "")


def _meta_set(con: sqlite3.Connection, key: str, value: str) -> None:
    con.execute(
        """
        INSERT INTO storage_meta(key, value) VALUES(?, ?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value
        """,
        [str(key or ""), str(value or "")],
    )


def _read_legacy_json(path: Path) -> Dict[str, Any] | None:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    return raw if isinstance(raw, dict) else None


def _maybe_migrate_legacy_files(con: sqlite3.Connection) -> None:
    enabled_raw = str(os.environ.get("FPC_DB_MIGRATE_FILES", "1") or "").strip().lower()
    if enabled_raw in {"0", "false", "no", "off"}:
        return
    if _meta_get(con, _MIGRATION_MARK) == "done":
        return

    sessions_dir = _legacy_sessions_dir()
    if sessions_dir.exists() and sessions_dir.is_dir():
        for fp in sorted(sessions_dir.glob("*.json")):
            if fp.name.startswith("_auth_"):
                continue
            raw = _read_legacy_json(fp)
            if not raw:
                continue
            sid = str(raw.get("id") or fp.stem).strip()
            if not sid:
                continue
            try:
                sess = Session.model_validate(raw)
            except Exception:
                continue
            owner = str(getattr(sess, "owner_user_id", "") or "").strip()
            created_at = int(getattr(sess, "created_at", 0) or 0) or int(fp.stat().st_mtime)
            updated_at = int(getattr(sess, "updated_at", 0) or 0) or int(fp.stat().st_mtime)
            con.execute(
                """
                INSERT INTO sessions (
                  id, title, roles_json, start_role, project_id, mode, notes, notes_by_element_json,
                  interview_json, nodes_json, edges_json, questions_json, mermaid, mermaid_simple, mermaid_lanes,
                  normalized_json, resources_json, analytics_json, ai_llm_state_json,
                  bpmn_xml, bpmn_xml_version, bpmn_graph_fingerprint, bpmn_meta_json, version,
                  owner_user_id, created_at, updated_at
                ) VALUES (
                  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
                ON CONFLICT(id) DO NOTHING
                """,
                [
                    sid,
                    str(getattr(sess, "title", "") or ""),
                    _json_dumps(getattr(sess, "roles", []), []),
                    getattr(sess, "start_role", None),
                    getattr(sess, "project_id", None),
                    getattr(sess, "mode", None),
                    str(getattr(sess, "notes", "") or ""),
                    _json_dumps(getattr(sess, "notes_by_element", {}), {}),
                    _json_dumps(getattr(sess, "interview", {}), {}),
                    _json_dumps(getattr(sess, "nodes", []), []),
                    _json_dumps(getattr(sess, "edges", []), []),
                    _json_dumps(getattr(sess, "questions", []), []),
                    str(getattr(sess, "mermaid", "") or ""),
                    str(getattr(sess, "mermaid_simple", "") or ""),
                    str(getattr(sess, "mermaid_lanes", "") or ""),
                    _json_dumps(getattr(sess, "normalized", {}), {}),
                    _json_dumps(getattr(sess, "resources", {}), {}),
                    _json_dumps(getattr(sess, "analytics", {}), {}),
                    _json_dumps(getattr(sess, "ai_llm_state", {}), {}),
                    str(getattr(sess, "bpmn_xml", "") or ""),
                    int(getattr(sess, "bpmn_xml_version", 0) or 0),
                    str(getattr(sess, "bpmn_graph_fingerprint", "") or ""),
                    _json_dumps(getattr(sess, "bpmn_meta", {}), {}),
                    int(getattr(sess, "version", 0) or 0),
                    owner,
                    created_at,
                    updated_at,
                ],
            )

    projects_dir = _legacy_projects_dir()
    if projects_dir.exists() and projects_dir.is_dir():
        for fp in sorted(projects_dir.glob("*.json")):
            raw = _read_legacy_json(fp)
            if not raw:
                continue
            pid = str(raw.get("id") or fp.stem).strip()
            if not pid:
                continue
            title = str(raw.get("title") or "Проект").strip() or "Проект"
            passport = raw.get("passport") if isinstance(raw.get("passport"), dict) else {}
            owner = str(raw.get("owner_user_id") or "").strip()
            created_at = int(raw.get("created_at") or 0) or int(fp.stat().st_mtime)
            updated_at = int(raw.get("updated_at") or 0) or int(fp.stat().st_mtime)
            version = int(raw.get("version") or 1) or 1
            con.execute(
                """
                INSERT INTO projects (id, title, passport_json, created_at, updated_at, version, owner_user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO NOTHING
                """,
                [pid, title, _json_dumps(passport, {}), created_at, updated_at, version, owner],
            )

    _meta_set(con, _MIGRATION_MARK, "done")


def _default_org_id() -> str:
    return _DEFAULT_ORG_ID


def _default_org_name() -> str:
    return _DEFAULT_ORG_NAME


def _default_workspace_name() -> str:
    return _DEFAULT_WORKSPACE_NAME


def _default_workspace_id(org_id: str) -> str:
    oid = str(org_id or "").strip() or _default_org_id()
    return f"ws_{oid}_main"


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


_BACKFILL_FOLDER_NAME = "Импортировано"
_BACKFILL_META_KEY = "workspace_folder_backfill_v1"


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


def _ensure_enterprise_bootstrap(con: sqlite3.Connection) -> None:
    default_org_id = _default_org_id()
    default_org_name = _default_org_name()
    if not default_org_id:
        return
    if _meta_get(con, _ENTERPRISE_BOOTSTRAP_MARK) == "done":
        return

    now = _now_ts()
    con.execute(
        """
        INSERT OR IGNORE INTO orgs (id, name, created_at, created_by)
        VALUES (?, ?, ?, ?)
        """,
        [default_org_id, default_org_name, now, "system"],
    )

    con.execute(
        """
        UPDATE projects
           SET org_id = ?
         WHERE COALESCE(org_id,'') = ''
        """,
        [default_org_id],
    )
    con.execute(
        """
        UPDATE sessions
           SET org_id = ?
         WHERE COALESCE(org_id,'') = ''
        """,
        [default_org_id],
    )

    con.execute(
        """
        UPDATE projects
           SET created_by = COALESCE(NULLIF(owner_user_id,''), created_by, '')
         WHERE COALESCE(created_by,'') = ''
        """
    )
    con.execute(
        """
        UPDATE projects
           SET updated_by = COALESCE(NULLIF(created_by,''), NULLIF(owner_user_id,''), updated_by, '')
         WHERE COALESCE(updated_by,'') = ''
        """
    )
    con.execute(
        """
        UPDATE sessions
           SET created_by = COALESCE(NULLIF(owner_user_id,''), created_by, '')
         WHERE COALESCE(created_by,'') = ''
        """
    )
    con.execute(
        """
        UPDATE sessions
           SET updated_by = COALESCE(NULLIF(created_by,''), NULLIF(owner_user_id,''), updated_by, '')
         WHERE COALESCE(updated_by,'') = ''
        """
    )

    org_rows = con.execute("SELECT id FROM orgs ORDER BY id ASC").fetchall()
    org_ids = [str(_row_value(row, "id", 0) or "").strip() for row in org_rows]
    single_default_mode = len(org_ids) == 1 and org_ids[0] == default_org_id

    owner_rows = con.execute(
        """
        SELECT DISTINCT owner_user_id AS user_id
          FROM projects
         WHERE COALESCE(owner_user_id,'') <> ''
        UNION
        SELECT DISTINCT owner_user_id AS user_id
          FROM sessions
         WHERE COALESCE(owner_user_id,'') <> ''
        """
    ).fetchall()
    owner_ids = {str(_row_value(row, "user_id", 0) or "").strip() for row in owner_rows}
    owner_ids.discard("")

    users = _read_auth_users_rows()
    for user in users:
        uid = str(user.get("id") or "").strip()
        if not uid:
            continue
        if not single_default_mode:
            continue
        is_admin = bool(user.get("is_admin", False))
        role = "org_admin" if is_admin else "editor"
        con.execute(
            """
            INSERT OR IGNORE INTO org_memberships (org_id, user_id, role, created_at)
            VALUES (?, ?, ?, ?)
            """,
            [default_org_id, uid, role, now],
        )
        if is_admin:
            con.execute(
                """
                UPDATE org_memberships
                   SET role = 'org_admin'
                 WHERE org_id = ? AND user_id = ?
                """,
                [default_org_id, uid],
            )

    for uid in owner_ids:
        con.execute(
            """
            INSERT OR IGNORE INTO org_memberships (org_id, user_id, role, created_at)
            VALUES (?, ?, 'editor', ?)
            """,
            [default_org_id, uid, now],
        )

    _meta_set(con, _ENTERPRISE_BOOTSTRAP_MARK, "done")


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


def _session_row_to_model(row: sqlite3.Row) -> Session:
    keys = set(row.keys())
    payload = {
        "id": str(row["id"] or ""),
        "title": str(row["title"] or ""),
        "roles": _json_loads(row["roles_json"], []),
        "start_role": row["start_role"],
        "project_id": row["project_id"],
        "mode": row["mode"],
        "notes": str(row["notes"] or ""),
        "notes_by_element": _json_loads(row["notes_by_element_json"], {}),
        "interview": _json_loads(row["interview_json"], {}),
        "nodes": _json_loads(row["nodes_json"], []),
        "edges": _json_loads(row["edges_json"], []),
        "questions": _json_loads(row["questions_json"], []),
        "mermaid": str(row["mermaid"] or ""),
        "mermaid_simple": str(row["mermaid_simple"] or ""),
        "mermaid_lanes": str(row["mermaid_lanes"] or ""),
        "normalized": _json_loads(row["normalized_json"], {}),
        "resources": _json_loads(row["resources_json"], {}),
        "analytics": _json_loads(row["analytics_json"], {}),
        "ai_llm_state": _json_loads(row["ai_llm_state_json"], {}),
        "bpmn_xml": str(row["bpmn_xml"] or ""),
        "bpmn_xml_version": int(row["bpmn_xml_version"] or 0),
        "bpmn_graph_fingerprint": str(row["bpmn_graph_fingerprint"] or ""),
        "bpmn_meta": _json_loads(row["bpmn_meta_json"], {}),
        "version": int(row["version"] or 0),
        "owner_user_id": str(row["owner_user_id"] or ""),
        "org_id": str((row["org_id"] if "org_id" in keys else "") or ""),
        "created_by": str((row["created_by"] if "created_by" in keys else "") or ""),
        "updated_by": str((row["updated_by"] if "updated_by" in keys else "") or ""),
        "created_at": int(row["created_at"] or 0),
        "updated_at": int(row["updated_at"] or 0),
    }
    return Session.model_validate(payload)


def _project_row_to_model(row: Any) -> "Project":
    keys = set(row.keys())
    passport = _json_loads(row["passport_json"], {})
    if not isinstance(passport, dict):
        passport = {}
    payload = {
        "id": str(row["id"] or ""),
        "title": str(row["title"] or ""),
        "passport": passport,
        "created_at": int(row["created_at"] or 0),
        "updated_at": int(row["updated_at"] or 0),
        "version": int(row["version"] or 1),
        "owner_user_id": str(row["owner_user_id"] or ""),
        "org_id": str((row["org_id"] if "org_id" in keys else "") or ""),
        "created_by": str((row["created_by"] if "created_by" in keys else "") or ""),
        "updated_by": str((row["updated_by"] if "updated_by" in keys else "") or ""),
        "workspace_id": str((row["workspace_id"] if "workspace_id" in keys else "") or ""),
        "folder_id": str((row["folder_id"] if "folder_id" in keys else "") or ""),
    }
    return Project.model_validate(payload)


@dataclass
class Storage:
    # Compatibility only; no JSON session files are used anymore.
    base_dir: Path

    def __post_init__(self) -> None:
        self.base_dir.mkdir(parents=True, exist_ok=True)
        _ensure_schema()

    def create(
        self,
        title: str,
        roles: List[str] | None = None,
        *,
        start_role: Optional[str] = None,
        project_id: Optional[str] = None,
        mode: Optional[str] = None,
        user_id: Optional[str] = None,
        is_admin: Optional[bool] = None,
        org_id: Optional[str] = None,
    ) -> str:
        sid = uuid.uuid4().hex[:10]
        r = [str(x).strip() for x in (roles or []) if str(x).strip()]
        r = list(dict.fromkeys(r))
        sr = (start_role or "").strip() or None
        if sr and sr not in r:
            r = [sr] + r
        if not sr and r:
            sr = r[0]
        owner = _scope_user_id(user_id)
        org = _scope_org_id(org_id) or _default_org_id()
        now = _now_ts()
        sess = Session(
            id=sid,
            title=(title or "process"),
            roles=r,
            start_role=sr,
            project_id=project_id,
            mode=mode,
            notes="[]",
            interview={},
            nodes=[],
            edges=[],
            questions=[],
            mermaid="",
            mermaid_simple="",
            mermaid_lanes="",
            normalized={},
            resources={},
            ai_llm_state={},
            bpmn_xml="",
            bpmn_xml_version=0,
            version=2,
            owner_user_id=owner,
            org_id=org,
            created_by=owner,
            updated_by=owner,
            created_at=now,
            updated_at=now,
        )
        self.save(sess, user_id=owner, is_admin=is_admin, org_id=org)
        return sid

    def load(
        self,
        session_id: str,
        *,
        user_id: Optional[str] = None,
        is_admin: Optional[bool] = None,
        org_id: Optional[str] = None,
    ) -> Optional[Session]:
        sid = str(session_id or "").strip()
        if not sid:
            return None
        owner = _scope_user_id(user_id)
        admin = _scope_is_admin(is_admin)
        org = _scope_org_id(org_id) or _default_org_id()
        clause, params = _owner_clause(owner, admin)
        org_clause, org_params = _org_clause(org)
        _ensure_schema()
        with _connect() as con:
            row = con.execute(
                f"SELECT * FROM sessions WHERE id = ? {org_clause} {clause} LIMIT 1",
                [sid, *org_params, *params],
            ).fetchone()
        if not row:
            return None
        return _session_row_to_model(row)

    def save(
        self,
        s: Session,
        *,
        user_id: Optional[str] = None,
        is_admin: Optional[bool] = None,
        org_id: Optional[str] = None,
    ) -> None:
        _ensure_schema()
        owner_scope = _scope_user_id(user_id)
        admin = _scope_is_admin(is_admin)
        org_scope = _scope_org_id(org_id) or str(getattr(s, "org_id", "") or "").strip() or _default_org_id()
        sid = str(getattr(s, "id", "") or "").strip()
        if not sid:
            raise ValueError("session id is required")
        now = _now_ts()
        with _connect() as con:
            existing = con.execute("SELECT owner_user_id, created_at, org_id, created_by FROM sessions WHERE id = ? LIMIT 1", [sid]).fetchone()
            existing_owner = str(existing["owner_user_id"] or "") if existing else ""
            existing_org = str(existing["org_id"] or "") if existing else ""
            existing_created_by = str(existing["created_by"] or "") if existing else ""
            if existing and not admin and owner_scope and existing_owner and existing_owner != owner_scope:
                raise PermissionError("session belongs to another user")
            if existing and existing_org and org_scope and existing_org != org_scope:
                raise PermissionError("session belongs to another org")
            owner = existing_owner or owner_scope
            if not owner:
                owner = str(getattr(s, "owner_user_id", "") or "").strip()
            created_at = int(existing["created_at"] or 0) if existing else int(getattr(s, "created_at", 0) or 0)
            if created_at <= 0:
                created_at = now
            created_by = existing_created_by or owner_scope or owner or str(getattr(s, "created_by", "") or "").strip()
            updated_by = owner_scope or owner or str(getattr(s, "updated_by", "") or "").strip()
            values = {
                "id": sid,
                "title": str(getattr(s, "title", "") or ""),
                "roles_json": _json_dumps(getattr(s, "roles", []), []),
                "start_role": getattr(s, "start_role", None),
                "project_id": getattr(s, "project_id", None),
                "mode": getattr(s, "mode", None),
                "notes": str(getattr(s, "notes", "") or ""),
                "notes_by_element_json": _json_dumps(getattr(s, "notes_by_element", {}), {}),
                "interview_json": _json_dumps(getattr(s, "interview", {}), {}),
                "nodes_json": _json_dumps(getattr(s, "nodes", []), []),
                "edges_json": _json_dumps(getattr(s, "edges", []), []),
                "questions_json": _json_dumps(getattr(s, "questions", []), []),
                "mermaid": str(getattr(s, "mermaid", "") or ""),
                "mermaid_simple": str(getattr(s, "mermaid_simple", "") or ""),
                "mermaid_lanes": str(getattr(s, "mermaid_lanes", "") or ""),
                "normalized_json": _json_dumps(getattr(s, "normalized", {}), {}),
                "resources_json": _json_dumps(getattr(s, "resources", {}), {}),
                "analytics_json": _json_dumps(getattr(s, "analytics", {}), {}),
                "ai_llm_state_json": _json_dumps(getattr(s, "ai_llm_state", {}), {}),
                "bpmn_xml": str(getattr(s, "bpmn_xml", "") or ""),
                "bpmn_xml_version": int(getattr(s, "bpmn_xml_version", 0) or 0),
                "bpmn_graph_fingerprint": str(getattr(s, "bpmn_graph_fingerprint", "") or ""),
                "bpmn_meta_json": _json_dumps(getattr(s, "bpmn_meta", {}), {}),
                "version": int(getattr(s, "version", 0) or 0),
                "owner_user_id": owner,
                "org_id": existing_org or org_scope or _default_org_id(),
                "created_by": created_by,
                "updated_by": updated_by,
                "created_at": created_at,
                "updated_at": now,
            }
            con.execute(
                """
                INSERT INTO sessions (
                  id, title, roles_json, start_role, project_id, mode, notes, notes_by_element_json,
                  interview_json, nodes_json, edges_json, questions_json, mermaid, mermaid_simple, mermaid_lanes,
                  normalized_json, resources_json, analytics_json, ai_llm_state_json,
                  bpmn_xml, bpmn_xml_version, bpmn_graph_fingerprint, bpmn_meta_json, version,
                  owner_user_id, org_id, created_by, updated_by, created_at, updated_at
                ) VALUES (
                  :id, :title, :roles_json, :start_role, :project_id, :mode, :notes, :notes_by_element_json,
                  :interview_json, :nodes_json, :edges_json, :questions_json, :mermaid, :mermaid_simple, :mermaid_lanes,
                  :normalized_json, :resources_json, :analytics_json, :ai_llm_state_json,
                  :bpmn_xml, :bpmn_xml_version, :bpmn_graph_fingerprint, :bpmn_meta_json, :version,
                  :owner_user_id, :org_id, :created_by, :updated_by, :created_at, :updated_at
                )
                ON CONFLICT(id) DO UPDATE SET
                  title=excluded.title,
                  roles_json=excluded.roles_json,
                  start_role=excluded.start_role,
                  project_id=excluded.project_id,
                  mode=excluded.mode,
                  notes=excluded.notes,
                  notes_by_element_json=excluded.notes_by_element_json,
                  interview_json=excluded.interview_json,
                  nodes_json=excluded.nodes_json,
                  edges_json=excluded.edges_json,
                  questions_json=excluded.questions_json,
                  mermaid=excluded.mermaid,
                  mermaid_simple=excluded.mermaid_simple,
                  mermaid_lanes=excluded.mermaid_lanes,
                  normalized_json=excluded.normalized_json,
                  resources_json=excluded.resources_json,
                  analytics_json=excluded.analytics_json,
                  ai_llm_state_json=excluded.ai_llm_state_json,
                  bpmn_xml=excluded.bpmn_xml,
                  bpmn_xml_version=excluded.bpmn_xml_version,
                  bpmn_graph_fingerprint=excluded.bpmn_graph_fingerprint,
                  bpmn_meta_json=excluded.bpmn_meta_json,
                  version=excluded.version,
                  owner_user_id=excluded.owner_user_id,
                  org_id=excluded.org_id,
                  created_by=excluded.created_by,
                  updated_by=excluded.updated_by,
                  created_at=excluded.created_at,
                  updated_at=excluded.updated_at
                """,
                values,
            )
            con.commit()

    def delete(
        self,
        session_id: str,
        *,
        user_id: Optional[str] = None,
        is_admin: Optional[bool] = None,
        org_id: Optional[str] = None,
    ) -> bool:
        sid = str(session_id or "").strip()
        if not sid:
            return False
        owner = _scope_user_id(user_id)
        admin = _scope_is_admin(is_admin)
        org = _scope_org_id(org_id) or _default_org_id()
        clause, params = _owner_clause(owner, admin)
        org_clause, org_params = _org_clause(org)
        _ensure_schema()
        with _connect() as con:
            cur = con.execute(
                f"DELETE FROM sessions WHERE id = ? {org_clause} {clause}",
                [sid, *org_params, *params],
            )
            con.commit()
            return int(cur.rowcount or 0) > 0

    def rename(self, session_id: str, new_title: str, *, user_id: Optional[str] = None, is_admin: Optional[bool] = None) -> Optional[Session]:
        sess = self.load(session_id, user_id=user_id, is_admin=is_admin)
        if not sess:
            return None
        t = (new_title or "").strip()
        if not t:
            return sess
        sess.title = t
        self.save(sess, user_id=user_id, is_admin=is_admin)
        return self.load(session_id, user_id=user_id, is_admin=is_admin)

    def list(
        self,
        q: Optional[str] = None,
        *,
        query: Optional[str] = None,
        limit: int = 200,
        project_id: Optional[str] = None,
        mode: Optional[str] = None,
        user_id: Optional[str] = None,
        is_admin: Optional[bool] = None,
        org_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        qq = (query if query is not None else q)
        qq = (qq or "").strip().lower()
        try:
            lim = int(limit)
        except Exception:
            lim = 200
        lim = min(max(lim, 1), 500)
        owner = _scope_user_id(user_id)
        admin = _scope_is_admin(is_admin)
        org = _scope_org_id(org_id) or _default_org_id()
        filters = []
        params: List[Any] = []
        if org:
            filters.append("org_id = ?")
            params.append(org)
        if not admin and owner:
            filters.append("owner_user_id = ?")
            params.append(owner)
        if project_id is not None:
            filters.append("COALESCE(project_id,'') = ?")
            params.append(str(project_id or ""))
        if mode is not None:
            filters.append("COALESCE(mode,'') = ?")
            params.append(str(mode or ""))
        if qq:
            filters.append("lower(id || ' ' || title || ' ' || COALESCE(roles_json,'')) LIKE ?")
            params.append(f"%{qq}%")
        where = f"WHERE {' AND '.join(filters)}" if filters else ""
        _ensure_schema()
        with _connect() as con:
            rows = con.execute(
                f"SELECT * FROM sessions {where} ORDER BY updated_at DESC LIMIT ?",
                [*params, lim],
            ).fetchall()
        out: List[Dict[str, Any]] = []
        for row in rows:
            sess = _session_row_to_model(row)
            out.append(sess.model_dump())
        return out

    def create_bpmn_version_snapshot(
        self,
        session_id: str,
        *,
        bpmn_xml: str,
        source_action: str,
        created_by: Optional[str] = None,
        org_id: Optional[str] = None,
        import_note: Optional[str] = None,
    ) -> Dict[str, Any]:
        _ensure_schema()
        sid = str(session_id or "").strip()
        if not sid:
            raise ValueError("session_id required")
        xml = str(bpmn_xml or "")
        if not xml.strip():
            raise ValueError("bpmn_xml required")
        action = str(source_action or "").strip().lower()
        if not action:
            raise ValueError("source_action required")
        actor = str(created_by or "").strip()
        note = str(import_note or "").strip()
        now = _now_ts()

        with _connect() as con:
            sess_row = con.execute(
                "SELECT org_id FROM sessions WHERE id = ? LIMIT 1",
                [sid],
            ).fetchone()
            if not sess_row:
                raise ValueError("session not found")
            session_org = str(sess_row["org_id"] or "").strip() or _default_org_id()
            scope_org = str(org_id or "").strip() or session_org
            if scope_org != session_org:
                raise ValueError("session belongs to another org")

            row = con.execute(
                """
                SELECT COALESCE(MAX(version_number), 0) AS max_version
                  FROM bpmn_versions
                 WHERE session_id = ?
                   AND org_id = ?
                """,
                [sid, scope_org],
            ).fetchone()
            next_version = int((row["max_version"] if row else 0) or 0) + 1
            snapshot_id = uuid.uuid4().hex[:12]
            con.execute(
                """
                INSERT INTO bpmn_versions (
                  id, session_id, org_id, version_number, bpmn_xml,
                  source_action, import_note, created_at, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [snapshot_id, sid, scope_org, next_version, xml, action, note, now, actor],
            )
            con.commit()

        return {
            "id": snapshot_id,
            "session_id": sid,
            "org_id": scope_org,
            "version_number": next_version,
            "source_action": action,
            "created_at": now,
            "created_by": actor,
            "import_note": note,
        }

    def list_bpmn_versions(
        self,
        session_id: str,
        *,
        org_id: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        _ensure_schema()
        sid = str(session_id or "").strip()
        if not sid:
            return []
        scope_org = str(org_id or "").strip()
        try:
            lim = int(limit)
        except Exception:
            lim = 100
        lim = min(max(lim, 1), 1000)

        with _connect() as con:
            sess_row = con.execute("SELECT org_id FROM sessions WHERE id = ? LIMIT 1", [sid]).fetchone()
            if not sess_row:
                return []
            session_org = str(sess_row["org_id"] or "").strip() or _default_org_id()
            oid = scope_org or session_org
            if oid != session_org:
                return []
            rows = con.execute(
                """
                SELECT id, session_id, org_id, version_number, bpmn_xml, source_action, import_note, created_at, created_by
                  FROM bpmn_versions
                 WHERE session_id = ?
                   AND org_id = ?
                 ORDER BY version_number DESC
                 LIMIT ?
                """,
                [sid, oid, lim],
            ).fetchall()

        out: List[Dict[str, Any]] = []
        for row in rows:
            out.append(
                {
                    "id": str(row["id"] or ""),
                    "session_id": str(row["session_id"] or ""),
                    "org_id": str(row["org_id"] or ""),
                    "version_number": int(row["version_number"] or 0),
                    "bpmn_xml": str(row["bpmn_xml"] or ""),
                    "source_action": str(row["source_action"] or ""),
                    "import_note": str(row["import_note"] or ""),
                    "created_at": int(row["created_at"] or 0),
                    "created_by": str(row["created_by"] or ""),
                }
            )
        return out


def gen_project_id() -> str:
    return uuid.uuid4().hex[:10]


class ProjectStorage:
    # Compatibility only; no JSON project files are used anymore.
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        _ensure_schema()

    def create(
        self,
        title: str,
        passport: Dict[str, Any] | None = None,
        *,
        user_id: Optional[str] = None,
        is_admin: Optional[bool] = None,
        org_id: Optional[str] = None,
    ) -> str:
        _ensure_schema()
        _ = _scope_is_admin(is_admin)
        owner = _scope_user_id(user_id)
        org = _scope_org_id(org_id) or _default_org_id()
        workspace_id = _default_workspace_id(org)
        pid = gen_project_id()
        now = _now_ts()
        with _connect() as con:
            _ensure_workspace_record(con, org, created_by=owner)
            con.execute(
                """
                INSERT INTO projects (id, title, passport_json, created_at, updated_at, version, owner_user_id, org_id, workspace_id, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    pid,
                    str(title or "").strip() or "Проект",
                    _json_dumps(passport, {}),
                    now,
                    now,
                    1,
                    owner,
                    org,
                    workspace_id,
                    owner,
                    owner,
                ],
            )
            con.commit()
        return pid

    def list(
        self,
        *,
        user_id: Optional[str] = None,
        is_admin: Optional[bool] = None,
        org_id: Optional[str] = None,
    ) -> list[Project]:
        owner = _scope_user_id(user_id)
        admin = _scope_is_admin(is_admin)
        org = _scope_org_id(org_id) or _default_org_id()
        _ensure_schema()
        if admin or not owner:
            sql = "SELECT * FROM projects WHERE org_id = ? ORDER BY updated_at DESC, created_at DESC"
            params: List[Any] = [org]
        else:
            sql = "SELECT * FROM projects WHERE org_id = ? AND owner_user_id = ? ORDER BY updated_at DESC, created_at DESC"
            params = [org, owner]
        with _connect() as con:
            rows = con.execute(sql, params).fetchall()
        return [_project_row_to_model(row) for row in rows]

    def load(
        self,
        project_id: str,
        *,
        user_id: Optional[str] = None,
        is_admin: Optional[bool] = None,
        org_id: Optional[str] = None,
    ) -> Project | None:
        pid = str(project_id or "").strip()
        if not pid:
            return None
        owner = _scope_user_id(user_id)
        admin = _scope_is_admin(is_admin)
        org = _scope_org_id(org_id) or _default_org_id()
        clause, params = _owner_clause(owner, admin)
        org_clause, org_params = _org_clause(org)
        _ensure_schema()
        with _connect() as con:
            row = con.execute(
                f"SELECT * FROM projects WHERE id = ? {org_clause} {clause} LIMIT 1",
                [pid, *org_params, *params],
            ).fetchone()
        if not row:
            return None
        return _project_row_to_model(row)

    def save(
        self,
        proj: Project,
        *,
        user_id: Optional[str] = None,
        is_admin: Optional[bool] = None,
        org_id: Optional[str] = None,
    ) -> None:
        _ensure_schema()
        pid = str(getattr(proj, "id", "") or "").strip()
        if not pid:
            raise ValueError("project id is required")
        owner_scope = _scope_user_id(user_id)
        admin = _scope_is_admin(is_admin)
        org_scope = _scope_org_id(org_id) or str(getattr(proj, "org_id", "") or "").strip() or _default_org_id()
        now = _now_ts()
        with _connect() as con:
            existing = con.execute("SELECT owner_user_id, created_at, version, org_id, workspace_id, created_by FROM projects WHERE id = ? LIMIT 1", [pid]).fetchone()
            existing_owner = str(existing["owner_user_id"] or "") if existing else ""
            existing_org = str(existing["org_id"] or "") if existing else ""
            existing_workspace_id = str(existing["workspace_id"] or "") if existing else ""
            existing_created_by = str(existing["created_by"] or "") if existing else ""
            if existing and not admin and owner_scope and existing_owner and existing_owner != owner_scope:
                raise PermissionError("project belongs to another user")
            if existing and existing_org and org_scope and existing_org != org_scope:
                raise PermissionError("project belongs to another org")
            owner = existing_owner or owner_scope or str(getattr(proj, "owner_user_id", "") or "").strip()
            created_at = int(existing["created_at"] or 0) if existing else int(getattr(proj, "created_at", 0) or 0)
            if created_at <= 0:
                created_at = now
            next_version = int(existing["version"] or 0) + 1 if existing else max(1, int(getattr(proj, "version", 1) or 1))
            created_by = existing_created_by or owner_scope or owner or str(getattr(proj, "created_by", "") or "").strip()
            updated_by = owner_scope or owner or str(getattr(proj, "updated_by", "") or "").strip()
            workspace_id = existing_workspace_id or _default_workspace_id(existing_org or org_scope)
            _ensure_workspace_record(con, existing_org or org_scope or _default_org_id(), created_by=created_by)
            con.execute(
                """
                INSERT INTO projects (id, title, passport_json, created_at, updated_at, version, owner_user_id, org_id, workspace_id, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  title=excluded.title,
                  passport_json=excluded.passport_json,
                  created_at=excluded.created_at,
                  updated_at=excluded.updated_at,
                  version=excluded.version,
                  owner_user_id=excluded.owner_user_id,
                  org_id=excluded.org_id,
                  workspace_id=excluded.workspace_id,
                  created_by=excluded.created_by,
                  updated_by=excluded.updated_by
                """,
                [
                    pid,
                    str(getattr(proj, "title", "") or "").strip() or "Проект",
                    _json_dumps(getattr(proj, "passport", {}), {}),
                    created_at,
                    now,
                    next_version,
                    owner,
                    existing_org or org_scope or _default_org_id(),
                    workspace_id,
                    created_by,
                    updated_by,
                ],
            )
            con.commit()

    def delete(
        self,
        project_id: str,
        *,
        user_id: Optional[str] = None,
        is_admin: Optional[bool] = None,
        org_id: Optional[str] = None,
    ) -> bool:
        pid = str(project_id or "").strip()
        if not pid:
            return False
        owner = _scope_user_id(user_id)
        admin = _scope_is_admin(is_admin)
        org = _scope_org_id(org_id) or _default_org_id()
        clause, params = _owner_clause(owner, admin)
        org_clause, org_params = _org_clause(org)
        _ensure_schema()
        with _connect() as con:
            cur = con.execute(
                f"DELETE FROM projects WHERE id = ? {org_clause} {clause}",
                [pid, *org_params, *params],
            )
            con.commit()
            return int(cur.rowcount or 0) > 0


def get_default_org_id() -> str:
    return _default_org_id()


def count_org_records() -> int:
    _ensure_schema()
    with _connect() as con:
        row = con.execute("SELECT COUNT(1) AS cnt FROM orgs").fetchone()
    return int((row["cnt"] if row and row["cnt"] is not None else 0) or 0)


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
        }
        item.update(_org_git_mirror_payload(row))
        out.append(item)
    return out


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
            "created_at": int(row["created_at"] or 0),
        }
        item.update(_org_git_mirror_payload(row))
        out.append(item)
    return out


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
              m.created_at AS created_at,
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


def user_has_org_membership(user_id: str, org_id: str, *, is_admin: Optional[bool] = None) -> bool:
    uid = str(user_id or "").strip()
    oid = str(org_id or "").strip()
    if not uid or not oid:
        return False
    memberships = list_user_org_memberships(uid, is_admin=is_admin)
    return any(str(item.get("org_id") or "") == oid for item in memberships)


def resolve_active_org_id(
    user_id: str,
    *,
    requested_org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> str:
    uid = str(user_id or "").strip()
    requested = str(requested_org_id or "").strip()
    memberships = list_user_org_memberships(uid, is_admin=is_admin) if uid else []
    if requested and any(str(item.get("org_id") or "") == requested for item in memberships):
        return requested
    if memberships:
        return str(memberships[0].get("org_id") or _default_org_id())
    return _default_org_id()


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


def list_org_workspaces(org_id: str) -> List[Dict[str, Any]]:
    oid = str(org_id or "").strip()
    if not oid:
        return []
    _ensure_schema()
    with _connect() as con:
        _ensure_workspace_record(con, oid)
        rows = con.execute(
            """
            SELECT id, org_id, name, created_at, created_by, updated_at
              FROM workspaces
             WHERE org_id = ?
             ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, name ASC, id ASC
            """,
            [oid, _default_workspace_id(oid)],
        ).fetchall()
    out: List[Dict[str, Any]] = []
    for row in rows:
        out.append({
            "id": str(row["id"] or ""),
            "org_id": str(row["org_id"] or ""),
            "name": str(row["name"] or ""),
            "created_at": int(row["created_at"] or 0),
            "created_by": str(row["created_by"] or ""),
            "updated_at": int(row["updated_at"] or 0),
            "is_default": str(row["id"] or "") == _default_workspace_id(oid),
        })
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
            **_org_git_mirror_payload({}),
        }
    out = {
        "id": str(row["id"] or ""),
        "name": str(row["name"] or ""),
        "created_at": int(row["created_at"] or 0),
        "created_by": str(row["created_by"] or ""),
    }
    out.update(_org_git_mirror_payload(row))
    return out


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
    out = {
        "id": str(row["id"] or ""),
        "name": str(row["name"] or ""),
        "created_at": int(row["created_at"] or 0),
        "created_by": str(row["created_by"] or ""),
    }
    out.update(_org_git_mirror_payload(row))
    return out


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


def _normalize_org_invite_role(raw: Any) -> str:
    role = _normalize_org_membership_role(raw)
    if role not in _ORG_INVITE_ROLES:
        return "org_viewer"
    return role


def _normalize_email(raw: Any) -> str:
    return str(raw or "").strip().lower()


def _invite_status(row: Dict[str, Any]) -> str:
    now = _now_ts()
    if int(row.get("revoked_at") or 0) > 0:
        return "revoked"
    if int(row.get("used_at") or row.get("accepted_at") or 0) > 0:
        return "used"
    if int(row.get("expires_at") or 0) > 0 and int(row.get("expires_at") or 0) < now:
        return "expired"
    return "pending"


def _invite_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    keys = set(row.keys()) if hasattr(row, "keys") else set()

    def _col(name: str, default: Any = "") -> Any:
        return row[name] if name in keys else default

    payload = {
        "id": str(_col("id") or ""),
        "org_id": str(_col("org_id") or ""),
        "org_name": str(_col("org_name") or _col("org_id") or ""),
        "email": _normalize_email(_col("email")),
        "role": _normalize_org_invite_role(_col("role")),
        "full_name": str(_col("full_name") or "").strip(),
        "job_title": str(_col("job_title") or "").strip(),
        "team_name": str(_col("team_name") or "").strip(),
        "subgroup_name": str(_col("subgroup_name") or "").strip(),
        "invite_comment": str(_col("invite_comment") or "").strip(),
        "invite_key": str(_col("invite_key") or "").strip(),
        "expires_at": int(_col("expires_at") or 0),
        "created_at": int(_col("created_at") or 0),
        "created_by": str(_col("created_by") or ""),
        "used_at": int(_col("used_at") or 0) if _col("used_at") is not None else None,
        "used_by_user_id": str(_col("used_by_user_id") or "") if _col("used_by_user_id") is not None else None,
        "accepted_at": int(_col("accepted_at") or 0) if _col("accepted_at") is not None else None,
        "accepted_by": str(_col("accepted_by") or "") if _col("accepted_by") is not None else None,
        "revoked_at": int(_col("revoked_at") or 0) if _col("revoked_at") is not None else None,
        "revoked_by": str(_col("revoked_by") or "") if _col("revoked_by") is not None else None,
        "invite_mode": "one_time",
    }
    payload["status"] = _invite_status(payload)
    if not payload.get("used_at") and payload.get("accepted_at"):
        payload["used_at"] = payload.get("accepted_at")
    if not payload.get("used_by_user_id") and payload.get("accepted_by"):
        payload["used_by_user_id"] = payload.get("accepted_by")
    payload["used_by"] = payload.get("used_by_user_id")
    return payload


def _audit_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": str(row["id"] or ""),
        "ts": int(row["ts"] or 0),
        "actor_user_id": str(row["actor_user_id"] or ""),
        "org_id": str(row["org_id"] or ""),
        "project_id": str(row["project_id"] or "") if row["project_id"] is not None else "",
        "session_id": str(row["session_id"] or "") if row["session_id"] is not None else "",
        "action": str(row["action"] or ""),
        "entity_type": str(row["entity_type"] or ""),
        "entity_id": str(row["entity_id"] or ""),
        "status": str(row["status"] or "ok"),
        "meta": _json_loads(row["meta_json"], {}),
    }


def _hash_invite_token(token: str) -> str:
    return hashlib.sha256(str(token or "").encode("utf-8")).hexdigest()


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


def list_org_memberships(org_id: str) -> List[Dict[str, Any]]:
    oid = str(org_id or "").strip()
    if not oid:
        return []
    _ensure_schema()
    with _connect() as con:
        rows = con.execute(
            """
            SELECT org_id, user_id, role, created_at
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
                "created_at": int(row["created_at"] or 0),
            }
        )
    return out


def upsert_org_membership(org_id: str, user_id: str, role: str) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    uid = str(user_id or "").strip()
    if not oid or not uid:
        raise ValueError("org_id and user_id are required")
    normalized_role = _normalize_org_membership_role(role)
    now = _now_ts()
    _ensure_schema()
    with _connect() as con:
        con.execute(
            """
            INSERT INTO org_memberships (org_id, user_id, role, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(org_id, user_id) DO UPDATE SET
              role = excluded.role
            """,
            [oid, uid, normalized_role, now],
        )
        con.commit()
        row = con.execute(
            """
            SELECT org_id, user_id, role, created_at
              FROM org_memberships
             WHERE org_id = ? AND user_id = ?
             LIMIT 1
            """,
            [oid, uid],
        ).fetchone()
    if not row:
        return {"org_id": oid, "user_id": uid, "role": normalized_role, "created_at": now}
    return {
        "org_id": str(row["org_id"] or ""),
        "user_id": str(row["user_id"] or ""),
        "role": _normalize_org_membership_role(row["role"]),
        "created_at": int(row["created_at"] or 0),
    }


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


def _normalize_template_scope(raw: Any) -> str:
    scope = str(raw or "").strip().lower()
    return "org" if scope == "org" else "personal"


def _normalize_template_folder_id(raw: Any) -> str:
    return str(raw or "").strip()


def _normalize_template_type(raw: Any) -> str:
    value = str(raw or "").strip().lower()
    if value == "hybrid_stencil_v1":
        return "hybrid_stencil_v1"
    if value == "bpmn_fragment_v1":
        return "bpmn_fragment_v1"
    return "bpmn_selection_v1"


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


def delete_template(template_id: str) -> bool:
    tid = str(template_id or "").strip()
    if not tid:
        return False
    _ensure_schema()
    with _connect() as con:
        cur = con.execute("DELETE FROM templates WHERE id = ?", [tid])
        con.commit()
    return int(cur.rowcount or 0) > 0


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


def _normalize_org_property_dictionary_input_mode(value: Any) -> str:
    mode = str(value or "").strip().lower()
    if mode == "free_text":
        return "free_text"
    return "autocomplete"


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


def _org_property_dictionary_operation_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": str(row["id"] or ""),
        "organizationId": str(row["org_id"] or ""),
        "org_id": str(row["org_id"] or ""),
        "operationKey": str(row["operation_key"] or ""),
        "operation_key": str(row["operation_key"] or ""),
        "operationLabel": str(row["operation_label"] or ""),
        "operation_label": str(row["operation_label"] or ""),
        "isActive": bool(int(row["is_active"] or 0)),
        "is_active": bool(int(row["is_active"] or 0)),
        "sortOrder": int(row["sort_order"] or 0),
        "sort_order": int(row["sort_order"] or 0),
        "created_at": int(row["created_at"] or 0),
        "updated_at": int(row["updated_at"] or 0),
        "created_by": str(row["created_by"] or ""),
        "updated_by": str(row["updated_by"] or ""),
    }


def _org_property_dictionary_definition_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": str(row["id"] or ""),
        "organizationId": str(row["org_id"] or ""),
        "org_id": str(row["org_id"] or ""),
        "operationKey": str(row["operation_key"] or ""),
        "operation_key": str(row["operation_key"] or ""),
        "propertyKey": str(row["property_key"] or ""),
        "property_key": str(row["property_key"] or ""),
        "propertyLabel": str(row["property_label"] or ""),
        "property_label": str(row["property_label"] or ""),
        "inputMode": _normalize_org_property_dictionary_input_mode(row["input_mode"]),
        "input_mode": _normalize_org_property_dictionary_input_mode(row["input_mode"]),
        "allowCustomValue": bool(int(row["allow_custom_value"] or 0)),
        "allow_custom_value": bool(int(row["allow_custom_value"] or 0)),
        "required": bool(int(row["required"] or 0)),
        "isActive": bool(int(row["is_active"] or 0)),
        "is_active": bool(int(row["is_active"] or 0)),
        "sortOrder": int(row["sort_order"] or 0),
        "sort_order": int(row["sort_order"] or 0),
        "created_at": int(row["created_at"] or 0),
        "updated_at": int(row["updated_at"] or 0),
        "created_by": str(row["created_by"] or ""),
        "updated_by": str(row["updated_by"] or ""),
    }


def _org_property_dictionary_value_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": str(row["id"] or ""),
        "organizationId": str(row["org_id"] or ""),
        "org_id": str(row["org_id"] or ""),
        "operationKey": str(row["operation_key"] or ""),
        "operation_key": str(row["operation_key"] or ""),
        "propertyKey": str(row["property_key"] or ""),
        "property_key": str(row["property_key"] or ""),
        "optionValue": str(row["option_value"] or ""),
        "option_value": str(row["option_value"] or ""),
        "isActive": bool(int(row["is_active"] or 0)),
        "is_active": bool(int(row["is_active"] or 0)),
        "sortOrder": int(row["sort_order"] or 0),
        "sort_order": int(row["sort_order"] or 0),
        "created_at": int(row["created_at"] or 0),
        "updated_at": int(row["updated_at"] or 0),
        "created_by": str(row["created_by"] or ""),
        "updated_by": str(row["updated_by"] or ""),
    }


def list_org_property_dictionary_operations(
    org_id: str,
    *,
    include_inactive: bool = True,
) -> List[Dict[str, Any]]:
    oid = str(org_id or "").strip()
    if not oid:
        return []
    _ensure_schema()
    clauses = ["org_id = ?"]
    params: List[Any] = [oid]
    if not include_inactive:
        clauses.append("is_active = 1")
    with _connect() as con:
        rows = con.execute(
            f"""
            SELECT id, org_id, operation_key, operation_label, is_active, sort_order, created_at, updated_at, created_by, updated_by
              FROM org_property_dictionary_operations
             WHERE {' AND '.join(clauses)}
             ORDER BY sort_order ASC, lower(operation_label) ASC, lower(operation_key) ASC, id ASC
            """,
            params,
        ).fetchall()
    return [_org_property_dictionary_operation_row_to_dict(row) for row in rows]


def get_org_property_dictionary_operation(org_id: str, operation_key: str) -> Optional[Dict[str, Any]]:
    oid = str(org_id or "").strip()
    op_key = _normalize_org_property_dictionary_key(operation_key)
    if not oid or not op_key:
        return None
    _ensure_schema()
    with _connect() as con:
        row = con.execute(
            """
            SELECT id, org_id, operation_key, operation_label, is_active, sort_order, created_at, updated_at, created_by, updated_by
              FROM org_property_dictionary_operations
             WHERE org_id = ? AND operation_key = ?
             LIMIT 1
            """,
            [oid, op_key],
        ).fetchone()
    return _org_property_dictionary_operation_row_to_dict(row) if row else None


def upsert_org_property_dictionary_operation(
    org_id: str,
    *,
    operation_key: str,
    operation_label: str = "",
    is_active: Any = True,
    sort_order: Any = 0,
    actor_user_id: str = "",
) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    op_key = _normalize_org_property_dictionary_key(operation_key)
    if not oid:
        raise ValueError("org_id required")
    if not op_key:
        raise ValueError("operation_key required")
    label = _normalize_org_property_dictionary_label(operation_label, fallback=op_key)
    now = _now_ts()
    op_id = f"opd_{uuid.uuid4().hex[:12]}"
    _ensure_schema()
    with _connect() as con:
        existing = con.execute(
            "SELECT id, created_at, created_by FROM org_property_dictionary_operations WHERE org_id = ? AND operation_key = ? LIMIT 1",
            [oid, op_key],
        ).fetchone()
        con.execute(
            """
            INSERT INTO org_property_dictionary_operations (
              id, org_id, operation_key, operation_label, is_active, sort_order, created_at, updated_at, created_by, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(org_id, operation_key) DO UPDATE SET
              operation_label = excluded.operation_label,
              is_active = excluded.is_active,
              sort_order = excluded.sort_order,
              updated_at = excluded.updated_at,
              updated_by = excluded.updated_by
            """,
            [
                str(existing["id"] if existing else op_id),
                oid,
                op_key,
                label,
                _normalize_org_property_dictionary_bool(is_active, default=True),
                int(sort_order or 0),
                int(existing["created_at"] or now) if existing else now,
                now,
                str(existing["created_by"] or actor_user_id or "") if existing else str(actor_user_id or ""),
                str(actor_user_id or ""),
            ],
        )
        con.commit()
    out = get_org_property_dictionary_operation(oid, op_key)
    if not out:
        raise ValueError("operation_upsert_failed")
    return out


def list_org_property_dictionary_definitions(
    org_id: str,
    operation_key: str,
    *,
    include_inactive: bool = True,
) -> List[Dict[str, Any]]:
    oid = str(org_id or "").strip()
    op_key = _normalize_org_property_dictionary_key(operation_key)
    if not oid or not op_key:
        return []
    _ensure_schema()
    clauses = ["org_id = ?", "operation_key = ?"]
    params: List[Any] = [oid, op_key]
    if not include_inactive:
        clauses.append("is_active = 1")
    with _connect() as con:
        rows = con.execute(
            f"""
            SELECT id, org_id, operation_key, property_key, property_label, input_mode, allow_custom_value, required, is_active, sort_order, created_at, updated_at, created_by, updated_by
              FROM org_property_dictionary_defs
             WHERE {' AND '.join(clauses)}
             ORDER BY sort_order ASC, lower(property_label) ASC, lower(property_key) ASC, id ASC
            """,
            params,
        ).fetchall()
    return [_org_property_dictionary_definition_row_to_dict(row) for row in rows]


def get_org_property_dictionary_definition(org_id: str, operation_key: str, property_key: str) -> Optional[Dict[str, Any]]:
    oid = str(org_id or "").strip()
    op_key = _normalize_org_property_dictionary_key(operation_key)
    prop_key = _normalize_org_property_dictionary_key(property_key)
    if not oid or not op_key or not prop_key:
        return None
    _ensure_schema()
    with _connect() as con:
        row = con.execute(
            """
            SELECT id, org_id, operation_key, property_key, property_label, input_mode, allow_custom_value, required, is_active, sort_order, created_at, updated_at, created_by, updated_by
              FROM org_property_dictionary_defs
             WHERE org_id = ? AND operation_key = ? AND property_key = ?
             LIMIT 1
            """,
            [oid, op_key, prop_key],
        ).fetchone()
    return _org_property_dictionary_definition_row_to_dict(row) if row else None


def upsert_org_property_dictionary_definition(
    org_id: str,
    *,
    operation_key: str,
    property_key: str,
    property_label: str = "",
    input_mode: Any = "autocomplete",
    allow_custom_value: Any = True,
    required: Any = False,
    is_active: Any = True,
    sort_order: Any = 0,
    actor_user_id: str = "",
) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    op_key = _normalize_org_property_dictionary_key(operation_key)
    prop_key = _normalize_org_property_dictionary_key(property_key)
    if not oid:
        raise ValueError("org_id required")
    if not op_key:
        raise ValueError("operation_key required")
    if not prop_key:
        raise ValueError("property_key required")
    label = _normalize_org_property_dictionary_label(property_label, fallback=prop_key)
    now = _now_ts()
    prop_id = f"opddef_{uuid.uuid4().hex[:12]}"
    _ensure_schema()
    with _connect() as con:
        existing = con.execute(
            """
            SELECT id, created_at, created_by
              FROM org_property_dictionary_defs
             WHERE org_id = ? AND operation_key = ? AND property_key = ?
             LIMIT 1
            """,
            [oid, op_key, prop_key],
        ).fetchone()
        con.execute(
            """
            INSERT INTO org_property_dictionary_defs (
              id, org_id, operation_key, property_key, property_label, input_mode, allow_custom_value, required, is_active, sort_order, created_at, updated_at, created_by, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(org_id, operation_key, property_key) DO UPDATE SET
              property_label = excluded.property_label,
              input_mode = excluded.input_mode,
              allow_custom_value = excluded.allow_custom_value,
              required = excluded.required,
              is_active = excluded.is_active,
              sort_order = excluded.sort_order,
              updated_at = excluded.updated_at,
              updated_by = excluded.updated_by
            """,
            [
                str(existing["id"] if existing else prop_id),
                oid,
                op_key,
                prop_key,
                label,
                _normalize_org_property_dictionary_input_mode(input_mode),
                _normalize_org_property_dictionary_bool(allow_custom_value, default=True),
                _normalize_org_property_dictionary_bool(required, default=False),
                _normalize_org_property_dictionary_bool(is_active, default=True),
                int(sort_order or 0),
                int(existing["created_at"] or now) if existing else now,
                now,
                str(existing["created_by"] or actor_user_id or "") if existing else str(actor_user_id or ""),
                str(actor_user_id or ""),
            ],
        )
        con.commit()
    out = get_org_property_dictionary_definition(oid, op_key, prop_key)
    if not out:
        raise ValueError("definition_upsert_failed")
    return out


def delete_org_property_dictionary_definition(org_id: str, operation_key: str, property_key: str) -> bool:
    oid = str(org_id or "").strip()
    op_key = _normalize_org_property_dictionary_key(operation_key)
    prop_key = _normalize_org_property_dictionary_key(property_key)
    if not oid or not op_key or not prop_key:
        return False
    _ensure_schema()
    with _connect() as con:
        con.execute(
            "DELETE FROM org_property_dictionary_values WHERE org_id = ? AND operation_key = ? AND property_key = ?",
            [oid, op_key, prop_key],
        )
        cur = con.execute(
            "DELETE FROM org_property_dictionary_defs WHERE org_id = ? AND operation_key = ? AND property_key = ?",
            [oid, op_key, prop_key],
        )
        con.commit()
    return int(cur.rowcount or 0) > 0


def list_org_property_dictionary_values(
    org_id: str,
    operation_key: str,
    property_key: str,
    *,
    include_inactive: bool = True,
) -> List[Dict[str, Any]]:
    oid = str(org_id or "").strip()
    op_key = _normalize_org_property_dictionary_key(operation_key)
    prop_key = _normalize_org_property_dictionary_key(property_key)
    if not oid or not op_key or not prop_key:
        return []
    _ensure_schema()
    clauses = ["org_id = ?", "operation_key = ?", "property_key = ?"]
    params: List[Any] = [oid, op_key, prop_key]
    if not include_inactive:
        clauses.append("is_active = 1")
    with _connect() as con:
        rows = con.execute(
            f"""
            SELECT id, org_id, operation_key, property_key, option_value, is_active, sort_order, created_at, updated_at, created_by, updated_by
              FROM org_property_dictionary_values
             WHERE {' AND '.join(clauses)}
             ORDER BY sort_order ASC, lower(option_value) ASC, id ASC
            """,
            params,
        ).fetchall()
    return [_org_property_dictionary_value_row_to_dict(row) for row in rows]


def get_org_property_dictionary_value_by_id(org_id: str, option_id: str) -> Optional[Dict[str, Any]]:
    oid = str(org_id or "").strip()
    option_row_id = str(option_id or "").strip()
    if not oid or not option_row_id:
        return None
    _ensure_schema()
    with _connect() as con:
        row = con.execute(
            """
            SELECT id, org_id, operation_key, property_key, option_value, is_active, sort_order, created_at, updated_at, created_by, updated_by
              FROM org_property_dictionary_values
             WHERE org_id = ? AND id = ?
             LIMIT 1
            """,
            [oid, option_row_id],
        ).fetchone()
    return _org_property_dictionary_value_row_to_dict(row) if row else None


def upsert_org_property_dictionary_value(
    org_id: str,
    *,
    operation_key: str,
    property_key: str,
    option_value: str,
    is_active: Any = True,
    sort_order: Any = 0,
    actor_user_id: str = "",
) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    op_key = _normalize_org_property_dictionary_key(operation_key)
    prop_key = _normalize_org_property_dictionary_key(property_key)
    opt_value = str(option_value or "").strip()
    if not oid:
        raise ValueError("org_id required")
    if not op_key:
        raise ValueError("operation_key required")
    if not prop_key:
        raise ValueError("property_key required")
    if not opt_value:
        raise ValueError("option_value required")
    now = _now_ts()
    value_id = f"opdval_{uuid.uuid4().hex[:12]}"
    _ensure_schema()
    with _connect() as con:
        existing = con.execute(
            """
            SELECT id, created_at, created_by
              FROM org_property_dictionary_values
             WHERE org_id = ? AND operation_key = ? AND property_key = ? AND option_value = ?
             LIMIT 1
            """,
            [oid, op_key, prop_key, opt_value],
        ).fetchone()
        con.execute(
            """
            INSERT INTO org_property_dictionary_values (
              id, org_id, operation_key, property_key, option_value, is_active, sort_order, created_at, updated_at, created_by, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(org_id, operation_key, property_key, option_value) DO UPDATE SET
              is_active = excluded.is_active,
              sort_order = excluded.sort_order,
              updated_at = excluded.updated_at,
              updated_by = excluded.updated_by
            """,
            [
                str(existing["id"] if existing else value_id),
                oid,
                op_key,
                prop_key,
                opt_value,
                _normalize_org_property_dictionary_bool(is_active, default=True),
                int(sort_order or 0),
                int(existing["created_at"] or now) if existing else now,
                now,
                str(existing["created_by"] or actor_user_id or "") if existing else str(actor_user_id or ""),
                str(actor_user_id or ""),
            ],
        )
        con.commit()
    out = None
    values = list_org_property_dictionary_values(oid, op_key, prop_key, include_inactive=True)
    for item in values:
        if str(item.get("option_value") or "") == opt_value:
            out = item
            break
    if not out:
        raise ValueError("value_upsert_failed")
    return out


def update_org_property_dictionary_value(
    org_id: str,
    option_id: str,
    *,
    option_value: Optional[str] = None,
    is_active: Any = None,
    sort_order: Any = None,
    actor_user_id: str = "",
) -> Optional[Dict[str, Any]]:
    current = get_org_property_dictionary_value_by_id(org_id, option_id)
    if not current:
        return None
    oid = str(current.get("org_id") or "")
    op_key = str(current.get("operation_key") or "")
    prop_key = str(current.get("property_key") or "")
    next_value = str(option_value if option_value is not None else current.get("option_value") or "").strip()
    if not next_value:
        raise ValueError("option_value required")
    next_sort_order = int(sort_order if sort_order is not None else current.get("sort_order") or 0)
    next_is_active = (
        _normalize_org_property_dictionary_bool(is_active, default=bool(current.get("is_active")))
        if is_active is not None
        else (1 if bool(current.get("is_active")) else 0)
    )
    now = _now_ts()
    _ensure_schema()
    with _connect() as con:
        conflict = con.execute(
            """
            SELECT id
              FROM org_property_dictionary_values
             WHERE org_id = ? AND operation_key = ? AND property_key = ? AND option_value = ? AND id != ?
             LIMIT 1
            """,
            [oid, op_key, prop_key, next_value, str(option_id or "").strip()],
        ).fetchone()
        if conflict:
            raise ValueError("option_value_exists")
        con.execute(
            """
            UPDATE org_property_dictionary_values
               SET option_value = ?,
                   is_active = ?,
                   sort_order = ?,
                   updated_at = ?,
                   updated_by = ?
             WHERE org_id = ? AND id = ?
            """,
            [next_value, next_is_active, next_sort_order, now, str(actor_user_id or ""), oid, str(option_id or "").strip()],
        )
        con.commit()
    return get_org_property_dictionary_value_by_id(oid, option_id)


def delete_org_property_dictionary_value(org_id: str, option_id: str) -> bool:
    oid = str(org_id or "").strip()
    option_row_id = str(option_id or "").strip()
    if not oid or not option_row_id:
        return False
    _ensure_schema()
    with _connect() as con:
        cur = con.execute(
            "DELETE FROM org_property_dictionary_values WHERE org_id = ? AND id = ?",
            [oid, option_row_id],
        )
        con.commit()
    return int(cur.rowcount or 0) > 0


def get_org_property_dictionary_bundle(
    org_id: str,
    operation_key: str,
    *,
    include_inactive: bool = False,
) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    op_key = _normalize_org_property_dictionary_key(operation_key)
    operation = get_org_property_dictionary_operation(oid, op_key)
    definitions = list_org_property_dictionary_definitions(oid, op_key, include_inactive=include_inactive)
    values_by_property: Dict[str, List[Dict[str, Any]]] = {}
    for definition in definitions:
        property_key = str(definition.get("property_key") or "")
        values_by_property[property_key] = list_org_property_dictionary_values(
            oid,
            op_key,
            property_key,
            include_inactive=include_inactive,
        )
    properties = []
    for definition in definitions:
        property_key = str(definition.get("property_key") or "")
        properties.append({
            **definition,
            "options": values_by_property.get(property_key, []),
        })
    return {
        "org_id": oid,
        "organizationId": oid,
        "operation_key": op_key,
        "operationKey": op_key,
        "operation": operation,
        "properties": properties,
    }


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
                   i.invite_key, i.token_hash, i.expires_at, i.created_at, i.created_by, i.used_at, i.used_by_user_id, i.accepted_at, i.accepted_by, i.revoked_at, i.revoked_by
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
                  used_at, used_by_user_id, accepted_at, accepted_by, revoked_at, revoked_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)
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
                   i.invite_key, i.token_hash, i.expires_at, i.created_at, i.created_by, i.used_at, i.used_by_user_id, i.accepted_at, i.accepted_by, i.revoked_at, i.revoked_by
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
                   i.invite_key, i.token_hash, i.expires_at, i.created_at, i.created_by, i.used_at, i.used_by_user_id, i.accepted_at, i.accepted_by, i.revoked_at, i.revoked_by
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
                       i.invite_key, i.token_hash, i.expires_at, i.created_at, i.created_by, i.used_at, i.used_by_user_id, i.accepted_at, i.accepted_by, i.revoked_at, i.revoked_by
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
                       i.invite_key, i.token_hash, i.expires_at, i.created_at, i.created_by, i.used_at, i.used_by_user_id, i.accepted_at, i.accepted_by, i.revoked_at, i.revoked_by
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
                       i.invite_key, i.token_hash, i.expires_at, i.created_at, i.created_by, i.used_at, i.used_by_user_id, i.accepted_at, i.accepted_by, i.revoked_at, i.revoked_by
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
                       i.invite_key, i.token_hash, i.expires_at, i.created_at, i.created_by, i.used_at, i.used_by_user_id, i.accepted_at, i.accepted_by, i.revoked_at, i.revoked_by
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
        con.execute(
            """
            INSERT INTO org_memberships (org_id, user_id, role, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(org_id, user_id) DO UPDATE SET role = excluded.role
            """,
            [oid, actor, role, now],
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
                   i.invite_key, i.token_hash, i.expires_at, i.created_at, i.created_by, i.used_at, i.used_by_user_id, i.accepted_at, i.accepted_by, i.revoked_at, i.revoked_by
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


def _build_audit_log_where(
    *,
    org_id: str,
    action: Optional[str] = None,
    project_id: Optional[str] = None,
    session_id: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    updated_from: Optional[int] = None,
    updated_to: Optional[int] = None,
) -> tuple[str, List[Any]]:
    clauses = ["org_id = ?"]
    params: List[Any] = [org_id]
    action_value = str(action or "").strip()
    if action_value:
        clauses.append("action = ?")
        params.append(action_value)
    project_value = str(project_id or "").strip()
    if project_value:
        clauses.append("project_id = ?")
        params.append(project_value)
    session_value = str(session_id or "").strip()
    if session_value:
        clauses.append("session_id = ?")
        params.append(session_value)
    status_value = str(status or "").strip().lower()
    if status_value:
        clauses.append("status = ?")
        params.append(status_value)
    from_ts = int(updated_from or 0)
    if from_ts > 0:
        clauses.append("ts >= ?")
        params.append(from_ts)
    to_ts = int(updated_to or 0)
    if to_ts > 0:
        clauses.append("ts <= ?")
        params.append(to_ts)
    query = str(q or "").strip().lower()
    if query:
        like = f"%{query}%"
        clauses.append(
            "("
            "LOWER(COALESCE(action, '')) LIKE ? OR "
            "LOWER(COALESCE(actor_user_id, '')) LIKE ? OR "
            "LOWER(COALESCE(project_id, '')) LIKE ? OR "
            "LOWER(COALESCE(session_id, '')) LIKE ? OR "
            "LOWER(COALESCE(entity_type, '')) LIKE ? OR "
            "LOWER(COALESCE(entity_id, '')) LIKE ?"
            ")"
        )
        params.extend([like, like, like, like, like, like])
    return " AND ".join(clauses), params


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
    where, params = _build_audit_log_where(
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
        rows = con.execute(
            f"""
            SELECT id, ts, actor_user_id, org_id, project_id, session_id, action, entity_type, entity_id, status, meta_json
              FROM audit_log
             WHERE {where}
             ORDER BY ts DESC, id DESC
             LIMIT ?
            OFFSET ?
            """,
            [*params, lim, off],
        ).fetchall()
    return [_audit_row_to_dict(row) for row in rows]


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
    where, params = _build_audit_log_where(
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
        row = con.execute(
            f"""
            SELECT COUNT(*)
              FROM audit_log
             WHERE {where}
            """,
            params,
        ).fetchone()
    if not row:
        return 0
    try:
        return int(row[0] or 0)
    except Exception:
        return 0


def cleanup_audit_log(org_id: str, *, retention_days: int = 90, now_ts: Optional[int] = None) -> int:
    oid = str(org_id or "").strip()
    if not oid:
        return 0
    retention = max(1, int(retention_days or 90))
    now = int(now_ts or 0) or _now_ts()
    threshold = now - retention * 24 * 60 * 60
    _ensure_schema()
    with _connect() as con:
        cur = con.execute(
            """
            DELETE FROM audit_log
             WHERE org_id = ? AND ts > 0 AND ts < ?
            """,
            [oid, threshold],
        )
        con.commit()
        return int(cur.rowcount or 0)


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


def list_workspace_snapshot_rows(
    org_id: str,
    *,
    allowed_project_ids: Optional[List[str]] = None,
    q: Optional[str] = None,
    owner_ids: Optional[List[str]] = None,
    updated_from: Optional[int] = None,
    updated_to: Optional[int] = None,
) -> Dict[str, Any]:
    oid = str(org_id or "").strip() or _default_org_id()
    search = str(q or "").strip().lower()
    allowed = sorted({
        str(item or "").strip()
        for item in (allowed_project_ids or [])
        if str(item or "").strip()
    })
    owners = sorted({
        str(item or "").strip()
        for item in (owner_ids or [])
        if str(item or "").strip()
    })
    try:
        ts_from = int(updated_from) if updated_from is not None else None
    except Exception:
        ts_from = None
    try:
        ts_to = int(updated_to) if updated_to is not None else None
    except Exception:
        ts_to = None

    session_filters: List[str] = ["org_id = ?"]
    session_params: List[Any] = [oid]
    project_filters: List[str] = ["org_id = ?"]
    project_params: List[Any] = [oid]

    if allowed:
        ph = ",".join(["?"] * len(allowed))
        session_filters.append(f"project_id IN ({ph})")
        project_filters.append(f"id IN ({ph})")
        session_params.extend(allowed)
        project_params.extend(allowed)
    if owners:
        ph = ",".join(["?"] * len(owners))
        session_filters.append(f"owner_user_id IN ({ph})")
        project_filters.append(f"owner_user_id IN ({ph})")
        session_params.extend(owners)
        project_params.extend(owners)
    if ts_from is not None and ts_from > 0:
        session_filters.append("updated_at >= ?")
        project_filters.append("updated_at >= ?")
        session_params.append(ts_from)
        project_params.append(ts_from)
    if ts_to is not None and ts_to > 0:
        session_filters.append("updated_at <= ?")
        project_filters.append("updated_at <= ?")
        session_params.append(ts_to)
        project_params.append(ts_to)
    if search:
        like = f"%{search}%"
        session_filters.append("lower(id || ' ' || title || ' ' || COALESCE(project_id,'') || ' ' || COALESCE(owner_user_id,'')) LIKE ?")
        project_filters.append("lower(id || ' ' || title || ' ' || COALESCE(owner_user_id,'')) LIKE ?")
        session_params.append(like)
        project_params.append(like)

    session_where = " AND ".join(session_filters)
    project_where = " AND ".join(project_filters)

    _ensure_schema()
    with _connect() as con:
        project_rows = con.execute(
            f"""
            SELECT id, title, owner_user_id, created_by, updated_by, created_at, updated_at, org_id
              FROM projects
             WHERE {project_where}
             ORDER BY updated_at DESC, created_at DESC, id DESC
            """,
            project_params,
        ).fetchall()
        session_rows = con.execute(
            f"""
            SELECT
              id, title, project_id, owner_user_id, created_by, updated_by,
              created_at, updated_at, mode, version, bpmn_xml_version, interview_json,
              bpmn_meta_json, notes, notes_by_element_json, org_id
              FROM sessions
             WHERE {session_where}
             ORDER BY updated_at DESC, id DESC
            """,
            session_params,
        ).fetchall()

    projects: List[Dict[str, Any]] = []
    for row in project_rows:
        projects.append({
            "id": str(row["id"] or ""),
            "title": str(row["title"] or ""),
            "owner_user_id": str(row["owner_user_id"] or ""),
            "created_by": str(row["created_by"] or ""),
            "updated_by": str(row["updated_by"] or ""),
            "created_at": int(row["created_at"] or 0),
            "updated_at": int(row["updated_at"] or 0),
            "org_id": str(row["org_id"] or oid),
        })

    sessions: List[Dict[str, Any]] = []
    for row in session_rows:
        sessions.append({
            "id": str(row["id"] or ""),
            "title": str(row["title"] or ""),
            "project_id": str(row["project_id"] or ""),
            "owner_user_id": str(row["owner_user_id"] or ""),
            "created_by": str(row["created_by"] or ""),
            "updated_by": str(row["updated_by"] or ""),
            "created_at": int(row["created_at"] or 0),
            "updated_at": int(row["updated_at"] or 0),
            "mode": str(row["mode"] or ""),
            "version": int(row["version"] or 0),
            "bpmn_xml_version": int(row["bpmn_xml_version"] or 0),
            "interview_json": str(row["interview_json"] or "{}"),
            "bpmn_meta_json": str(row["bpmn_meta_json"] or "{}"),
            "notes": str(row["notes"] or ""),
            "notes_by_element_json": str(row["notes_by_element_json"] or "{}"),
            "org_id": str(row["org_id"] or oid),
        })

    return {
        "org_id": oid,
        "projects": projects,
        "sessions": sessions,
    }


def get_project_storage() -> ProjectStorage:
    root = os.getenv("PROJECT_STORAGE_DIR", "").strip()
    if root:
        return ProjectStorage(Path(root))
    return ProjectStorage(_db_base_dir())


def get_db_runtime_info() -> Dict[str, Any]:
    cfg = get_db_runtime_config()
    info: Dict[str, Any] = {
        "backend": cfg.backend,
        "configured_backend": cfg.configured_backend,
        "startup_check": bool(cfg.startup_check),
    }
    if cfg.backend == "postgres":
        info["database_url"] = redact_database_url(cfg.database_url)
        info["pool_min_size"] = int(cfg.pool_min_size)
        info["pool_max_size"] = int(cfg.pool_max_size)
    else:
        info["db_path"] = str(_db_path())
    return info


def startup_db_check() -> Dict[str, Any]:
    info = get_db_runtime_info()
    with _connect() as con:
        row = con.execute("SELECT 1 AS ok").fetchone()
        if row is None:
            raise RuntimeError("database ping failed")
    _ensure_schema()
    return info


def get_storage() -> Storage:
    return Storage(base_dir=_db_base_dir())


# ─────────────────────────────────────────────────────────────────────────────
# Workspace Folder CRUD
# ─────────────────────────────────────────────────────────────────────────────

def _folder_row_to_dict(row: Any) -> Dict[str, Any]:
    return {
        "id": str(row["id"] or ""),
        "org_id": str(row["org_id"] or ""),
        "workspace_id": str((_row_value(row, "workspace_id") or "") or ""),
        "parent_id": str(row["parent_id"] or ""),
        "name": str(row["name"] or ""),
        "sort_order": int(row["sort_order"] or 0),
        "created_by": str(row["created_by"] or ""),
        "created_at": int(row["created_at"] or 0),
        "updated_at": int(row["updated_at"] or 0),
        "archived_at": row["archived_at"],
    }


def create_workspace_folder(
    org_id: str,
    workspace_id: str,
    name: str,
    parent_id: str = "",
    *,
    user_id: Optional[str] = None,
    sort_order: int = 0,
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
            INSERT INTO workspace_folders (id, org_id, workspace_id, parent_id, name, sort_order, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [fid, oid, wid, pid, fname, sort_order, owner, now, now],
        )
        con.commit()
        row = con.execute("SELECT * FROM workspace_folders WHERE id = ? LIMIT 1", [fid]).fetchone()
    return _folder_row_to_dict(row)


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
    return _folder_row_to_dict(row) if row else None


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
    return _folder_row_to_dict(row)


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
    return _folder_row_to_dict(row)


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
            SELECT s.project_id, s.id, s.title, s.updated_at
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
        folder_dict = _folder_row_to_dict(row)
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
    for row in session_rows:
        project_id = str(row["project_id"] or "")
        if not project_id or project_id in session_latest_by_project:
            continue
        session_latest_by_project[project_id] = {
            "id": str(row["id"] or ""),
            "title": str(row["title"] or "") or "Сессия",
            "updated_at": _safe_int(row["updated_at"], 0),
        }

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
        dod_sum = 0.0
        dod_count = 0

        for child_folder_id in folder_children.get(folder_id, []):
            child_metrics = _compute_folder_metrics(child_folder_id)
            descendant_projects_count += _safe_int(child_metrics.get("descendant_projects_count"), 0)
            descendant_sessions_count += _safe_int(child_metrics.get("descendant_sessions_count"), 0)
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
            "self_activity_at": _safe_int(folder.get("updated_at"), 0),
            "rollup_activity_at": _safe_int(metrics.get("rollup_activity_at"), _safe_int(folder.get("updated_at"), 0)),
            "last_activity_source_type": str(metrics.get("last_activity_source_type") or "folder"),
            "last_activity_source_id": str(metrics.get("last_activity_source_id") or folder_id),
            "last_activity_source_title": str(metrics.get("last_activity_source_title") or folder.get("name") or "Папка"),
            "rollup_dod_percent": rollup_dod_percent,
        })

    project_items = list(projects_by_folder.get(pid, []))
    return {"folders": folder_items, "projects": project_items}


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
            crumbs.append({"id": str(row["id"]), "name": str(row["name"]), "parent_id": str(row["parent_id"] or "")})
            current_id = str(row["parent_id"] or "")
    crumbs.reverse()
    return crumbs


def create_project_in_folder(
    org_id: str,
    workspace_id: str,
    folder_id: str,
    title: str,
    *,
    user_id: Optional[str] = None,
    passport: Optional[Dict[str, Any]] = None,
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
    with _connect() as con:
        frow = con.execute(
            "SELECT id FROM workspace_folders WHERE id = ? AND org_id = ? AND workspace_id = ? AND archived_at IS NULL LIMIT 1",
            [fid, oid, wid],
        ).fetchone()
        if not frow:
            raise ValueError("folder not found")
        con.execute(
            """
            INSERT INTO projects (id, title, passport_json, folder_id, workspace_id, created_at, updated_at, version, owner_user_id, org_id, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [pid, str(title or "").strip() or "Проект", _json_dumps(pdata, {}), fid, wid, now, now, 1, owner, oid, owner, owner],
        )
        con.commit()
    return pid


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


def list_project_sessions_for_explorer(org_id: str, project_id: str) -> List[Dict[str, Any]]:
    """List sessions for a project, explorer-friendly format.
    Falls back to no-org-filter when org_id mismatches legacy data."""
    _ensure_schema()
    oid = str(org_id or "").strip()
    pid = str(project_id or "").strip()
    with _connect() as con:
        if oid:
            rows = con.execute(
                "SELECT * FROM sessions WHERE project_id = ? AND org_id = ? ORDER BY updated_at DESC",
                [pid, oid],
            ).fetchall()
            if not rows:
                # Fallback: legacy sessions may have wrong org_id
                rows = con.execute(
                    "SELECT * FROM sessions WHERE project_id = ? ORDER BY updated_at DESC",
                    [pid],
                ).fetchall()
        else:
            rows = con.execute(
                "SELECT * FROM sessions WHERE project_id = ? ORDER BY updated_at DESC",
                [pid],
            ).fetchall()
    result = []
    for row in rows:
        s = _session_row_to_model(row)
        result.append({
            "id": s.id,
            "title": s.title,
            "project_id": s.project_id or "",
            "owner_user_id": s.owner_user_id,
            "org_id": s.org_id,
            "status": str((s.interview or {}).get("status", "draft") or "draft"),
            "stage": str((s.interview or {}).get("stage", "") or ""),
            "dod_percent": int((s.analytics or {}).get("dod_percent", 0) or 0),
            "attention_count": int((s.analytics or {}).get("attention_count", 0) or 0),
            "reports_count": int((s.analytics or {}).get("reports_count", 0) or 0),
            "updated_at": s.updated_at,
            "created_at": s.created_at,
        })
    return result


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
