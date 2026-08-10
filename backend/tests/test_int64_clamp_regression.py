"""Регрессия contract-fuzz (PR #707): int query-параметры за пределами int64
(offset, occurred_from/to, created_from/to) клэмпятся, а не роняют sqlite/psycopg
биндинг OverflowError → 500. Найдено schemathesis на GET /api/admin/ai/executions,
/api/admin/ai/prompts, /api/notifications/error_events (огромный offset/ts).
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

HUGE = 474793763510629620476127739904  # из CI-лога contract fuzz
INT64_MAX = 2**63 - 1


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class Int64ClampRegressionTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_env = {
            k: os.environ.get(k)
            for k in ("PROCESS_DB_PATH", "PROCESS_STORAGE_DIR", "PROJECT_STORAGE_DIR",
                      "DATABASE_URL", "FPC_DB_BACKEND")
        }
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp.name) / "int64_clamp.sqlite3")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp.name
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)

        from app.db.config import get_db_runtime_config
        import app.storage as storage

        get_db_runtime_config.cache_clear()
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""
        self.storage = storage

        from app.auth import create_user
        from app.routers.admin import admin_ai_executions, admin_ai_prompts, _as_int

        self.admin_ai_executions = admin_ai_executions
        self.admin_ai_prompts = admin_ai_prompts
        self._as_int = _as_int
        admin = create_user("int64.admin@local", "strongpass1", is_admin=True)
        self.request = _DummyRequest(admin, active_org_id=storage.get_default_org_id())

    def tearDown(self):
        for key, value in self.old_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        from app.db.config import get_db_runtime_config
        import app.storage as storage

        get_db_runtime_config.cache_clear()
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""
        self.tmp.cleanup()

    def test_as_int_clamps_beyond_int64(self):
        self.assertEqual(self._as_int(HUGE), INT64_MAX)
        self.assertEqual(self._as_int(-HUGE), -(2**63))
        self.assertEqual(self._as_int(42), 42)
        self.assertEqual(self._as_int("junk", 7), 7)

    def test_admin_ai_executions_huge_offset_no_500(self):
        result = self.admin_ai_executions(
            self.request, module_id="", status="", actor_user_id="", org_id="",
            workspace_id="", project_id="", session_id="",
            created_from=0, created_to=0, limit=50, offset=HUGE)
        self.assertTrue(result.get("ok"), result)
        self.assertEqual(result["items"], [])

    def test_admin_ai_executions_huge_created_from_no_500(self):
        result = self.admin_ai_executions(
            self.request, module_id="", status="", actor_user_id="", org_id="",
            workspace_id="", project_id="", session_id="",
            created_from=HUGE, created_to=HUGE, limit=50, offset=0)
        self.assertTrue(result.get("ok"), result)

    def test_admin_ai_prompts_huge_offset_no_500(self):
        result = self.admin_ai_prompts(
            self.request, module_id="", status="", scope_level="", scope_id="",
            limit=50, offset=HUGE)
        self.assertTrue(result.get("ok"), result)

    def test_storage_list_error_events_huge_ints_no_overflow(self):
        items = self.storage.list_error_events(occurred_from=HUGE, occurred_to=HUGE,
                                               offset=HUGE, limit=10**30)
        self.assertEqual(items, [])
        total = self.storage.count_error_events(occurred_from=HUGE)
        self.assertEqual(int(total), 0)

    def test_storage_clamp_int64_helper(self):
        self.assertEqual(self.storage._clamp_int64(HUGE), INT64_MAX)
        self.assertEqual(self.storage._clamp_int64("junk", 5), 5)


if __name__ == "__main__":
    unittest.main()
