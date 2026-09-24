"""PATCH/PUT /api/admin/feature-flags — строгий парсинг boolean-значений.

Находка release/tobe-stage-wave-2026-09-24 №1: роутер применял bool(value) к raw JSON,
поэтому строка "0" (truthy) не выключала флаг. Контур: fix/feature-flags-bool-v1.

Контракт:
- bool true/false — как раньше;
- строки "0"/"1"/"true"/"false" (регистронезависимо, с trim) — корректный парсинг;
- целые 0/1 — как раньше (обратная совместимость bool(0)/bool(1));
- прочие значения (прочие строки, прочие числа, None, списки, dict) — 422
  с detail.code = FEATURE_FLAG_INVALID_VALUE.

Прогон: python -m pytest tests/test_admin_feature_flags_bool_parsing.py
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


class AdminFeatureFlagsBoolParsingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_backend = os.environ.get("FPC_DB_BACKEND")
        self.old_db_url = os.environ.get("DATABASE_URL")
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp.name) / "ff_bool_parse.sqlite3")
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
        self.admin = create_user("ff_bool_admin@local", "adminpass", is_admin=True)
        self.user = create_user("ff_bool_user@local", "userpass", is_admin=False)

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

    def _patch(self, payload):
        request = _DummyRequest(self.admin, active_org_id=self.org_id)
        return self.patch_endpoint(request, payload)

    def _put(self, key, payload):
        request = _DummyRequest(self.admin, active_org_id=self.org_id)
        return self.put_endpoint(key, request, payload)

    def test_patch_string_zero_disables_flag(self):
        # Регрессия находки: строка "0" раньше была truthy и не выключала флаг.
        self._patch({"flags": {"bpmn_fps_meter_enabled": True}})
        result = self._patch({"flags": {"bpmn_fps_meter_enabled": "0"}})
        self.assertTrue(result.get("ok"))
        self.assertIs(result["flags"].get("bpmn_fps_meter_enabled"), False)

    def test_patch_string_one_and_true_enable(self):
        for raw in ("1", "true", "TRUE", " True "):
            result = self._patch({"flags": {"bpmn_fps_meter_enabled": raw}})
            self.assertTrue(result.get("ok"), msg=f"raw={raw!r}")
            self.assertIs(result["flags"].get("bpmn_fps_meter_enabled"), True, msg=f"raw={raw!r}")

    def test_patch_string_false_disables(self):
        self._patch({"flags": {"bpmn_fps_meter_enabled": True}})
        for raw in ("false", "FALSE", "0"):
            result = self._patch({"flags": {"bpmn_fps_meter_enabled": raw}})
            self.assertIs(result["flags"].get("bpmn_fps_meter_enabled"), False, msg=f"raw={raw!r}")

    def test_patch_bool_and_int_still_work(self):
        result = self._patch({"flags": {"bpmn_fps_meter_enabled": True}})
        self.assertIs(result["flags"].get("bpmn_fps_meter_enabled"), True)
        result = self._patch({"flags": {"bpmn_fps_meter_enabled": False}})
        self.assertIs(result["flags"].get("bpmn_fps_meter_enabled"), False)
        result = self._patch({"flags": {"bpmn_fps_meter_enabled": 1}})
        self.assertIs(result["flags"].get("bpmn_fps_meter_enabled"), True)
        result = self._patch({"flags": {"bpmn_fps_meter_enabled": 0}})
        self.assertIs(result["flags"].get("bpmn_fps_meter_enabled"), False)

    def test_patch_invalid_values_rejected_422(self):
        from fastapi import HTTPException

        for raw in ("yes", "on", "2", "00", "", None, ["1"], {"v": 1}, 2, -1, 0.5):
            with self.assertRaises(HTTPException, msg=f"raw={raw!r}") as ctx:
                self._patch({"flags": {"bpmn_fps_meter_enabled": raw}})
            self.assertEqual(ctx.exception.status_code, 422, msg=f"raw={raw!r}")
            self.assertIn("FEATURE_FLAG_INVALID_VALUE", str(ctx.exception.detail))

    def test_patch_valid_and_invalid_mix_rejected_422(self):
        from fastapi import HTTPException

        with self.assertRaises(HTTPException) as ctx:
            self._patch({"flags": {"bpmn_fps_meter_enabled": "1", "canvas_profiler_enabled": "maybe"}})
        self.assertEqual(ctx.exception.status_code, 422)
        # Отклоняем весь батч: валидный флаг из смешанного батча не применяется.
        request = _DummyRequest(self.admin, active_org_id=self.org_id)
        flags = self.patch_endpoint(request, {"flags": {}})["flags"]
        self.assertIs(flags.get("canvas_profiler_enabled"), False)

    def test_put_string_zero_disables(self):
        self._put("bpmn_fps_meter_enabled", {"value": True})
        result = self._put("bpmn_fps_meter_enabled", {"value": "0"})
        self.assertTrue(result.get("ok"))
        self.assertIs(result.get("value"), False)
        self.assertIs(result["flags"].get("bpmn_fps_meter_enabled"), False)

    def test_put_invalid_rejected_422(self):
        from fastapi import HTTPException

        with self.assertRaises(HTTPException) as ctx:
            self._put("bpmn_fps_meter_enabled", {"value": "yes"})
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("FEATURE_FLAG_INVALID_VALUE", str(ctx.exception.detail))

    def test_put_missing_value_defaults_false(self):
        # Существующее поведение: отсутствие "value" == False (документируем тестом).
        result = self._put("bpmn_fps_meter_enabled", {})
        self.assertIs(result.get("value"), False)

    def test_non_admin_forbidden_before_value_validation(self):
        from fastapi import HTTPException

        request = _DummyRequest(self.user, active_org_id=self.org_id)
        with self.assertRaises(HTTPException) as ctx:
            self.patch_endpoint(request, {"flags": {"bpmn_fps_meter_enabled": "yes"}})
        self.assertEqual(ctx.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
