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

_DB_LOCK = threading.RLock()
_SCHEMA_READY = False
_SCHEMA_DB_FILE = ""
_MIGRATION_MARK = "legacy_file_to_sqlite_v1"


def _now_ts() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def push_storage_request_scope(user_id: str | None, is_admin: bool = False) -> Tuple[Any, Any]:
    token_uid = _REQ_USER_ID.set(str(user_id or "").strip())
    token_admin = _REQ_IS_ADMIN.set(bool(is_admin))
    return token_uid, token_admin


def pop_storage_request_scope(tokens: Tuple[Any, Any] | None) -> None:
    if not tokens:
        return
    tok_uid, tok_admin = tokens
    try:
        _REQ_USER_ID.reset(tok_uid)
    except Exception:
        pass
    try:
        _REQ_IS_ADMIN.reset(tok_admin)
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
                  owner_user_id TEXT NOT NULL DEFAULT ''
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
                  bpmn_meta_json TEXT NOT NULL DEFAULT '{}',
                  version INTEGER NOT NULL DEFAULT 0,
                  owner_user_id TEXT NOT NULL DEFAULT '',
                  created_at INTEGER NOT NULL DEFAULT 0,
                  updated_at INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_sessions_owner_updated ON sessions(owner_user_id, updated_at DESC)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id)")
            _maybe_migrate_legacy_files(con)
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


def _session_row_to_model(row: sqlite3.Row) -> Session:
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
        "created_at": int(row["created_at"] or 0),
        "updated_at": int(row["updated_at"] or 0),
    }
    return Session.model_validate(payload)


