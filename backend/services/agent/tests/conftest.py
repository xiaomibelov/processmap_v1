"""AGENT-SVC: conftest тестов agent-сервиса.

Изоляция — per-test свежая on-disk SQLite через DATABASE_URL (паттерн
backend/tests/conftest.py isolate_process_db; db.py читает env в момент вызова).
Seed-хелперы (users/org_memberships/sessions + JWT) — прямым SQL, монолитные
app.* фабрики НЕ используются (сервис не импортирует backend.app.*).
"""
from __future__ import annotations

import os
import sys
import tempfile
import time
import uuid
from types import SimpleNamespace
from unittest import mock

import jwt
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("AGENT_SVC_INTERNAL_TOKEN", "test-internal-token")

# Imported before autouse mock so tests can restore the real router when needed.
from memory.chat import route_intent as _real_route_intent  # noqa: E402

DEFAULT_ORG = "org_default"

_CORE_DDL = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    is_admin BOOLEAN NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS org_memberships (
    org_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    UNIQUE(org_id, user_id)
);
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'org_default',
    project_id TEXT,
    owner_user_id TEXT NOT NULL DEFAULT '',
    deleted_at INTEGER NOT NULL DEFAULT 0,
    diagram_state_version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS llm_providers (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'org_default',
    name TEXT NOT NULL DEFAULT '',
    base_url TEXT NOT NULL DEFAULT '',
    api_key TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    priority INTEGER NOT NULL DEFAULT 100,
    enabled BOOLEAN NOT NULL DEFAULT 1,
    created_by TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_by TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS llm_prompts (
    id TEXT PRIMARY KEY,
    feature TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    system TEXT NOT NULL DEFAULT '',
    template TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    max_tokens INTEGER NOT NULL DEFAULT 2000,
    model_class TEXT NOT NULL DEFAULT 'primary',
    updated_by TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS llm_feature_flags (
    feature TEXT PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT 1,
    daily_token_limit INTEGER NOT NULL DEFAULT 200000,
    updated_by TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS llm_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id TEXT NOT NULL DEFAULT 'org_default',
    feature TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    provider_id TEXT NOT NULL DEFAULT '',
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    cached BOOLEAN NOT NULL DEFAULT 0,
    cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
    user_id TEXT NOT NULL DEFAULT '',
    project_id TEXT NOT NULL DEFAULT '',
    session_id TEXT NOT NULL DEFAULT '',
    latency_ms INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ok',
    ts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS llm_models (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'org_default',
    provider TEXT NOT NULL DEFAULT '',
    model_name TEXT NOT NULL DEFAULT '',
    display_name TEXT NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT 1,
    is_default BOOLEAN NOT NULL DEFAULT 0,
    model_class TEXT NOT NULL DEFAULT 'primary',
    cost_prompt_1k_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
    cost_completion_1k_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
    params TEXT NOT NULL DEFAULT '{}',
    created_by TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_by TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS llm_feature_models (
    feature TEXT NOT NULL,
    org_id TEXT NOT NULL DEFAULT 'org_default',
    model_id TEXT NOT NULL,
    model_class TEXT NOT NULL DEFAULT 'primary',
    updated_by TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT 0,
    UNIQUE(org_id, feature, model_class)
);
CREATE TABLE IF NOT EXISTS agent_schema_memory (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'org_default',
    session_id TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    facts_json TEXT NOT NULL DEFAULT '{}',
    decisions_json TEXT NOT NULL DEFAULT '{}',
    projection_digest TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    UNIQUE(org_id, session_id)
);
CREATE INDEX IF NOT EXISTS idx_agent_schema_memory_session
ON agent_schema_memory(org_id, session_id);
CREATE TABLE IF NOT EXISTS agent_pending_edits (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'org_default',
    session_id TEXT NOT NULL,
    turn_id TEXT NOT NULL,
    edit_plan_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL CHECK (status IN ('pending', 'applied', 'rejected', 'expired', 'conflict_rev')),
    base_diagram_state_version INTEGER NOT NULL DEFAULT 0,
    expires_at BIGINT NOT NULL,
    created_at BIGINT NOT NULL,
    resumed_by_user_id TEXT,
    resumed_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_agent_pending_edits_session_status
ON agent_pending_edits(org_id, session_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_pending_edits_turn
ON agent_pending_edits(org_id, session_id, turn_id);
"""


@pytest.fixture(autouse=True)
def isolate_service_db():
    """Каждый тест — свежая on-disk SQLite; env восстанавливается после теста."""
    old_url = os.environ.get("DATABASE_URL")
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    os.environ["DATABASE_URL"] = f"sqlite:///{path}"
    import sqlite3

    with sqlite3.connect(path) as conn:
        conn.executescript(_CORE_DDL)
    yield
    if old_url is None:
        os.environ.pop("DATABASE_URL", None)
    else:
        os.environ["DATABASE_URL"] = old_url
    try:
        os.unlink(path)
    except Exception:
        pass


def _make_user(is_admin: bool = False) -> str:
    import db

    uid = uuid.uuid4().hex
    with db.get_conn() as conn:
        conn.execute(
            db.adapt_sql("INSERT INTO users (id, is_admin) VALUES (?, ?)"),
            [uid, bool(is_admin)],
        )
    return uid


def _make_token(user_id: str) -> str:
    return jwt.encode(
        {"sub": str(user_id), "iat": int(time.time()), "exp": int(time.time()) + 3600},
        os.environ["JWT_SECRET"],
        algorithm="HS256",
    )


def _add_membership(org_id: str, user_id: str, role: str = "editor") -> None:
    import db

    with db.get_conn() as conn:
        conn.execute(
            db.adapt_sql("INSERT INTO org_memberships (org_id, user_id, role) VALUES (?, ?, ?)"),
            [org_id, user_id, role],
        )


def _make_session(
    session_id: str = "",
    org_id: str = DEFAULT_ORG,
    project_id: str = "proj_1",
    owner_user_id: str = "",
) -> str:
    import db

    sid = str(session_id or "").strip() or f"sess_{uuid.uuid4().hex[:8]}"
    with db.get_conn() as conn:
        conn.execute(
            db.adapt_sql("INSERT INTO sessions (id, org_id, project_id, owner_user_id) VALUES (?, ?, ?, ?)"),
            [sid, org_id, project_id, owner_user_id],
        )
    return sid


@pytest.fixture
def seed():
    """Seed-хелперы поверх текущей изолированной БД теста."""
    return SimpleNamespace(
        make_user=_make_user,
        make_token=_make_token,
        add_membership=_add_membership,
        make_session=_make_session,
        DEFAULT_ORG=DEFAULT_ORG,
    )


@pytest.fixture
def member_user(seed):
    """Org member (не admin) в default org + его токен."""
    uid = seed.make_user(is_admin=False)
    seed.add_membership(seed.DEFAULT_ORG, uid, "editor")
    return {"id": uid, "token": seed.make_token(uid)}


@pytest.fixture
def session_id(seed, member_user):
    return seed.make_session(org_id=seed.DEFAULT_ORG, owner_user_id=member_user["id"])


@pytest.fixture(autouse=True)
def mock_route_intent_smalltalk():
    """AGENT-1: keep AGENT-0 regression tests on the free-answer path.

    New intent/branch tests can restore the real router via
    `mock_route_intent_smalltalk.side_effect = _real_route_intent`.
    """
    with mock.patch("memory.chat.route_intent", return_value="smalltalk") as m:
        yield m
