#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence, Tuple
from urllib.parse import urlsplit, urlunsplit

import psycopg

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


TABLES_IN_ORDER: List[str] = [
    "storage_meta",
    "orgs",
    "org_memberships",
    "projects",
    "project_memberships",
    "sessions",
    "template_folders",
    "templates",
    "org_invites",
    "audit_log",
]

TABLE_KEY_COLUMNS: Dict[str, List[str]] = {
    "storage_meta": ["key"],
    "orgs": ["id"],
    "org_memberships": ["org_id", "user_id"],
    "projects": ["id"],
    "project_memberships": ["org_id", "project_id", "user_id"],
    "sessions": ["id"],
    "template_folders": ["id"],
    "templates": ["id"],
    "org_invites": ["id"],
    "audit_log": ["id"],
}

EXPECTED_INDEXES: Dict[str, List[str]] = {
    "projects": ["idx_projects_owner_updated", "idx_projects_org_updated"],
    "sessions": ["idx_sessions_owner_updated", "idx_sessions_project", "idx_sessions_org_project_updated"],
    "org_memberships": ["idx_org_memberships_user"],
    "project_memberships": ["idx_project_memberships_org_user", "idx_project_memberships_org_project"],
    "templates": [
        "idx_templates_scope_owner_updated",
        "idx_templates_scope_org_updated",
        "idx_templates_owner_updated",
        "idx_templates_scope_updated",
        "idx_templates_org_scope_updated",
        "idx_templates_folder",
    ],
    "template_folders": ["idx_template_folders_scope_owner", "idx_template_folders_scope_org", "idx_template_folders_parent"],
    "org_invites": ["idx_org_invites_org_created", "idx_org_invites_token_hash", "idx_org_invites_active_unique"],
    "audit_log": ["idx_audit_org_ts", "idx_audit_org_action", "idx_audit_project", "idx_audit_session"],
}


def _redact_dsn(url: str) -> str:
    src = str(url or "").strip()
    if not src:
        return ""
    parts = urlsplit(src)
    if "@" not in parts.netloc:
        return src
    left, right = parts.netloc.rsplit("@", 1)
    if ":" in left:
        user = left.split(":", 1)[0]
        auth = f"{user}:***"
    else:
        auth = "***"
    return urlunsplit((parts.scheme, f"{auth}@{right}", parts.path, parts.query, parts.fragment))


