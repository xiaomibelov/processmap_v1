from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from typing import Any, Dict, Generator
from urllib.parse import urlparse

from .config import config

_pg_pool: Any | None = None


def _get_pg_pool() -> Any:
    global _pg_pool
    if _pg_pool is None:
        from psycopg_pool import ConnectionPool

        _pg_pool = ConnectionPool(
            config.DATABASE_URL,
            min_size=1,
            max_size=10,
            open=True,
        )
    return _pg_pool


@contextmanager
def get_conn() -> Generator[Any, None, None]:
    parsed = urlparse(config.DATABASE_URL)
    if parsed.scheme == "sqlite":
        path = parsed.path or ""
        if path == ":memory:" or not path:
            db_path = ":memory:"
        elif path.startswith("/"):
            db_path = path
        else:
            db_path = path
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()
    else:
        pool = _get_pg_pool()
        with pool.connection() as conn:
            from psycopg.rows import dict_row

            conn.row_factory = dict_row
            yield conn


def row_to_dict(row: Any) -> Dict[str, Any]:
    if row is None:
        return {}
    if isinstance(row, sqlite3.Row):
        return dict(row)
    # psycopg Row / tuple
    return dict(row)


def is_sqlite() -> bool:
    return urlparse(config.DATABASE_URL).scheme == "sqlite"


def adapt_sql(sql: str) -> str:
    """Convert SQLite '?' placeholders to PostgreSQL '%s' when needed."""
    return sql if is_sqlite() else sql.replace("?", "%s")


def ensure_schema() -> None:
    """Create the error_events table if it does not exist."""
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS error_events (
                id TEXT PRIMARY KEY,
                schema_version INTEGER NOT NULL,
                occurred_at INTEGER NOT NULL,
                ingested_at INTEGER NOT NULL,
                source TEXT NOT NULL,
                event_type TEXT NOT NULL,
                severity TEXT NOT NULL,
                message TEXT NOT NULL,
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
                fingerprint TEXT NOT NULL,
                context_json TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_error_events_org_id ON error_events(org_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_error_events_session_id ON error_events(session_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_error_events_request_id ON error_events(request_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_error_events_correlation_id ON error_events(correlation_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_error_events_fingerprint ON error_events(fingerprint)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_error_events_ingested_at ON error_events(ingested_at)"
        )
