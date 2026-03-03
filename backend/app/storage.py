from __future__ import annotations

import json
import os
import sqlite3
import threading
import uuid
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .models import Project, Session

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
_ORG_FULL_ACCESS_ROLES = {"org_owner", "org_admin", "auditor"}
_PROJECT_MEMBER_ROLES = {"project_manager", "editor", "viewer"}


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


def _connect() -> sqlite3.Connection:
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


def _column_exists(con: sqlite3.Connection, table: str, column: str) -> bool:
    try:
        rows = con.execute(f"PRAGMA table_info({table})").fetchall()
    except Exception:
        return False
    target = str(column or "").strip().lower()
    for row in rows:
        name = str(row["name"] if isinstance(row, sqlite3.Row) else row[1]).strip().lower()
        if name == target:
            return True
    return False


def _ensure_schema() -> None:
    global _SCHEMA_READY, _SCHEMA_DB_FILE
    db_file = str(_db_path())
    with _DB_LOCK:
        if _SCHEMA_READY and _SCHEMA_DB_FILE == db_file:
            return
        with _connect() as con:
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
            con.execute("CREATE INDEX IF NOT EXISTS idx_projects_org_updated ON projects(org_id, updated_at DESC)")
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
            con.execute("CREATE INDEX IF NOT EXISTS idx_sessions_org_project_updated ON sessions(org_id, project_id, updated_at DESC)")
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS orgs (
                  id TEXT PRIMARY KEY,
                  name TEXT NOT NULL,
                  created_at INTEGER NOT NULL DEFAULT 0,
                  created_by TEXT NOT NULL DEFAULT ''
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
            if not _column_exists(con, "projects", "org_id"):
                con.execute("ALTER TABLE projects ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_default'")
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
            _maybe_migrate_legacy_files(con)
            _ensure_enterprise_bootstrap(con)
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


def _ensure_enterprise_bootstrap(con: sqlite3.Connection) -> None:
    default_org_id = _default_org_id()
    default_org_name = _default_org_name()
    if not default_org_id:
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
    owner_ids = {str((row["user_id"] if isinstance(row, sqlite3.Row) else row[0]) or "").strip() for row in owner_rows}
    owner_ids.discard("")

    users = _read_auth_users_rows()
    for user in users:
        uid = str(user.get("id") or "").strip()
        if not uid:
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


def _project_row_to_model(row: sqlite3.Row) -> Project:
    keys = set(row.keys())
    payload = {
        "id": str(row["id"] or ""),
        "title": str(row["title"] or ""),
        "passport": _json_loads(row["passport_json"], {}),
        "created_at": int(row["created_at"] or 0),
        "updated_at": int(row["updated_at"] or 0),
        "version": int(row["version"] or 1),
        "owner_user_id": str(row["owner_user_id"] or ""),
        "org_id": str((row["org_id"] if "org_id" in keys else "") or ""),
        "created_by": str((row["created_by"] if "created_by" in keys else "") or ""),
        "updated_by": str((row["updated_by"] if "updated_by" in keys else "") or ""),
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
        pid = gen_project_id()
        now = _now_ts()
        with _connect() as con:
            con.execute(
                """
                INSERT INTO projects (id, title, passport_json, created_at, updated_at, version, owner_user_id, org_id, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            existing = con.execute("SELECT owner_user_id, created_at, version, org_id, created_by FROM projects WHERE id = ? LIMIT 1", [pid]).fetchone()
            existing_owner = str(existing["owner_user_id"] or "") if existing else ""
            existing_org = str(existing["org_id"] or "") if existing else ""
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
            con.execute(
                """
                INSERT INTO projects (id, title, passport_json, created_at, updated_at, version, owner_user_id, org_id, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  title=excluded.title,
                  passport_json=excluded.passport_json,
                  created_at=excluded.created_at,
                  updated_at=excluded.updated_at,
                  version=excluded.version,
                  owner_user_id=excluded.owner_user_id,
                  org_id=excluded.org_id,
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


def list_user_org_memberships(user_id: str, *, is_admin: Optional[bool] = None) -> List[Dict[str, Any]]:
    uid = str(user_id or "").strip()
    if not uid:
        return []
    _ensure_schema()
    with _connect() as con:
        _ensure_enterprise_bootstrap(con)
        now = _now_ts()
        role = "org_admin" if bool(is_admin) else "editor"
        con.execute(
            """
            INSERT OR IGNORE INTO org_memberships (org_id, user_id, role, created_at)
            VALUES (?, ?, ?, ?)
            """,
            [_default_org_id(), uid, role, now],
        )
        if bool(is_admin):
            con.execute(
                """
                UPDATE org_memberships
                   SET role = 'org_admin'
                 WHERE org_id = ? AND user_id = ?
                """,
                [_default_org_id(), uid],
            )
        con.commit()
        rows = con.execute(
            """
            SELECT m.org_id AS org_id, o.name AS org_name, m.role AS role, m.created_at AS created_at
              FROM org_memberships m
              JOIN orgs o ON o.id = m.org_id
             WHERE m.user_id = ?
             ORDER BY CASE WHEN m.org_id = ? THEN 0 ELSE 1 END, o.name ASC, m.org_id ASC
            """,
            [uid, _default_org_id()],
        ).fetchall()
    out: List[Dict[str, Any]] = []
    for row in rows:
        out.append(
            {
                "org_id": str(row["org_id"] or ""),
                "name": str(row["org_name"] or row["org_id"] or ""),
                "role": str(row["role"] or "viewer"),
                "created_at": int(row["created_at"] or 0),
            }
        )
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
        con.commit()
        row = con.execute("SELECT id, name, created_at, created_by FROM orgs WHERE id = ? LIMIT 1", [oid]).fetchone()
    if not row:
        return {"id": oid, "name": title, "created_at": now, "created_by": actor}
    return {
        "id": str(row["id"] or ""),
        "name": str(row["name"] or ""),
        "created_at": int(row["created_at"] or 0),
        "created_by": str(row["created_by"] or ""),
    }


def _normalize_project_membership_role(raw: Any) -> str:
    role = str(raw or "").strip().lower()
    aliases = {
        "projectmanager": "project_manager",
        "pm": "project_manager",
        "manager": "project_manager",
        "proj_manager": "project_manager",
        "project_manager": "project_manager",
        "editor": "editor",
        "edit": "editor",
        "viewer": "viewer",
        "read_only": "viewer",
    }
    role = aliases.get(role, role)
    if role not in _PROJECT_MEMBER_ROLES:
        return "viewer"
    return role


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


def get_project_storage() -> ProjectStorage:
    root = os.getenv("PROJECT_STORAGE_DIR", "").strip()
    if root:
        return ProjectStorage(Path(root))
    return ProjectStorage(_db_base_dir())


def get_storage() -> Storage:
    return Storage(base_dir=_db_base_dir())
