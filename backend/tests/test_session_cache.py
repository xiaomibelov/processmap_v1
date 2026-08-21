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


class SessionCacheUnitTest(unittest.TestCase):
    def test_build_projection_omits_bpmn_xml(self):
        from app.cache.session_cache import build_projection

        row = {
            "id": "s1",
            "title": "Test",
            "bpmn_xml": "<definitions>big</definitions>",
            "bpmn_xml_length": 30,
            "bpmn_meta_json": '{"version": 1}',
            "version": 5,
            "updated_at": 100,
        }
        projection = build_projection("s1", row)
        self.assertEqual(projection["id"], "s1")
        self.assertEqual(projection["title"], "Test")
        self.assertEqual(projection["bpmn_xml"], "")
        self.assertTrue(projection["has_bpmn_xml"])
        self.assertNotEqual(projection["bpmn_xml_hash"], "")
        self.assertEqual(projection["version"], 5)

    def test_build_projection_excludes_nodes_and_edges(self):
        from app.cache.session_cache import build_projection

        # load_session_projection no longer selects the raw JSON blobs, so the
        # lightweight projection should carry empty node/edge arrays and never
        # expose the raw *_json columns.
        row = {
            "id": "s1",
            "title": "Test",
            "bpmn_meta_json": '{}',
            "version": 1,
        }
        projection = build_projection("s1", row)
        self.assertEqual(projection.get("nodes"), [])
        self.assertEqual(projection.get("edges"), [])
        self.assertNotIn("nodes_json", projection)
        self.assertNotIn("edges_json", projection)

    def test_session_cache_get_set_invalidate(self):
        from app.cache import session_cache
        from app.redis_cache import cache_stats_reset

        fake = _FakeRedis()
        with patch("app.redis_cache.get_client", return_value=fake):
            cache_stats_reset()
            self.assertIsNone(session_cache.get_projection("s1"))
            session_cache.set_projection("s1", {"id": "s1", "title": "A"})
            self.assertEqual(session_cache.get_projection("s1")["title"], "A")

            session_cache.set_bpmn_raw("s1", "<xml/>")
            self.assertEqual(session_cache.get_bpmn_raw("s1"), "<xml/>")

            session_cache.set_meta("s1", {"versions_count": 3})
            self.assertEqual(session_cache.get_meta("s1")["versions_count"], 3)

            session_cache.set_auto_pass_precheck("s1", {"ok": True})
            self.assertTrue(session_cache.get_auto_pass_precheck("s1")["ok"])

            deleted = session_cache.invalidate_session("s1")
            self.assertGreaterEqual(deleted, 1)
            self.assertIsNone(session_cache.get_projection("s1"))
            self.assertIsNone(session_cache.get_bpmn_raw("s1"))
            self.assertIsNone(session_cache.get_meta("s1"))
            self.assertIsNone(session_cache.get_auto_pass_precheck("s1"))


