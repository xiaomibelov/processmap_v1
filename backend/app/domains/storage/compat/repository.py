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

class DiagramStateConflictError(RuntimeError):
    """Raised when a CAS-guarded session write loses the race on diagram_state_version."""

    def __init__(self, session_id: str, expected: int, current: Optional[int] = None) -> None:
        super().__init__(
            f"diagram state conflict for session {session_id}: expected={expected} current={current}"
        )
        self.session_id = str(session_id or "")
        self.expected = int(expected or 0)
        self.current = current


NOTE_SCOPE_TYPES = {"diagram_element", "diagram", "session"}


NOTE_THREAD_PRIORITIES = {"low", "normal", "high"}


NOTE_THREAD_STATUSES = {"open", "resolved"}


SESSION_PRESENCE_TTL_SECONDS = 60


class SessionNotFoundError(RuntimeError):
    """Raised when a CAS-guarded session write targets a missing (deleted) row.

    Distinct from :class:`DiagramStateConflictError`: the row does not exist at
    all (deleted between the pre-load and the write, or never existed), so the
    API contract must surface 404 SESSION_NOT_FOUND — not a 409 conflict
    (audit P-1: save into a deleted session masqueraded as DIAGRAM_STATE_CONFLICT).
    """

    def __init__(self, session_id: str) -> None:
        super().__init__(f"session not found for CAS-guarded write: {session_id}")
        self.session_id = str(session_id or "")


class SessionTitleConflictError(RuntimeError):
    """Raised when a session natural-key (org/project/title/mode) unique constraint is violated."""


_AGENT_TABLES_DB_FILE: str = ""


_AGENT_TABLES_READY: bool = False


_AI_EXECUTION_STATUSES = {"queued", "running", "success", "error", "cancelled"}


_AI_PROMPT_SCOPE_LEVELS = {"global", "org", "workspace", "project", "session"}


_AI_PROMPT_STATUSES = {"draft", "active", "archived"}


_AUTH_USERS_BACKFILL_MARK = "auth_users_json_to_db_v1"


_BACKFILL_FOLDER_NAME = "Импортировано"


_BACKFILL_META_KEY = "workspace_folder_backfill_v1"


_BPMN_ACTIVITY_TAGS: Set[str] = {
    "task",
    "usertask",
    "servicetask",
    "manualtask",
    "scripttask",
    "businessruletask",
    "sendtask",
    "receivetask",
    "callactivity",
    "subprocess",
}


_DB_LOCK = threading.RLock()


_DEFAULT_ORG_ID = str(os.environ.get("FPC_DEFAULT_ORG_ID", "org_default") or "org_default").strip() or "org_default"


_DEFAULT_ORG_NAME = str(os.environ.get("FPC_DEFAULT_ORG_NAME", "Default") or "Default").strip() or "Default"


_DEFAULT_WORKSPACE_NAME = (
    str(os.environ.get("FPC_DEFAULT_WORKSPACE_NAME", "Main Workspace") or "Main Workspace").strip()
    or "Main Workspace"
)


_ENTERPRISE_BOOTSTRAP_MARK = "enterprise_org_bootstrap_v1"


_GIT_MIRROR_HEALTH_STATUSES = {"unknown", "valid", "invalid"}


_GIT_MIRROR_PROVIDERS = {"github", "gitlab"}


_INT64_MAX = 2**63 - 1


_MIGRATION_MARK = "legacy_file_to_sqlite_v1"


_ORG_FULL_ACCESS_ROLES = {"org_owner", "org_admin", "auditor"}


_ORG_INVITE_ROLES = {"org_admin", "project_manager", "editor", "viewer", "org_viewer", "auditor"}


_ORG_MEMBER_ROLES = {"org_owner", "org_admin", "project_manager", "editor", "viewer", "org_viewer", "auditor"}


_PERMISSION_KEYS = ("view", "create", "edit", "export", "delete", "manage_users")


_PG_POOL: Any = None


_PG_POOL_LOCK = threading.RLock()


_PROJECT_MEMBER_ROLES = {"project_manager", "editor", "viewer"}


_PROPERTY_METADATA_SEED = [
    {
        "id": "ingredient",
        "display_name": "Ингредиент",
        "property_type": "reference",
        "applicable_to": ["Task", "SubProcess"],
        "validation_rules": ["required"],
        "source": "bpmn_extension",
        "editable": True,
        "visible_in": ["canvas", "properties_panel", "export"],
        "category": "materials",
        "inheritance": "from_template",
        "value_range": {"reference_source": "table:ingredients"},
    },
    {
        "id": "equipment",
        "display_name": "Оборудование",
        "property_type": "reference",
        "applicable_to": ["Task", "SubProcess"],
        "validation_rules": ["required"],
        "source": "bpmn_extension",
        "editable": True,
        "visible_in": ["canvas", "properties_panel", "export"],
        "category": "equipment",
        "inheritance": "from_template",
        "value_range": {"reference_source": "table:equipment"},
    },
    {
        "id": "container",
        "display_name": "Контейнер",
        "property_type": "reference",
        "applicable_to": ["Task", "SubProcess"],
        "source": "bpmn_extension",
        "editable": True,
        "visible_in": ["canvas", "properties_panel", "export"],
        "category": "materials",
        "inheritance": "from_template",
        "value_range": {"reference_source": "table:containers"},
    },
    {
        "id": "duration",
        "display_name": "Длительность",
        "property_type": "duration",
        "applicable_to": ["Task", "SubProcess", "Process"],
        "source": "system",
        "editable": False,
        "visible_in": ["properties_panel", "analytics", "export"],
        "category": "timing",
        "inheritance": "none",
    },
    {
        "id": "priority",
        "display_name": "Приоритет",
        "property_type": "enum",
        "applicable_to": ["Task"],
        "value_range": {"options": ["low", "medium", "high"]},
        "source": "bpmn_extension",
        "editable": True,
        "visible_in": ["properties_panel", "export"],
        "category": "general",
        "inheritance": "none",
    },
]


_PROPERTY_METADATA_SEED_KEY = "property_registry_metadata_seed_v1"


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


_REFERENCE_SEED = {
    "ingredients": [
        ("ing_001", "Мука пшеничная", "kg", 364.0, "[]", None),
        ("ing_002", "Сахар", "kg", 400.0, "[]", None),
        ("ing_003", "Соль", "kg", 0.0, "[]", None),
        ("ing_004", "Дрожжи", "kg", 0.0, "[]", None),
        ("ing_005", "Молоко", "l", 420.0, '["lactose"]', None),
    ],
    "equipment": [
        ("eq_001", "Печь конвекционная", "oven", "200°C", "ежемесячно"),
        ("eq_002", "Миксер планетарный", "mixer", "50 л", "ежеквартально"),
        ("eq_003", "Конвейер охлаждения", "conveyor", "10 м/мин", "ежегодно"),
    ],
    "containers": [
        ("cnt_001", "Пластиковый лоток", "10 л", "plastic", "-10..+40"),
        ("cnt_002", "Стеклянная банка", "5 л", "glass", "0..+25"),
        ("cnt_003", "Металлическая бочка", "200 л", "metal", "-20..+40"),
    ],
}


_REFERENCE_SEED_KEY = "property_registry_reference_seed_v1"


_REQ_IS_ADMIN: ContextVar[bool] = ContextVar("fpc_req_is_admin", default=False)


_REQ_ORG_ID: ContextVar[str] = ContextVar("fpc_req_org_id", default="")


_REQ_USER_ID: ContextVar[str] = ContextVar("fpc_req_user_id", default="")


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

    def get(self, key: Any, default: Any = None) -> Any:
        return self._mapping.get(str(key), default)

    def keys(self) -> List[str]:
        return list(self._columns)


_SCHEMA_DB_FILE = ""


_SCHEMA_ENSURE_IN_PROGRESS = False


_SCHEMA_READY = False


_SESSION_ORG_WIDE_READ_ROLES = {"editor", "project_manager"}


_USERS_ROLE_COLUMN_CACHE: Optional[bool] = None


_USER_FACING_BPMN_VERSION_ACTIONS: Set[str] = {
    "publish_manual_save",
    "manual_publish",
    "manual_publish_revision",
    "import_bpmn",
    "restore_bpmn",
    "restore_revision",
    "restore_bpmn_version",
    "session.bpmn_restore",
}


def _ai_execution_log_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "execution_id": str(row["execution_id"] or ""),
        "module_id": str(row["module_id"] or ""),
        "actor_user_id": str(row["actor_user_id"] or ""),
        "scope": {
            "org_id": str(row["org_id"] or ""),
            "workspace_id": str(row["workspace_id"] or ""),
            "project_id": str(row["project_id"] or ""),
            "session_id": str(row["session_id"] or ""),
        },
        "org_id": str(row["org_id"] or ""),
        "workspace_id": str(row["workspace_id"] or ""),
        "project_id": str(row["project_id"] or ""),
        "session_id": str(row["session_id"] or ""),
        "provider": str(row["provider"] or ""),
        "model": str(row["model"] or ""),
        "prompt_id": str(row["prompt_id"] or ""),
        "prompt_version": str(row["prompt_version"] or ""),
        "status": str(row["status"] or "queued"),
        "input_hash": str(row["input_hash"] or ""),
        "output_summary": str(row["output_summary"] or ""),
        "usage": _json_loads(row["usage_json"], {}),
        "latency_ms": int(row["latency_ms"] or 0),
        "error_code": str(row["error_code"] or ""),
        "error_message": str(row["error_message"] or ""),
        "created_at": int(row["created_at"] or 0),
        "finished_at": int(row["finished_at"] or 0),
    }


def _ai_prompt_version_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    scope_level = str(row["scope_level"] or "global")
    scope_id = str(row["scope_id"] or "")
    return {
        "prompt_id": str(row["prompt_id"] or ""),
        "module_id": str(row["module_id"] or ""),
        "version": str(row["version"] or ""),
        "status": str(row["status"] or "draft"),
        "scope_level": scope_level,
        "scope_id": scope_id,
        "scope": {"level": scope_level, "id": scope_id},
        "template": str(row["template"] or ""),
        "variables_schema": _json_loads(row["variables_schema_json"], {}),
        "output_schema": _json_loads(row["output_schema_json"], {}),
        "created_by": str(row["created_by"] or ""),
        "created_at": int(row["created_at"] or 0),
        "updated_by": str(row["updated_by"] or ""),
        "updated_at": int(row["updated_at"] or 0),
        "activated_at": int(row["activated_at"] or 0),
        "archived_at": int(row["archived_at"] or 0),
    }


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


def _bpmn_local_name(tag: str) -> str:
    if not tag:
        return ""
    if tag.startswith("{"):
        return tag.split("}", 1)[-1].lower()
    return tag.lower()


def _clamp_int64(value: Any, default: int = 0) -> int:
    try:
        n = int(value)
    except Exception:
        n = int(default)
    return max(-_INT64_MAX - 1, min(n, _INT64_MAX))


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


def _conversation_row_to_dict(row: Any, now_ts: int) -> Dict[str, Any]:
    return {
        "id": str(row["id"]),
        "org_id": str(row["org_id"]),
        "session_id": str(row["session_id"]),
        "user_id": str(row["user_id"]),
        "created_at": int(row["created_at"] or 0),
        "updated_at": int(row["updated_at"] or 0),
        "first_activity_at": int(row["first_activity_at"] or row["created_at"] or 0),
        "last_activity_at": int(row["updated_at"] or 0),
        "turn_count": int(row["turn_count"] or 0),
        "total_tokens": int(row["total_tokens"] or 0),
        "applied_count": int(row["applied_count"] or 0),
        "rejected_count": int(row["rejected_count"] or 0),
        "summary": row["summary"] if row["summary"] else None,
        "status": _conversation_status(int(row["updated_at"] or 0), now_ts),
    }


def _conversation_status(updated_at: int, now_ts: int) -> str:
    return "closed" if (now_ts - int(updated_at or 0)) > 24 * 3600 else "active"


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


def _ensure_agent_tables() -> None:
    """Idempotent DDL for agent memory tables used by admin observability."""
    global _AGENT_TABLES_READY, _AGENT_TABLES_DB_FILE
    current_path = str(os.environ.get("PROCESS_DB_PATH", "") or "").strip()
    if _AGENT_TABLES_READY and _AGENT_TABLES_DB_FILE == current_path:
        return

    with _connect() as con:
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS agent_conversations (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL DEFAULT 'org_default',
                session_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                created_at BIGINT NOT NULL,
                updated_at BIGINT NOT NULL,
                summary TEXT
            )
            """
        )
        con.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_agent_conversations_session_user
            ON agent_conversations(org_id, session_id, user_id)
            """
        )
        con.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_agent_conversations_updated_at
            ON agent_conversations(updated_at)
            """
        )
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS agent_turns (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
                client_turn_id TEXT,
                org_id TEXT NOT NULL DEFAULT 'org_default',
                session_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
                content_json TEXT NOT NULL DEFAULT '{}',
                action TEXT,
                action_payload_json TEXT NOT NULL DEFAULT '{}',
                projection_digest TEXT,
                usage_json TEXT NOT NULL DEFAULT '{}',
                created_at BIGINT NOT NULL,
                UNIQUE(conversation_id, client_turn_id, role)
            )
            """
        )
        con.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_agent_turns_conversation_created
            ON agent_turns(conversation_id, created_at)
            """
        )
        con.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_agent_turns_session_created
            ON agent_turns(org_id, session_id, created_at)
            """
        )
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS agent_pending_edits (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL DEFAULT 'org_default',
                session_id TEXT NOT NULL,
                turn_id TEXT NOT NULL REFERENCES agent_turns(id) ON DELETE CASCADE,
                edit_plan_json TEXT NOT NULL DEFAULT '{}',
                status TEXT NOT NULL CHECK (status IN ('pending', 'applied', 'rejected', 'expired', 'conflict_rev')),
                expires_at BIGINT NOT NULL,
                created_at BIGINT NOT NULL,
                resumed_by_user_id TEXT,
                resumed_at BIGINT,
                base_diagram_state_version INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        con.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_agent_pending_edits_session_status
            ON agent_pending_edits(org_id, session_id, status)
            """
        )
        # Агрегация токенов диалога опирается на llm_usage. В окружениях без
        # alembic (тесты/contract) создаём SQLite-совместимую версию таблицы.
        cfg = get_db_runtime_config()
        if cfg.backend != "postgres":
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS llm_usage (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    org_id TEXT,
                    feature TEXT NOT NULL,
                    model TEXT,
                    provider_id TEXT,
                    prompt_tokens INTEGER NOT NULL DEFAULT 0,
                    completion_tokens INTEGER NOT NULL DEFAULT 0,
                    cached INTEGER NOT NULL DEFAULT 0,
                    user_id TEXT,
                    project_id TEXT,
                    session_id TEXT,
                    latency_ms INTEGER,
                    status TEXT NOT NULL DEFAULT 'ok',
                    ts BIGINT NOT NULL
                )
                """
            )
            con.execute(
                "CREATE INDEX IF NOT EXISTS idx_llm_usage_session_id ON llm_usage(session_id)"
            )
        con.commit()

    _AGENT_TABLES_READY = True
    _AGENT_TABLES_DB_FILE = current_path


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

    users = [
        _auth_user_row_to_dict(row)
        for row in con.execute(
            """
            SELECT id, email, password_hash, is_active, is_admin, created_at, updated_at,
                   activation_pending, activated_at, activation_required, activation_token_hash,
                   activation_expires_at, full_name, job_title
              FROM users
             ORDER BY email ASC, id ASC
            """
        ).fetchall()
    ]
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


