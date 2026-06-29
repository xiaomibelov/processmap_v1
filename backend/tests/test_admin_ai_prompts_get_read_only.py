import os
import tempfile
import unittest
from types import SimpleNamespace
from pathlib import Path


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str = "", org_memberships: list | None = None):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.state.org_memberships = list(org_memberships or [])
        self.headers = {}


class AdminAiPromptsGetReadOnlyTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_process_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_project_storage_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_database_url = os.environ.get("DATABASE_URL")
        self.old_backend = os.environ.get("FPC_DB_BACKEND")
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp.name) / "admin_ai_prompts.sqlite3")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp.name
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)

        from app.db.config import get_db_runtime_config
        import app.storage as storage

        get_db_runtime_config.cache_clear()
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""

        from app.auth import create_user
        from app.ai.prompt_registry import seed_existing_ai_prompts
        from app.routers.admin import (
            admin_ai_active_prompt,
            admin_ai_modules,
            admin_ai_prompts,
            admin_seed_ai_prompts,
        )
        from app.storage import get_default_org_id, list_user_org_memberships

        self.admin_ai_prompts = admin_ai_prompts
        self.admin_ai_active_prompt = admin_ai_active_prompt
        self.admin_ai_modules = admin_ai_modules
        self.admin_seed_ai_prompts = admin_seed_ai_prompts

        self.admin = create_user("admin_ai_prompts@local", "strongpass1", is_admin=True)
        self.default_org_id = get_default_org_id()
        self.request = _DummyRequest(
            self.admin,
            active_org_id=self.default_org_id,
            org_memberships=list_user_org_memberships(str(self.admin.get("id") or ""), is_admin=True),
        )

        # Seed once so GET endpoints have data to return.
        seed_result = seed_existing_ai_prompts(actor_user_id="test_seed")
        self.assertTrue(seed_result.get("ok"), seed_result)

    def tearDown(self):
        if self.old_process_db_path is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = self.old_process_db_path
        if self.old_storage_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_storage_dir
        if self.old_project_storage_dir is None:
            os.environ.pop("PROJECT_STORAGE_DIR", None)
        else:
            os.environ["PROJECT_STORAGE_DIR"] = self.old_project_storage_dir
        if self.old_database_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = self.old_database_url
        if self.old_backend is None:
            os.environ.pop("FPC_DB_BACKEND", None)
        else:
            os.environ["FPC_DB_BACKEND"] = self.old_backend

        from app.db.config import get_db_runtime_config
        import app.storage as storage

        get_db_runtime_config.cache_clear()
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""
        self.tmp.cleanup()

    def test_get_prompts_is_read_only_and_idempotent(self):
        """GET /api/admin/ai/prompts must not write; two calls in a row return 200."""
        first = self.admin_ai_prompts(
            self.request,
            module_id="",
            status="",
            scope_level="",
            scope_id="",
            limit=50,
            offset=0,
        )
        self.assertTrue(first.get("ok"), first)
        count = first.get("count")

        second = self.admin_ai_prompts(
            self.request,
            module_id="",
            status="",
            scope_level="",
            scope_id="",
            limit=50,
            offset=0,
        )
        self.assertTrue(second.get("ok"), second)
        self.assertEqual(second.get("count"), count)

    def test_get_prompts_active_is_read_only(self):
        first = self.admin_ai_active_prompt(
            self.request, module_id="ai.questions.session", scope_level="global", scope_id=""
        )
        self.assertTrue(first.get("ok"), first)

        second = self.admin_ai_active_prompt(
            self.request, module_id="ai.questions.session", scope_level="global", scope_id=""
        )
        self.assertTrue(second.get("ok"), second)
        self.assertEqual(
            (first.get("item") or {}).get("prompt_id"),
            (second.get("item") or {}).get("prompt_id"),
        )

    def test_get_modules_is_read_only(self):
        first = self.admin_ai_modules(self.request)
        self.assertIsInstance(first, dict)

        second = self.admin_ai_modules(self.request)
        self.assertIsInstance(second, dict)

    def test_seed_endpoint_writes_and_is_idempotent(self):
        first = self.admin_seed_ai_prompts(self.request)
        self.assertTrue(first.get("ok"), first)

        second = self.admin_seed_ai_prompts(self.request)
        self.assertTrue(second.get("ok"), second)
        self.assertEqual(second.get("created") or [], [])


if __name__ == "__main__":
    unittest.main()