class SessionCacheServiceTest(unittest.TestCase):
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

        self.create_user = create_user
        self.CreateProjectIn = CreateProjectIn
        self.CreateSessionIn = CreateSessionIn
        self.create_org_project = create_org_project
        self.create_org_project_session = create_org_project_session
        self.get_default_org_id = get_default_org_id
        self.get_storage = get_storage
        self.push_scope = push_storage_request_scope
        self.pop_scope = pop_storage_request_scope

        self.admin = create_user("session_cache_admin@local", "admin", is_admin=True)
        _ = get_storage()
        self.org_id = get_default_org_id()
        self._ensure_org_membership(self.org_id, str(self.admin.get("id") or ""), "org_admin")
        self.session_id = self._create_project_with_session("Cache Project", "Cache Session")

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

    def _seed_bpmn_xml(self):
        st = self.get_storage()
        sess = st.load(self.session_id, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(sess)
        xml = '<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="def_1"></bpmn:definitions>'
        sess.bpmn_xml = xml
        st.save(sess, user_id=str(self.admin.get("id") or ""), org_id=self.org_id, is_admin=True)
        return xml

    def test_get_session_second_call_is_cache_hit(self):
        from app.redis_cache import cache_stats_reset, cache_stats_snapshot

        req_admin = _DummyRequest(self.admin, active_org_id=self.org_id)
        fake = _FakeRedis()
        with patch("app.redis_cache.get_client", return_value=fake):
            cache_stats_reset()
            first = self.svc.get_session(self.session_id, request=req_admin)
            first_stats = cache_stats_snapshot()
            second = self.svc.get_session(self.session_id, request=req_admin)
            second_stats = cache_stats_snapshot()

        self.assertIsInstance(first, dict)
        self.assertEqual(str(first.get("id") or ""), self.session_id)
        self.assertEqual(first.get("title"), second.get("title"))
        self.assertEqual(int(first_stats.get("hit") or 0), 0)
        self.assertGreaterEqual(int(first_stats.get("set") or 0), 1)
        self.assertGreaterEqual(int(second_stats.get("hit") or 0), 1)

    def test_get_session_falls_back_when_redis_unavailable(self):
        req_admin = _DummyRequest(self.admin, active_org_id=self.org_id)
        with patch("app.redis_cache.get_client", return_value=None):
            payload = self.svc.get_session(self.session_id, request=req_admin)
        self.assertIsInstance(payload, dict)
        self.assertEqual(str(payload.get("id") or ""), self.session_id)

    def test_get_session_returns_fresh_data_after_invalidation(self):
        from app.cache import session_cache
        from app.redis_cache import cache_stats_reset

        req_admin = _DummyRequest(self.admin, active_org_id=self.org_id)
        fake = _FakeRedis()
        with patch("app.redis_cache.get_client", return_value=fake):
            cache_stats_reset()
            first = self.svc.get_session(self.session_id, request=req_admin)
            self.assertEqual(str(first.get("title") or ""), "Cache Session")

            st = self.get_storage()
            sess = st.load(self.session_id, org_id=self.org_id, is_admin=True)
            sess.title = "Cache Session Updated"
            sess.version = int(getattr(sess, "version", 0) or 0) + 1
            st.save(sess, user_id=str(self.admin.get("id") or ""), org_id=self.org_id, is_admin=True)
            session_cache.invalidate_session(self.session_id)

            second = self.svc.get_session(self.session_id, request=req_admin)
            self.assertEqual(str(second.get("title") or ""), "Cache Session Updated")

    def test_bpmn_raw_cache_hit(self):
        from app.cache import session_cache

        xml = self._seed_bpmn_xml()
        req_admin = _DummyRequest(self.admin, active_org_id=self.org_id)
        fake = _FakeRedis()
        with patch("app.redis_cache.get_client", return_value=fake):
            first = self.svc.bpmn_export(self.session_id, raw=1, request=req_admin)
            self.assertEqual(first.status_code, 200)
            self.assertIn("definitions", first.body.decode("utf-8"))
            self.assertEqual(session_cache.get_bpmn_raw(self.session_id), xml)

            second = self.svc.bpmn_export(self.session_id, raw=1, request=req_admin)
            self.assertEqual(second.body.decode("utf-8"), xml)

    def test_bpmn_raw_cache_invalidated_after_save(self):
        from app.cache import session_cache

        xml = self._seed_bpmn_xml()
        req_admin = _DummyRequest(self.admin, active_org_id=self.org_id)
        fake = _FakeRedis()
        with patch("app.redis_cache.get_client", return_value=fake):
            self.svc.bpmn_export(self.session_id, raw=1, request=req_admin)
            self.assertEqual(session_cache.get_bpmn_raw(self.session_id), xml)

            new_xml = xml.replace('id="def_1"', 'id="def_2"')
            from app.schemas.legacy_api import BpmnXmlIn
            self.svc.bpmn_save(self.session_id, BpmnXmlIn(xml=new_xml), request=req_admin)
            self.assertIsNone(session_cache.get_bpmn_raw(self.session_id))

    def test_get_session_meta_returns_aggregate(self):
        req_admin = _DummyRequest(self.admin, active_org_id=self.org_id)
        fake = _FakeRedis()
        with patch("app.redis_cache.get_client", return_value=fake):
            meta = self.svc.get_session_meta(self.session_id, request=req_admin)

        self.assertIsInstance(meta, dict)
        self.assertEqual(str(meta.get("session_id") or ""), self.session_id)
        self.assertIn("versions_count", meta)
        self.assertIn("notes_count", meta)
        self.assertIn("active_users", meta)
        self.assertIn("auto_pass_status", meta)

    def test_meta_second_call_is_cache_hit(self):
        from app.redis_cache import cache_stats_reset, cache_stats_snapshot

        req_admin = _DummyRequest(self.admin, active_org_id=self.org_id)
        fake = _FakeRedis()
        with patch("app.redis_cache.get_client", return_value=fake):
            cache_stats_reset()
            first = self.svc.get_session_meta(self.session_id, request=req_admin)
            first_stats = cache_stats_snapshot()
            second = self.svc.get_session_meta(self.session_id, request=req_admin)
            second_stats = cache_stats_snapshot()

        self.assertIsInstance(first, dict)
        self.assertEqual(first.get("versions_count"), second.get("versions_count"))
        self.assertGreaterEqual(int(first_stats.get("set") or 0), 1)
        self.assertGreaterEqual(int(second_stats.get("hit") or 0), 1)

    def test_auto_pass_precheck_background_caches_result(self):
        from app.cache import session_cache
        from app.routers.auto_pass import _run_auto_pass_precheck_background

        self._seed_bpmn_xml()
        fake = _FakeRedis()
        with patch("app.redis_cache.get_client", return_value=fake):
            self.assertIsNone(session_cache.get_auto_pass_precheck(self.session_id))
            _run_auto_pass_precheck_background(self.session_id, self.org_id)
            cached = session_cache.get_auto_pass_precheck(self.session_id)

        self.assertIsInstance(cached, dict)
        self.assertIn("ok", cached)

    def test_invalidation_wipes_all_session_segments(self):
        from app.cache import session_cache

        fake = _FakeRedis()
        with patch("app.redis_cache.get_client", return_value=fake):
            session_cache.set_projection("s1", {"id": "s1"})
            session_cache.set_bpmn_raw("s1", "x")
            session_cache.set_meta("s1", {"v": 1})
            session_cache.set_auto_pass_precheck("s1", {"ok": True})

            deleted = session_cache.invalidate_session("s1")
            self.assertGreaterEqual(deleted, 4)
            self.assertIsNone(session_cache.get_projection("s1"))
            self.assertIsNone(session_cache.get_bpmn_raw("s1"))
            self.assertIsNone(session_cache.get_meta("s1"))
            self.assertIsNone(session_cache.get_auto_pass_precheck("s1"))


if __name__ == "__main__":
    unittest.main()