def _ensure_schema() -> None:
    global _SCHEMA_READY, _SCHEMA_DB_FILE, _SCHEMA_ENSURE_IN_PROGRESS
    if _SCHEMA_ENSURE_IN_PROGRESS:
        return
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
                CREATE TABLE IF NOT EXISTS users (
                  id TEXT PRIMARY KEY,
                  email TEXT NOT NULL UNIQUE,
                  password_hash TEXT NOT NULL DEFAULT '',
                  is_active INTEGER NOT NULL DEFAULT 1,
                  is_admin INTEGER NOT NULL DEFAULT 0,
                  created_at INTEGER NOT NULL DEFAULT 0,
                  updated_at INTEGER NOT NULL DEFAULT 0,
                  activation_pending INTEGER NOT NULL DEFAULT 0,
                  activated_at INTEGER NOT NULL DEFAULT 0,
                  activation_required INTEGER NOT NULL DEFAULT 0,
                  activation_token_hash TEXT NOT NULL DEFAULT '',
                  activation_expires_at INTEGER NOT NULL DEFAULT 0,
                  full_name TEXT NOT NULL DEFAULT '',
                  job_title TEXT NOT NULL DEFAULT ''
                )
                """
            )
            con.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)")
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
                  executor_user_id TEXT,
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
                  diagram_state_version INTEGER NOT NULL DEFAULT 0,
                  diagram_last_write_actor_user_id TEXT NOT NULL DEFAULT '',
                  diagram_last_write_actor_label TEXT NOT NULL DEFAULT '',
                  diagram_last_write_client_id TEXT NOT NULL DEFAULT '',
                  diagram_last_write_at INTEGER NOT NULL DEFAULT 0,
                  diagram_last_write_changed_keys_json TEXT NOT NULL DEFAULT '[]',
                  bpmn_graph_fingerprint TEXT NOT NULL DEFAULT '',
                  git_mirror_version_number INTEGER NOT NULL DEFAULT 0,
                  bpmn_meta_json TEXT NOT NULL DEFAULT '{}',
                  version INTEGER NOT NULL DEFAULT 0,
                  owner_user_id TEXT NOT NULL DEFAULT '',
                  org_id TEXT NOT NULL DEFAULT 'org_default',
                  created_by TEXT NOT NULL DEFAULT '',
                  updated_by TEXT NOT NULL DEFAULT '',
                  created_at INTEGER NOT NULL DEFAULT 0,
                  updated_at INTEGER NOT NULL DEFAULT 0,
                  navigation_stack TEXT DEFAULT '[]',
                  parent_session_id TEXT,
                  element_id_in_parent TEXT,
                  activity_count INTEGER NOT NULL DEFAULT 0,
                  deleted_at INTEGER NOT NULL DEFAULT 0,
                  rag_readiness_status TEXT NOT NULL DEFAULT 'not_ready',
                  rag_queued_at INTEGER,
                  rag_indexed_at INTEGER
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_sessions_owner_updated ON sessions(owner_user_id, updated_at DESC)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_sessions_org_project ON sessions(org_id, project_id)")
            con.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_parent_element_unique
                ON sessions(org_id, project_id, parent_session_id, element_id_in_parent)
                WHERE parent_session_id IS NOT NULL AND parent_session_id != ''
                  AND element_id_in_parent IS NOT NULL AND element_id_in_parent != ''
                """
            )
            con.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_sessions_project_parent
                ON sessions(project_id, parent_session_id)
                WHERE parent_session_id IS NOT NULL AND parent_session_id != ''
                """
            )
            # P3 guard: idempotent session create. Unique natural key for project-scoped
            # root sessions created through the API (mode is always set there, e.g.
            # 'quick_skeleton'). mode-less rows (internal/direct storage creates, e.g.
            # seeds and fixtures that intentionally reuse titles) are out of scope.
            # Subprocess children are guarded by idx_sessions_parent_element_unique.
            # Created only when no duplicates exist; otherwise skipped with a warning
            # (never silently mutate user data — see docs/fix-save/track_b_report.md).
            # SAVEPOINT: on postgres a failed statement aborts the whole transaction;
            # keep the guard isolated so schema bootstrap can continue.
            con.execute("SAVEPOINT pm_ix_sessions_natural_key")
            try:
                dup_row = con.execute(
                    """
                    SELECT org_id, COALESCE(project_id,'') AS pid, lower(title) AS lt, COALESCE(mode,'') AS m,
                           COUNT(*) AS c
                      FROM sessions
                     WHERE (parent_session_id IS NULL OR parent_session_id = '')
                       AND project_id IS NOT NULL AND project_id != ''
                       AND mode IS NOT NULL AND mode != ''
                     GROUP BY org_id, pid, lt, m
                    HAVING COUNT(*) > 1
                     LIMIT 1
                    """
                ).fetchone()
                if dup_row is None:
                    con.execute(
                        """
                        CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_natural_key_unique
                        ON sessions(org_id, COALESCE(project_id,''), lower(title), COALESCE(mode,''))
                        WHERE (parent_session_id IS NULL OR parent_session_id = '')
                          AND project_id IS NOT NULL AND project_id != ''
                          AND mode IS NOT NULL AND mode != ''
                        """
                    )
                else:
                    logger.warning(
                        "sessions natural-key unique index skipped: duplicates exist org=%s project=%s title=%s mode=%s count=%s",
                        _row_value(dup_row, "org_id", 0), _row_value(dup_row, "pid", 1),
                        _row_value(dup_row, "lt", 2), _row_value(dup_row, "m", 3), _row_value(dup_row, "c", 4),
                    )
                con.execute("RELEASE SAVEPOINT pm_ix_sessions_natural_key")
            except Exception as exc:
                try:
                    con.execute("ROLLBACK TO SAVEPOINT pm_ix_sessions_natural_key")
                except Exception:
                    pass
                logger.warning("sessions natural-key unique index not created: %s", exc)
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS session_presence (
                  session_id TEXT NOT NULL,
                  user_id TEXT NOT NULL,
                  client_id TEXT NOT NULL,
                  org_id TEXT NOT NULL DEFAULT 'org_default',
                  project_id TEXT NOT NULL DEFAULT '',
                  surface TEXT NOT NULL DEFAULT '',
                  last_seen_at INTEGER NOT NULL DEFAULT 0,
                  created_at INTEGER NOT NULL DEFAULT 0,
                  updated_at INTEGER NOT NULL DEFAULT 0,
                  PRIMARY KEY (session_id, user_id, client_id)
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_session_presence_active ON session_presence(session_id, org_id, project_id, last_seen_at DESC)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_session_presence_stale ON session_presence(last_seen_at)")
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS session_assignees (
                  session_id TEXT NOT NULL,
                  user_id TEXT NOT NULL,
                  assigned_by TEXT NOT NULL,
                  assigned_at INTEGER NOT NULL,
                  PRIMARY KEY (session_id, user_id)
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_session_assignees_session ON session_assignees(session_id)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_session_assignees_user ON session_assignees(user_id)")
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS bpmn_versions (
                  id TEXT PRIMARY KEY,
                  session_id TEXT NOT NULL,
                  org_id TEXT NOT NULL DEFAULT 'org_default',
                  version_number INTEGER NOT NULL,
                  diagram_state_version INTEGER NOT NULL DEFAULT 0,
                  bpmn_xml TEXT NOT NULL DEFAULT '',
                  session_payload_hash TEXT NOT NULL DEFAULT '',
                  session_version INTEGER NOT NULL DEFAULT 0,
                  session_updated_at INTEGER NOT NULL DEFAULT 0,
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
                CREATE TABLE IF NOT EXISTS session_state_versions (
                  id TEXT PRIMARY KEY,
                  session_id TEXT NOT NULL,
                  org_id TEXT NOT NULL DEFAULT 'org_default',
                  diagram_state_version INTEGER NOT NULL,
                  parent_diagram_state_version INTEGER NOT NULL DEFAULT 0,
                  changed_keys_json TEXT NOT NULL DEFAULT '[]',
                  payload_hash TEXT NOT NULL DEFAULT '',
                  actor_user_id TEXT NOT NULL DEFAULT '',
                  actor_label TEXT NOT NULL DEFAULT '',
                  created_at INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            con.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_session_state_versions_session_diagram_state ON session_state_versions(session_id, org_id, diagram_state_version)"
            )
            con.execute(
                "CREATE INDEX IF NOT EXISTS idx_session_state_versions_session_created ON session_state_versions(session_id, org_id, created_at DESC)"
            )
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS session_product_action_suggestions (
                  id TEXT PRIMARY KEY,
                  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                  status TEXT NOT NULL DEFAULT 'pending',
                  source TEXT NOT NULL DEFAULT 'llm',
                  original_llm_output TEXT NOT NULL DEFAULT '{}',
                  action TEXT NOT NULL DEFAULT '{}',
                  binding TEXT NOT NULL DEFAULT '{}',
                  edited_by_user INTEGER NOT NULL DEFAULT 0,
                  created_at INTEGER NOT NULL DEFAULT 0,
                  updated_at INTEGER NOT NULL DEFAULT 0,
                  CONSTRAINT chk_session_product_action_suggestions_status
                    CHECK (status IN ('pending', 'approved', 'rejected'))
                )
                """
            )
            con.execute(
                "CREATE INDEX IF NOT EXISTS idx_session_product_action_suggestions_session_status ON session_product_action_suggestions(session_id, status)"
            )
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS note_threads (
                  id TEXT PRIMARY KEY,
                  org_id TEXT NOT NULL DEFAULT 'org_default',
                  workspace_id TEXT NOT NULL DEFAULT '',
                  project_id TEXT NOT NULL DEFAULT '',
                  session_id TEXT NOT NULL,
                  scope_type TEXT NOT NULL,
                  scope_ref_json TEXT NOT NULL DEFAULT '{}',
                  status TEXT NOT NULL DEFAULT 'open',
                  priority TEXT NOT NULL DEFAULT 'normal',
                  requires_attention INTEGER NOT NULL DEFAULT 0,
                  created_by TEXT NOT NULL DEFAULT '',
                  created_at INTEGER NOT NULL DEFAULT 0,
                  updated_at INTEGER NOT NULL DEFAULT 0,
                  updated_by TEXT NOT NULL DEFAULT '',
                  resolved_by TEXT NOT NULL DEFAULT '',
                  resolved_at INTEGER NOT NULL DEFAULT 0,
                  deleted_at INTEGER NOT NULL DEFAULT 0,
                  deleted_by TEXT NOT NULL DEFAULT ''
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_note_threads_session_status ON note_threads(session_id, org_id, status, updated_at DESC)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_note_threads_project_status ON note_threads(project_id, org_id, status)")
            if not _column_exists(con, "note_threads", "updated_by"):
                con.execute("ALTER TABLE note_threads ADD COLUMN updated_by TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "note_threads", "deleted_at"):
                con.execute("ALTER TABLE note_threads ADD COLUMN deleted_at INTEGER NOT NULL DEFAULT 0")
            if not _column_exists(con, "note_threads", "deleted_by"):
                con.execute("ALTER TABLE note_threads ADD COLUMN deleted_by TEXT NOT NULL DEFAULT ''")
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS note_comments (
                  id TEXT PRIMARY KEY,
                  thread_id TEXT NOT NULL,
                  author_user_id TEXT NOT NULL DEFAULT '',
                  body TEXT NOT NULL DEFAULT '',
                  reply_to_comment_id TEXT DEFAULT '',
                  created_at INTEGER NOT NULL DEFAULT 0,
                  updated_at INTEGER NOT NULL DEFAULT 0,
                  updated_by TEXT NOT NULL DEFAULT '',
                  edited_at INTEGER DEFAULT 0,
                  edited_by_user_id TEXT DEFAULT '',
                  deleted_at INTEGER NOT NULL DEFAULT 0,
                  deleted_by TEXT NOT NULL DEFAULT ''
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_note_comments_thread_created ON note_comments(thread_id, created_at ASC)")
            if not _column_exists(con, "note_comments", "reply_to_comment_id"):
                con.execute("ALTER TABLE note_comments ADD COLUMN reply_to_comment_id TEXT DEFAULT ''")
            if not _column_exists(con, "note_comments", "edited_at"):
                con.execute("ALTER TABLE note_comments ADD COLUMN edited_at INTEGER DEFAULT 0")
            if not _column_exists(con, "note_comments", "edited_by_user_id"):
                con.execute("ALTER TABLE note_comments ADD COLUMN edited_by_user_id TEXT DEFAULT ''")
            con.execute("CREATE INDEX IF NOT EXISTS idx_note_comments_reply_to ON note_comments(reply_to_comment_id)")
            if not _column_exists(con, "sessions", "navigation_stack"):
                con.execute("ALTER TABLE sessions ADD COLUMN navigation_stack TEXT DEFAULT '[]'")
            if not _column_exists(con, "sessions", "parent_session_id"):
                con.execute("ALTER TABLE sessions ADD COLUMN parent_session_id TEXT")
            if not _column_exists(con, "sessions", "element_id_in_parent"):
                con.execute("ALTER TABLE sessions ADD COLUMN element_id_in_parent TEXT")
            if not _column_exists(con, "sessions", "activity_count"):
                con.execute("ALTER TABLE sessions ADD COLUMN activity_count INTEGER NOT NULL DEFAULT 0")
            if not _column_exists(con, "sessions", "process_layer"):
                con.execute("ALTER TABLE sessions ADD COLUMN process_layer TEXT NOT NULL DEFAULT 'as_is'")
            if not _column_exists(con, "sessions", "derived_from_session_id"):
                con.execute("ALTER TABLE sessions ADD COLUMN derived_from_session_id TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "sessions", "deleted_at"):
                con.execute("ALTER TABLE sessions ADD COLUMN deleted_at INTEGER NOT NULL DEFAULT 0")
            con.execute("CREATE INDEX IF NOT EXISTS idx_sessions_parent_element ON sessions(parent_session_id, element_id_in_parent)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_sessions_parent_active ON sessions(parent_session_id, deleted_at) WHERE parent_session_id IS NOT NULL AND parent_session_id != ''")
            con.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_parent_element_unique
                ON sessions(org_id, project_id, parent_session_id, element_id_in_parent)
                WHERE parent_session_id IS NOT NULL AND parent_session_id != ''
                  AND element_id_in_parent IS NOT NULL AND element_id_in_parent != ''
                """
            )
            con.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_sessions_project_parent
                ON sessions(project_id, parent_session_id)
                WHERE parent_session_id IS NOT NULL AND parent_session_id != ''
                """
            )
            # P3 guard (TO BE): one TO BE copy per (org, project, source AS IS session).
            # Placed AFTER the ALTERs above so process_layer/derived_from_session_id exist.
            # SAVEPOINT: on postgres a failed statement aborts the whole transaction.
            con.execute("SAVEPOINT pm_ix_sessions_tobe_derived")
            try:
                dup_tobe = con.execute(
                    """
                    SELECT org_id, COALESCE(project_id,'') AS pid, derived_from_session_id AS src,
                           COUNT(*) AS c
                      FROM sessions
                     WHERE derived_from_session_id IS NOT NULL AND derived_from_session_id != ''
                       AND process_layer = 'to_be'
                       AND (parent_session_id IS NULL OR parent_session_id = '')
                     GROUP BY org_id, pid, src
                    HAVING COUNT(*) > 1
                     LIMIT 1
                    """
                ).fetchone()
                if dup_tobe is None:
                    con.execute(
                        """
                        CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_tobe_derived_unique
                        ON sessions(org_id, COALESCE(project_id,''), derived_from_session_id)
                        WHERE derived_from_session_id IS NOT NULL AND derived_from_session_id != ''
                          AND process_layer = 'to_be'
                          AND (parent_session_id IS NULL OR parent_session_id = '')
                        """
                    )
                else:
                    logger.warning(
                        "sessions tobe-derived unique index skipped: duplicates exist org=%s project=%s src=%s count=%s",
                        _row_value(dup_tobe, "org_id", 0), _row_value(dup_tobe, "pid", 1),
                        _row_value(dup_tobe, "src", 2), _row_value(dup_tobe, "c", 3),
                    )
                con.execute("RELEASE SAVEPOINT pm_ix_sessions_tobe_derived")
            except Exception as exc:
                try:
                    con.execute("ROLLBACK TO SAVEPOINT pm_ix_sessions_tobe_derived")
                except Exception:
                    pass
                logger.warning("sessions tobe-derived unique index not created: %s", exc)
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS note_comment_mentions (
                  id TEXT PRIMARY KEY,
                  org_id TEXT NOT NULL DEFAULT 'org_default',
                  session_id TEXT NOT NULL DEFAULT '',
                  thread_id TEXT NOT NULL,
                  comment_id TEXT NOT NULL,
                  mentioned_user_id TEXT NOT NULL,
                  mentioned_label TEXT NOT NULL DEFAULT '',
                  created_by TEXT NOT NULL DEFAULT '',
                  created_at INTEGER NOT NULL DEFAULT 0,
                  acknowledged_at INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_note_comment_mentions_user_active ON note_comment_mentions(org_id, mentioned_user_id, acknowledged_at, created_at DESC)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_note_comment_mentions_comment ON note_comment_mentions(comment_id, org_id)")
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS note_thread_attention_acknowledgements (
                  org_id TEXT NOT NULL DEFAULT 'org_default',
                  thread_id TEXT NOT NULL,
                  user_id TEXT NOT NULL,
                  acknowledged_at INTEGER NOT NULL DEFAULT 0,
                  PRIMARY KEY (org_id, thread_id, user_id)
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_note_thread_attention_ack_thread ON note_thread_attention_acknowledgements(thread_id, org_id)")
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS note_thread_reads (
                  thread_id TEXT NOT NULL,
                  user_id TEXT NOT NULL,
                  last_read_at INTEGER NOT NULL DEFAULT 0,
                  last_seen_comment_id TEXT DEFAULT '',
                  updated_at INTEGER NOT NULL DEFAULT 0,
                  PRIMARY KEY (thread_id, user_id)
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_note_thread_reads_user_updated ON note_thread_reads(user_id, updated_at DESC)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_note_thread_reads_thread ON note_thread_reads(thread_id)")
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS orgs (
                  id TEXT PRIMARY KEY,
                  name TEXT NOT NULL,
                  created_at INTEGER NOT NULL DEFAULT 0,
                  created_by TEXT NOT NULL DEFAULT '',
                  is_active INTEGER NOT NULL DEFAULT 1,
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
            if not _column_exists(con, "orgs", "is_active"):
                con.execute("ALTER TABLE orgs ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1")
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS org_memberships (
                  org_id TEXT NOT NULL,
                  user_id TEXT NOT NULL,
                  role TEXT NOT NULL DEFAULT 'editor',
                  permissions_json TEXT NOT NULL DEFAULT '{}',
                  created_at INTEGER NOT NULL DEFAULT 0,
                  PRIMARY KEY (org_id, user_id)
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON org_memberships(user_id)")
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS groups (
                  id TEXT PRIMARY KEY,
                  org_id TEXT NOT NULL,
                  name TEXT NOT NULL,
                  description TEXT NOT NULL DEFAULT '',
                  created_at INTEGER NOT NULL DEFAULT 0,
                  updated_at INTEGER NOT NULL DEFAULT 0,
                  created_by TEXT NOT NULL DEFAULT '',
                  updated_by TEXT NOT NULL DEFAULT ''
                )
                """
            )
            con.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_org_name ON groups(org_id, name)"
            )
            con.execute(
                "CREATE INDEX IF NOT EXISTS idx_groups_org ON groups(org_id)"
            )
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS group_memberships (
                  group_id TEXT NOT NULL,
                  user_id TEXT NOT NULL,
                  created_at INTEGER NOT NULL DEFAULT 0,
                  created_by TEXT NOT NULL DEFAULT '',
                  PRIMARY KEY (group_id, user_id)
                )
                """
            )
            con.execute(
                "CREATE INDEX IF NOT EXISTS idx_group_memberships_user ON group_memberships(user_id)"
            )
            con.execute(
                "CREATE INDEX IF NOT EXISTS idx_group_memberships_group ON group_memberships(group_id)"
            )
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
            # Extended property registry metadata
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS process_property_metadata (
                  id TEXT PRIMARY KEY,
                  display_name TEXT NOT NULL,
                  property_type TEXT NOT NULL,
                  applicable_to TEXT,
                  default_value TEXT,
                  value_range TEXT,
                  validation_rules TEXT,
                  source TEXT NOT NULL DEFAULT 'bpmn_extension',
                  editable INTEGER NOT NULL DEFAULT 1,
                  visible_in TEXT,
                  category TEXT NOT NULL DEFAULT 'general',
                  inheritance TEXT NOT NULL DEFAULT 'none',
                  version INTEGER NOT NULL DEFAULT 1,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  org_id TEXT,
                  created_by TEXT,
                  updated_by TEXT,
                  FOREIGN KEY (org_id) REFERENCES orgs(id)
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_ppm_org_id ON process_property_metadata(org_id)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_ppm_category ON process_property_metadata(category)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_ppm_source ON process_property_metadata(source)")
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS ingredients (
                  id TEXT PRIMARY KEY,
                  org_id TEXT,
                  name TEXT NOT NULL,
                  unit TEXT,
                  calories_per_unit REAL,
                  allergens TEXT,
                  supplier_id TEXT,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  FOREIGN KEY (org_id) REFERENCES orgs(id)
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_ingredients_org_id ON ingredients(org_id)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_ingredients_name ON ingredients(name)")
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS equipment (
                  id TEXT PRIMARY KEY,
                  org_id TEXT,
                  name TEXT NOT NULL,
                  type TEXT,
                  capacity TEXT,
                  maintenance_schedule TEXT,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  FOREIGN KEY (org_id) REFERENCES orgs(id)
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_equipment_org_id ON equipment(org_id)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_equipment_name ON equipment(name)")
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS containers (
                  id TEXT PRIMARY KEY,
                  org_id TEXT,
                  name TEXT NOT NULL,
                  volume TEXT,
                  material TEXT,
                  temperature_range TEXT,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  FOREIGN KEY (org_id) REFERENCES orgs(id)
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_containers_org_id ON containers(org_id)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_containers_name ON containers(name)")
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
            # P1 [А]: per-user+per-org UI preferences (PHASE2_USER_PREFERENCES_CONTRACT).
            # Значения храним как TEXT (JSON-строка), как остальные *_json колонки —
            # слой _translate_sql_for_postgres прозрачно переносит это на Postgres.
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS user_preferences (
                  user_id TEXT NOT NULL,
                  org_id TEXT NOT NULL,
                  key TEXT NOT NULL,
                  value_json TEXT NOT NULL DEFAULT '{}',
                  updated_at INTEGER NOT NULL DEFAULT 0,
                  PRIMARY KEY (user_id, org_id, key)
                )
                """
            )
            # Монотонный version одного preferences-документа (user+org) для
            # optimistic concurrency (base_version/409) — отдельно от ключей,
            # чтобы счётчик не терялся при unset всех ключей.
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS user_preferences_docs (
                  user_id TEXT NOT NULL,
                  org_id TEXT NOT NULL,
                  version INTEGER NOT NULL DEFAULT 0,
                  updated_at INTEGER NOT NULL DEFAULT 0,
                  PRIMARY KEY (user_id, org_id)
                )
                """
            )
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS ai_execution_log (
                  execution_id TEXT PRIMARY KEY,
                  module_id TEXT NOT NULL,
                  actor_user_id TEXT NOT NULL DEFAULT '',
                  org_id TEXT NOT NULL DEFAULT '',
                  workspace_id TEXT NOT NULL DEFAULT '',
                  project_id TEXT NOT NULL DEFAULT '',
                  session_id TEXT NOT NULL DEFAULT '',
                  provider TEXT NOT NULL DEFAULT '',
                  model TEXT NOT NULL DEFAULT '',
                  prompt_id TEXT NOT NULL DEFAULT '',
                  prompt_version TEXT NOT NULL DEFAULT '',
                  status TEXT NOT NULL DEFAULT 'queued',
                  input_hash TEXT NOT NULL DEFAULT '',
                  output_summary TEXT NOT NULL DEFAULT '',
                  usage_json TEXT NOT NULL DEFAULT '{}',
                  latency_ms INTEGER NOT NULL DEFAULT 0,
                  error_code TEXT NOT NULL DEFAULT '',
                  error_message TEXT NOT NULL DEFAULT '',
                  created_at INTEGER NOT NULL DEFAULT 0,
                  finished_at INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_ai_exec_org_created ON ai_execution_log(org_id, created_at DESC)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_ai_exec_module ON ai_execution_log(module_id)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_ai_exec_status ON ai_execution_log(status)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_ai_exec_actor ON ai_execution_log(actor_user_id)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_ai_exec_scope ON ai_execution_log(workspace_id, project_id, session_id)")
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS ai_prompt_versions (
                  prompt_id TEXT PRIMARY KEY,
                  module_id TEXT NOT NULL,
                  version TEXT NOT NULL,
                  status TEXT NOT NULL DEFAULT 'draft',
                  scope_level TEXT NOT NULL DEFAULT 'global',
                  scope_id TEXT NOT NULL DEFAULT '',
                  template TEXT NOT NULL DEFAULT '',
                  variables_schema_json TEXT NOT NULL DEFAULT '{}',
                  output_schema_json TEXT NOT NULL DEFAULT '{}',
                  created_by TEXT NOT NULL DEFAULT '',
                  created_at INTEGER NOT NULL DEFAULT 0,
                  updated_by TEXT NOT NULL DEFAULT '',
                  updated_at INTEGER NOT NULL DEFAULT 0,
                  activated_at INTEGER NOT NULL DEFAULT 0,
                  archived_at INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            con.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_prompt_module_scope_version
                ON ai_prompt_versions(module_id, scope_level, scope_id, version)
                """
            )
            con.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_prompt_one_active_per_scope
                ON ai_prompt_versions(module_id, scope_level, scope_id)
                WHERE status = 'active'
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_ai_prompt_module_scope ON ai_prompt_versions(module_id, scope_level, scope_id)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_ai_prompt_status ON ai_prompt_versions(status)")
            # Контур test/llm-testgen-admin: учёт запусков LLM-генератора тестов
            # (генератор исполняется в GitHub Actions, здесь только метаданные).
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS testgen_runs (
                  run_id TEXT PRIMARY KEY,
                  status TEXT NOT NULL DEFAULT 'queued',
                  tag TEXT NOT NULL DEFAULT '',
                  batch_limit INTEGER NOT NULL DEFAULT 5,
                  github_run_id TEXT NOT NULL DEFAULT '',
                  pr_url TEXT NOT NULL DEFAULT '',
                  summary_json TEXT NOT NULL DEFAULT '{}',
                  error TEXT NOT NULL DEFAULT '',
                  requested_by TEXT NOT NULL DEFAULT '',
                  created_at INTEGER NOT NULL DEFAULT 0,
                  updated_at INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_testgen_runs_status ON testgen_runs(status)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_testgen_runs_created ON testgen_runs(created_at)")
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS error_events (
                  id TEXT PRIMARY KEY,
                  schema_version INTEGER NOT NULL DEFAULT 1,
                  occurred_at INTEGER NOT NULL DEFAULT 0,
                  ingested_at INTEGER NOT NULL DEFAULT 0,
                  source TEXT NOT NULL DEFAULT '',
                  event_type TEXT NOT NULL DEFAULT '',
                  severity TEXT NOT NULL DEFAULT 'error',
                  message TEXT NOT NULL DEFAULT '',
                  user_id TEXT,
                  org_id TEXT,
                  session_id TEXT,
                  project_id TEXT,
                  route TEXT,
                  runtime_id TEXT,
                  tab_id TEXT,
                  request_id TEXT,
                  correlation_id TEXT,
                  app_version TEXT,
                  git_sha TEXT,
                  fingerprint TEXT NOT NULL DEFAULT '',
                  context_json TEXT NOT NULL DEFAULT '{}'
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_error_events_occurred_at ON error_events(occurred_at DESC)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_error_events_user ON error_events(user_id)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_error_events_org ON error_events(org_id)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_error_events_session ON error_events(session_id)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_error_events_project ON error_events(project_id)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_error_events_request ON error_events(request_id)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_error_events_runtime ON error_events(runtime_id)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_error_events_correlation ON error_events(correlation_id)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_error_events_fingerprint ON error_events(fingerprint)")
            # Контур feature/endpoint-regression-scanner: прогоны read-only
            # сканера эндпоинтов и их результаты. История не затирается — только INSERT.
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS endpoint_check_runs (
                  id TEXT PRIMARY KEY,
                  started_at INTEGER NOT NULL DEFAULT 0,
                  finished_at INTEGER NOT NULL DEFAULT 0,
                  trigger TEXT NOT NULL DEFAULT 'manual',
                  status TEXT NOT NULL DEFAULT 'pending',
                  version_commit TEXT NOT NULL DEFAULT '',
                  version_branch TEXT NOT NULL DEFAULT '',
                  version_env TEXT NOT NULL DEFAULT '',
                  requested_by TEXT NOT NULL DEFAULT '',
                  summary_json TEXT NOT NULL DEFAULT '{}',
                  error TEXT NOT NULL DEFAULT ''
                )
                """
            )
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS endpoint_check_results (
                  id TEXT PRIMARY KEY,
                  run_id TEXT NOT NULL,
                  operation_id TEXT NOT NULL DEFAULT '',
                  method TEXT NOT NULL DEFAULT '',
                  path TEXT NOT NULL DEFAULT '',
                  url_path TEXT NOT NULL DEFAULT '',
                  http_status INTEGER NOT NULL DEFAULT 0,
                  category TEXT NOT NULL DEFAULT '',
                  latency_ms REAL NOT NULL DEFAULT 0,
                  fingerprint TEXT NOT NULL DEFAULT '',
                  diff_status TEXT NOT NULL DEFAULT '',
                  note TEXT NOT NULL DEFAULT '',
                  body_excerpt TEXT NOT NULL DEFAULT '',
                  error_events_json TEXT NOT NULL DEFAULT '[]',
                  created_at INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_endpoint_check_results_run ON endpoint_check_results(run_id)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_endpoint_check_results_op ON endpoint_check_results(operation_id)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_endpoint_check_runs_started ON endpoint_check_runs(started_at)")
            if not _column_exists(con, "projects", "org_id"):
                con.execute("ALTER TABLE projects ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_default'")
            if not _column_exists(con, "users", "updated_at"):
                con.execute("ALTER TABLE users ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0")
            if not _column_exists(con, "users", "activation_pending"):
                con.execute("ALTER TABLE users ADD COLUMN activation_pending INTEGER NOT NULL DEFAULT 0")
            if not _column_exists(con, "users", "activated_at"):
                con.execute("ALTER TABLE users ADD COLUMN activated_at INTEGER NOT NULL DEFAULT 0")
            if not _column_exists(con, "users", "activation_required"):
                con.execute("ALTER TABLE users ADD COLUMN activation_required INTEGER NOT NULL DEFAULT 0")
            if not _column_exists(con, "users", "activation_token_hash"):
                con.execute("ALTER TABLE users ADD COLUMN activation_token_hash TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "users", "activation_expires_at"):
                con.execute("ALTER TABLE users ADD COLUMN activation_expires_at INTEGER NOT NULL DEFAULT 0")
            if not _column_exists(con, "users", "full_name"):
                con.execute("ALTER TABLE users ADD COLUMN full_name TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "users", "job_title"):
                con.execute("ALTER TABLE users ADD COLUMN job_title TEXT NOT NULL DEFAULT ''")
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
            if not _column_exists(con, "org_memberships", "permissions_json"):
                con.execute("ALTER TABLE org_memberships ADD COLUMN permissions_json TEXT NOT NULL DEFAULT '{}'")
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
            if not _column_exists(con, "sessions", "diagram_state_version"):
                con.execute("ALTER TABLE sessions ADD COLUMN diagram_state_version INTEGER NOT NULL DEFAULT 0")
            if not _column_exists(con, "sessions", "diagram_last_write_actor_user_id"):
                con.execute("ALTER TABLE sessions ADD COLUMN diagram_last_write_actor_user_id TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "sessions", "diagram_last_write_actor_label"):
                con.execute("ALTER TABLE sessions ADD COLUMN diagram_last_write_actor_label TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "sessions", "diagram_last_write_at"):
                con.execute("ALTER TABLE sessions ADD COLUMN diagram_last_write_at INTEGER NOT NULL DEFAULT 0")
            if not _column_exists(con, "sessions", "diagram_last_write_changed_keys_json"):
                con.execute("ALTER TABLE sessions ADD COLUMN diagram_last_write_changed_keys_json TEXT NOT NULL DEFAULT '[]'")
            if not _column_exists(con, "sessions", "diagram_last_write_client_id"):
                con.execute("ALTER TABLE sessions ADD COLUMN diagram_last_write_client_id TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "sessions", "rag_readiness_status"):
                con.execute("ALTER TABLE sessions ADD COLUMN rag_readiness_status TEXT NOT NULL DEFAULT 'not_ready'")
            if not _column_exists(con, "sessions", "rag_queued_at"):
                con.execute("ALTER TABLE sessions ADD COLUMN rag_queued_at INTEGER")
            if not _column_exists(con, "sessions", "rag_indexed_at"):
                con.execute("ALTER TABLE sessions ADD COLUMN rag_indexed_at INTEGER")
            if not _column_exists(con, "bpmn_versions", "diagram_state_version"):
                con.execute("ALTER TABLE bpmn_versions ADD COLUMN diagram_state_version INTEGER NOT NULL DEFAULT 0")
            if not _column_exists(con, "bpmn_versions", "session_payload_hash"):
                con.execute("ALTER TABLE bpmn_versions ADD COLUMN session_payload_hash TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "bpmn_versions", "session_version"):
                con.execute("ALTER TABLE bpmn_versions ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0")
            if not _column_exists(con, "bpmn_versions", "session_updated_at"):
                con.execute("ALTER TABLE bpmn_versions ADD COLUMN session_updated_at INTEGER NOT NULL DEFAULT 0")
            con.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_bpmn_versions_session_diagram_state ON bpmn_versions(session_id, org_id, diagram_state_version) WHERE diagram_state_version > 0"
            )
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS session_state_versions (
                  id TEXT PRIMARY KEY,
                  session_id TEXT NOT NULL,
                  org_id TEXT NOT NULL DEFAULT 'org_default',
                  diagram_state_version INTEGER NOT NULL,
                  parent_diagram_state_version INTEGER NOT NULL DEFAULT 0,
                  changed_keys_json TEXT NOT NULL DEFAULT '[]',
                  payload_hash TEXT NOT NULL DEFAULT '',
                  actor_user_id TEXT NOT NULL DEFAULT '',
                  actor_label TEXT NOT NULL DEFAULT '',
                  created_at INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            con.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_session_state_versions_session_diagram_state ON session_state_versions(session_id, org_id, diagram_state_version)"
            )
            con.execute(
                "CREATE INDEX IF NOT EXISTS idx_session_state_versions_session_created ON session_state_versions(session_id, org_id, created_at DESC)"
            )
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS session_product_action_suggestions (
                  id TEXT PRIMARY KEY,
                  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                  status TEXT NOT NULL DEFAULT 'pending',
                  source TEXT NOT NULL DEFAULT 'llm',
                  original_llm_output TEXT NOT NULL DEFAULT '{}',
                  action TEXT NOT NULL DEFAULT '{}',
                  binding TEXT NOT NULL DEFAULT '{}',
                  edited_by_user INTEGER NOT NULL DEFAULT 0,
                  created_at INTEGER NOT NULL DEFAULT 0,
                  updated_at INTEGER NOT NULL DEFAULT 0,
                  CONSTRAINT chk_session_product_action_suggestions_status
                    CHECK (status IN ('pending', 'approved', 'rejected'))
                )
                """
            )
            con.execute(
                "CREATE INDEX IF NOT EXISTS idx_session_product_action_suggestions_session_status ON session_product_action_suggestions(session_id, status)"
            )
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS note_threads (
                  id TEXT PRIMARY KEY,
                  org_id TEXT NOT NULL DEFAULT 'org_default',
                  workspace_id TEXT NOT NULL DEFAULT '',
                  project_id TEXT NOT NULL DEFAULT '',
                  session_id TEXT NOT NULL,
                  scope_type TEXT NOT NULL,
                  scope_ref_json TEXT NOT NULL DEFAULT '{}',
                  status TEXT NOT NULL DEFAULT 'open',
                  priority TEXT NOT NULL DEFAULT 'normal',
                  requires_attention INTEGER NOT NULL DEFAULT 0,
                  created_by TEXT NOT NULL DEFAULT '',
                  created_at INTEGER NOT NULL DEFAULT 0,
                  updated_at INTEGER NOT NULL DEFAULT 0,
                  updated_by TEXT NOT NULL DEFAULT '',
                  resolved_by TEXT NOT NULL DEFAULT '',
                  resolved_at INTEGER NOT NULL DEFAULT 0,
                  deleted_at INTEGER NOT NULL DEFAULT 0,
                  deleted_by TEXT NOT NULL DEFAULT ''
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_note_threads_session_status ON note_threads(session_id, org_id, status, updated_at DESC)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_note_threads_project_status ON note_threads(project_id, org_id, status)")
            if not _column_exists(con, "note_threads", "updated_by"):
                con.execute("ALTER TABLE note_threads ADD COLUMN updated_by TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "note_threads", "deleted_at"):
                con.execute("ALTER TABLE note_threads ADD COLUMN deleted_at INTEGER NOT NULL DEFAULT 0")
            if not _column_exists(con, "note_threads", "deleted_by"):
                con.execute("ALTER TABLE note_threads ADD COLUMN deleted_by TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "note_threads", "priority"):
                con.execute("ALTER TABLE note_threads ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'")
            if not _column_exists(con, "note_threads", "requires_attention"):
                con.execute("ALTER TABLE note_threads ADD COLUMN requires_attention INTEGER NOT NULL DEFAULT 0")
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS note_comments (
                  id TEXT PRIMARY KEY,
                  thread_id TEXT NOT NULL,
                  author_user_id TEXT NOT NULL DEFAULT '',
                  body TEXT NOT NULL DEFAULT '',
                  reply_to_comment_id TEXT DEFAULT '',
                  created_at INTEGER NOT NULL DEFAULT 0,
                  updated_at INTEGER NOT NULL DEFAULT 0,
                  updated_by TEXT NOT NULL DEFAULT '',
                  edited_at INTEGER DEFAULT 0,
                  edited_by_user_id TEXT DEFAULT '',
                  deleted_at INTEGER NOT NULL DEFAULT 0,
                  deleted_by TEXT NOT NULL DEFAULT ''
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_note_comments_thread_created ON note_comments(thread_id, created_at ASC)")
            if not _column_exists(con, "note_comments", "updated_by"):
                con.execute("ALTER TABLE note_comments ADD COLUMN updated_by TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "note_comments", "deleted_at"):
                con.execute("ALTER TABLE note_comments ADD COLUMN deleted_at INTEGER NOT NULL DEFAULT 0")
            if not _column_exists(con, "note_comments", "deleted_by"):
                con.execute("ALTER TABLE note_comments ADD COLUMN deleted_by TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "note_comments", "reply_to_comment_id"):
                con.execute("ALTER TABLE note_comments ADD COLUMN reply_to_comment_id TEXT DEFAULT ''")
            if not _column_exists(con, "note_comments", "edited_at"):
                con.execute("ALTER TABLE note_comments ADD COLUMN edited_at INTEGER DEFAULT 0")
            if not _column_exists(con, "note_comments", "edited_by_user_id"):
                con.execute("ALTER TABLE note_comments ADD COLUMN edited_by_user_id TEXT DEFAULT ''")
            con.execute("CREATE INDEX IF NOT EXISTS idx_note_comments_reply_to ON note_comments(reply_to_comment_id)")
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS note_comment_mentions (
                  id TEXT PRIMARY KEY,
                  org_id TEXT NOT NULL DEFAULT 'org_default',
                  session_id TEXT NOT NULL DEFAULT '',
                  thread_id TEXT NOT NULL,
                  comment_id TEXT NOT NULL,
                  mentioned_user_id TEXT NOT NULL,
                  mentioned_label TEXT NOT NULL DEFAULT '',
                  created_by TEXT NOT NULL DEFAULT '',
                  created_at INTEGER NOT NULL DEFAULT 0,
                  acknowledged_at INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_note_comment_mentions_user_active ON note_comment_mentions(org_id, mentioned_user_id, acknowledged_at, created_at DESC)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_note_comment_mentions_comment ON note_comment_mentions(comment_id, org_id)")
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS note_thread_attention_acknowledgements (
                  org_id TEXT NOT NULL DEFAULT 'org_default',
                  thread_id TEXT NOT NULL,
                  user_id TEXT NOT NULL,
                  acknowledged_at INTEGER NOT NULL DEFAULT 0,
                  PRIMARY KEY (org_id, thread_id, user_id)
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_note_thread_attention_ack_thread ON note_thread_attention_acknowledgements(thread_id, org_id)")
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS note_thread_reads (
                  thread_id TEXT NOT NULL,
                  user_id TEXT NOT NULL,
                  last_read_at INTEGER NOT NULL DEFAULT 0,
                  last_seen_comment_id TEXT DEFAULT '',
                  updated_at INTEGER NOT NULL DEFAULT 0,
                  PRIMARY KEY (thread_id, user_id)
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_note_thread_reads_user_updated ON note_thread_reads(user_id, updated_at DESC)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_note_thread_reads_thread ON note_thread_reads(thread_id)")
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
                  responsible_user_id TEXT,
                  context_status TEXT NOT NULL DEFAULT 'none',
                  responsible_assigned_at REAL,
                  responsible_assigned_by TEXT,
                  created_by TEXT NOT NULL DEFAULT '',
                  created_at INTEGER NOT NULL DEFAULT 0,
                  updated_at INTEGER NOT NULL DEFAULT 0,
                  archived_at INTEGER
                )
                """
            )
            if not _column_exists(con, "workspace_folders", "workspace_id"):
                con.execute("ALTER TABLE workspace_folders ADD COLUMN workspace_id TEXT NOT NULL DEFAULT ''")
            if not _column_exists(con, "workspace_folders", "responsible_user_id"):
                con.execute("ALTER TABLE workspace_folders ADD COLUMN responsible_user_id TEXT")
            if not _column_exists(con, "workspace_folders", "context_status"):
                con.execute("ALTER TABLE workspace_folders ADD COLUMN context_status TEXT NOT NULL DEFAULT 'none'")
            if not _column_exists(con, "workspace_folders", "responsible_assigned_at"):
                con.execute("ALTER TABLE workspace_folders ADD COLUMN responsible_assigned_at REAL")
            if not _column_exists(con, "workspace_folders", "responsible_assigned_by"):
                con.execute("ALTER TABLE workspace_folders ADD COLUMN responsible_assigned_by TEXT")
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
            if not _column_exists(con, "projects", "executor_user_id"):
                con.execute("ALTER TABLE projects ADD COLUMN executor_user_id TEXT")
            con.execute("CREATE INDEX IF NOT EXISTS idx_projects_org_workspace_folder ON projects(org_id, workspace_id, folder_id)")
            from ....recipe.storage import _ensure_recipe_tables
            _ensure_recipe_tables(con)
            _maybe_migrate_legacy_files(con)
            _ensure_auth_users_backfill(con)
            _ensure_enterprise_bootstrap(con)
            _ensure_org_workspaces_bootstrap(con)
            _ensure_workspace_folder_backfill(con)
            # ── RAG tables ───────────────────────────────────────────────────────────
            con.execute("""
                CREATE TABLE IF NOT EXISTS rag_documents (
                    doc_id          TEXT PRIMARY KEY,
                    org_id          TEXT NOT NULL,
                    source_type     TEXT NOT NULL,
                    source_id       TEXT NOT NULL,
                    source_version  INTEGER,
                    content_hash    TEXT NOT NULL,
                    content_text    TEXT NOT NULL,
                    metadata_json   TEXT NOT NULL DEFAULT '{}',
                    created_at      INTEGER NOT NULL,
                    updated_at      INTEGER NOT NULL,
                    is_active       INTEGER NOT NULL DEFAULT 1
                )
            """)
            con.execute("""
                CREATE TABLE IF NOT EXISTS rag_chunks (
                    chunk_id        TEXT PRIMARY KEY,
                    doc_id          TEXT NOT NULL,
                    org_id          TEXT NOT NULL,
                    chunk_index     INTEGER NOT NULL,
                    chunk_text      TEXT NOT NULL,
                    token_count     INTEGER,
                    metadata_json   TEXT NOT NULL DEFAULT '{}',
                    created_at      INTEGER NOT NULL
                )
            """)
            con.execute("""
                CREATE TABLE IF NOT EXISTS rag_embeddings (
                    embedding_id    TEXT PRIMARY KEY,
                    chunk_id        TEXT NOT NULL,
                    org_id          TEXT NOT NULL,
                    model_id        TEXT NOT NULL,
                    vector_data     BYTEA,
                    created_at      INTEGER NOT NULL
                )
            """)
            con.execute("""
                CREATE TABLE IF NOT EXISTS rag_sources (
                    source_id       TEXT PRIMARY KEY,
                    org_id          TEXT NOT NULL,
                    source_type     TEXT NOT NULL,
                    display_name    TEXT NOT NULL,
                    is_enabled      INTEGER NOT NULL DEFAULT 1,
                    last_indexed_at INTEGER,
                    index_error     TEXT,
                    config_json     TEXT NOT NULL DEFAULT '{}'
                )
            """)
            con.execute("""
                CREATE TABLE IF NOT EXISTS rag_feedback (
                    feedback_id     TEXT PRIMARY KEY,
                    org_id          TEXT NOT NULL,
                    query_id        TEXT NOT NULL,
                    chunk_id        TEXT NOT NULL,
                    rating          INTEGER NOT NULL,
                    actor_user_id   TEXT NOT NULL,
                    created_at      INTEGER NOT NULL
                )
            """)
            con.execute("""
                CREATE TABLE IF NOT EXISTS rag_eval_cases (
                    eval_id                 TEXT PRIMARY KEY,
                    org_id                  TEXT NOT NULL,
                    query_text              TEXT NOT NULL,
                    expected_chunk_ids_json TEXT NOT NULL DEFAULT '[]',
                    tags_json               TEXT NOT NULL DEFAULT '[]',
                    created_at              INTEGER NOT NULL
                )
            """)
            con.execute("CREATE INDEX IF NOT EXISTS idx_rag_docs_org_source ON rag_documents(org_id, source_type, source_id)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_rag_docs_hash ON rag_documents(content_hash)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_rag_docs_active ON rag_documents(org_id, is_active)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_rag_chunks_doc ON rag_chunks(doc_id)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_rag_chunks_org ON rag_chunks(org_id)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_rag_embed_chunk ON rag_embeddings(chunk_id)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_rag_embed_org_model ON rag_embeddings(org_id, model_id)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_rag_sources_org ON rag_sources(org_id, source_type)")
            con.execute("""
                CREATE TABLE IF NOT EXISTS rag_settings (
                    org_id                  TEXT PRIMARY KEY,
                    enabled                 INTEGER NOT NULL DEFAULT 1,
                    indexing_enabled        INTEGER NOT NULL DEFAULT 1,
                    default_top_k           INTEGER NOT NULL DEFAULT 10,
                    max_top_k               INTEGER NOT NULL DEFAULT 50,
                    default_min_score       REAL,
                    allowed_source_types    TEXT NOT NULL DEFAULT '["bpmn_xml","product_action"]',
                    show_technical_fragments INTEGER NOT NULL DEFAULT 0,
                    updated_at              INTEGER NOT NULL DEFAULT 0,
                    updated_by              TEXT NOT NULL DEFAULT ''
                )
            """)
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS feature_flags (
                    key         TEXT PRIMARY KEY,
                    value       TEXT NOT NULL DEFAULT '',
                    description TEXT NOT NULL DEFAULT '',
                    updated_at  INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_feature_flags_updated_at ON feature_flags(updated_at)")
            con.execute(
                """
                INSERT OR IGNORE INTO feature_flags (key, value, description, updated_at)
                VALUES (?, ?, ?, ?)
                """,
                ["lightweightOverlays", "false", "Enable lightweight JSON overlays instead of monolithic XML", int(time.time())],
            )
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS analytics_session_snapshots (
                  session_id TEXT PRIMARY KEY,
                  org_id TEXT NOT NULL,
                  project_id TEXT,
                  workspace_id TEXT,
                  total_duration_min INTEGER NOT NULL DEFAULT 0,
                  critical_path_min INTEGER,
                  actions_total INTEGER NOT NULL DEFAULT 0,
                  elements_count INTEGER NOT NULL DEFAULT 0,
                  actions_by_role_json TEXT NOT NULL DEFAULT '{}',
                  actions_by_section_json TEXT NOT NULL DEFAULT '{}',
                  actions_by_type_json TEXT NOT NULL DEFAULT '{}',
                  handoffs_count INTEGER NOT NULL DEFAULT 0,
                  open_questions INTEGER NOT NULL DEFAULT 0,
                  critical_questions INTEGER NOT NULL DEFAULT 0,
                  unknown_duration_nodes_json TEXT NOT NULL DEFAULT '[]',
                  computed_at INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            if not _column_exists(con, "analytics_session_snapshots", "elements_count"):
                con.execute(
                    "ALTER TABLE analytics_session_snapshots ADD COLUMN elements_count INTEGER NOT NULL DEFAULT 0"
                )
            con.execute(
                "CREATE INDEX IF NOT EXISTS idx_analytics_session_org_project ON analytics_session_snapshots(org_id, project_id)"
            )
            con.execute(
                "CREATE INDEX IF NOT EXISTS idx_analytics_session_org_workspace ON analytics_session_snapshots(org_id, workspace_id)"
            )
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS analytics_project_snapshots (
                  project_id TEXT PRIMARY KEY,
                  org_id TEXT NOT NULL,
                  workspace_id TEXT,
                  sessions_count INTEGER NOT NULL DEFAULT 0,
                  total_actions INTEGER NOT NULL DEFAULT 0,
                  avg_duration_min REAL NOT NULL DEFAULT 0,
                  total_critical_questions INTEGER NOT NULL DEFAULT 0,
                  handoffs_count INTEGER NOT NULL DEFAULT 0,
                  computed_at INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            con.execute(
                "CREATE INDEX IF NOT EXISTS idx_analytics_project_org_workspace ON analytics_project_snapshots(org_id, workspace_id)"
            )
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS analytics_workspace_snapshots (
                  workspace_id TEXT PRIMARY KEY,
                  org_id TEXT NOT NULL,
                  projects_count INTEGER NOT NULL DEFAULT 0,
                  sessions_count INTEGER NOT NULL DEFAULT 0,
                  total_actions INTEGER NOT NULL DEFAULT 0,
                  avg_duration_min REAL NOT NULL DEFAULT 0,
                  total_critical_questions INTEGER NOT NULL DEFAULT 0,
                  handoffs_count INTEGER NOT NULL DEFAULT 0,
                  computed_at INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            con.execute(
                "CREATE INDEX IF NOT EXISTS idx_analytics_workspace_org ON analytics_workspace_snapshots(org_id)"
            )
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS analytics_metrics (
                  id TEXT PRIMARY KEY,
                  scope_type TEXT NOT NULL,
                  scope_id TEXT NOT NULL,
                  metric_name TEXT NOT NULL,
                  metric_value_json TEXT NOT NULL DEFAULT '{}',
                  computed_at INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            con.execute(
                "CREATE INDEX IF NOT EXISTS idx_analytics_metrics_scope ON analytics_metrics(scope_type, scope_id, metric_name)"
            )
            # Migrate legacy role-only admin_entity_permissions to principal model.
            if _table_exists(con, "admin_entity_permissions") and not _column_exists(con, "admin_entity_permissions", "principal_type"):
                con.execute(
                    """
                    CREATE TABLE admin_entity_permissions_new (
                      org_id TEXT NOT NULL,
                      principal_type TEXT NOT NULL,
                      principal_id TEXT NOT NULL,
                      entity_type TEXT NOT NULL,
                      entity_id TEXT NOT NULL,
                      permissions_json TEXT NOT NULL DEFAULT '{}',
                      updated_at INTEGER NOT NULL DEFAULT 0,
                      updated_by TEXT NOT NULL DEFAULT '',
                      PRIMARY KEY (org_id, principal_type, principal_id, entity_type, entity_id)
                    )
                    """
                )
                con.execute(
                    """
                    INSERT INTO admin_entity_permissions_new
                      (org_id, principal_type, principal_id, entity_type, entity_id, permissions_json, updated_at, updated_by)
                    SELECT org_id, 'role', role, entity_type, entity_id, permissions_json, updated_at, updated_by
                    FROM admin_entity_permissions
                    """
                )
                con.execute("DROP TABLE admin_entity_permissions")
                con.execute("ALTER TABLE admin_entity_permissions_new RENAME TO admin_entity_permissions")
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS admin_entity_permissions (
                  org_id TEXT NOT NULL,
                  principal_type TEXT NOT NULL,
                  principal_id TEXT NOT NULL,
                  entity_type TEXT NOT NULL,
                  entity_id TEXT NOT NULL,
                  permissions_json TEXT NOT NULL DEFAULT '{}',
                  updated_at INTEGER NOT NULL DEFAULT 0,
                  updated_by TEXT NOT NULL DEFAULT '',
                  PRIMARY KEY (org_id, principal_type, principal_id, entity_type, entity_id)
                )
                """
            )
            con.execute(
                "CREATE INDEX IF NOT EXISTS idx_admin_entity_permissions_org ON admin_entity_permissions(org_id)"
            )
            con.execute(
                "CREATE INDEX IF NOT EXISTS idx_admin_entity_permissions_principal ON admin_entity_permissions(principal_type, principal_id)"
            )
            if not _column_exists(con, "org_invites", "permissions_json"):
                con.execute("ALTER TABLE org_invites ADD COLUMN permissions_json TEXT NOT NULL DEFAULT '{}'")
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS deployment_notices (
                  id TEXT PRIMARY KEY,
                  message TEXT NOT NULL DEFAULT '',
                  scheduled_at INTEGER NOT NULL DEFAULT 0,
                  display_duration_minutes INTEGER NOT NULL DEFAULT 0,
                  is_active INTEGER NOT NULL DEFAULT 1,
                  created_by TEXT NOT NULL DEFAULT '',
                  created_at INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            con.execute(
                "CREATE INDEX IF NOT EXISTS idx_deployment_notices_active ON deployment_notices(is_active, scheduled_at)"
            )
            _SCHEMA_ENSURE_IN_PROGRESS = True
            try:
                _seed_process_property_metadata(con)
                _seed_reference_tables(con)
            finally:
                _SCHEMA_ENSURE_IN_PROGRESS = False
            con.commit()
        _SCHEMA_READY = True
        _SCHEMA_DB_FILE = db_file


def _error_event_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": str(row["id"] or ""),
        "schema_version": int(row["schema_version"] or 1),
        "occurred_at": int(row["occurred_at"] or 0),
        "ingested_at": int(row["ingested_at"] or 0),
        "source": str(row["source"] or ""),
        "event_type": str(row["event_type"] or ""),
        "severity": str(row["severity"] or "error"),
        "message": str(row["message"] or ""),
        "user_id": str(row["user_id"] or "") if row["user_id"] is not None else "",
        "org_id": str(row["org_id"] or "") if row["org_id"] is not None else "",
        "session_id": str(row["session_id"] or "") if row["session_id"] is not None else "",
        "project_id": str(row["project_id"] or "") if row["project_id"] is not None else "",
        "route": str(row["route"] or "") if row["route"] is not None else "",
        "runtime_id": str(row["runtime_id"] or "") if row["runtime_id"] is not None else "",
        "tab_id": str(row["tab_id"] or "") if row["tab_id"] is not None else "",
        "request_id": str(row["request_id"] or "") if row["request_id"] is not None else "",
        "correlation_id": str(row["correlation_id"] or "") if row["correlation_id"] is not None else "",
        "app_version": str(row["app_version"] or "") if row["app_version"] is not None else "",
        "git_sha": str(row["git_sha"] or "") if row["git_sha"] is not None else "",
        "fingerprint": str(row["fingerprint"] or ""),
        "context_json": _json_loads(row["context_json"], {}),
    }


def _get_auth_user_by_email_with_connection(con: Any, email: str) -> Optional[Dict[str, Any]]:
    em = _normalize_email(email)
    if not em:
        return None
    role_col = ", role" if _users_has_role_column(con) else ""
    row = con.execute(
        f"""
        SELECT id, email, password_hash, is_active, is_admin, created_at, updated_at,
               activation_pending, activated_at, activation_required, activation_token_hash,
               activation_expires_at, full_name, job_title{role_col}
          FROM users
         WHERE email = ?
         LIMIT 1
        """,
        [em],
    ).fetchone()
    return _auth_user_row_to_dict(row) if row else None


def _get_auth_user_by_id_with_connection(con: Any, user_id: str) -> Optional[Dict[str, Any]]:
    uid = str(user_id or "").strip()
    if not uid:
        return None
    role_col = ", role" if _users_has_role_column(con) else ""
    row = con.execute(
        f"""
        SELECT id, email, password_hash, is_active, is_admin, created_at, updated_at,
               activation_pending, activated_at, activation_required, activation_token_hash,
               activation_expires_at, full_name, job_title{role_col}
          FROM users
         WHERE id = ?
         LIMIT 1
        """,
        [uid],
    ).fetchone()
    return _auth_user_row_to_dict(row) if row else None


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


def _hash_invite_token(token: str) -> str:
    return hashlib.sha256(str(token or "").encode("utf-8")).hexdigest()


def _invite_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    keys = set(row.keys()) if hasattr(row, "keys") else set()

    def _col(name: str, default: Any = "") -> Any:
        return row[name] if name in keys else default

    role = _normalize_org_invite_role(_col("role"))
    payload = {
        "id": str(_col("id") or ""),
        "org_id": str(_col("org_id") or ""),
        "org_name": str(_col("org_name") or _col("org_id") or ""),
        "email": _normalize_email(_col("email")),
        "role": role,
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
        "permissions_json": _json_loads(_col("permissions_json"), {}),
        "permissions": _normalize_membership_permissions(role, _col("permissions_json")),
        "invite_mode": "one_time",
    }
    payload["status"] = _invite_status(payload)
    if not payload.get("used_at") and payload.get("accepted_at"):
        payload["used_at"] = payload.get("accepted_at")
    if not payload.get("used_by_user_id") and payload.get("accepted_by"):
        payload["used_by_user_id"] = payload.get("accepted_by")
    payload["used_by"] = payload.get("used_by_user_id")
    return payload


def _invite_status(row: Dict[str, Any]) -> str:
    now = _now_ts()
    if int(row.get("revoked_at") or 0) > 0:
        return "revoked"
    if int(row.get("used_at") or row.get("accepted_at") or 0) > 0:
        return "used"
    if int(row.get("expires_at") or 0) > 0 and int(row.get("expires_at") or 0) < now:
        return "expired"
    return "pending"


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


def _json_text(value: Any) -> str:
    return _json_dumps(value, None)


def _legacy_projects_dir() -> Path:
    root = str(os.environ.get("PROJECT_STORAGE_DIR", "") or "").strip()
    if root:
        return Path(root)
    return Path("/app/workspace/projects")


def _legacy_sessions_dir() -> Path:
    base = str(os.environ.get("PROCESS_STORAGE_DIR", "workspace/.session_store") or "").strip()
    return Path(base)


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


def _merge_auth_user_profile_with_connection(
    con: Any,
    user_id: str,
    *,
    full_name: str = "",
    job_title: str = "",
) -> Optional[Dict[str, Any]]:
    current = _get_auth_user_by_id_with_connection(con, user_id)
    if not current:
        return None
    next_full_name = str(current.get("full_name") or "").strip()
    next_job_title = str(current.get("job_title") or "").strip()
    incoming_full_name = str(full_name or "").strip()
    incoming_job_title = str(job_title or "").strip()
    changed = False
    if incoming_full_name and not next_full_name:
        next_full_name = incoming_full_name
        changed = True
    if incoming_job_title and not next_job_title:
        next_job_title = incoming_job_title
        changed = True
    if not changed:
        return current
    now = _now_ts()
    con.execute(
        """
        UPDATE users
           SET full_name = ?, job_title = ?, updated_at = ?
         WHERE id = ?
        """,
        [next_full_name, next_job_title, now, str(current.get("id") or "")],
    )
    updated = dict(current)
    updated["full_name"] = next_full_name
    updated["job_title"] = next_job_title
    updated["updated_at"] = now
    return updated


def _named_to_pyformat(sql: str) -> str:
    # Keep PostgreSQL casts (::) intact.
    return re.sub(r"(?<!:):([A-Za-z_][A-Za-z0-9_]*)", r"%(\1)s", sql)


def _normalize_email(raw: Any) -> str:
    return str(raw or "").strip().lower()


def _normalize_git_mirror_health_status(value: Any) -> str:
    status = str(value or "").strip().lower()
    return status if status in _GIT_MIRROR_HEALTH_STATUSES else "unknown"


def _normalize_git_mirror_provider(value: Any) -> str:
    provider = str(value or "").strip().lower()
    return provider if provider in _GIT_MIRROR_PROVIDERS else ""


def _normalize_note_scope(scope_type: Any, scope_ref: Any) -> Tuple[str, Dict[str, Any]]:
    normalized_type = str(scope_type or "").strip().lower()
    if normalized_type not in NOTE_SCOPE_TYPES:
        raise ValueError("invalid scope_type")
    raw_ref = scope_ref if isinstance(scope_ref, dict) else {}
    if normalized_type == "diagram_element":
        element_id = str(raw_ref.get("element_id") or "").strip()
        if not element_id:
            raise ValueError("element_id required")
        return normalized_type, {"element_id": element_id}
    return normalized_type, {}


def _normalize_org_invite_role(raw: Any) -> str:
    role = _normalize_org_membership_role(raw)
    if role not in _ORG_INVITE_ROLES:
        return "org_viewer"
    return role


def _now_ts() -> int:
    return int(datetime.now(timezone.utc).timestamp())


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
        "executor_user_id": str((row["executor_user_id"] if "executor_user_id" in keys else "") or "").strip() or None,
        "org_id": str((row["org_id"] if "org_id" in keys else "") or ""),
        "created_by": str((row["created_by"] if "created_by" in keys else "") or ""),
        "updated_by": str((row["updated_by"] if "updated_by" in keys else "") or ""),
        "workspace_id": str((row["workspace_id"] if "workspace_id" in keys else "") or ""),
        "folder_id": str((row["folder_id"] if "folder_id" in keys else "") or ""),
    }
    return Project.model_validate(payload)


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


def _read_legacy_json(path: Path) -> Dict[str, Any] | None:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    return raw if isinstance(raw, dict) else None


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return dict(row)


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


def _scope_is_admin(override_is_admin: Optional[bool] = None) -> bool:
    if override_is_admin is not None:
        return bool(override_is_admin)
    return bool(_REQ_IS_ADMIN.get(False))


def _scope_org_id(override_org_id: str | None = None) -> str:
    if override_org_id is not None:
        return str(override_org_id or "").strip()
    return str(_REQ_ORG_ID.get("") or "").strip()


def _scope_user_id(override_user_id: str | None = None) -> str:
    if override_user_id is not None:
        return str(override_user_id or "").strip()
    return str(_REQ_USER_ID.get("") or "").strip()


def _session_read_scope(
    user_id: Optional[str],
    org_id: Optional[str],
    is_admin: Optional[bool],
) -> Dict[str, Any]:
    """Return session read access scope for a user/org context.

    - mode "all": user may read sessions across the org.
    - mode "owner": user may only read sessions they own.
    - mode "scoped": user may read sessions in the listed project_ids.
    """
    admin = bool(is_admin)
    if admin:
        return {"mode": "all", "project_ids": []}

    uid = str(user_id or "").strip()
    oid = str(org_id or "").strip()
    if not uid or not oid:
        return {"mode": "owner", "project_ids": []}

    role = str(get_user_org_role(uid, oid, is_admin=admin) or "").strip().lower()
    if role in _ORG_FULL_ACCESS_ROLES:
        return {"mode": "all", "project_ids": []}

    scope = get_effective_project_scope(uid, oid, is_admin=admin)
    project_ids = [
        str(item).strip()
        for item in (scope.get("project_ids") or [])
        if str(item or "").strip()
    ]
    if project_ids:
        return {"mode": "scoped", "project_ids": project_ids}

    # Org-level editors/managers without explicit project assignments may read
    # any session in the org. This matches can_edit_workspace and fixes the case
    # where a user has an org editor role (or gets one via default-org auto-membership)
    # but has not been assigned to individual projects yet.
    if role in _SESSION_ORG_WIDE_READ_ROLES:
        return {"mode": "all", "project_ids": []}

    return {"mode": "owner", "project_ids": []}


def _session_read_scope_filter(
    scope: Dict[str, Any], owner_user_id: str
) -> Tuple[str, List[Any]]:
    """Build a SQL filter and parameters enforcing a session read scope."""
    mode = str(scope.get("mode") or "").strip().lower()
    if mode == "all":
        return "", []
    if mode == "owner":
        if not owner_user_id:
            return "", []
        return "owner_user_id = ?", [owner_user_id]
    # scoped
    project_ids = [
        str(item).strip()
        for item in (scope.get("project_ids") or [])
        if str(item or "").strip()
    ]
    if project_ids:
        placeholders = ", ".join("?" for _ in project_ids)
        if owner_user_id:
            return f"(owner_user_id = ? OR project_id IN ({placeholders}))", [
                owner_user_id,
                *project_ids,
            ]
        return f"project_id IN ({placeholders})", project_ids
    if owner_user_id:
        return "owner_user_id = ?", [owner_user_id]
    return "1 = 0", []


def _session_read_scope_filters(
    user_id: Optional[str],
    is_admin: Optional[bool],
    org_id: Optional[str],
) -> Tuple[List[str], List[Any]]:
    """Return (filter_expressions, params) for session read scope."""
    owner = _scope_user_id(user_id)
    admin = _scope_is_admin(is_admin)
    org = _scope_org_id(org_id) or _default_org_id()
    read_scope = _session_read_scope(owner, org, admin)
    mode = str(read_scope.get("mode") or "").strip()
    if mode == "all":
        return [], []
    if mode == "owner":
        if owner:
            return ["owner_user_id = ?"], [owner]
        return ["1 = 0"], []
    # scoped
    allowed = [
        str(item or "").strip()
        for item in (read_scope.get("project_ids") or [])
        if str(item or "").strip()
    ]
    if allowed and owner:
        placeholders = ", ".join(["?"] * len(allowed))
        return [f"(owner_user_id = ? OR project_id IN ({placeholders}))"], [owner, *allowed]
    if owner:
        return ["owner_user_id = ?"], [owner]
    return ["1 = 0"], []


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
        "diagram_state_version": int((row["diagram_state_version"] if "diagram_state_version" in keys else 0) or 0),
        "diagram_last_write_actor_user_id": str((row["diagram_last_write_actor_user_id"] if "diagram_last_write_actor_user_id" in keys else "") or ""),
        "diagram_last_write_actor_label": str((row["diagram_last_write_actor_label"] if "diagram_last_write_actor_label" in keys else "") or ""),
        "diagram_last_write_client_id": str((row["diagram_last_write_client_id"] if "diagram_last_write_client_id" in keys else "") or ""),
        "diagram_last_write_at": int((row["diagram_last_write_at"] if "diagram_last_write_at" in keys else 0) or 0),
        "diagram_last_write_changed_keys": _json_loads(
            (row["diagram_last_write_changed_keys_json"] if "diagram_last_write_changed_keys_json" in keys else "[]"),
            [],
        ),
        "bpmn_graph_fingerprint": str(row["bpmn_graph_fingerprint"] or ""),
        "bpmn_meta": _json_loads(row["bpmn_meta_json"], {}),
        "version": int(row["version"] or 0),
        "owner_user_id": str(row["owner_user_id"] or ""),
        "org_id": str((row["org_id"] if "org_id" in keys else "") or ""),
        "created_by": str((row["created_by"] if "created_by" in keys else "") or ""),
        "updated_by": str((row["updated_by"] if "updated_by" in keys else "") or ""),
        "created_at": int(row["created_at"] or 0),
        "updated_at": int(row["updated_at"] or 0),
        "navigation_stack": _json_loads(
            (row["navigation_stack"] if "navigation_stack" in keys else "[]") or "[]",
            [],
        ),
        "parent_session_id": str((row["parent_session_id"] if "parent_session_id" in keys else "") or ""),
        "element_id_in_parent": str((row["element_id_in_parent"] if "element_id_in_parent" in keys else "") or ""),
        "process_layer": str((row["process_layer"] if "process_layer" in keys else "as_is") or "as_is"),
        "derived_from_session_id": str((row["derived_from_session_id"] if "derived_from_session_id" in keys else "") or ""),
        "activity_count": int((row["activity_count"] if "activity_count" in keys else 0) or 0),
        "deleted_at": int((row["deleted_at"] if "deleted_at" in keys else 0) or 0),
        "rag_readiness_status": str((row["rag_readiness_status"] if "rag_readiness_status" in keys else "not_ready") or "not_ready"),
        "rag_queued_at": int(row["rag_queued_at"]) if ("rag_queued_at" in keys and row["rag_queued_at"] is not None) else None,
        "rag_indexed_at": int(row["rag_indexed_at"]) if ("rag_indexed_at" in keys and row["rag_indexed_at"] is not None) else None,
    }
    return Session.model_validate(payload)


def _suggestion_row_to_dict(row: Any) -> Dict[str, Any]:
    keys = set(row.keys())
    return {
        "id": str(row["id"] or ""),
        "session_id": str(row["session_id"] or ""),
        "status": str(row["status"] or "pending"),
        "source": str(row["source"] or "llm"),
        "original_llm_output": _json_loads(
            (row["original_llm_output"] if "original_llm_output" in keys else "{}") or "{}", {}
        ),
        "action": _json_loads((row["action"] if "action" in keys else "{}") or "{}", {}),
        "binding": _json_loads((row["binding"] if "binding" in keys else "{}") or "{}", {}),
        "edited_by_user": int((row["edited_by_user"] if "edited_by_user" in keys else 0) or 0),
        "created_at": int((row["created_at"] if "created_at" in keys else 0) or 0),
        "updated_at": int((row["updated_at"] if "updated_at" in keys else 0) or 0),
    }


def _table_exists(con: Any, table: str) -> bool:
    if isinstance(con, _PgCompatConnection):
        # PG: нельзя probing-запросом `SELECT 1 FROM <table>` — на отсутствующей
        # таблице он бросает UndefinedTable и abort'ит всю транзакцию
        # (свежая БД: _ensure_schema падал с InFailedSqlTransaction, crash-loop api).
        # information_schema-запрос безопасен: не бросает на missing table.
        rows = con.execute(
            "SELECT 1 FROM information_schema.tables"
            " WHERE table_schema = current_schema() AND table_name = %s LIMIT 1",
            [table],
        ).fetchall()
        return bool(rows)
    try:
        con.execute(f"SELECT 1 FROM {table} LIMIT 1")
        return True
    except Exception:
        return False


def _thread_attention_acknowledged_at(con: Any, thread_id: str, org_id: str, viewer_user_id: Optional[str]) -> int:
    viewer = str(viewer_user_id or "").strip()
    tid = str(thread_id or "").strip()
    oid = str(org_id or "").strip()
    if not viewer or not tid or not oid:
        return 0
    row = con.execute(
        """
        SELECT acknowledged_at
        FROM note_thread_attention_acknowledgements
        WHERE thread_id = ? AND org_id = ? AND user_id = ?
        LIMIT 1
        """,
        [tid, oid, viewer],
    ).fetchone()
    return int(_row_value(row, "acknowledged_at", 0) or 0)


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

    had_insert_replace = bool(re.search(r"\bINSERT\s+OR\s+REPLACE\s+INTO\b", sql, flags=re.IGNORECASE))
    if had_insert_replace:
        m = re.search(r"\bINSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*\(([^)]+)\)", sql, flags=re.IGNORECASE)
        if m and "ON CONFLICT" not in sql.upper():
            cols_raw = [c.strip() for c in m.group(2).split(",")]
            pk = cols_raw[0] if cols_raw else "id"
            update_cols = cols_raw[1:]
            sql = re.sub(r"\bINSERT\s+OR\s+REPLACE\s+INTO\b", "INSERT INTO", sql, flags=re.IGNORECASE)
            stripped = sql.rstrip()
            if stripped.endswith(";"):
                stripped = stripped[:-1]
            if update_cols:
                set_clause = ", ".join(f"{c} = EXCLUDED.{c}" for c in update_cols)
                sql = f"{stripped} ON CONFLICT ({pk}) DO UPDATE SET {set_clause}"
            else:
                sql = f"{stripped} ON CONFLICT ({pk}) DO NOTHING"

    if isinstance(params, Mapping):
        return _named_to_pyformat(sql), dict(params)
    return _qmark_to_pyformat(sql), (list(params) if params is not None else [])


def _users_has_role_column(con: Any) -> bool:
    """True if users.role exists (alembic 001 applied). Cached per process."""
    global _USERS_ROLE_COLUMN_CACHE
    if _USERS_ROLE_COLUMN_CACHE is None:
        try:
            row = con.execute(
                "SELECT COUNT(*) AS c FROM information_schema.columns "
                "WHERE table_name = 'users' AND column_name = 'role'"
            ).fetchone()
            _USERS_ROLE_COLUMN_CACHE = bool(row and int(_row_value(row, "c") or 0) > 0)
        except Exception:
            _USERS_ROLE_COLUMN_CACHE = False
    return _USERS_ROLE_COLUMN_CACHE


def delete_admin_entity_permission(
    org_id: str,
    entity_type: str,
    entity_id: str,
    principal_type: Optional[str] = None,
    principal_id: Optional[str] = None,
    role: Optional[str] = None,
) -> bool:
    ptype = str(principal_type or "role").strip()
    pid = str(principal_id or role or "").strip()
    if not ptype or not pid:
        raise ValueError("principal_type/principal_id or role is required")
    with _connect() as con:
        cur = con.execute(
            "DELETE FROM admin_entity_permissions WHERE org_id = ? AND principal_type = ? AND principal_id = ? AND entity_type = ? AND entity_id = ?",
            (org_id, ptype, pid, entity_type, entity_id),
        )
        con.commit()
        return cur.rowcount > 0


def delete_admin_entity_permission_by_role(org_id: str, entity_type: str, entity_id: str, role: str) -> bool:
    return delete_admin_entity_permission(org_id, entity_type, entity_id, principal_type="role", principal_id=role)


def gen_project_id() -> str:
    return uuid.uuid4().hex[:10]


def get_admin_invite_permissions(invite_id: str) -> Dict[str, bool]:
    with _connect() as con:
        row = con.execute("SELECT permissions_json, role FROM org_invites WHERE id = ?", (invite_id,)).fetchone()
    if not row:
        return {}
    role = str(row["role"] or "org_viewer")
    return _normalize_membership_permissions(role, row["permissions_json"])


def get_auth_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    _ensure_schema()
    with _connect() as con:
        return _get_auth_user_by_email_with_connection(con, email)


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


def list_admin_entity_permissions(
    org_id: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    principal_type: Optional[str] = None,
    principal_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    params: List[Any] = [org_id]
    where = "org_id = ?"
    if entity_type:
        where += " AND entity_type = ?"
        params.append(entity_type)
    if entity_id:
        where += " AND entity_id = ?"
        params.append(entity_id)
    if principal_type:
        where += " AND principal_type = ?"
        params.append(principal_type)
    if principal_id:
        where += " AND principal_id = ?"
        params.append(principal_id)
    with _connect() as con:
        rows = con.execute(f"SELECT * FROM admin_entity_permissions WHERE {where}", params).fetchall()
    out: List[Dict[str, Any]] = []
    for row in rows:
        ptype = str(row["principal_type"] or "")
        pid = str(row["principal_id"] or "")
        etype = str(row["entity_type"] or "")
        out.append({
            "org_id": str(row["org_id"] or ""),
            "principal_type": ptype,
            "principal_id": pid,
            "entity_type": etype,
            "entity_id": str(row["entity_id"] or ""),
            "role": pid if ptype == "role" else "",
            "permissions": _normalize_admin_entity_permissions(etype, ptype, pid, row["permissions_json"]),
            "updated_at": int(row["updated_at"] or 0),
            "updated_by": str(row["updated_by"] or ""),
        })
    return out


def list_auth_users() -> List[Dict[str, Any]]:
    _ensure_schema()
    with _connect() as con:
        rows = con.execute(
            """
            SELECT id, email, password_hash, is_active, is_admin, created_at, updated_at,
                   activation_pending, activated_at, activation_required, activation_token_hash,
                   activation_expires_at, full_name, job_title
              FROM users
             ORDER BY email ASC, id ASC
            """
        ).fetchall()
    return [_auth_user_row_to_dict(row) for row in rows]


def list_org_workspace_folders(org_id: str, workspace_id: Optional[str] = None) -> List[Dict[str, Any]]:
    params: List[Any] = [org_id]
    where = "org_id = ?"
    if workspace_id:
        where += " AND workspace_id = ?"
        params.append(workspace_id)
    with _connect() as con:
        rows = con.execute(
            f"SELECT * FROM workspace_folders WHERE {where} ORDER BY name",
            params,
        ).fetchall()
    return [dict(row) for row in rows]


def list_org_workspaces(org_id: str) -> List[Dict[str, Any]]:
    with _connect() as con:
        rows = con.execute(
            "SELECT * FROM workspaces WHERE org_id = ? ORDER BY name",
            (org_id,),
        ).fetchall()
    return [dict(row) for row in rows]


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


logger = logging.getLogger(__name__)


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


def push_storage_request_scope(user_id: str | None, is_admin: bool = False, org_id: str | None = None) -> Tuple[Any, Any, Any]:
    token_uid = _REQ_USER_ID.set(str(user_id or "").strip())
    token_admin = _REQ_IS_ADMIN.set(bool(is_admin))
    token_org = _REQ_ORG_ID.set(str(org_id or "").strip())
    return token_uid, token_admin, token_org


def save_auth_users(users: List[Dict[str, Any]]) -> None:
    _ensure_schema()
    with _connect() as con:
        for row in list(users or []):
            if isinstance(row, Mapping):
                _upsert_auth_user(con, row)
        con.commit()


def set_admin_invite_permissions(invite_id: str, permissions: Dict[str, bool]) -> bool:
    with _connect() as con:
        row = con.execute("SELECT role FROM org_invites WHERE id = ?", (invite_id,)).fetchone()
        if not row:
            return False
        role = str(row["role"] or "org_viewer")
        normalized = _normalize_membership_permissions(role, permissions)
        con.execute(
            "UPDATE org_invites SET permissions_json = ? WHERE id = ?",
            (_json_dumps(normalized, {}), invite_id),
        )
        con.commit()
    return True


def startup_db_check() -> Dict[str, Any]:
    info = get_db_runtime_info()
    with _connect() as con:
        row = con.execute("SELECT 1 AS ok").fetchone()
        if row is None:
            raise RuntimeError("database ping failed")
    _ensure_schema()
    return info


def upsert_admin_entity_permission(
    org_id: str,
    entity_type: str,
    entity_id: str,
    permissions: Dict[str, bool],
    updated_by: str,
    principal_type: Optional[str] = None,
    principal_id: Optional[str] = None,
    role: Optional[str] = None,
) -> Dict[str, Any]:
    ptype = str(principal_type or "role").strip()
    pid = str(principal_id or role or "").strip()
    if not ptype or not pid:
        raise ValueError("principal_type/principal_id or role is required")
    normalized = _normalize_admin_entity_permissions(entity_type, ptype, pid, permissions)
    now = _now_ts()
    with _connect() as con:
        con.execute(
            """
            INSERT INTO admin_entity_permissions (org_id, principal_type, principal_id, entity_type, entity_id, permissions_json, updated_at, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (org_id, principal_type, principal_id, entity_type, entity_id)
            DO UPDATE SET permissions_json=excluded.permissions_json, updated_at=excluded.updated_at, updated_by=excluded.updated_by
            """,
            (org_id, ptype, pid, entity_type, entity_id, json.dumps(normalized), now, updated_by),
        )
        con.commit()
    return {
        "org_id": org_id,
        "principal_type": ptype,
        "principal_id": pid,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "role": pid if ptype == "role" else "",
        "permissions": normalized,
        "updated_at": now,
        "updated_by": updated_by,
    }


def upsert_admin_entity_permission_by_role(
    org_id: str,
    entity_type: str,
    entity_id: str,
    role: str,
    permissions: Dict[str, bool],
    updated_by: str,
) -> Dict[str, Any]:
    return upsert_admin_entity_permission(org_id, entity_type, entity_id, permissions, updated_by, principal_type="role", principal_id=role)


def _projectstorage___init__(self, root: Path) -> None:
    self.root = root
    self.root.mkdir(parents=True, exist_ok=True)
    _ensure_schema()


def _projectstorage_create(
    self,
    title: str,
    passport: Dict[str, Any] | None = None,
    *,
    user_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    org_id: Optional[str] = None,
    executor_user_id: Optional[str] = None,
) -> str:
    _ensure_schema()
    _ = _scope_is_admin(is_admin)
    owner = _scope_user_id(user_id)
    org = _scope_org_id(org_id) or _default_org_id()
    workspace_id = _default_workspace_id(org)
    pid = gen_project_id()
    now = _now_ts()
    executor = str(executor_user_id or "").strip() or None
    with _connect() as con:
        _ensure_workspace_record(con, org, created_by=owner)
        con.execute(
            """
            INSERT INTO projects (id, title, passport_json, created_at, updated_at, version, owner_user_id, executor_user_id, org_id, workspace_id, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                pid,
                str(title or "").strip() or "Проект",
                _json_dumps(passport, {}),
                now,
                now,
                1,
                owner,
                executor,
                org,
                workspace_id,
                owner,
                owner,
            ],
        )
        con.commit()
    return pid


def _projectstorage_delete(
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


def _projectstorage_list(
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


def _projectstorage_load(
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


def _projectstorage_save(
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
        existing = con.execute("SELECT owner_user_id, created_at, version, org_id, workspace_id, created_by, executor_user_id FROM projects WHERE id = ? LIMIT 1", [pid]).fetchone()
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
        executor = str(getattr(proj, "executor_user_id", "") or "").strip() or None
        _ensure_workspace_record(con, existing_org or org_scope or _default_org_id(), created_by=created_by)
        con.execute(
            """
            INSERT INTO projects (id, title, passport_json, created_at, updated_at, version, owner_user_id, executor_user_id, org_id, workspace_id, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              title=excluded.title,
              passport_json=excluded.passport_json,
              created_at=excluded.created_at,
              updated_at=excluded.updated_at,
              version=excluded.version,
              owner_user_id=excluded.owner_user_id,
              executor_user_id=excluded.executor_user_id,
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
                executor,
                existing_org or org_scope or _default_org_id(),
                workspace_id,
                created_by,
                updated_by,
            ],
        )
        con.commit()


def _storage___post_init__(self) -> None:
    self.base_dir.mkdir(parents=True, exist_ok=True)
    _ensure_schema()


def _storage__insert_bpmn_version_row(
    self,
    con: Any,
    *,
    session_id: str,
    org_id: str,
    bpmn_xml: str,
    source_action: str,
    diagram_state_version: int,
    session_payload_hash: str,
    session_version: int,
    session_updated_at: int,
    created_by: str,
    import_note: str,
) -> Dict[str, Any]:
    """Insert one bpmn_versions row on an EXISTING connection/transaction.

    version_number is computed as MAX+1 inside the caller's transaction; the
    UNIQUE(session_id, org_id, version_number) index protects against races.
    """
    sid = str(session_id or "").strip()
    scope_org = str(org_id or "").strip() or _default_org_id()
    xml = str(bpmn_xml or "")
    action = str(source_action or "").strip().lower()
    diagram_version = max(0, int(diagram_state_version or 0))
    payload_hash = str(session_payload_hash or "").strip()
    sess_version = max(0, int(session_version or 0))
    sess_updated_at = max(0, int(session_updated_at or 0))
    actor = str(created_by or "").strip()
    note = str(import_note or "").strip()
    now = _now_ts()
    row = con.execute(
        """
        SELECT COALESCE(MAX(version_number), 0) AS max_version
          FROM bpmn_versions
         WHERE session_id = ?
           AND org_id = ?
        """,
        [sid, scope_org],
    ).fetchone()
    next_version = int((_row_value(row, "max_version", 0) if row else 0) or 0) + 1
    snapshot_id = uuid.uuid4().hex[:12]
    con.execute(
        """
        INSERT INTO bpmn_versions (
          id, session_id, org_id, version_number, diagram_state_version, bpmn_xml,
          session_payload_hash, session_version, session_updated_at,
          source_action, import_note, created_at, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            snapshot_id,
            sid,
            scope_org,
            next_version,
            diagram_version,
            xml,
            payload_hash,
            sess_version,
            sess_updated_at,
            action,
            note,
            now,
            actor,
        ],
    )
    return {
        "id": snapshot_id,
        "session_id": sid,
        "org_id": scope_org,
        "version_number": next_version,
        "diagram_state_version": diagram_version,
        "session_payload_hash": payload_hash,
        "session_version": sess_version,
        "session_updated_at": sess_updated_at,
        "source_action": action,
        "created_at": now,
        "created_by": actor,
        "import_note": note,
    }


def _storage_count_bpmn_versions(
    self,
    session_id: str,
    *,
    org_id: Optional[str] = None,
    source_actions: Optional[Iterable[str]] = None,
) -> int:
    sid = str(session_id or "").strip()
    if not sid:
        return 0
    scope_org = str(org_id or "").strip()
    _ensure_schema()
    with _connect() as con:
        sess_row = con.execute("SELECT org_id FROM sessions WHERE id = ? LIMIT 1", [sid]).fetchone()
        if not sess_row:
            return 0
        session_org = str(sess_row["org_id"] or "").strip() or _default_org_id()
        oid = scope_org or session_org
        if oid != session_org:
            return 0
        filters = ["session_id = ?", "org_id = ?"]
        params: List[Any] = [sid, oid]
        actions = [
            str(action or "").strip().lower()
            for action in (source_actions or [])
            if str(action or "").strip()
        ]
        if actions:
            placeholders = ", ".join(["?"] * len(actions))
            filters.append(f"lower(source_action) IN ({placeholders})")
            params.extend(actions)
        where = f"WHERE {' AND '.join(filters)}"
        row = con.execute(
            f"SELECT COUNT(*) AS cnt FROM bpmn_versions {where}",
            params,
        ).fetchone()
    return int((dict(row) if row else {}).get("cnt") or 0)


def _storage_count_note_threads(
    self,
    session_id: str,
    *,
    org_id: Optional[str] = None,
    status: Optional[str] = None,
) -> int:
    sid = str(session_id or "").strip()
    if not sid:
        return 0
    oid = str(org_id or "").strip() or _default_org_id()
    filters = ["session_id = ?", "deleted_at = 0"]
    params: List[Any] = [sid]
    if oid:
        filters.append("org_id = ?")
        params.append(oid)
    normalized_status = None
    if status is not None and str(status or "").strip():
        normalized_status = _normalize_note_status(status)
    if normalized_status:
        filters.append("status = ?")
        params.append(normalized_status)
    where = f"WHERE {' AND '.join(filters)}"
    _ensure_schema()
    with _connect() as con:
        row = con.execute(
            f"SELECT COUNT(*) AS cnt FROM note_threads {where}",
            params,
        ).fetchone()
    return int((dict(row) if row else {}).get("cnt") or 0)


def _storage_create(
    self,
    title: str,
    roles: List[str] | None = None,
    *,
    start_role: Optional[str] = None,
    project_id: Optional[str] = None,
    mode: Optional[str] = None,
    process_layer: Optional[str] = None,
    derived_from_session_id: Optional[str] = None,
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
        diagram_state_version=0,
        version=2,
        owner_user_id=owner,
        org_id=org,
        created_by=owner,
        updated_by=owner,
        created_at=now,
        updated_at=now,
    )
    if process_layer is not None:
        sess.process_layer = str(process_layer or "as_is").strip() or "as_is"
    if derived_from_session_id is not None:
        sess.derived_from_session_id = str(derived_from_session_id or "").strip()
    try:
        self.save(sess, user_id=owner, is_admin=is_admin, org_id=org)
    except Exception as exc:
        if _is_integrity_error(exc):
            # Natural-key unique index (org/project/lower(title)/mode) — race-safe
            # dedup for concurrent creates (audit P3).
            raise SessionTitleConflictError(
                f"session title already exists: {sess.title!r} (project={project_id!r}, mode={mode!r})"
            ) from exc
        raise
    return sid


def _storage_create_bpmn_version_snapshot(
    self,
    session_id: str,
    *,
    bpmn_xml: str,
    source_action: str,
    diagram_state_version: Optional[int] = None,
    session_payload_hash: Optional[str] = None,
    session_version: Optional[int] = None,
    session_updated_at: Optional[int] = None,
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

        result = self._insert_bpmn_version_row(
            con,
            session_id=sid,
            org_id=scope_org,
            bpmn_xml=xml,
            source_action=action,
            diagram_state_version=int(diagram_state_version or 0),
            session_payload_hash=str(session_payload_hash or ""),
            session_version=int(session_version or 0),
            session_updated_at=int(session_updated_at or 0),
            created_by=str(created_by or ""),
            import_note=str(import_note or ""),
        )
        con.commit()
    return result


def _storage_delete(
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


def _storage_delete_product_action_suggestions(
    self,
    session_id: str,
    *,
    suggestion_ids: Optional[List[str]] = None,
    status: Optional[str] = None,
) -> int:
    sid = str(session_id or "").strip()
    if not sid:
        return 0
    _ensure_schema()
    clauses: List[str] = ["session_id = ?"]
    params: List[Any] = [sid]
    if suggestion_ids:
        placeholders = ",".join(["?"] * len(suggestion_ids))
        clauses.append(f"id IN ({placeholders})")
        params.extend(suggestion_ids)
    if status:
        clauses.append("status = ?")
        params.append(status)
    with _connect() as con:
        cur = con.execute(
            f"DELETE FROM session_product_action_suggestions WHERE {' AND '.join(clauses)}",
            params,
        )
        return int(cur.rowcount or 0)


def _storage_find_by_parent_element(
    self,
    parent_session_id: str,
    element_id_in_parent: str,
    *,
    org_id: Optional[str] = None,
) -> Optional[Session]:
    pid = str(parent_session_id or "").strip()
    eid = str(element_id_in_parent or "").strip()
    if not pid or not eid:
        return None
    org = _scope_org_id(org_id) or _default_org_id()
    org_clause, org_params = _org_clause(org)
    _ensure_schema()
    with _connect() as con:
        row = con.execute(
            f"SELECT * FROM sessions WHERE parent_session_id = ? AND element_id_in_parent = ? {org_clause} LIMIT 1",
            [pid, eid, *org_params],
        ).fetchone()
    return _session_row_to_model(row) if row else None


def _storage_find_or_create_child_session(
    self,
    parent_session: Session,
    element_id: str,
    child_xml: str,
    navigation_stack: List[Dict[str, Any]],
    title: str,
    *,
    user_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    org_id: Optional[str] = None,
) -> Session:
    """Atomically create a child subprocess session or return the existing one.

    Uses the unique partial index on
    (org_id, project_id, parent_session_id, element_id_in_parent) to guard
    against concurrent navigate_to_subprocess calls creating duplicates.
    """
    pid = str(getattr(parent_session, "id", "") or "").strip()
    eid = str(element_id or "").strip()
    if not pid or not eid:
        raise ValueError("parent session id and element id are required")

    owner = _scope_user_id(user_id)
    admin = _scope_is_admin(is_admin)
    org = _scope_org_id(org_id) or getattr(parent_session, "org_id", None) or _default_org_id()
    project_id = str(getattr(parent_session, "project_id", "") or "").strip()
    now = _now_ts()
    child_id = uuid.uuid4().hex[:10]
    stack = [dict(f) for f in (navigation_stack or [])]
    if stack and not str(stack[-1].get("session_id") or "").strip():
        stack[-1]["session_id"] = child_id

    child = Session(
        id=child_id,
        title=title,
        roles=[],
        project_id=project_id or None,
        mode=getattr(parent_session, "mode", None),
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
        analytics={},
        ai_llm_state={},
        bpmn_xml=str(child_xml or ""),
        bpmn_xml_version=0,
        diagram_state_version=0,
        version=2,
        owner_user_id=owner,
        org_id=org,
        created_by=owner,
        updated_by=owner,
        created_at=now,
        updated_at=now,
        navigation_stack=stack,
        parent_session_id=pid,
        element_id_in_parent=eid,
        activity_count=_count_bpmn_activities(str(child_xml or "")),
    )

    values = {
        "id": child.id,
        "title": child.title,
        "roles_json": _json_dumps(child.roles, []),
        "start_role": child.start_role,
        "project_id": child.project_id,
        "mode": child.mode,
        "notes": child.notes,
        "notes_by_element_json": _json_dumps(child.notes_by_element, {}),
        "interview_json": _json_dumps(child.interview, {}),
        "nodes_json": _json_dumps(child.nodes, []),
        "edges_json": _json_dumps(child.edges, []),
        "questions_json": _json_dumps(child.questions, []),
        "mermaid": child.mermaid,
        "mermaid_simple": child.mermaid_simple,
        "mermaid_lanes": child.mermaid_lanes,
        "normalized_json": _json_dumps(child.normalized, {}),
        "resources_json": _json_dumps(child.resources, {}),
        "analytics_json": _json_dumps(child.analytics, {}),
        "ai_llm_state_json": _json_dumps(child.ai_llm_state, {}),
        "bpmn_xml": child.bpmn_xml,
        "bpmn_xml_version": int(child.bpmn_xml_version or 0),
        "diagram_state_version": int(child.diagram_state_version or 0),
        "diagram_last_write_actor_user_id": "",
        "diagram_last_write_actor_label": "",
        "diagram_last_write_client_id": "",
        "diagram_last_write_at": 0,
        "diagram_last_write_changed_keys_json": _json_dumps([], []),
        "bpmn_graph_fingerprint": "",
        "bpmn_meta_json": _json_dumps({}, {}),
        "version": int(child.version or 0),
        "owner_user_id": owner,
        "org_id": org,
        "created_by": owner,
        "updated_by": owner,
        "created_at": now,
        "updated_at": now,
        "navigation_stack": _json_dumps(child.navigation_stack, []),
        "parent_session_id": pid,
        "element_id_in_parent": eid,
        "activity_count": int(getattr(child, "activity_count", 0) or 0),
        "deleted_at": int(getattr(child, "deleted_at", 0) or 0),
    }

    _ensure_schema()
    with _connect() as con:
        con.execute(
            """
            INSERT INTO sessions (
              id, title, roles_json, start_role, project_id, mode, notes, notes_by_element_json,
              interview_json, nodes_json, edges_json, questions_json, mermaid, mermaid_simple, mermaid_lanes,
              normalized_json, resources_json, analytics_json, ai_llm_state_json,
              bpmn_xml, bpmn_xml_version, diagram_state_version,
              diagram_last_write_actor_user_id, diagram_last_write_actor_label, diagram_last_write_client_id,
              diagram_last_write_at, diagram_last_write_changed_keys_json, bpmn_graph_fingerprint, bpmn_meta_json,
              version, owner_user_id, org_id, created_by, updated_by, created_at, updated_at,
              navigation_stack, parent_session_id, element_id_in_parent, activity_count, deleted_at
            ) VALUES (
              :id, :title, :roles_json, :start_role, :project_id, :mode, :notes, :notes_by_element_json,
              :interview_json, :nodes_json, :edges_json, :questions_json, :mermaid, :mermaid_simple, :mermaid_lanes,
              :normalized_json, :resources_json, :analytics_json, :ai_llm_state_json,
              :bpmn_xml, :bpmn_xml_version, :diagram_state_version,
              :diagram_last_write_actor_user_id, :diagram_last_write_actor_label, :diagram_last_write_client_id,
              :diagram_last_write_at, :diagram_last_write_changed_keys_json, :bpmn_graph_fingerprint, :bpmn_meta_json,
              :version, :owner_user_id, :org_id, :created_by, :updated_by, :created_at, :updated_at,
              :navigation_stack, :parent_session_id, :element_id_in_parent, :activity_count, :deleted_at
            )
            ON CONFLICT (org_id, project_id, parent_session_id, element_id_in_parent)
            WHERE parent_session_id IS NOT NULL AND parent_session_id != ''
              AND element_id_in_parent IS NOT NULL AND element_id_in_parent != ''
            DO NOTHING
            """,
            values,
        )
        row = con.execute(
            """
            SELECT id FROM sessions
             WHERE org_id = ? AND project_id = ? AND parent_session_id = ? AND element_id_in_parent = ?
             LIMIT 1
            """,
            [org, project_id, pid, eid],
        ).fetchone()
        resolved_id = str(row["id"] if row else "").strip() or child_id

    loaded = self.load(resolved_id, user_id=owner, org_id=org, is_admin=admin)
    if loaded is None:
        raise RuntimeError("failed to persist or load child subprocess session")
    return loaded


def _storage_get_bpmn_version(
    self,
    session_id: str,
    version_id: str,
    *,
    org_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    _ensure_schema()
    sid = str(session_id or "").strip()
    vid = str(version_id or "").strip()
    if not sid or not vid:
        return None
    scope_org = str(org_id or "").strip()

    with _connect() as con:
        sess_row = con.execute("SELECT org_id FROM sessions WHERE id = ? LIMIT 1", [sid]).fetchone()
        if not sess_row:
            return None
        session_org = str(sess_row["org_id"] or "").strip() or _default_org_id()
        oid = scope_org or session_org
        if oid != session_org:
            return None
        row = con.execute(
            """
            SELECT id, session_id, org_id, version_number, diagram_state_version, bpmn_xml,
                   session_payload_hash, session_version, session_updated_at,
                   source_action, import_note, created_at, created_by
              FROM bpmn_versions
             WHERE session_id = ?
               AND org_id = ?
               AND id = ?
             LIMIT 1
            """,
            [sid, oid, vid],
        ).fetchone()

    if not row:
        return None
    return {
        "id": str(row["id"] or ""),
        "session_id": str(row["session_id"] or ""),
        "org_id": str(row["org_id"] or ""),
        "version_number": int(row["version_number"] or 0),
        "diagram_state_version": int(row["diagram_state_version"] or 0),
        "session_payload_hash": str(row["session_payload_hash"] or ""),
        "session_version": int(row["session_version"] or 0),
        "session_updated_at": int(row["session_updated_at"] or 0),
        "bpmn_xml": str(row["bpmn_xml"] or ""),
        "source_action": str(row["source_action"] or ""),
        "import_note": str(row["import_note"] or ""),
        "created_at": int(row["created_at"] or 0),
        "created_by": str(row["created_by"] or ""),
    }


def _storage_get_rag_readiness(
    self,
    session_id: str,
    *,
    org_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    session = self.load(session_id, org_id=org_id, is_admin=True)
    if session is None:
        return None
    return {
        "session_id": session.id,
        "rag_readiness_status": session.rag_readiness_status,
        "rag_queued_at": session.rag_queued_at,
        "rag_indexed_at": session.rag_indexed_at,
    }


def _storage_list(
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
    filters = []
    params: List[Any] = []
    org = _scope_org_id(org_id) or _default_org_id()
    if org:
        filters.append("org_id = ?")
        params.append(org)
    scope_filters, scope_params = _session_read_scope_filters(user_id, is_admin, org_id)
    filters.extend(scope_filters)
    params.extend(scope_params)
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


def _storage_list_bpmn_version_numbers_by_source_actions(
    self,
    session_id: str,
    *,
    org_id: Optional[str] = None,
    source_actions: Iterable[str] = (),
) -> List[int]:
    _ensure_schema()
    sid = str(session_id or "").strip()
    if not sid:
        return []
    actions = [
        str(action or "").strip().lower()
        for action in source_actions
        if str(action or "").strip()
    ]
    if not actions:
        return []
    scope_org = str(org_id or "").strip()

    with _connect() as con:
        sess_row = con.execute("SELECT org_id FROM sessions WHERE id = ? LIMIT 1", [sid]).fetchone()
        if not sess_row:
            return []
        session_org = str(sess_row["org_id"] or "").strip() or _default_org_id()
        oid = scope_org or session_org
        if oid != session_org:
            return []
        placeholders = ", ".join(["?"] * len(actions))
        rows = con.execute(
            f"""
            SELECT version_number
              FROM bpmn_versions
             WHERE session_id = ?
               AND org_id = ?
               AND lower(source_action) IN ({placeholders})
             ORDER BY version_number ASC
            """,
            [sid, oid, *actions],
        ).fetchall()
    return [int(row["version_number"] or 0) for row in rows if int(row["version_number"] or 0) > 0]


def _storage_list_bpmn_versions(
    self,
    session_id: str,
    *,
    org_id: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    include_xml: bool = False,
    include_technical: bool = True,
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
    try:
        off = int(offset)
    except Exception:
        off = 0
    off = max(off, 0)

    with _connect() as con:
        sess_row = con.execute("SELECT org_id FROM sessions WHERE id = ? LIMIT 1", [sid]).fetchone()
        if not sess_row:
            return []
        session_org = str(sess_row["org_id"] or "").strip() or _default_org_id()
        oid = scope_org or session_org
        if oid != session_org:
            return []
        filters = ["session_id = ?", "org_id = ?"]
        params: List[Any] = [sid, oid]
        if not include_technical:
            placeholders = ", ".join(["?"] * len(_USER_FACING_BPMN_VERSION_ACTIONS))
            filters.append(f"lower(source_action) IN ({placeholders})")
            params.extend(_USER_FACING_BPMN_VERSION_ACTIONS)
        where = f"WHERE {' AND '.join(filters)}"
        columns = (
            "id, session_id, org_id, version_number, diagram_state_version, bpmn_xml, session_payload_hash, session_version, session_updated_at, source_action, import_note, created_at, created_by"
            if include_xml
            else "id, session_id, org_id, version_number, diagram_state_version, session_payload_hash, session_version, session_updated_at, source_action, import_note, created_at, created_by"
        )
        rows = con.execute(
            f"""
            SELECT {columns}
              FROM bpmn_versions
             {where}
             ORDER BY version_number DESC
             LIMIT ?
             OFFSET ?
            """,
            [*params, lim, off],
        ).fetchall()

    out: List[Dict[str, Any]] = []
    for row in rows:
        item = {
            "id": str(row["id"] or ""),
            "session_id": str(row["session_id"] or ""),
            "org_id": str(row["org_id"] or ""),
            "version_number": int(row["version_number"] or 0),
            "diagram_state_version": int(row["diagram_state_version"] or 0),
            "session_payload_hash": str(row["session_payload_hash"] or ""),
            "session_version": int(row["session_version"] or 0),
            "session_updated_at": int(row["session_updated_at"] or 0),
            "source_action": str(row["source_action"] or ""),
            "import_note": str(row["import_note"] or ""),
            "created_at": int(row["created_at"] or 0),
            "created_by": str(row["created_by"] or ""),
        }
        if include_xml:
            item["bpmn_xml"] = str(row["bpmn_xml"] or "")
        out.append(item)
    return out


def _storage_list_process_properties_registry_sources(
    self,
    *,
    org_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    project_ids: Optional[List[str]] = None,
    session_ids: Optional[List[str]] = None,
    limit_sessions: int = 5000,
    user_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> List[Dict[str, Any]]:
    """Return minimal metadata plus bpmn_meta and bpmn_xml for process properties extraction.

    The query intentionally does not select interview_json, notes, reports,
    resources, analytics or normalized payloads. It reads bpmn_meta_json to
    reduce it to camunda_extensions_by_element_id, and bpmn_xml to enrich
    element_type and element_title from BPMN tags.
    """
    owner = _scope_user_id(user_id)
    admin = _scope_is_admin(is_admin)
    org = _scope_org_id(org_id) or _default_org_id()
    wid = str(workspace_id or "").strip()
    pids = [str(item or "").strip() for item in (project_ids or []) if str(item or "").strip()]
    sids = [str(item or "").strip() for item in (session_ids or []) if str(item or "").strip()]
    try:
        lim = int(limit_sessions)
    except Exception:
        lim = 5000
    lim = min(max(lim, 1), 10000)

    filters = ["s.org_id = ?"]
    params: List[Any] = [org]
    if not admin and owner:
        filters.append("s.owner_user_id = ?")
        params.append(owner)
    if wid:
        filters.append("COALESCE(p.workspace_id, '') = ?")
        params.append(wid)
    if pids:
        placeholders = ", ".join("?" for _ in pids)
        filters.append(f"COALESCE(s.project_id, '') IN ({placeholders})")
        params.extend(pids)
    if sids:
        placeholders = ", ".join("?" for _ in sids)
        filters.append(f"s.id IN ({placeholders})")
        params.extend(sids)

    where = f"WHERE {' AND '.join(filters)}"
    _ensure_schema()
    with _connect() as con:
        rows = con.execute(
            f"""
            SELECT
              s.id AS session_id,
              s.title AS session_title,
              s.project_id AS project_id,
              s.org_id AS org_id,
              s.bpmn_meta_json AS bpmn_meta_json,
              s.bpmn_xml AS bpmn_xml,
              s.diagram_state_version AS diagram_state_version,
              s.updated_at AS session_updated_at,
              p.title AS project_title,
              p.workspace_id AS workspace_id,
              p.folder_id AS folder_id,
              wf.name AS folder_title
            FROM sessions s
            LEFT JOIN projects p
              ON p.id = s.project_id
             AND p.org_id = s.org_id
            LEFT JOIN workspace_folders wf
              ON wf.id = p.folder_id
             AND wf.org_id = p.org_id
             AND wf.workspace_id = p.workspace_id
             AND wf.archived_at IS NULL
            {where}
            ORDER BY s.updated_at DESC
            LIMIT ?
            """,
            [*params, lim],
        ).fetchall()

    out: List[Dict[str, Any]] = []
    for row in rows:
        bpmn_meta = _json_loads(_row_value(row, "bpmn_meta_json"), {})
        if not isinstance(bpmn_meta, dict):
            bpmn_meta = {}
        out.append({
            "org_id": str(_row_value(row, "org_id") or ""),
            "workspace_id": str(_row_value(row, "workspace_id") or ""),
            "project_id": str(_row_value(row, "project_id") or ""),
            "project_title": str(_row_value(row, "project_title") or ""),
            "folder_id": str(_row_value(row, "folder_id") or ""),
            "folder_title": str(_row_value(row, "folder_title") or ""),
            "session_id": str(_row_value(row, "session_id") or ""),
            "session_title": str(_row_value(row, "session_title") or ""),
            "diagram_state_version": int(_row_value(row, "diagram_state_version") or 0),
            "updated_at": int(_row_value(row, "session_updated_at") or 0),
            "bpmn_meta": bpmn_meta,
            "bpmn_xml": str(_row_value(row, "bpmn_xml") or ""),
        })
    return out


def _storage_list_product_action_registry_sources(
    self,
    *,
    org_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    project_ids: Optional[List[str]] = None,
    session_ids: Optional[List[str]] = None,
    limit_sessions: int = 5000,
    user_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> List[Dict[str, Any]]:
    """Return minimal metadata plus extracted analysis.product_actions rows.

    The query intentionally does not select BPMN XML, BPMN meta, notes,
    reports, resources, analytics or normalized payloads. It reads
    interview_json only to reduce it to analysis.product_actions[].
    """
    owner = _scope_user_id(user_id)
    admin = _scope_is_admin(is_admin)
    org = _scope_org_id(org_id) or _default_org_id()
    wid = str(workspace_id or "").strip()
    pids = [str(item or "").strip() for item in (project_ids or []) if str(item or "").strip()]
    sids = [str(item or "").strip() for item in (session_ids or []) if str(item or "").strip()]
    try:
        lim = int(limit_sessions)
    except Exception:
        lim = 5000
    lim = min(max(lim, 1), 10000)

    filters = ["s.org_id = ?"]
    params: List[Any] = [org]
    if not admin and owner:
        filters.append("s.owner_user_id = ?")
        params.append(owner)
    if wid:
        filters.append("COALESCE(p.workspace_id, '') = ?")
        params.append(wid)
    if pids:
        placeholders = ", ".join("?" for _ in pids)
        filters.append(f"COALESCE(s.project_id, '') IN ({placeholders})")
        params.extend(pids)
    if sids:
        placeholders = ", ".join("?" for _ in sids)
        filters.append(f"s.id IN ({placeholders})")
        params.extend(sids)

    where = f"WHERE {' AND '.join(filters)}"
    _ensure_schema()
    with _connect() as con:
        rows = con.execute(
            f"""
            SELECT
              s.id AS session_id,
              s.title AS session_title,
              s.project_id AS project_id,
              s.org_id AS org_id,
              s.interview_json AS interview_json,
              s.diagram_state_version AS diagram_state_version,
              s.updated_at AS session_updated_at,
              p.title AS project_title,
              p.workspace_id AS workspace_id,
              p.folder_id AS folder_id,
              wf.name AS folder_title
            FROM sessions s
            LEFT JOIN projects p
              ON p.id = s.project_id
             AND p.org_id = s.org_id
            LEFT JOIN workspace_folders wf
              ON wf.id = p.folder_id
             AND wf.org_id = p.org_id
             AND wf.workspace_id = p.workspace_id
             AND wf.archived_at IS NULL
            {where}
            ORDER BY s.updated_at DESC
            LIMIT ?
            """,
            [*params, lim],
        ).fetchall()

    out: List[Dict[str, Any]] = []
    for row in rows:
        interview = _json_loads(_row_value(row, "interview_json"), {})
        if not isinstance(interview, dict):
            interview = {}
        analysis = interview.get("analysis")
        if not isinstance(analysis, dict):
            analysis = {}
        product_actions = analysis.get("product_actions")
        if not isinstance(product_actions, list):
            product_actions = []
        out.append({
            "org_id": str(_row_value(row, "org_id") or ""),
            "workspace_id": str(_row_value(row, "workspace_id") or ""),
            "project_id": str(_row_value(row, "project_id") or ""),
            "project_title": str(_row_value(row, "project_title") or ""),
            "folder_id": str(_row_value(row, "folder_id") or ""),
            "folder_title": str(_row_value(row, "folder_title") or ""),
            "session_id": str(_row_value(row, "session_id") or ""),
            "session_title": str(_row_value(row, "session_title") or ""),
            "diagram_state_version": int(_row_value(row, "diagram_state_version") or 0),
            "updated_at": int(_row_value(row, "session_updated_at") or 0),
            "product_actions": product_actions,
        })
    return out


def _storage_list_product_action_suggestions(
    self,
    session_id: str,
    *,
    org_id: Optional[str] = None,
    status: Optional[str] = None,
) -> List[Dict[str, Any]]:
    sid = str(session_id or "").strip()
    if not sid:
        return []
    _ensure_schema()
    params: List[Any] = [sid]
    status_filter = ""
    if status:
        status_filter = " AND status = ?"
        params.append(status)
    with _connect() as con:
        rows = con.execute(
            f"""
            SELECT * FROM session_product_action_suggestions
             WHERE session_id = ? {status_filter}
             ORDER BY created_at DESC, id DESC
            """,
            params,
        ).fetchall()
    return [_suggestion_row_to_dict(row) for row in rows]


def _storage_list_project_session_summaries(
    self,
    *,
    project_id: str,
    mode: Optional[str] = None,
    limit: int = 500,
    user_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    org_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Return project session list rows without loading large session JSON/XML fields."""
    pid = str(project_id or "").strip()
    if not pid:
        return []
    try:
        lim = int(limit)
    except Exception:
        lim = 500
    lim = min(max(lim, 1), 500)
    filters = ["COALESCE(project_id,'') = ?"]
    params: List[Any] = [pid]
    org = _scope_org_id(org_id) or _default_org_id()
    if org:
        filters.append("org_id = ?")
        params.append(org)
    scope_filters, scope_params = _session_read_scope_filters(user_id, is_admin, org_id)
    filters.extend(scope_filters)
    params.extend(scope_params)
    if mode is not None:
        filters.append("COALESCE(mode,'') = ?")
        params.append(str(mode or ""))
    where = f"WHERE {' AND '.join(filters)}"
    _ensure_schema()
    with _connect() as con:
        rows = con.execute(
            f"""
            SELECT
              id,
              title,
              roles_json,
              start_role,
              project_id,
              mode,
              process_layer,
              derived_from_session_id,
              parent_session_id,
              element_id_in_parent,
              bpmn_xml_version,
              diagram_state_version,
              bpmn_graph_fingerprint,
              version,
              owner_user_id,
              org_id,
              created_by,
              updated_by,
              created_at,
              updated_at,
              interview_json,
              LENGTH(COALESCE(bpmn_xml, '')) AS bpmn_xml_length
            FROM sessions
            {where}
            ORDER BY updated_at DESC
            LIMIT ?
            """,
            [*params, lim],
        ).fetchall()
    out: List[Dict[str, Any]] = []
    for row in rows:
        sid = str(_row_value(row, "id") or "").strip()
        title = str(_row_value(row, "title") or "").strip()
        roles = _json_loads(_row_value(row, "roles_json"), [])
        if not isinstance(roles, list):
            roles = []
        xml_len_raw = _row_value(row, "bpmn_xml_length")
        try:
            xml_len = max(0, int(xml_len_raw or 0))
        except Exception:
            xml_len = 0
        parent_session_id = str(_row_value(row, "parent_session_id") or "").strip()
        # P2 [Б]: реальный статус для StatusBadge в дереве explorer —
        # derive как в workspace-листе (manual interview.status > report_versions
        # > контент > draft). interview_json читается только для derive и
        # в summary-payload НЕ попадает.
        interview = _json_loads(_row_value(row, "interview_json"), {})
        if not isinstance(interview, dict):
            interview = {}
        out.append({
            "id": sid,
            "session_id": sid,
            "title": title,
            "name": title,
            "roles": [str(item) for item in roles if str(item or "").strip()],
            "start_role": str(_row_value(row, "start_role") or "").strip() or None,
            "project_id": str(_row_value(row, "project_id") or "").strip(),
            "mode": str(_row_value(row, "mode") or "").strip() or None,
            "process_layer": str(_row_value(row, "process_layer") or "as_is") or "as_is",
            "derived_from_session_id": str(_row_value(row, "derived_from_session_id") or ""),
            "parent_session_id": parent_session_id,
            "element_id_in_parent": str(_row_value(row, "element_id_in_parent") or ""),
            "is_subprocess": parent_session_id != "",
            "bpmn_xml_version": int(_row_value(row, "bpmn_xml_version") or 0),
            "diagram_state_version": int(_row_value(row, "diagram_state_version") or 0),
            "bpmn_graph_fingerprint": str(_row_value(row, "bpmn_graph_fingerprint") or ""),
            "version": int(_row_value(row, "version") or 0),
            "owner_user_id": str(_row_value(row, "owner_user_id") or ""),
            "org_id": str(_row_value(row, "org_id") or ""),
            "created_by": str(_row_value(row, "created_by") or ""),
            "updated_by": str(_row_value(row, "updated_by") or ""),
            "created_at": int(_row_value(row, "created_at") or 0),
            "updated_at": int(_row_value(row, "updated_at") or 0),
            "has_bpmn_xml": xml_len > 0,
            "status": derive_session_status(
                version=_row_value(row, "version"),
                bpmn_xml_version=_row_value(row, "bpmn_xml_version"),
                interview_raw=interview,
            ),
            "stage": str(interview.get("stage") or ""),
        })
    return out


def _storage_list_session_state_versions(
    self,
    session_id: str,
    *,
    org_id: Optional[str] = None,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    _ensure_schema()
    sid = str(session_id or "").strip()
    if not sid:
        return []
    scope_org = str(org_id or "").strip()
    try:
        lim = int(limit)
    except Exception:
        lim = 200
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
            SELECT id, session_id, org_id, diagram_state_version, parent_diagram_state_version,
                   changed_keys_json, payload_hash, actor_user_id, actor_label, created_at
              FROM session_state_versions
             WHERE session_id = ?
               AND org_id = ?
             ORDER BY diagram_state_version DESC
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
                "diagram_state_version": int(row["diagram_state_version"] or 0),
                "parent_diagram_state_version": int(row["parent_diagram_state_version"] or 0),
                "changed_keys": _json_loads(row["changed_keys_json"], []),
                "payload_hash": str(row["payload_hash"] or ""),
                "actor_user_id": str(row["actor_user_id"] or ""),
                "actor_label": str(row["actor_label"] or ""),
                "created_at": int(row["created_at"] or 0),
            }
        )
    return out


def _storage_list_sessions_by_rag_status(
    self,
    status: str,
    *,
    org_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Return lightweight session rows with the requested rag_readiness_status."""
    target = str(status or "").strip() or "queued"
    org = _scope_org_id(org_id) or _default_org_id()
    org_clause, org_params = _org_clause(org)
    _ensure_schema()
    with _connect() as con:
        rows = con.execute(
            f"""
            SELECT id, title, project_id, org_id, rag_readiness_status,
                   rag_queued_at, rag_indexed_at, diagram_state_version
              FROM sessions
             WHERE rag_readiness_status = ?
               AND deleted_at = 0
               {org_clause}
             ORDER BY rag_queued_at ASC, updated_at ASC
            """,
            [target, *org_params],
        ).fetchall()
    return [
        {
            "id": str(row["id"]),
            "title": str(row["title"] or ""),
            "project_id": str(row["project_id"] or ""),
            "org_id": str(row["org_id"] or ""),
            "rag_readiness_status": str(row["rag_readiness_status"] or "not_ready"),
            "rag_queued_at": int(row["rag_queued_at"]) if row["rag_queued_at"] is not None else None,
            "rag_indexed_at": int(row["rag_indexed_at"]) if row["rag_indexed_at"] is not None else None,
            "diagram_state_version": int(row["diagram_state_version"] or 0),
        }
        for row in rows
    ]


def _storage_load(
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
    org_clause, org_params = _org_clause(org)
    _ensure_schema()
    with _connect() as con:
        row = con.execute(
            f"SELECT * FROM sessions WHERE id = ? {org_clause} LIMIT 1",
            [sid, *org_params],
        ).fetchone()
    if not row:
        return None
    sess = _session_row_to_model(row)
    scope = _session_read_scope(owner, org, admin)
    mode = str(scope.get("mode") or "").strip().lower()
    if mode == "all":
        return sess
    if mode == "owner":
        return sess if sess.owner_user_id == owner else None
    if mode == "scoped":
        allowed_project_ids = set(scope.get("project_ids") or [])
        if sess.owner_user_id == owner:
            return sess
        if sess.project_id and str(sess.project_id).strip() in allowed_project_ids:
            return sess
        return None
    return None


def _storage_load_session_projection(
    self,
    session_id: str,
    *,
    user_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    org_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Load a lightweight session projection without the raw bpmn_xml blob."""
    sid = str(session_id or "").strip()
    if not sid:
        return None
    owner = _scope_user_id(user_id)
    admin = _scope_is_admin(is_admin)
    org = _scope_org_id(org_id) or _default_org_id()
    org_clause, org_params = _org_clause(org)
    _ensure_schema()
    columns = """
        id,
        title,
        roles_json,
        start_role,
        project_id,
        mode,
        notes,
        notes_by_element_json,
        interview_json,
        questions_json,
        mermaid,
        mermaid_simple,
        mermaid_lanes,
        normalized_json,
        resources_json,
        analytics_json,
        ai_llm_state_json,
        bpmn_xml,
        LENGTH(COALESCE(bpmn_xml, '')) AS bpmn_xml_length,
        bpmn_xml_version,
        diagram_state_version,
        bpmn_graph_fingerprint,
        bpmn_meta_json,
        version,
        owner_user_id,
        org_id,
        created_by,
        updated_by,
        created_at,
        updated_at,
        navigation_stack,
        parent_session_id,
        element_id_in_parent,
        process_layer,
        derived_from_session_id
    """
    with _connect() as con:
        row = con.execute(
            f"SELECT {columns} FROM sessions WHERE id = ? {org_clause} LIMIT 1",
            [sid, *org_params],
        ).fetchone()
    if not row:
        return None
    data = dict(row)
    scope = _session_read_scope(owner, org, admin)
    mode = str(scope.get("mode") or "").strip().lower()
    if mode == "all":
        return data
    if mode == "owner":
        return data if str(data.get("owner_user_id") or "").strip() == owner else None
    if mode == "scoped":
        allowed_project_ids = set(scope.get("project_ids") or [])
        if str(data.get("owner_user_id") or "").strip() == owner:
            return data
        if data.get("project_id") and str(data.get("project_id")).strip() in allowed_project_ids:
            return data
        return None
    return None


def _storage_patch_session_interview(
    self,
    session_id: str,
    interview: Dict[str, Any],
    *,
    user_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    org_id: Optional[str] = None,
) -> Optional["Session"]:
    """Atomically update only interview_json (status, git-mirror, etc.).

    Preserves diagram-truth columns (bpmn_xml, bpmn_xml_version,
    diagram_state_version, diagram_last_write_*). This prevents status-only
    transitions from clobbering concurrent diagram writes.

    Returns the updated Session or None on scope/permission failure.
    """
    sid = str(session_id or "").strip()
    if not sid:
        return None
    interview_dict = interview if isinstance(interview, dict) else {}
    owner = _scope_user_id(user_id)
    admin = _scope_is_admin(is_admin)
    org = _scope_org_id(org_id) or _default_org_id()
    org_clause, org_params = _org_clause(org)
    _ensure_schema()
    with _connect() as con:
        row = con.execute(
            f"SELECT owner_user_id FROM sessions WHERE id = ? {org_clause} LIMIT 1",
            [sid, *org_params],
        ).fetchone()
        if not row:
            return None
        existing_owner = str(row["owner_user_id"] or "")
        if not admin and owner and existing_owner and existing_owner != owner:
            raise PermissionError("session belongs to another user")
        now = _now_ts()
        updated_by = owner or existing_owner or ""
        cur = con.execute(
            f"""
            UPDATE sessions
               SET interview_json = ?,
                   updated_at = ?,
                   updated_by = ?
             WHERE id = ?
             {org_clause}
            """,
            [_json_dumps(interview_dict, {}), now, updated_by, sid, *org_params],
        )
        con.commit()
        if int(cur.rowcount or 0) == 0:
            return None
    return self.load(sid, user_id=user_id, org_id=org_id, is_admin=admin)


def _storage_patch_session_meta(
    self,
    session_id: str,
    bpmn_meta: Dict[str, Any],
    base_diagram_state_version: int,
    *,
    user_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    org_id: Optional[str] = None,
    client_id: Optional[str] = None,
) -> Optional["Session"]:
    """Atomically update only bpmn_meta_json and diagram_state_version (CAS).

    Does not touch bpmn_xml. Returns the updated Session or None on CAS/scope failure.
    """
    sid = str(session_id or "").strip()
    if not sid:
        return None
    meta_dict = bpmn_meta if isinstance(bpmn_meta, dict) else {}
    base = int(base_diagram_state_version or 0)
    owner = _scope_user_id(user_id)
    admin = _scope_is_admin(is_admin)
    org = _scope_org_id(org_id) or _default_org_id()
    org_clause, org_params = _org_clause(org)
    _ensure_schema()
    with _connect() as con:
        row = con.execute(
            f"SELECT owner_user_id, diagram_state_version FROM sessions WHERE id = ? {org_clause} LIMIT 1",
            [sid, *org_params],
        ).fetchone()
        if not row:
            return None
        existing_owner = str(row["owner_user_id"] or "")
        if not admin and owner and existing_owner and existing_owner != owner:
            raise PermissionError("session belongs to another user")
        current_version = int(row["diagram_state_version"] or 0)
        if current_version != base:
            return None
        now = _now_ts()
        next_version = current_version + 1
        updated_by = owner or existing_owner or ""
        actor_user_id = owner or existing_owner or ""
        actor_label = actor_user_id
        normalized_client_id = re.sub(r"[^A-Za-z0-9_.:-]+", "", str(client_id or "").strip())[:128]
        cur = con.execute(
            """
            UPDATE sessions
               SET bpmn_meta_json = ?,
                   diagram_state_version = ?,
                   updated_at = ?,
                   updated_by = ?,
                   diagram_last_write_at = ?,
                   diagram_last_write_actor_user_id = ?,
                   diagram_last_write_actor_label = ?,
                   diagram_last_write_client_id = ?,
                   diagram_last_write_changed_keys_json = ?
             WHERE id = ?
               AND diagram_state_version = ?
            """,
            [
                _json_dumps(meta_dict, {}),
                next_version,
                now,
                updated_by,
                now,
                actor_user_id,
                actor_label,
                normalized_client_id,
                _json_dumps(["bpmn_meta"], []),
                sid,
                base,
            ],
        )
        con.commit()
        if int(cur.rowcount or 0) == 0:
            return None
    return self.load(sid, user_id=user_id, org_id=org_id, is_admin=admin)


def _storage_rename(self, session_id: str, new_title: str, *, user_id: Optional[str] = None, is_admin: Optional[bool] = None, org_id: Optional[str] = None) -> Optional[Session]:
    sess = self.load(session_id, user_id=user_id, is_admin=is_admin, org_id=org_id)
    if not sess:
        return None
    t = (new_title or "").strip()
    if not t:
        return sess
    sess.title = t
    try:
        self.save(sess, user_id=user_id, is_admin=is_admin, org_id=org_id)
    except Exception as exc:
        if _is_integrity_error(exc):
            raise SessionTitleConflictError(f"session title already exists: {t!r}") from exc
        raise
    return self.load(session_id, user_id=user_id, is_admin=is_admin, org_id=org_id)


def _storage_save(
    self,
    s: Session,
    *,
    user_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    org_id: Optional[str] = None,
    expected_diagram_state_version: Optional[int] = None,
    bpmn_snapshot: Optional[Dict[str, Any]] = None,
) -> None:
    """Persist a session row.

    When ``expected_diagram_state_version`` is provided (and the row already
    exists), the write is a SQL-level CAS:
    ``UPDATE ... WHERE id=? AND diagram_state_version=?``. Zero affected rows
    raises :class:`DiagramStateConflictError` instead of silently overwriting
    a concurrent writer (last-writer-wins fix, audit P2).

    When ``bpmn_snapshot`` is provided, the bpmn_versions row is inserted in
    the SAME transaction as the session row (audit P4); the passed dict is
    updated in place with the inserted row (id/version_number/created_at).
    """
    _ensure_schema()
    owner_scope = _scope_user_id(user_id)
    admin = _scope_is_admin(is_admin)
    org_scope = _scope_org_id(org_id) or str(getattr(s, "org_id", "") or "").strip() or _default_org_id()
    sid = str(getattr(s, "id", "") or "").strip()
    if not sid:
        raise ValueError("session id is required")
    now = _now_ts()
    with _connect() as con:
        existing = con.execute(
            """
            SELECT owner_user_id, created_at, org_id, created_by, bpmn_xml, diagram_state_version
              FROM sessions
             WHERE id = ?
             LIMIT 1
            """,
            [sid],
        ).fetchone()
        existing_owner = str(existing["owner_user_id"] or "") if existing else ""
        existing_org = str(existing["org_id"] or "") if existing else ""
        existing_created_by = str(existing["created_by"] or "") if existing else ""
        existing_bpmn_xml = str(existing["bpmn_xml"] or "") if existing else ""
        existing_diagram_state_version = int(existing["diagram_state_version"] or 0) if existing else 0
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
            "diagram_state_version": int(getattr(s, "diagram_state_version", 0) or 0),
            "diagram_last_write_actor_user_id": str(getattr(s, "diagram_last_write_actor_user_id", "") or ""),
            "diagram_last_write_actor_label": str(getattr(s, "diagram_last_write_actor_label", "") or ""),
            "diagram_last_write_client_id": str(getattr(s, "diagram_last_write_client_id", "") or ""),
            "diagram_last_write_at": int(getattr(s, "diagram_last_write_at", 0) or 0),
            "diagram_last_write_changed_keys_json": _json_dumps(getattr(s, "diagram_last_write_changed_keys", []), []),
            "bpmn_graph_fingerprint": str(getattr(s, "bpmn_graph_fingerprint", "") or ""),
            "bpmn_meta_json": _json_dumps(getattr(s, "bpmn_meta", {}), {}),
            "version": int(getattr(s, "version", 0) or 0),
            "owner_user_id": owner,
            "org_id": existing_org or org_scope or _default_org_id(),
            "created_by": created_by,
            "updated_by": updated_by,
            "created_at": created_at,
            "updated_at": now,
            "navigation_stack": _json_dumps(getattr(s, "navigation_stack", []) or [], []),
            "parent_session_id": str(getattr(s, "parent_session_id", "") or ""),
            "element_id_in_parent": str(getattr(s, "element_id_in_parent", "") or ""),
            "process_layer": str(getattr(s, "process_layer", "") or "as_is") or "as_is",
            "derived_from_session_id": str(getattr(s, "derived_from_session_id", "") or ""),
            "activity_count": int(getattr(s, "activity_count", 0) or 0),
            "deleted_at": int(getattr(s, "deleted_at", 0) or 0),
            "rag_readiness_status": str(getattr(s, "rag_readiness_status", "not_ready") or "not_ready"),
            "rag_queued_at": int(getattr(s, "rag_queued_at", 0) or 0) if getattr(s, "rag_queued_at", None) is not None else None,
            "rag_indexed_at": int(getattr(s, "rag_indexed_at", 0) or 0) if getattr(s, "rag_indexed_at", None) is not None else None,
        }
        cas_base = (
            int(expected_diagram_state_version)
            if (existing is not None and expected_diagram_state_version is not None)
            else None
        )
        if existing is None and expected_diagram_state_version is not None:
            # A CAS write presumes an existing row: the session was deleted
            # between the pre-load and this write (or never existed).
            # Surface 404 instead of silently INSERTing a zombie row with a
            # resurrected deleted id (audit P-1).
            raise SessionNotFoundError(sid)
        if cas_base is not None:
            update_values = dict(values)
            update_values["__cas_base"] = cas_base
            cur = con.execute(
                """
                UPDATE sessions
                   SET title=:title,
                     roles_json=:roles_json,
                     start_role=:start_role,
                     project_id=:project_id,
                     mode=:mode,
                     notes=:notes,
                     notes_by_element_json=:notes_by_element_json,
                     interview_json=:interview_json,
                     nodes_json=:nodes_json,
                     edges_json=:edges_json,
                     questions_json=:questions_json,
                     mermaid=:mermaid,
                     mermaid_simple=:mermaid_simple,
                     mermaid_lanes=:mermaid_lanes,
                     normalized_json=:normalized_json,
                     resources_json=:resources_json,
                     analytics_json=:analytics_json,
                     ai_llm_state_json=:ai_llm_state_json,
                     bpmn_xml=:bpmn_xml,
                     bpmn_xml_version=:bpmn_xml_version,
                     diagram_state_version=:diagram_state_version,
                     diagram_last_write_actor_user_id=:diagram_last_write_actor_user_id,
                     diagram_last_write_actor_label=:diagram_last_write_actor_label,
                     diagram_last_write_client_id=:diagram_last_write_client_id,
                     diagram_last_write_at=:diagram_last_write_at,
                     diagram_last_write_changed_keys_json=:diagram_last_write_changed_keys_json,
                     bpmn_graph_fingerprint=:bpmn_graph_fingerprint,
                     bpmn_meta_json=:bpmn_meta_json,
                     version=:version,
                     owner_user_id=:owner_user_id,
                     org_id=:org_id,
                     created_by=:created_by,
                     updated_by=:updated_by,
                     created_at=:created_at,
                     updated_at=:updated_at,
                     navigation_stack=:navigation_stack,
                     parent_session_id=:parent_session_id,
                     element_id_in_parent=:element_id_in_parent,
                     process_layer=:process_layer,
                     derived_from_session_id=:derived_from_session_id,
                     activity_count=:activity_count,
                     deleted_at=:deleted_at,
                     rag_readiness_status=:rag_readiness_status,
                     rag_queued_at=:rag_queued_at,
                     rag_indexed_at=:rag_indexed_at
                 WHERE id = :id
                   AND diagram_state_version = :__cas_base
                """,
                update_values,
            )
            if int(cur.rowcount or 0) == 0:
                current_row = con.execute(
                    "SELECT diagram_state_version FROM sessions WHERE id = ? LIMIT 1",
                    [sid],
                ).fetchone()
                con.rollback()
                if current_row is None:
                    # Row disappeared between the initial SELECT and the
                    # UPDATE: deleted concurrently. This is a 404, not a
                    # version conflict (audit P-1).
                    raise SessionNotFoundError(sid)
                current_version = int(_row_value(current_row, "diagram_state_version", 0) or 0)
                raise DiagramStateConflictError(sid, cas_base, current_version)
        else:
            con.execute(
                """
                INSERT INTO sessions (
                  id, title, roles_json, start_role, project_id, mode, notes, notes_by_element_json,
                  interview_json, nodes_json, edges_json, questions_json, mermaid, mermaid_simple, mermaid_lanes,
                  normalized_json, resources_json, analytics_json, ai_llm_state_json,
                  bpmn_xml, bpmn_xml_version, diagram_state_version,
                  diagram_last_write_actor_user_id, diagram_last_write_actor_label, diagram_last_write_client_id,
                  diagram_last_write_at, diagram_last_write_changed_keys_json, bpmn_graph_fingerprint, bpmn_meta_json,
                  version, owner_user_id, org_id, created_by, updated_by, created_at, updated_at,
                  navigation_stack, parent_session_id, element_id_in_parent, process_layer,
                  derived_from_session_id, activity_count, rag_readiness_status, rag_queued_at,
                  rag_indexed_at
                ) VALUES (
                  :id, :title, :roles_json, :start_role, :project_id, :mode, :notes, :notes_by_element_json,
                  :interview_json, :nodes_json, :edges_json, :questions_json, :mermaid, :mermaid_simple, :mermaid_lanes,
                  :normalized_json, :resources_json, :analytics_json, :ai_llm_state_json,
                  :bpmn_xml, :bpmn_xml_version, :diagram_state_version,
                  :diagram_last_write_actor_user_id, :diagram_last_write_actor_label, :diagram_last_write_client_id,
                  :diagram_last_write_at, :diagram_last_write_changed_keys_json, :bpmn_graph_fingerprint, :bpmn_meta_json,
                  :version, :owner_user_id, :org_id, :created_by, :updated_by, :created_at, :updated_at,
                  :navigation_stack, :parent_session_id, :element_id_in_parent, :process_layer,
                  :derived_from_session_id, :activity_count, :rag_readiness_status, :rag_queued_at,
                  :rag_indexed_at
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
                  diagram_state_version=excluded.diagram_state_version,
                  diagram_last_write_actor_user_id=excluded.diagram_last_write_actor_user_id,
                  diagram_last_write_actor_label=excluded.diagram_last_write_actor_label,
                  diagram_last_write_client_id=excluded.diagram_last_write_client_id,
                  diagram_last_write_at=excluded.diagram_last_write_at,
                  diagram_last_write_changed_keys_json=excluded.diagram_last_write_changed_keys_json,
                  bpmn_graph_fingerprint=excluded.bpmn_graph_fingerprint,
                  bpmn_meta_json=excluded.bpmn_meta_json,
                  version=excluded.version,
                  owner_user_id=excluded.owner_user_id,
                  org_id=excluded.org_id,
                  created_by=excluded.created_by,
                  updated_by=excluded.updated_by,
                  created_at=excluded.created_at,
                  updated_at=excluded.updated_at,
                  navigation_stack=excluded.navigation_stack,
                  parent_session_id=excluded.parent_session_id,
                  element_id_in_parent=excluded.element_id_in_parent,
                  process_layer=excluded.process_layer,
                  derived_from_session_id=excluded.derived_from_session_id,
                  activity_count=excluded.activity_count,
                  deleted_at=excluded.deleted_at,
                  rag_readiness_status=excluded.rag_readiness_status,
                  rag_queued_at=excluded.rag_queued_at,
                  rag_indexed_at=excluded.rag_indexed_at
                """,
                values,
            )
        if bpmn_snapshot:
            snap_xml = str(bpmn_snapshot.get("bpmn_xml") or "")
            snap_action = str(bpmn_snapshot.get("source_action") or "").strip().lower()
            if snap_xml.strip() and snap_action:
                snap_row = self._insert_bpmn_version_row(
                    con,
                    session_id=sid,
                    org_id=str(values.get("org_id") or _default_org_id()),
                    bpmn_xml=snap_xml,
                    source_action=snap_action,
                    diagram_state_version=int(bpmn_snapshot.get("diagram_state_version") or 0),
                    session_payload_hash=str(bpmn_snapshot.get("session_payload_hash") or ""),
                    session_version=int(bpmn_snapshot.get("session_version") or 0),
                    session_updated_at=int(bpmn_snapshot.get("session_updated_at") or 0),
                    created_by=str(bpmn_snapshot.get("created_by") or ""),
                    import_note=str(bpmn_snapshot.get("import_note") or ""),
                )
                bpmn_snapshot.clear()
                bpmn_snapshot.update(snap_row)
        next_diagram_state_version = int(values.get("diagram_state_version") or 0)
        accepted_diagram_write = bool(existing) and next_diagram_state_version > existing_diagram_state_version
        bpmn_xml_changed = str(values.get("bpmn_xml") or "") != existing_bpmn_xml
        if accepted_diagram_write and not bpmn_xml_changed:
            trace_id = uuid.uuid4().hex[:12]
            payload_hash = _diagram_truth_payload_hash(s)
            changed_keys_raw = getattr(s, "diagram_last_write_changed_keys", [])
            changed_keys = []
            if isinstance(changed_keys_raw, list):
                for key in changed_keys_raw:
                    txt = str(key or "").strip()
                    if txt:
                        changed_keys.append(txt)
            changed_keys = sorted(set(changed_keys))
            created_at_ts = int(getattr(s, "diagram_last_write_at", 0) or 0) or now
            actor_user_id = str(getattr(s, "diagram_last_write_actor_user_id", "") or "")
            actor_label = str(getattr(s, "diagram_last_write_actor_label", "") or "")
            con.execute(
                """
                INSERT INTO session_state_versions (
                  id, session_id, org_id, diagram_state_version, parent_diagram_state_version,
                  changed_keys_json, payload_hash, actor_user_id, actor_label, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    trace_id,
                    sid,
                    str(values.get("org_id") or _default_org_id()),
                    next_diagram_state_version,
                    existing_diagram_state_version,
                    _json_dumps(changed_keys, []),
                    payload_hash,
                    actor_user_id,
                    actor_label,
                    created_at_ts,
                ],
            )
        con.commit()
        # AGENT-2: фоновая переиндексация bpmn_xml после успешного сохранения.
        # Локальный импорт, чтобы избежать циклического импорта на старте.
        # Enqueue только при реальном изменении bpmn_xml в ЭТОМ save:
        # enqueue на каждый save, где поле физически присутствует, вместе со
        # служебными save (rag-статусы и т.п.) образует самоподдерживающийся
        # цикл задач (audit/prod-stage-divergence-409).
        try:
            from ....rag_tasks import index_session_bpmn_xml

            bpmn_xml_value = str(values.get("bpmn_xml") or "").strip()
            if bpmn_xml_value and bpmn_xml_changed:
                index_session_bpmn_xml.delay(sid, org_scope)
        except Exception as exc:
            logger.warning("save: failed to enqueue rag index task for %s: %s", sid, exc)


def _storage_set_rag_readiness(
    self,
    session_id: str,
    new_status: str,
    *,
    org_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Установить rag-статус сессии ТОЧЕЧНЫМ update только rag-колонок.

    Нельзя делать load() + save() полного объекта: такой non-CAS full-row
    upsert, загруженный до чужого коммита, откатывает diagram_state_version
    после успешного CAS-save пользователя, оставляя orphan-снапшот в
    bpmn_versions и ловя сессию в вечный 409 SESSION_WRITE_CONFLICT
    (audit/prod-stage-divergence-409).
    """
    sid = str(session_id or "").strip()
    if not sid:
        return None
    status = str(new_status or "not_ready").strip() or "not_ready"
    _ensure_schema()
    org = _scope_org_id(org_id) or _default_org_id()
    org_clause, org_params = _org_clause(org)
    now = _now_ts()
    with _connect() as con:
        row = con.execute(
            f"SELECT id FROM sessions WHERE id = ? {org_clause} LIMIT 1",
            [sid, *org_params],
        ).fetchone()
        if not row:
            return None
        if status == "queued":
            con.execute(
                f"""
                UPDATE sessions
                   SET rag_readiness_status = ?,
                       rag_queued_at = ?,
                       updated_at = ?
                 WHERE id = ? {org_clause}
                """,
                [status, now, now, sid, *org_params],
            )
        else:
            con.execute(
                f"""
                UPDATE sessions
                   SET rag_readiness_status = ?,
                       updated_at = ?
                 WHERE id = ? {org_clause}
                """,
                [status, now, sid, *org_params],
            )
        con.commit()
    return self.get_rag_readiness(session_id, org_id=org_id)


def _storage_soft_delete_children_by_parent(
    self,
    parent_session_id: str,
    keep_element_ids: List[str],
    *,
    user_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    org_id: Optional[str] = None,
) -> List[str]:
    """Soft-delete active child sessions whose element_id_in_parent is not in keep_element_ids.

    Returns the list of soft-deleted session ids.
    """
    pid = str(parent_session_id or "").strip()
    if not pid:
        return []
    owner = _scope_user_id(user_id)
    admin = _scope_is_admin(is_admin)
    org = _scope_org_id(org_id) or _default_org_id()
    org_clause, org_params = _org_clause(org)
    keep = [str(e).strip() for e in (keep_element_ids or []) if str(e).strip()]
    _ensure_schema()
    now = _now_ts()
    with _connect() as con:
        if keep:
            placeholders = ",".join("?" * len(keep))
            rows = con.execute(
                f"""
                SELECT id FROM sessions
                 WHERE parent_session_id = ?
                   AND (deleted_at = 0 OR deleted_at IS NULL)
                   AND element_id_in_parent NOT IN ({placeholders})
                   {org_clause}
                """,
                [pid, *keep, *org_params],
            ).fetchall()
        else:
            rows = con.execute(
                f"""
                SELECT id FROM sessions
                 WHERE parent_session_id = ?
                   AND (deleted_at = 0 OR deleted_at IS NULL)
                   {org_clause}
                """,
                [pid, *org_params],
            ).fetchall()
        ids = [str(r["id"]) for r in rows]
        if ids:
            ph = ",".join("?" * len(ids))
            con.execute(
                f"""
                UPDATE sessions
                   SET deleted_at = ?, updated_at = ?
                 WHERE id IN ({ph})
                   {org_clause}
                """,
                [now, now, *ids, *org_params],
            )
            con.commit()
    return ids


def _storage_upsert_product_action_suggestion(
    self,
    session_id: str,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    sid = str(session_id or "").strip()
    if not sid:
        raise ValueError("session_id is required")
    _ensure_schema()
    suggestion_id = str(payload.get("id") or "").strip() or uuid.uuid4().hex
    now = _now_ts()
    status = str(payload.get("status") or "pending").strip()
    if status not in {"pending", "approved", "rejected"}:
        status = "pending"
    values = {
        "id": suggestion_id,
        "session_id": sid,
        "status": status,
        "source": str(payload.get("source") or "llm").strip() or "llm",
        "original_llm_output": _json_dumps(payload.get("original_llm_output") or {}, {}),
        "action": _json_dumps(payload.get("action") or {}, {}),
        "binding": _json_dumps(payload.get("binding") or {}, {}),
        "edited_by_user": int(payload.get("edited_by_user") or 0),
        "created_at": now,
        "updated_at": now,
    }
    with _connect() as con:
        existing = con.execute(
            "SELECT 1 FROM session_product_action_suggestions WHERE id = ? AND session_id = ? LIMIT 1",
            [suggestion_id, sid],
        ).fetchone()
        if existing:
            con.execute(
                """
                UPDATE session_product_action_suggestions
                   SET status = :status,
                       source = :source,
                       original_llm_output = :original_llm_output,
                       action = :action,
                       binding = :binding,
                       edited_by_user = :edited_by_user,
                       updated_at = :updated_at
                 WHERE id = :id
                   AND session_id = :session_id
                """,
                values,
            )
        else:
            con.execute(
                """
                INSERT INTO session_product_action_suggestions (
                  id, session_id, status, source, original_llm_output, action, binding,
                  edited_by_user, created_at, updated_at
                ) VALUES (
                  :id, :session_id, :status, :source, :original_llm_output, :action, :binding,
                  :edited_by_user, :created_at, :updated_at
                )
                """,
                values,
            )
    return {
        **values,
        "original_llm_output": _json_loads(values["original_llm_output"], {}),
        "action": _json_loads(values["action"], {}),
        "binding": _json_loads(values["binding"], {}),
    }

from ..audit_telemetry.repository import get_effective_project_scope
from ..canvas_session.repository import _count_bpmn_activities
from ..canvas_session.repository import _diagram_truth_payload_hash
from ..canvas_session.repository import _is_integrity_error
from ..canvas_session.repository import _org_clause
from ..canvas_session.repository import _owner_clause
from ..dictionaries.repository import _seed_process_property_metadata
from ..dictionaries.repository import _seed_reference_tables
from ..org_auth.repository import _auth_user_row_to_dict
from ..org_auth.repository import _default_org_id
from ..org_auth.repository import _default_org_name
from ..org_auth.repository import _default_workspace_id
from ..org_auth.repository import _ensure_auth_users_backfill
from ..org_auth.repository import _ensure_org_workspaces_bootstrap
from ..org_auth.repository import _ensure_workspace_folder_backfill
from ..org_auth.repository import _ensure_workspace_record
from ..org_auth.repository import _normalize_admin_entity_permissions
from ..org_auth.repository import _normalize_membership_permissions
from ..org_auth.repository import _normalize_org_membership_role
from ..org_auth.repository import _upsert_auth_user
from ..org_auth.repository import get_user_org_role
from ..platform.repository import _meta_get
from ..platform.repository import _meta_set
from ..utils.repository import _normalize_note_status
from ..utils.repository import _normalize_org_property_dictionary_input_mode
