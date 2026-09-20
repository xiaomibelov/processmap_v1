"""PATCH/PUT /api/admin/feature-flags — env-флаги read-only (422 FEATURE_FLAG_ENV_READONLY).

Контур: feature/admin-dashboard-v2-feature-map.
Прогон: python -m pytest tests/test_admin_feature_flags_env_readonly.py
"""

import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in __import__("sys").path:
    import sys

    sys.path.insert(0, str(BACKEND_DIR))


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(
            auth_user=user,
            active_org_id=active_org_id,
            org_id=active_org_id,
            org_memberships=[],
        )
        self.headers = {}


class AdminFeatureFlagsEnvReadonlyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_backend = os.environ.get("FPC_DB_BACKEND")
        self.old_db_url = os.environ.get("DATABASE_URL")
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp.name) / "ff_env_ro.sqlite3")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-issuer")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")

        import importlib

        import app.storage as storage

        importlib.reload(storage)
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""
        storage._AGENT_TABLES_READY = False
        storage._AGENT_TABLES_DB_FILE = ""

        from app.auth import create_user
        from app.storage import get_default_org_id

        self.org_id = get_default_org_id()
        self.admin = create_user("ff_env_admin@local", "adminpass", is_admin=True)
        self.user = create_user("ff_env_user@local", "userpass", is_admin=False)

        from app.routers.feature_flags import (
            patch_feature_flags_endpoint,
            put_feature_flag_endpoint,
        )

        self.patch_endpoint = patch_feature_flags_endpoint
        self.put_endpoint = put_feature_flag_endpoint

    def tearDown(self):
        for key, old in [
            ("PROCESS_DB_PATH", self.old_db_path),
            ("PROCESS_STORAGE_DIR", self.old_storage_dir),
            ("FPC_DB_BACKEND", self.old_backend),
            ("DATABASE_URL", self.old_db_url),
        ]:
            if old is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = old
        self.tmp.cleanup()

    def test_patch_env_key_rejected(self):
        from fastapi import HTTPException

        request = _DummyRequest(self.admin, active_org_id=self.org_id)
        with self.assertRaises(HTTPException) as ctx:
            self.patch_endpoint(request, {"flags": {"FPC_ASYNC_SUBPROCESS_SYNC": True}})
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("FEATURE_FLAG_ENV_READONLY", str(ctx.exception.detail))

    def test_put_env_key_rejected(self):
        from fastapi import HTTPException

        request = _DummyRequest(self.admin, active_org_id=self.org_id)
        with self.assertRaises(HTTPException) as ctx:
            self.put_endpoint("FPC_ASYNC_SUBPROCESS_SYNC", request, {"value": True})
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("FEATURE_FLAG_ENV_READONLY", str(ctx.exception.detail))

    def test_patch_mixed_env_and_runtime_rejected(self):
        from fastapi import HTTPException

        request = _DummyRequest(self.admin, active_org_id=self.org_id)
        with self.assertRaises(HTTPException) as ctx:
            self.patch_endpoint(
                request,
                {"flags": {"useBpmnExtensionOverlays": True, "FPC_ASYNC_SUBPROCESS_SYNC": True}},
            )
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("FEATURE_FLAG_ENV_READONLY", str(ctx.exception.detail))

    def test_patch_unknown_keys_accepted(self):
        # Known behavior: PATCH произвольных неизвестных ключей пока принимается
        # (Postgres хранит любой ключ). Осознанно не ломаем — фиксируем тестом.
        request = _DummyRequest(self.admin, active_org_id=self.org_id)
        result = self.patch_endpoint(request, {"flags": {"some_new_unknown_key": True}})
        self.assertTrue(result.get("ok"))

    def test_env_key_as_non_admin_forbidden_before_validation(self):
        from fastapi import HTTPException

        request = _DummyRequest(self.user, active_org_id=self.org_id)
        with self.assertRaises(HTTPException) as ctx:
            self.patch_endpoint(request, {"flags": {"FPC_ASYNC_SUBPROCESS_SYNC": True}})
        self.assertEqual(ctx.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
