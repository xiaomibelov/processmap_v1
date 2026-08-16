"""Подключение к общей БД (PostgreSQL prod/stage, SQLite в тестах).

Паттерн notifications db.py: DATABASE_URL, psycopg_pool, adapt_sql, row_to_dict.
Миграций сервис НЕ содержит — схему накатывает только монолит
(backend/scripts/db_bootstrap.py, LINEAR). ensure_schema здесь нет сознательно.
"""
from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from typing import Any, Dict, Generator
from urllib.parse import urlparse

_pg_pool: Any | None = None
_pg_pool_url: str = ""


def database_url() -> str:
    return str(os.environ.get("DATABASE_URL") or "sqlite:///./agent.db").strip()


def _get_pg_pool() -> Any:
    global _pg_pool, _pg_pool_url
    url = database_url()
    if _pg_pool is None or _pg_pool_url != url:
        from psycopg_pool import ConnectionPool

        _pg_pool = ConnectionPool(url, min_size=1, max_size=10, open=True)
        _pg_pool_url = url
    return _pg_pool


@contextmanager
def get_conn() -> Generator[Any, None, None]:
    parsed = urlparse(database_url())
    if parsed.scheme == "sqlite":
        db_path = parsed.path or ":memory:"
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
    # psycopg DictRow / mapping
    return dict(row)


def is_sqlite() -> bool:
    return urlparse(database_url()).scheme == "sqlite"


def adapt_sql(sql: str) -> str:
    """Convert SQLite '?' placeholders to PostgreSQL '%s' when needed."""
    return sql if is_sqlite() else sql.replace("?", "%s")
