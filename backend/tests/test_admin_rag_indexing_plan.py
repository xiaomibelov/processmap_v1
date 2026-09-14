import asyncio
import importlib
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class AdminRagIndexingPlanTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_backend = os.environ.get("FPC_DB_BACKEND")
        self.old_db_url = os.environ.get("DATABASE_URL")
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp.name) / "admin_rag_plan.sqlite3")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-issuer")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")

        import app.storage as storage
        importlib.reload(storage)
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""

        from app.auth import create_user
        from app.storage import get_default_org_id, get_storage

        self.get_storage = get_storage
        self.org_id = get_default_org_id()

        self.admin_user = create_user("admin@local", "adminpass", is_admin=True)
        self.admin_id = str(self.admin_user.get("id") or "")

        self.viewer_user = create_user("viewer@local", "pass", is_admin=False)
        self.viewer_id = str(self.viewer_user.get("id") or "")
        self._insert_membership(self.org_id, self.viewer_id, "org_viewer")

        from app.routers.admin import (
            admin_rag_get_indexing_plan,
            admin_rag_get_settings,
            admin_rag_patch_settings,
        )
        self.get_plan = admin_rag_get_indexing_plan
        self.get_settings = admin_rag_get_settings
        self.patch_settings = admin_rag_patch_settings

    def tearDown(self):
        self.tmp.cleanup()
        for key, val in [
            ("PROCESS_DB_PATH", self.old_db_path),
            ("PROCESS_STORAGE_DIR", self.old_storage_dir),
            ("FPC_DB_BACKEND", self.old_backend),
            ("DATABASE_URL", self.old_db_url),
        ]:
            if val is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = val

        import app.storage as storage
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""

    def _insert_membership(self, org_id, user_id, role):
        from app.storage import _connect
        with _connect() as con:
            con.execute(
                "INSERT OR REPLACE INTO org_memberships (org_id, user_id, role) VALUES (?,?,?)",
                [org_id, user_id, role],
            )
            con.commit()

    def _admin_request(self):
        return _DummyRequest(
            {"id": self.admin_id, "email": "admin@local", "is_admin": True},
            active_org_id=self.org_id,
        )

    def _viewer_request(self):
        return _DummyRequest(
            {"id": self.viewer_id, "email": "viewer@local", "is_admin": False},
            active_org_id=self.org_id,
        )

    def _unauth_request(self):
        return _DummyRequest({}, active_org_id=self.org_id)

    def _create_session(self, sid: str, title: str = ""):
        from app.models import Session

        sess = Session(id=sid, title=title or f"Session {sid}")
        self.get_storage().save(sess, is_admin=True)
        return sid

    def _set_readiness(self, sid: str, status: str):
        return self.get_storage().set_rag_readiness(sid, status, org_id=self.org_id)

    async def _patch(self, request, body):
        import json

        class _FakeRequest:
            def __init__(self, req, b):
                self.state = req.state
                self.headers = req.headers
                self._body = b

            async def json(self):
                return self._body

        return await self.patch_settings(_FakeRequest(request, body))

    # ── access control ────────────────────────────────────────────────────────

    def test_plan_requires_auth_401(self):
        result = self.get_plan(self._unauth_request())
        self.assertEqual(result.status_code, 401)

    def test_plan_viewer_forbidden_403(self):
        result = self.get_plan(self._viewer_request())
        self.assertEqual(result.status_code, 403)

    # ── shape / empty state ───────────────────────────────────────────────────

    def test_plan_shape_when_empty(self):
        result = self.get_plan(self._admin_request())
        self.assertTrue(result.get("ok"))
        self.assertEqual(
            set(result.keys()),
            {"ok", "schedule", "queue", "readiness_counts", "index_size", "disclaimer"},
        )
        schedule = result["schedule"]
        self.assertEqual(schedule["task"], "rag-index-nightly-refresh")
        self.assertEqual(schedule["crontab"], "30 4 * * *")
        self.assertEqual(schedule["tz"], "Europe/Moscow")
        self.assertIsInstance(schedule["next_run_at"], int)
        self.assertEqual(result["queue"], {"total": 0, "preview": []})
        self.assertEqual(
            result["readiness_counts"],
            {"not_ready": 0, "queued": 0, "indexed": 0, "error": 0},
        )
        self.assertEqual(
            set(result["index_size"].keys()),
            {"documents", "active_documents", "chunks"},
        )
        self.assertIn("content-hash", result["disclaimer"])

    # ── queue / readiness fixtures ────────────────────────────────────────────

    def test_plan_counts_readiness_and_queue(self):
        self._create_session("sess-q1", "Queued One")
        self._create_session("sess-q2", "Queued Two")
        self._create_session("sess-i1", "Indexed One")
        self._create_session("sess-e1", "Error One")
        self._create_session("sess-n1", "Not Ready One")
        self._set_readiness("sess-q1", "queued")
        self._set_readiness("sess-q2", "queued")
        self._set_readiness("sess-i1", "indexed")
        self._set_readiness("sess-e1", "error")

        result = self.get_plan(self._admin_request())
        self.assertTrue(result.get("ok"))
        self.assertEqual(
            result["readiness_counts"],
            {"not_ready": 1, "queued": 2, "indexed": 1, "error": 1},
        )
        queue = result["queue"]
        self.assertEqual(queue["total"], 2)
        self.assertEqual(len(queue["preview"]), 2)
        for item in queue["preview"]:
            self.assertEqual(
                set(item.keys()),
                {"session_id", "title", "rag_queued_at", "updated_at"},
            )
            self.assertIsInstance(item["rag_queued_at"], int)
            self.assertIsInstance(item["updated_at"], int)
        titles = [i["title"] for i in queue["preview"]]
        self.assertIn("Queued One", titles)
        self.assertIn("Queued Two", titles)

    def test_plan_preview_capped_at_50(self):
        for i in range(60):
            sid = f"sess-cap-{i:03d}"
            self._create_session(sid)
            self._set_readiness(sid, "queued")

        result = self.get_plan(self._admin_request())
        self.assertTrue(result.get("ok"))
        self.assertEqual(result["queue"]["total"], 60)
        self.assertEqual(len(result["queue"]["preview"]), 50)

    # ── next_run_at ───────────────────────────────────────────────────────────

    def test_next_run_at_is_next_0430_msk(self):
        from zoneinfo import ZoneInfo

        import app.routers.admin as admin_mod

        tz = ZoneInfo("Europe/Moscow")
        # Фиксируем «сейчас» внутри UTC-дня так, чтобы 04:30 МСК ещё не наступило
        # (MSK = UTC+3): 2026-09-14 00:30 UTC == 03:30 МСК.
        fixed_utc = 1789345800  # 2026-09-14 00:30:00 UTC
        try:
            admin_mod._RAG_INDEX_NOW_TS = lambda: fixed_utc
            result = self.get_plan(self._admin_request())
            expected = int(
                __import__("datetime").datetime(2026, 9, 14, 4, 30, tzinfo=tz).timestamp()
            )
            self.assertEqual(result["schedule"]["next_run_at"], expected)

            # После 04:30 МСК — следующий прогон на следующие сутки.
            late_utc = 1789354200  # 2026-09-14 02:50:00 UTC == 05:50 МСК
            admin_mod._RAG_INDEX_NOW_TS = lambda: late_utc
            result = self.get_plan(self._admin_request())
            expected = int(
                __import__("datetime").datetime(2026, 9, 15, 4, 30, tzinfo=tz).timestamp()
            )
            self.assertEqual(result["schedule"]["next_run_at"], expected)
        finally:
            admin_mod._RAG_INDEX_NOW_TS = None

    # ── regression: settings invariants untouched ─────────────────────────────

    def test_patch_settings_still_rejects_invariant_fields(self):
        result = asyncio.get_event_loop().run_until_complete(
            self._patch(self._admin_request(), {"read_only_mode": False})
        )
        self.assertEqual(result.status_code, 400)
        result = asyncio.get_event_loop().run_until_complete(
            self._patch(self._admin_request(), {"auto_apply_enabled": True})
        )
        self.assertEqual(result.status_code, 400)


if __name__ == "__main__":
    unittest.main()
