"""GET /api/admin/feature-flags/catalog — каталог метаданных фичафлагов (группы/зрелость/env).

Контур: feature/admin-dashboard-v2-feature-map.
Прогон: python -m pytest tests/test_admin_feature_flags_catalog.py
"""

import os
import tempfile
import unittest
from datetime import datetime
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


class AdminFeatureFlagsCatalogTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_backend = os.environ.get("FPC_DB_BACKEND")
        self.old_db_url = os.environ.get("DATABASE_URL")
        self.old_env_flag = os.environ.get("FPC_ASYNC_SUBPROCESS_SYNC")
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp.name) / "ff_catalog.sqlite3")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-issuer")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")
        os.environ.pop("FPC_ASYNC_SUBPROCESS_SYNC", None)

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
        self.admin = create_user("ff_catalog_admin@local", "adminpass", is_admin=True)
        self.user = create_user("ff_catalog_user@local", "userpass", is_admin=False)

        from app.routers.feature_flags import get_feature_flags_catalog_endpoint

        self.endpoint = get_feature_flags_catalog_endpoint

    def tearDown(self):
        for key, old in [
            ("PROCESS_DB_PATH", self.old_db_path),
            ("PROCESS_STORAGE_DIR", self.old_storage_dir),
            ("FPC_DB_BACKEND", self.old_backend),
            ("DATABASE_URL", self.old_db_url),
            ("FPC_ASYNC_SUBPROCESS_SYNC", self.old_env_flag),
        ]:
            if old is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = old
        self.tmp.cleanup()

    def _flag(self, groups, key):
        for group in groups:
            for flag in group.get("flags", []):
                if flag.get("key") == key:
                    return flag
        return None

    def test_admin_gets_catalog_schema(self):
        request = _DummyRequest(self.admin, active_org_id=self.org_id)
        result = self.endpoint(request)
        self.assertTrue(result.get("ok"))
        groups = result.get("groups")
        self.assertIsInstance(groups, list)
        self.assertTrue(groups)
        for group in groups:
            self.assertTrue(group.get("id"))
            self.assertTrue(group.get("label"))
            self.assertIsInstance(group.get("flags"), list)
            for flag in group.get("flags", []):
                for field in (
                    "key",
                    "label",
                    "description",
                    "maturity",
                    "owner_contour",
                    "removal_criterion",
                    "source",
                    "editable",
                    "value",
                    "default",
                ):
                    self.assertIn(field, flag, f"missing field {field} in {flag.get('key')}")
        generated_at = (result.get("meta") or {}).get("generated_at")
        self.assertTrue(generated_at)
        datetime.fromisoformat(str(generated_at))

    def test_non_admin_forbidden(self):
        from fastapi import HTTPException

        request = _DummyRequest(self.user, active_org_id=self.org_id)
        with self.assertRaises(HTTPException) as ctx:
            self.endpoint(request)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_env_flag_present_readonly(self):
        os.environ["FPC_ASYNC_SUBPROCESS_SYNC"] = "1"
        request = _DummyRequest(self.admin, active_org_id=self.org_id)
        result = self.endpoint(request)
        flag = self._flag(result.get("groups", []), "FPC_ASYNC_SUBPROCESS_SYNC")
        self.assertIsNotNone(flag, "env-флаг должен присутствовать в каталоге")
        self.assertEqual(flag.get("source"), "env")
        self.assertFalse(flag.get("editable"))
        self.assertTrue(flag.get("value"))
        self.assertFalse(flag.get("default"))
        self.assertEqual(flag.get("maturity"), "rollout")

    def test_env_flag_default_off(self):
        os.environ.pop("FPC_ASYNC_SUBPROCESS_SYNC", None)
        request = _DummyRequest(self.admin, active_org_id=self.org_id)
        result = self.endpoint(request)
        flag = self._flag(result.get("groups", []), "FPC_ASYNC_SUBPROCESS_SYNC")
        self.assertIsNotNone(flag)
        self.assertFalse(flag.get("value"))
        self.assertFalse(flag.get("default"))

    def test_unknown_postgres_key_goes_to_other_group(self):
        from app.storage import set_feature_flag

        set_feature_flag("custom_unknown_flag", "1")
        request = _DummyRequest(self.admin, active_org_id=self.org_id)
        result = self.endpoint(request)
        groups = result.get("groups", [])
        other = next((g for g in groups if g.get("id") == "other"), None)
        self.assertIsNotNone(other, "неизвестный Postgres-ключ должен попасть в группу other")
        flag = self._flag(groups, "custom_unknown_flag")
        self.assertIsNotNone(flag)
        self.assertEqual(flag.get("label"), "custom_unknown_flag")
        self.assertEqual(flag.get("maturity"), "experimental")
        self.assertTrue(flag.get("editable"))
        self.assertTrue(flag.get("value"))
        self.assertEqual(groups[-1].get("id"), "other")

    def test_rudiment_markup(self):
        request = _DummyRequest(self.admin, active_org_id=self.org_id)
        result = self.endpoint(request)
        groups = result.get("groups", [])
        for key in (
            "lightweightOverlays",
            "canvas_profiler_enabled",
            "workspace_auto_expand_steps",
        ):
            flag = self._flag(groups, key)
            self.assertIsNotNone(flag, key)
            self.assertEqual(flag.get("maturity"), "rudiment", key)

    def test_group_order_stable(self):
        request = _DummyRequest(self.admin, active_org_id=self.org_id)
        result = self.endpoint(request)
        group_ids = [g.get("id") for g in result.get("groups", [])]
        self.assertEqual(group_ids[:3], ["canvas", "workspace", "save"])
        self.assertEqual(group_ids, ["canvas", "workspace", "save"])

    def test_runtime_value_resolution_from_postgres(self):
        from app.storage import set_feature_flag

        set_feature_flag("useBpmnExtensionOverlays", "1")
        request = _DummyRequest(self.admin, active_org_id=self.org_id)
        result = self.endpoint(request)
        flag = self._flag(result.get("groups", []), "useBpmnExtensionOverlays")
        self.assertIsNotNone(flag)
        self.assertTrue(flag.get("value"))
        self.assertFalse(flag.get("default"))
        self.assertEqual(flag.get("source"), "runtime")
        self.assertTrue(flag.get("editable"))


if __name__ == "__main__":
    unittest.main()
