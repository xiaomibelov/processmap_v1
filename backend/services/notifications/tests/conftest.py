from __future__ import annotations

import os
import sqlite3
import tempfile
from pathlib import Path

import pytest

# Set environment before any app modules are imported by test modules.
_fd, _DB_PATH = tempfile.mkstemp(suffix=".db")
os.close(_fd)
os.environ["DATABASE_URL"] = f"sqlite:///{_DB_PATH}"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["NOTIFICATIONS_SKIP_AUTH"] = "1"
os.environ["NOTIFICATIONS_LOG_LEVEL"] = "warning"


def _ensure_user_and_membership_tables(db_path: str) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                is_admin BOOLEAN NOT NULL DEFAULT 0
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS org_memberships (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                org_id TEXT NOT NULL,
                role TEXT NOT NULL
            )
            """
        )
        conn.commit()


_ensure_user_and_membership_tables(_DB_PATH)


@pytest.fixture(scope="session", autouse=True)
def _ensure_schema_fixture():
    # Import here so that config picks up the env vars set above.
    from app.db import ensure_schema

    ensure_schema()
    yield
    try:
        Path(_DB_PATH).unlink(missing_ok=True)
    except Exception:
        pass


@pytest.fixture
def db_path():
    return _DB_PATH
