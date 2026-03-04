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


class RedisCacheHelperTest(unittest.TestCase):
    def test_cache_hit_miss_and_prefix_invalidation(self):
        from app.redis_cache import (
            cache_delete_prefix,
            cache_get_json,
            cache_set_json,
            cache_stats_reset,
            cache_stats_snapshot,
            tldr_cache_key,
            workspace_cache_key,
        )

        fake = _FakeRedis()
        with patch("app.redis_cache.get_client", return_value=fake):
            cache_stats_reset()
            key = workspace_cache_key("org_1", "abc")
            self.assertIsNone(cache_get_json(key))
            self.assertTrue(cache_set_json(key, {"ok": True}, ttl_sec=30))
            self.assertEqual(cache_get_json(key), {"ok": True})
            self.assertTrue(cache_set_json(tldr_cache_key("s1"), {"summary": "A"}, ttl_sec=60))
            deleted = cache_delete_prefix("pm:cache:tldr:session:")
            self.assertGreaterEqual(deleted, 1)
            stats = cache_stats_snapshot()
            self.assertGreaterEqual(int(stats.get("miss") or 0), 1)
            self.assertGreaterEqual(int(stats.get("hit") or 0), 1)
            self.assertGreaterEqual(int(stats.get("set") or 0), 2)
            self.assertGreaterEqual(int(stats.get("delete") or 0), 1)


class RedisCacheWorkspaceTldrIntegrationTest(unittest.TestCase):
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
        from app.main import (
            CreateProjectIn,
            CreateSessionIn,
            create_org_project,
            create_org_project_session,
            enterprise_workspace,
            get_session_tldr,
        )
        from app.storage import (
            get_default_org_id,
            get_storage,
            push_storage_request_scope,
            pop_storage_request_scope,
        )

        self.create_user = create_user
        self.CreateProjectIn = CreateProjectIn
        self.CreateSessionIn = CreateSessionIn
        self.create_org_project = create_org_project
        self.create_org_project_session = create_org_project_session
        self.enterprise_workspace = enterprise_workspace
        self.get_session_tldr = get_session_tldr
        self.get_default_org_id = get_default_org_id
        self.get_storage = get_storage
        self.push_scope = push_storage_request_scope
        self.pop_scope = pop_storage_request_scope

        self.admin = create_user("redis_cache_admin@local", "admin", is_admin=True)
        _ = get_storage()
        self.org_id = get_default_org_id()
        self._ensure_org_membership(self.org_id, str(self.admin.get("id") or ""), "org_admin")
        self.session_id = self._create_project_with_session("Cache Project", "Cache Session")
        self._seed_notes_summary(self.session_id, "Краткий итог для кэша.")

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

    def _ensure_org_membership(self, org_id: str, user_id: str, role: str):
        with sqlite3.connect(self._db_path()) as con:
            con.execute(
                """
                INSERT OR IGNORE INTO org_memberships (org_id, user_id, role, created_at)
                VALUES (?, ?, ?, strftime('%s','now'))
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
        request = _DummyRequest(self.admin, active_org_id=self.org_id)
        scope_token = self.push_scope(uid, True, self.org_id)
        try:
            project = self.create_org_project(
                self.org_id,
                self.CreateProjectIn(title=project_title, passport={}),
                request,
            )
            project_id = str(project.get("id") or "")
            session = self.create_org_project_session(
                self.org_id,
                project_id,
                self.CreateSessionIn(title=session_title, roles=["operator"], start_role="operator"),
                request,
                mode="quick_skeleton",
            )
            return str(session.get("id") or "")
        finally:
            self.pop_scope(scope_token)

    def _seed_notes_summary(self, session_id: str, summary_text: str):
        st = self.get_storage()
        sess = st.load(session_id, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(sess)
        sess.notes_by_element = {
            "Task_1": {
                "items": [{"id": "n1", "text": "note", "createdAt": 1, "updatedAt": 1}],
                "summary": summary_text,
                "summaryUpdatedAt": 1730000000,
                "updatedAt": 1730000000,
            }
        }
        st.save(sess, user_id=str(self.admin.get("id") or ""), org_id=self.org_id, is_admin=True)

    def test_workspace_second_call_is_cache_hit(self):
        from app.redis_cache import cache_stats_reset, cache_stats_snapshot

        req_admin = _DummyRequest(self.admin, active_org_id=self.org_id)
        fake = _FakeRedis()
        with patch("app.redis_cache.get_client", return_value=fake):
            cache_stats_reset()
            first = self.enterprise_workspace(
                req_admin,
                group_by="projects",
                q="",
                owner_ids="",
                project_id="",
                status="",
                updated_from=None,
                updated_to=None,
                needs_attention=None,
                limit=50,
                offset=0,
            )
            first_stats = cache_stats_snapshot()
            second = self.enterprise_workspace(
                req_admin,
                group_by="projects",
                q="",
                owner_ids="",
                project_id="",
                status="",
                updated_from=None,
                updated_to=None,
                needs_attention=None,
                limit=50,
                offset=0,
            )
            second_stats = cache_stats_snapshot()

        self.assertIsInstance(first, dict)
        self.assertEqual(first, second)
        self.assertGreaterEqual(int(first_stats.get("set") or 0), 1)
        self.assertEqual(int(first_stats.get("hit") or 0), 0)
        self.assertGreaterEqual(int(second_stats.get("hit") or 0), 1)

    def test_tldr_second_call_is_cache_hit(self):
        from app.redis_cache import cache_stats_reset, cache_stats_snapshot

        req_admin = _DummyRequest(self.admin, active_org_id=self.org_id)
        fake = _FakeRedis()
        with patch("app.redis_cache.get_client", return_value=fake):
            cache_stats_reset()
            first = self.get_session_tldr(self.session_id, request=req_admin)
            first_stats = cache_stats_snapshot()
            second = self.get_session_tldr(self.session_id, request=req_admin)
            second_stats = cache_stats_snapshot()

        self.assertIsInstance(first, dict)
        self.assertEqual(str(first.get("summary") or "").strip(), "Краткий итог для кэша.")
        self.assertEqual(first, second)
        self.assertGreaterEqual(int(first_stats.get("set") or 0), 1)
        self.assertEqual(int(first_stats.get("hit") or 0), 0)
        self.assertGreaterEqual(int(second_stats.get("hit") or 0), 1)


if __name__ == "__main__":
    unittest.main()
