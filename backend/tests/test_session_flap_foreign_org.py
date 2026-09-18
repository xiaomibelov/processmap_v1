"""Регрессия: флап GET /api/sessions/{id} 200→404 при переключении в foreign org.

Руткоз (fix/session-flap-foreign-org): session_cache projection ключ орг-агностичен
(TTL 30 с) и отдаётся без проверки видимости (session_service.get_session), а холодный
путь строго скоуплен по active org без candidate-fallback по memberships →
чужой-org GET: 200 пока кэш тёплый / 404 когда холоден; non-member получает 200 из
кэша (authz-утечка).

Контракт после фикса:
- member сессии (membership в org сессии) → 200 при ЛЮБОМ active org, тёплый/холодный кэш;
- platform_admin → 200 при любом active org;
- non-member → 404 SESSION_NOT_FOUND байт-в-байт прежний, тёплый/холодный кэш.
"""
import os
import sqlite3
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class _FakeRedis:
    def __init__(self):
        self.store = {}

    def get(self, key):
        return self.store.get(str(key))

    def set(self, key, value, ex=None):
        self.store[str(key)] = str(value)
        return True

    def setex(self, key, ttl, value):
        _ = ttl
        self.store[str(key)] = str(value)
        return True

    def delete(self, key):
        k = str(key)
        if k in self.store:
            del self.store[k]
            return 1
        return 0

    def scan_iter(self, match=None, count=500):
        _ = count
        pattern = str(match or "")
        prefix = pattern[:-1] if pattern.endswith("*") else pattern
        for key in sorted(self.store.keys()):
            if not prefix or key.startswith(prefix):
                yield key


