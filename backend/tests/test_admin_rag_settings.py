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


class AdminRagSettingsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_backend = os.environ.get("FPC_DB_BACKEND")
        self.old_db_url = os.environ.get("DATABASE_URL")
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp.name) / "admin_rag.sqlite3")
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
        from app.storage import get_default_org_id, get_project_storage, get_storage

        self.get_storage = get_storage
        self.get_project_storage = get_project_storage
        self.org_id = get_default_org_id()

        self.admin_user = create_user("admin@local", "adminpass", is_admin=True)
        self.admin_id = str(self.admin_user.get("id") or "")

        self.org_admin_user = create_user("orgadmin@local", "pass", is_admin=False)
        self.org_admin_id = str(self.org_admin_user.get("id") or "")
        self._insert_membership(self.org_id, self.org_admin_id, "org_admin")

        self.viewer_user = create_user("viewer@local", "pass", is_admin=False)
        self.viewer_id = str(self.viewer_user.get("id") or "")
        self._insert_membership(self.org_id, self.viewer_id, "org_viewer")

        from app.routers.admin import admin_rag_get_settings, admin_rag_patch_settings
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

    def _org_admin_request(self):
        return _DummyRequest(
            {"id": self.org_admin_id, "email": "orgadmin@local", "is_admin": False},
            active_org_id=self.org_id,
        )

    def _viewer_request(self):
        return _DummyRequest(
            {"id": self.viewer_id, "email": "viewer@local", "is_admin": False},
            active_org_id=self.org_id,
        )

    def _unauth_request(self):
        return _DummyRequest({}, active_org_id=self.org_id)

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

    # ── GET tests ─────────────────────────────────────────────────────────────

    def test_get_returns_defaults_when_no_db_row(self):
        result = self.get_settings(self._admin_request())
        self.assertTrue(result.get("ok"))
        s = result["settings"]
        self.assertEqual(s["default_top_k"], 10)
        self.assertEqual(s["max_top_k"], 50)
        self.assertEqual(s["read_only_mode"], True)
        self.assertEqual(s["auto_apply_enabled"], False)
        self.assertEqual(s["embeddings_enabled"], False)
        self.assertEqual(s["vector_search_enabled"], False)
        self.assertIn("bpmn_xml", s["allowed_source_types"])

    def test_get_returns_status_counts_empty(self):
        result = self.get_settings(self._admin_request())
        self.assertTrue(result.get("ok"))
        status = result["status"]
        self.assertEqual(status["sources_count"], 0)
        self.assertEqual(status["documents_count"], 0)
        self.assertEqual(status["chunks_count"], 0)

    def test_get_requires_auth_401(self):
        result = self.get_settings(self._unauth_request())
        self.assertEqual(result.status_code, 401)

    def test_get_viewer_forbidden_403(self):
        result = self.get_settings(self._viewer_request())
        self.assertEqual(result.status_code, 403)

    def test_get_org_admin_allowed(self):
        result = self.get_settings(self._org_admin_request())
        self.assertTrue(result.get("ok"))

    # ── PATCH tests ───────────────────────────────────────────────────────────

    def test_patch_updates_default_top_k(self):
        import asyncio
        result = asyncio.get_event_loop().run_until_complete(
            self._patch(self._admin_request(), {"default_top_k": 20})
        )
        self.assertTrue(result.get("ok"))
        self.assertTrue(result.get("updated"))
        self.assertEqual(result["settings"]["default_top_k"], 20)

    def test_patch_rejects_default_top_k_zero(self):
        import asyncio
        result = asyncio.get_event_loop().run_until_complete(
            self._patch(self._admin_request(), {"default_top_k": 0})
        )
        self.assertEqual(result.status_code, 400)

    def test_patch_rejects_max_top_k_greater_than_100(self):
        import asyncio
        result = asyncio.get_event_loop().run_until_complete(
            self._patch(self._admin_request(), {"max_top_k": 101})
        )
        self.assertEqual(result.status_code, 400)

    def test_patch_rejects_max_top_k_less_than_default(self):
        import asyncio
        result = asyncio.get_event_loop().run_until_complete(
            self._patch(self._admin_request(), {"default_top_k": 30, "max_top_k": 20})
        )
        self.assertEqual(result.status_code, 400)

    def test_patch_rejects_invariant_field_read_only_mode(self):
        import asyncio
        result = asyncio.get_event_loop().run_until_complete(
            self._patch(self._admin_request(), {"read_only_mode": False})
        )
        self.assertEqual(result.status_code, 400)

    def test_patch_rejects_invariant_field_auto_apply(self):
        import asyncio
        result = asyncio.get_event_loop().run_until_complete(
            self._patch(self._admin_request(), {"auto_apply_enabled": True})
        )
        self.assertEqual(result.status_code, 400)

    def test_patch_rejects_unknown_field(self):
        import asyncio
        result = asyncio.get_event_loop().run_until_complete(
            self._patch(self._admin_request(), {"unknown_setting": "value"})
        )
        self.assertEqual(result.status_code, 400)

    def test_patch_empty_body_returns_not_updated(self):
        import asyncio
        result = asyncio.get_event_loop().run_until_complete(
            self._patch(self._admin_request(), {})
        )
        self.assertTrue(result.get("ok"))
        self.assertFalse(result.get("updated"))

    def test_patch_preserves_invariants(self):
        import asyncio
        result = asyncio.get_event_loop().run_until_complete(
            self._patch(self._admin_request(), {"enabled": False})
        )
        self.assertTrue(result.get("ok"))
        s = result["settings"]
        self.assertEqual(s["read_only_mode"], True)
        self.assertEqual(s["auto_apply_enabled"], False)
        self.assertEqual(s["embeddings_enabled"], False)


if __name__ == "__main__":
    unittest.main()