def _utc(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def _sqlite_columns(con: sqlite3.Connection, table: str) -> List[str]:
    rows = con.execute(f"PRAGMA table_info({table})").fetchall()
    return [str(row[1]) for row in rows]


def _pg_columns(con: psycopg.Connection[Any], table: str) -> List[str]:
    with con.cursor() as cur:
        rows = cur.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = %s
            ORDER BY ordinal_position
            """,
            [table],
        ).fetchall()
    return [str(row[0]) for row in rows]


def _table_count_sqlite(con: sqlite3.Connection, table: str) -> int:
    return int(con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] or 0)


def _table_count_pg(con: psycopg.Connection[Any], table: str) -> int:
    with con.cursor() as cur:
        row = cur.execute(f"SELECT COUNT(*) FROM {table}").fetchone()
    return int((row[0] if row else 0) or 0)


def _safe_ident(name: str) -> str:
    src = str(name or "").strip()
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", src):
        raise ValueError(f"unsafe identifier: {src}")
    return src


def _build_insert_sql(table: str, cols: Sequence[str]) -> str:
    table_name = _safe_ident(table)
    columns = [_safe_ident(c) for c in cols]
    col_sql = ", ".join(columns)
    val_sql = ", ".join(["%s"] * len(columns))
    return f"INSERT INTO {table_name} ({col_sql}) VALUES ({val_sql})"


def _row_digest(parts: Iterable[Any]) -> str:
    h = hashlib.sha256()
    for p in parts:
        if p is None:
            h.update(b"\x00")
            continue
        if isinstance(p, (bytes, bytearray)):
            h.update(bytes(p))
            h.update(b"\x1f")
            continue
        h.update(str(p).encode("utf-8", errors="replace"))
        h.update(b"\x1f")
    return h.hexdigest()


def _source_session_digests(sqlite_con: sqlite3.Connection) -> Dict[str, str]:
    rows = sqlite_con.execute(
        """
        SELECT id, bpmn_meta_json, interview_json, notes_by_element_json, nodes_json, edges_json, questions_json, bpmn_xml
        FROM sessions
        ORDER BY id
        """
    ).fetchall()
    out: Dict[str, str] = {}
    for row in rows:
        sid = str(row[0] or "")
        out[sid] = _row_digest(row)
    return out


def _target_session_digests(pg_con: psycopg.Connection[Any]) -> Dict[str, str]:
    with pg_con.cursor() as cur:
        rows = cur.execute(
            """
            SELECT id, bpmn_meta_json, interview_json, notes_by_element_json, nodes_json, edges_json, questions_json, bpmn_xml
            FROM sessions
            ORDER BY id
            """
        ).fetchall()
    out: Dict[str, str] = {}
    for row in rows:
        sid = str(row[0] or "")
        out[sid] = _row_digest(row)
    return out


def _orphans_sqlite(sqlite_con: sqlite3.Connection) -> Dict[str, int]:
    checks = {
        "projects.org_id_missing": """
            SELECT COUNT(*) FROM projects p
            LEFT JOIN orgs o ON o.id = p.org_id
            WHERE COALESCE(p.org_id,'') <> '' AND o.id IS NULL
        """,
        "sessions.org_id_missing": """
            SELECT COUNT(*) FROM sessions s
            LEFT JOIN orgs o ON o.id = s.org_id
            WHERE COALESCE(s.org_id,'') <> '' AND o.id IS NULL
        """,
        "sessions.project_id_missing": """
            SELECT COUNT(*) FROM sessions s
            LEFT JOIN projects p ON p.id = s.project_id
            WHERE COALESCE(s.project_id,'') <> '' AND p.id IS NULL
        """,
        "project_memberships.project_id_missing": """
            SELECT COUNT(*) FROM project_memberships pm
            LEFT JOIN projects p ON p.id = pm.project_id
            WHERE p.id IS NULL
        """,
        "project_memberships.org_id_missing": """
            SELECT COUNT(*) FROM project_memberships pm
            LEFT JOIN orgs o ON o.id = pm.org_id
            WHERE o.id IS NULL
        """,
        "org_memberships.org_id_missing": """
            SELECT COUNT(*) FROM org_memberships om
            LEFT JOIN orgs o ON o.id = om.org_id
            WHERE o.id IS NULL
        """,
        "org_invites.org_id_missing": """
            SELECT COUNT(*) FROM org_invites oi
            LEFT JOIN orgs o ON o.id = oi.org_id
            WHERE o.id IS NULL
        """,
    }
    out: Dict[str, int] = {}
    for key, sql in checks.items():
        out[key] = int(sqlite_con.execute(sql).fetchone()[0] or 0)
    return out


def _orphans_pg(pg_con: psycopg.Connection[Any]) -> Dict[str, int]:
    checks = {
        "projects.org_id_missing": """
            SELECT COUNT(*) FROM projects p
            LEFT JOIN orgs o ON o.id = p.org_id
            WHERE COALESCE(p.org_id,'') <> '' AND o.id IS NULL
        """,
        "sessions.org_id_missing": """
            SELECT COUNT(*) FROM sessions s
            LEFT JOIN orgs o ON o.id = s.org_id
            WHERE COALESCE(s.org_id,'') <> '' AND o.id IS NULL
        """,
        "sessions.project_id_missing": """
            SELECT COUNT(*) FROM sessions s
            LEFT JOIN projects p ON p.id = s.project_id
            WHERE COALESCE(s.project_id,'') <> '' AND p.id IS NULL
        """,
        "project_memberships.project_id_missing": """
            SELECT COUNT(*) FROM project_memberships pm
            LEFT JOIN projects p ON p.id = pm.project_id
            WHERE p.id IS NULL
        """,
        "project_memberships.org_id_missing": """
            SELECT COUNT(*) FROM project_memberships pm
            LEFT JOIN orgs o ON o.id = pm.org_id
            WHERE o.id IS NULL
        """,
        "org_memberships.org_id_missing": """
            SELECT COUNT(*) FROM org_memberships om
            LEFT JOIN orgs o ON o.id = om.org_id
            WHERE o.id IS NULL
        """,
        "org_invites.org_id_missing": """
            SELECT COUNT(*) FROM org_invites oi
            LEFT JOIN orgs o ON o.id = oi.org_id
            WHERE o.id IS NULL
        """,
    }
    out: Dict[str, int] = {}
    with pg_con.cursor() as cur:
        for key, sql in checks.items():
            row = cur.execute(sql).fetchone()
            out[key] = int((row[0] if row else 0) or 0)
    return out


def _reset_target(pg_con: psycopg.Connection[Any]) -> None:
    ordered = list(reversed(TABLES_IN_ORDER))
    with pg_con.cursor() as cur:
        for table in ordered:
            cur.execute(f"TRUNCATE TABLE {_safe_ident(table)}")
    pg_con.commit()


def _transfer_table(
    sqlite_con: sqlite3.Connection,
    pg_con: psycopg.Connection[Any],
    table: str,
    *,
    batch_size: int,
) -> Dict[str, Any]:
    src_cols = _sqlite_columns(sqlite_con, table)
    dst_cols = _pg_columns(pg_con, table)
    shared_cols = [c for c in src_cols if c in set(dst_cols)]
    source_only_cols = [c for c in src_cols if c not in set(dst_cols)]
    target_only_cols = [c for c in dst_cols if c not in set(src_cols)]

    src_count = _table_count_sqlite(sqlite_con, table)
    if not shared_cols:
        raise RuntimeError(f"{table}: no shared columns between source and target")

    dropped_non_empty: Dict[str, int] = {}
    for col in source_only_cols:
        cnt = int(
            sqlite_con.execute(
                f"SELECT COUNT(*) FROM {_safe_ident(table)} WHERE COALESCE({_safe_ident(col)}, '') <> ''"
            ).fetchone()[0]
            or 0
        )
        if cnt > 0:
            dropped_non_empty[col] = cnt

    insert_sql = _build_insert_sql(table, shared_cols)
    sel_sql = f"SELECT {', '.join(_safe_ident(c) for c in shared_cols)} FROM {_safe_ident(table)}"

    with sqlite_con:
        src_cur = sqlite_con.execute(sel_sql)
        with pg_con.cursor() as dst_cur:
            while True:
                rows = src_cur.fetchmany(batch_size)
                if not rows:
                    break
                dst_cur.executemany(insert_sql, rows)
    pg_con.commit()
    dst_count = _table_count_pg(pg_con, table)
    return {
        "table": table,
        "source_count": src_count,
        "target_count": dst_count,
        "shared_columns": shared_cols,
        "source_only_columns": source_only_cols,
        "target_only_columns": target_only_cols,
        "source_only_non_empty": dropped_non_empty,
    }


def _table_key_set_sqlite(sqlite_con: sqlite3.Connection, table: str, key_cols: Sequence[str]) -> set[Tuple[str, ...]]:
    if not key_cols:
        return set()
    sql = f"SELECT {', '.join(_safe_ident(c) for c in key_cols)} FROM {_safe_ident(table)}"
    rows = sqlite_con.execute(sql).fetchall()
    return {tuple(str(v or "") for v in row) for row in rows}


def _table_key_set_pg(pg_con: psycopg.Connection[Any], table: str, key_cols: Sequence[str]) -> set[Tuple[str, ...]]:
    if not key_cols:
        return set()
    sql = f"SELECT {', '.join(_safe_ident(c) for c in key_cols)} FROM {_safe_ident(table)}"
    with pg_con.cursor() as cur:
        rows = cur.execute(sql).fetchall()
    return {tuple(str(v or "") for v in row) for row in rows}


def _check_indexes(pg_con: psycopg.Connection[Any]) -> Dict[str, Dict[str, bool]]:
    with pg_con.cursor() as cur:
        rows = cur.execute(
            """
            SELECT tablename, indexname
            FROM pg_indexes
            WHERE schemaname = current_schema()
            """
        ).fetchall()
    by_table: Dict[str, set[str]] = {}
    for table, index in rows:
        t = str(table or "")
        by_table.setdefault(t, set()).add(str(index or ""))
    out: Dict[str, Dict[str, bool]] = {}
    for table, expected in EXPECTED_INDEXES.items():
        present = by_table.get(table, set())
        out[table] = {idx: (idx in present) for idx in expected}
    return out


def _check_constraints(pg_con: psycopg.Connection[Any]) -> List[Dict[str, Any]]:
    with pg_con.cursor() as cur:
        rows = cur.execute(
            """
            SELECT table_name, constraint_name, constraint_type
            FROM information_schema.table_constraints
            WHERE table_schema = current_schema()
              AND table_name = ANY(%s)
            ORDER BY table_name, constraint_name
            """,
            [TABLES_IN_ORDER],
        ).fetchall()
    out: List[Dict[str, Any]] = []
    for table_name, constraint_name, constraint_type in rows:
        out.append(
            {
                "table": str(table_name or ""),
                "constraint_name": str(constraint_name or ""),
                "constraint_type": str(constraint_type or ""),
            }
        )
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Transfer ProcessMap data from SQLite to PostgreSQL with verification.")
    parser.add_argument("--source-sqlite", required=True, help="Path to source SQLite DB file.")
    parser.add_argument("--postgres-url", default=os.environ.get("DATABASE_URL", ""), help="Target PostgreSQL DSN.")
    parser.add_argument("--batch-size", type=int, default=1000)
    parser.add_argument("--reset-target", action="store_true", help="TRUNCATE target tables before import.")
    args = parser.parse_args()

    source_path = Path(str(args.source_sqlite or "")).expanduser().resolve()
    if not source_path.exists():
        raise SystemExit(f"source sqlite db not found: {source_path}")
    target_url = str(args.postgres_url or "").strip()
    if not target_url:
        raise SystemExit("postgres url is required (use --postgres-url or DATABASE_URL)")
    if urlsplit(target_url).scheme.lower() not in {"postgres", "postgresql", "postgresql+psycopg"}:
        raise SystemExit("postgres-url must use postgres/postgresql scheme")

    # Ensure schema/bootstrap in target DB.
    os.environ["FPC_DB_BACKEND"] = "postgres"
    os.environ["DATABASE_URL"] = target_url
    try:
        from backend.app.storage import startup_db_check  # type: ignore
    except Exception:
        from app.storage import startup_db_check  # type: ignore

    startup_db_check()

    sqlite_con = sqlite3.connect(str(source_path))
    sqlite_con.row_factory = sqlite3.Row
    pg_con = psycopg.connect(target_url)
    pg_con.autocommit = False

    src_stat = source_path.stat()
    print("SOURCE_DB", json.dumps({
        "path": str(source_path),
        "size_bytes": int(src_stat.st_size),
        "mtime_utc": _utc(src_stat.st_mtime),
    }, ensure_ascii=False))
    print("TARGET_DB", json.dumps({"dsn": _redact_dsn(target_url)}, ensure_ascii=False))

    src_counts_before = {table: _table_count_sqlite(sqlite_con, table) for table in TABLES_IN_ORDER}
    tgt_counts_before = {table: _table_count_pg(pg_con, table) for table in TABLES_IN_ORDER}
    print("COUNTS_BEFORE", json.dumps({"source": src_counts_before, "target": tgt_counts_before}, ensure_ascii=False))

    if args.reset_target:
        _reset_target(pg_con)
        tgt_counts_after_reset = {table: _table_count_pg(pg_con, table) for table in TABLES_IN_ORDER}
        print("COUNTS_AFTER_RESET", json.dumps(tgt_counts_after_reset, ensure_ascii=False))

    table_reports: List[Dict[str, Any]] = []
    for table in TABLES_IN_ORDER:
        report = _transfer_table(sqlite_con, pg_con, table, batch_size=max(1, int(args.batch_size or 1000)))
        table_reports.append(report)
        print("TRANSFER_TABLE", json.dumps(report, ensure_ascii=False))

    src_counts_after = {table: _table_count_sqlite(sqlite_con, table) for table in TABLES_IN_ORDER}
    tgt_counts_after = {table: _table_count_pg(pg_con, table) for table in TABLES_IN_ORDER}
    print("COUNTS_AFTER", json.dumps({"source": src_counts_after, "target": tgt_counts_after}, ensure_ascii=False))

    key_integrity: Dict[str, Dict[str, Any]] = {}
    for table, key_cols in TABLE_KEY_COLUMNS.items():
        src_keys = _table_key_set_sqlite(sqlite_con, table, key_cols)
        tgt_keys = _table_key_set_pg(pg_con, table, key_cols)
        missing_in_target = sorted(src_keys - tgt_keys)[:10]
        extra_in_target = sorted(tgt_keys - src_keys)[:10]
        key_integrity[table] = {
            "key_columns": list(key_cols),
            "source_keys": len(src_keys),
            "target_keys": len(tgt_keys),
            "missing_in_target_sample": missing_in_target,
            "extra_in_target_sample": extra_in_target,
        }
    print("KEY_INTEGRITY", json.dumps(key_integrity, ensure_ascii=False))

    src_orphans = _orphans_sqlite(sqlite_con)
    tgt_orphans = _orphans_pg(pg_con)
    print("ORPHANS", json.dumps({"source": src_orphans, "target": tgt_orphans}, ensure_ascii=False))

    src_session_digest = _source_session_digests(sqlite_con)
    tgt_session_digest = _target_session_digests(pg_con)
    mismatched_sessions = sorted(
        [
            sid for sid in src_session_digest.keys()
            if sid not in tgt_session_digest or src_session_digest[sid] != tgt_session_digest[sid]
        ]
    )
    print(
        "SESSION_DIGEST",
        json.dumps(
            {
                "source_sessions": len(src_session_digest),
                "target_sessions": len(tgt_session_digest),
                "mismatched_count": len(mismatched_sessions),
                "mismatched_sample": mismatched_sessions[:20],
            },
            ensure_ascii=False,
        ),
    )

    with sqlite_con:
        source_meta_presence = sqlite_con.execute(
            """
            SELECT
              SUM(CASE WHEN COALESCE(bpmn_meta_json,'') <> '' AND bpmn_meta_json <> '{}' THEN 1 ELSE 0 END) AS bpmn_meta_non_empty,
              SUM(CASE WHEN COALESCE(interview_json,'') <> '' AND interview_json <> '{}' THEN 1 ELSE 0 END) AS interview_non_empty,
              SUM(CASE WHEN COALESCE(notes_by_element_json,'') <> '' AND notes_by_element_json <> '{}' THEN 1 ELSE 0 END) AS notes_by_element_non_empty
            FROM sessions
            """
        ).fetchone()
    with pg_con.cursor() as cur:
        target_meta_presence = cur.execute(
            """
            SELECT
              SUM(CASE WHEN COALESCE(bpmn_meta_json,'') <> '' AND bpmn_meta_json <> '{}' THEN 1 ELSE 0 END) AS bpmn_meta_non_empty,
              SUM(CASE WHEN COALESCE(interview_json,'') <> '' AND interview_json <> '{}' THEN 1 ELSE 0 END) AS interview_non_empty,
              SUM(CASE WHEN COALESCE(notes_by_element_json,'') <> '' AND notes_by_element_json <> '{}' THEN 1 ELSE 0 END) AS notes_by_element_non_empty
            FROM sessions
            """
        ).fetchone()
    print(
        "SESSION_META_PRESENCE",
        json.dumps(
            {
                "source": {
                    "bpmn_meta_non_empty": int(source_meta_presence[0] or 0),
                    "interview_non_empty": int(source_meta_presence[1] or 0),
                    "notes_by_element_non_empty": int(source_meta_presence[2] or 0),
                },
                "target": {
                    "bpmn_meta_non_empty": int(target_meta_presence[0] or 0),
                    "interview_non_empty": int(target_meta_presence[1] or 0),
                    "notes_by_element_non_empty": int(target_meta_presence[2] or 0),
                },
            },
            ensure_ascii=False,
        ),
    )

    with sqlite_con:
        source_audit_dims = sqlite_con.execute(
            """
            SELECT
              SUM(CASE WHEN COALESCE(org_id,'') <> '' THEN 1 ELSE 0 END) AS org_linked,
              SUM(CASE WHEN COALESCE(project_id,'') <> '' THEN 1 ELSE 0 END) AS project_linked,
              SUM(CASE WHEN COALESCE(session_id,'') <> '' THEN 1 ELSE 0 END) AS session_linked
            FROM audit_log
            """
        ).fetchone()
    with pg_con.cursor() as cur:
        target_audit_dims = cur.execute(
            """
            SELECT
              SUM(CASE WHEN COALESCE(org_id,'') <> '' THEN 1 ELSE 0 END) AS org_linked,
              SUM(CASE WHEN COALESCE(project_id,'') <> '' THEN 1 ELSE 0 END) AS project_linked,
              SUM(CASE WHEN COALESCE(session_id,'') <> '' THEN 1 ELSE 0 END) AS session_linked
            FROM audit_log
            """
        ).fetchone()
    print(
        "AUDIT_LINKAGE",
        json.dumps(
            {
                "source": {
                    "org_linked": int(source_audit_dims[0] or 0),
                    "project_linked": int(source_audit_dims[1] or 0),
                    "session_linked": int(source_audit_dims[2] or 0),
                },
                "target": {
                    "org_linked": int(target_audit_dims[0] or 0),
                    "project_linked": int(target_audit_dims[1] or 0),
                    "session_linked": int(target_audit_dims[2] or 0),
                },
            },
            ensure_ascii=False,
        ),
    )

    constraints = _check_constraints(pg_con)
    indexes = _check_indexes(pg_con)
    print("PG_CONSTRAINTS", json.dumps(constraints, ensure_ascii=False))
    print("PG_INDEXES", json.dumps(indexes, ensure_ascii=False))

    sqlite_con.close()
    pg_con.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