def _project_row_to_model(row: sqlite3.Row) -> Project:
    payload = {
        "id": str(row["id"] or ""),
        "title": str(row["title"] or ""),
        "passport": _json_loads(row["passport_json"], {}),
        "created_at": int(row["created_at"] or 0),
        "updated_at": int(row["updated_at"] or 0),
        "version": int(row["version"] or 1),
        "owner_user_id": str(row["owner_user_id"] or ""),
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
            created_at=now,
            updated_at=now,
        )
        self.save(sess, user_id=owner, is_admin=is_admin)
        return sid

    def load(self, session_id: str, *, user_id: Optional[str] = None, is_admin: Optional[bool] = None) -> Optional[Session]:
        sid = str(session_id or "").strip()
        if not sid:
            return None
        owner = _scope_user_id(user_id)
        admin = _scope_is_admin(is_admin)
        clause, params = _owner_clause(owner, admin)
        _ensure_schema()
        with _connect() as con:
            row = con.execute(
                f"SELECT * FROM sessions WHERE id = ? {clause} LIMIT 1",
                [sid, *params],
            ).fetchone()
        if not row:
            return None
        return _session_row_to_model(row)

    def save(self, s: Session, *, user_id: Optional[str] = None, is_admin: Optional[bool] = None) -> None:
        _ensure_schema()
        owner_scope = _scope_user_id(user_id)
        admin = _scope_is_admin(is_admin)
        sid = str(getattr(s, "id", "") or "").strip()
        if not sid:
            raise ValueError("session id is required")
        now = _now_ts()
        with _connect() as con:
            existing = con.execute("SELECT owner_user_id, created_at FROM sessions WHERE id = ? LIMIT 1", [sid]).fetchone()
            existing_owner = str(existing["owner_user_id"] or "") if existing else ""
            if existing and not admin and owner_scope and existing_owner and existing_owner != owner_scope:
                raise PermissionError("session belongs to another user")
            owner = existing_owner or owner_scope
            if not owner:
                owner = str(getattr(s, "owner_user_id", "") or "").strip()
            created_at = int(existing["created_at"] or 0) if existing else int(getattr(s, "created_at", 0) or 0)
            if created_at <= 0:
                created_at = now
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
                  owner_user_id, created_at, updated_at
                ) VALUES (
                  :id, :title, :roles_json, :start_role, :project_id, :mode, :notes, :notes_by_element_json,
                  :interview_json, :nodes_json, :edges_json, :questions_json, :mermaid, :mermaid_simple, :mermaid_lanes,
                  :normalized_json, :resources_json, :analytics_json, :ai_llm_state_json,
                  :bpmn_xml, :bpmn_xml_version, :bpmn_graph_fingerprint, :bpmn_meta_json, :version,
                  :owner_user_id, :created_at, :updated_at
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
                  created_at=excluded.created_at,
                  updated_at=excluded.updated_at
                """,
                values,
            )
            con.commit()

    def delete(self, session_id: str, *, user_id: Optional[str] = None, is_admin: Optional[bool] = None) -> bool:
        sid = str(session_id or "").strip()
        if not sid:
            return False
        owner = _scope_user_id(user_id)
        admin = _scope_is_admin(is_admin)
        clause, params = _owner_clause(owner, admin)
        _ensure_schema()
        with _connect() as con:
            cur = con.execute(
                f"DELETE FROM sessions WHERE id = ? {clause}",
                [sid, *params],
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
        filters = []
        params: List[Any] = []
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
    ) -> str:
        _ensure_schema()
        _ = _scope_is_admin(is_admin)
        owner = _scope_user_id(user_id)
        pid = gen_project_id()
        now = _now_ts()
        with _connect() as con:
            con.execute(
                """
                INSERT INTO projects (id, title, passport_json, created_at, updated_at, version, owner_user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    pid,
                    str(title or "").strip() or "Проект",
                    _json_dumps(passport, {}),
                    now,
                    now,
                    1,
                    owner,
                ],
            )
            con.commit()
        return pid

    def list(self, *, user_id: Optional[str] = None, is_admin: Optional[bool] = None) -> list[Project]:
        owner = _scope_user_id(user_id)
        admin = _scope_is_admin(is_admin)
        _ensure_schema()
        if admin or not owner:
            sql = "SELECT * FROM projects ORDER BY updated_at DESC, created_at DESC"
            params: List[Any] = []
        else:
            sql = "SELECT * FROM projects WHERE owner_user_id = ? ORDER BY updated_at DESC, created_at DESC"
            params = [owner]
        with _connect() as con:
            rows = con.execute(sql, params).fetchall()
        return [_project_row_to_model(row) for row in rows]

    def load(self, project_id: str, *, user_id: Optional[str] = None, is_admin: Optional[bool] = None) -> Project | None:
        pid = str(project_id or "").strip()
        if not pid:
            return None
        owner = _scope_user_id(user_id)
        admin = _scope_is_admin(is_admin)
        clause, params = _owner_clause(owner, admin)
        _ensure_schema()
        with _connect() as con:
            row = con.execute(
                f"SELECT * FROM projects WHERE id = ? {clause} LIMIT 1",
                [pid, *params],
            ).fetchone()
        if not row:
            return None
        return _project_row_to_model(row)

    def save(self, proj: Project, *, user_id: Optional[str] = None, is_admin: Optional[bool] = None) -> None:
        _ensure_schema()
        pid = str(getattr(proj, "id", "") or "").trim()
        if not pid:
            raise ValueError("project id is required")
        owner_scope = _scope_user_id(user_id)
        admin = _scope_is_admin(is_admin)
        now = _now_ts()
        with _connect() as con:
            existing = con.execute("SELECT owner_user_id, created_at, version FROM projects WHERE id = ? LIMIT 1", [pid]).fetchone()
            existing_owner = str(existing["owner_user_id"] or "") if existing else ""
            if existing and not admin and owner_scope and existing_owner and existing_owner != owner_scope:
                raise PermissionError("project belongs to another user")
            owner = existing_owner or owner_scope or str(getattr(proj, "owner_user_id", "") or "").strip()
            created_at = int(existing["created_at"] or 0) if existing else int(getattr(proj, "created_at", 0) or 0)
            if created_at <= 0:
                created_at = now
            next_version = int(existing["version"] or 0) + 1 if existing else max(1, int(getattr(proj, "version", 1) or 1))
            con.execute(
                """
                INSERT INTO projects (id, title, passport_json, created_at, updated_at, version, owner_user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  title=excluded.title,
                  passport_json=excluded.passport_json,
                  created_at=excluded.created_at,
                  updated_at=excluded.updated_at,
                  version=excluded.version,
                  owner_user_id=excluded.owner_user_id
                """,
                [
                    pid,
                    str(getattr(proj, "title", "") or "").strip() or "Проект",
                    _json_dumps(getattr(proj, "passport", {}), {}),
                    created_at,
                    now,
                    next_version,
                    owner,
                ],
            )
            con.commit()

    def delete(self, project_id: str, *, user_id: Optional[str] = None, is_admin: Optional[bool] = None) -> bool:
        pid = str(project_id or "").strip()
        if not pid:
            return False
        owner = _scope_user_id(user_id)
        admin = _scope_is_admin(is_admin)
        clause, params = _owner_clause(owner, admin)
        _ensure_schema()
        with _connect() as con:
            cur = con.execute(
                f"DELETE FROM projects WHERE id = ? {clause}",
                [pid, *params],
            )
            con.commit()
            return int(cur.rowcount or 0) > 0


def get_project_storage() -> ProjectStorage:
    root = os.getenv("PROJECT_STORAGE_DIR", "").strip()
    if root:
        return ProjectStorage(Path(root))
    return ProjectStorage(_db_base_dir())


def get_storage() -> Storage:
    return Storage(base_dir=_db_base_dir())