class SessionFlapForeignOrgTest(unittest.TestCase):
    def setUp(self):
        self.tmp_sessions = tempfile.TemporaryDirectory()
        self.tmp_projects = tempfile.TemporaryDirectory()
        self.old_sessions_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_projects_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp_sessions.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp_projects.name
        os.environ.pop("PROCESS_DB_PATH", None)

        from app.auth import create_user
        from app._legacy_main import (
            CreateSessionIn,
            create_org_project,
            create_org_project_session,
        )
        from app.models import CreateProjectIn
        from app.storage import (
            get_default_org_id,
            get_storage,
            push_storage_request_scope,
            pop_storage_request_scope,
        )

        self.CreateProjectIn = CreateProjectIn
        self.CreateSessionIn = CreateSessionIn
        self.create_org_project = create_org_project
        self.create_org_project_session = create_org_project_session
        self.get_default_org_id = get_default_org_id
        self.get_storage = get_storage
        self.push_scope = push_storage_request_scope
        self.pop_scope = pop_storage_request_scope

        self.admin = create_user("flap_admin@local", "admin", is_admin=True)
        self.member = create_user("flap_member@local", "member")
        self.outsider = create_user("flap_outsider@local", "outsider")

        _ = get_storage()
        self.org_a = get_default_org_id()   # org сессии
        self.org_b = "flap_org_b"           # foreign org
        self._create_org_record(self.org_b, "Flap Org B")

        # member — membership в обоих org; outsider — только в org_b
        self._ensure_org_membership(self.org_a, str(self.member.get("id") or ""), "org_admin")
        self._ensure_org_membership(self.org_b, str(self.member.get("id") or ""), "org_admin")
        self._ensure_org_membership(self.org_b, str(self.outsider.get("id") or ""), "org_admin")
        self._ensure_org_membership(self.org_a, str(self.admin.get("id") or ""), "org_admin")

        self.session_id = self._create_project_with_session("Flap Project", "Flap Session")

        from app.services import session_service as _svc
        self.svc = _svc

    def tearDown(self):
        if self.old_sessions_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_sessions_dir
        if self.old_projects_dir is None:
            os.environ.pop("PROJECT_STORAGE_DIR", None)
        else:
            os.environ["PROJECT_STORAGE_DIR"] = self.old_projects_dir
        if self.old_db_path is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = self.old_db_path
        self.tmp_sessions.cleanup()
        self.tmp_projects.cleanup()

    def _db_path(self):
        return os.path.join(self.tmp_sessions.name, "processmap.sqlite3")

    def _create_org_record(self, org_id: str, name: str):
        with sqlite3.connect(self._db_path()) as con:
            con.execute(
                "INSERT INTO orgs (id, name, is_active, created_at) VALUES (?, ?, 1, 0)",
                [org_id, name],
            )
            con.commit()

    def _ensure_org_membership(self, org_id: str, user_id: str, role: str):
        with sqlite3.connect(self._db_path()) as con:
            con.execute(
                """
                INSERT OR IGNORE INTO org_memberships (org_id, user_id, role, created_at)
                VALUES (?, ?, ?, 0)
                """,
                [org_id, user_id, role],
            )
            con.execute(
                "UPDATE org_memberships SET role = ? WHERE org_id = ? AND user_id = ?",
                [role, org_id, user_id],
            )
            con.commit()

    def _create_project_with_session(self, project_title: str, session_title: str) -> str:
        uid = str(self.admin.get("id") or "")
        request = _DummyRequest(self.admin, active_org_id=self.org_a)
        scope_token = self.push_scope(uid, True, self.org_a)
        try:
            project = self.create_org_project(
                self.org_a,
                self.CreateProjectIn(title=project_title, passport={}),
                request,
            )
            project_id = str(project.get("id") or "")
            session = self.create_org_project_session(
                self.org_a,
                project_id,
                self.CreateSessionIn(title=session_title, roles=["operator"], start_role="operator"),
                request,
                mode="quick_skeleton",
            )
            return str(session.get("id") or "")
        finally:
            self.pop_scope(scope_token)

    def _assert_session_not_found(self, exc: Exception):
        from fastapi import HTTPException

        self.assertIsInstance(exc, HTTPException)
        self.assertEqual(exc.status_code, 404)
        detail = exc.detail if isinstance(exc.detail, dict) else {}
        self.assertEqual(detail.get("code"), "SESSION_NOT_FOUND")

    def _warm_cache(self, fake: _FakeRedis):
        """Тёплый кэш: GET от admin в org сессии → 200 + запись projection."""
        req = _DummyRequest(self.admin, active_org_id=self.org_a)
        with patch("app.redis_cache.get_client", return_value=fake):
            payload = self.svc.get_session(self.session_id, request=req)
        self.assertEqual(str(payload.get("id") or ""), self.session_id)

    # ── кэш-хит с foreign active org ──────────────────────────────────────

    def test_warm_cache_non_member_foreign_org_gets_404(self):
        """Authz-утечка: тёплый org-агностичный кэш отдаёт сессию non-member."""
        fake = _FakeRedis()
        self._warm_cache(fake)
        req = _DummyRequest(self.outsider, active_org_id=self.org_b)
        with patch("app.redis_cache.get_client", return_value=fake):
            with self.assertRaises(Exception) as ctx:
                self.svc.get_session(self.session_id, request=req)
        self._assert_session_not_found(ctx.exception)

    def test_warm_cache_member_foreign_org_gets_200(self):
        """Member сессии видит её при любом active org (паритет candidate-контракта)."""
        fake = _FakeRedis()
        self._warm_cache(fake)
        req = _DummyRequest(self.member, active_org_id=self.org_b)
        with patch("app.redis_cache.get_client", return_value=fake):
            payload = self.svc.get_session(self.session_id, request=req)
        self.assertEqual(str(payload.get("id") or ""), self.session_id)
        self.assertEqual(str(payload.get("org_id") or ""), self.org_a)

    def test_warm_cache_admin_foreign_org_gets_200(self):
        """Admin не флапает: тёплый кэш + foreign org → 200 (детерминизм)."""
        fake = _FakeRedis()
        self._warm_cache(fake)
        req = _DummyRequest(self.admin, active_org_id=self.org_b)
        with patch("app.redis_cache.get_client", return_value=fake):
            payload = self.svc.get_session(self.session_id, request=req)
        self.assertEqual(str(payload.get("id") or ""), self.session_id)

    # ── холодный путь (кэш пуст) ──────────────────────────────────────────

    def test_cold_path_member_foreign_org_gets_200(self):
        """Флап: cold GET member'а с foreign active org сейчас 404; после фикса — 200."""
        fake = _FakeRedis()
        req = _DummyRequest(self.member, active_org_id=self.org_b)
        with patch("app.redis_cache.get_client", return_value=fake):
            payload = self.svc.get_session(self.session_id, request=req)
        self.assertEqual(str(payload.get("id") or ""), self.session_id)
        self.assertEqual(str(payload.get("org_id") or ""), self.org_a)

    def test_cold_path_non_member_foreign_org_gets_404(self):
        """Non-member с foreign active org → 404 SESSION_NOT_FOUND (контракт сохраняется)."""
        fake = _FakeRedis()
        req = _DummyRequest(self.outsider, active_org_id=self.org_b)
        with patch("app.redis_cache.get_client", return_value=fake):
            with self.assertRaises(Exception) as ctx:
                self.svc.get_session(self.session_id, request=req)
        self._assert_session_not_found(ctx.exception)

    def test_cold_path_member_session_org_gets_200(self):
        """Регрессия: member с active org сессии → 200 (прежнее поведение)."""
        fake = _FakeRedis()
        req = _DummyRequest(self.member, active_org_id=self.org_a)
        with patch("app.redis_cache.get_client", return_value=fake):
            payload = self.svc.get_session(self.session_id, request=req)
        self.assertEqual(str(payload.get("id") or ""), self.session_id)

    # ── инвалидация ───────────────────────────────────────────────────────

    def test_invalidation_after_update_returns_fresh_projection(self):
        """Guard: инвалидация стирает projection, повторный GET читает storage заново."""
        from app.cache import session_cache

        fake = _FakeRedis()
        self._warm_cache(fake)
        with patch("app.redis_cache.get_client", return_value=fake):
            session_cache.invalidate_session(self.session_id)
            self.assertIsNone(session_cache.get_projection(self.session_id))
            req = _DummyRequest(self.admin, active_org_id=self.org_a)
            payload = self.svc.get_session(self.session_id, request=req)
        self.assertEqual(str(payload.get("id") or ""), self.session_id)


if __name__ == "__main__":
    unittest.main()
