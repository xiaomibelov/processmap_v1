import os
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class AiPromptRegistrySeedTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_process_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_project_storage_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_database_url = os.environ.get("DATABASE_URL")
        self.old_backend = os.environ.get("FPC_DB_BACKEND")
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp.name) / "ai_prompt_seeds.sqlite3")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp.name
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)

        from app.db.config import get_db_runtime_config
        import app.storage as storage

        get_db_runtime_config.cache_clear()
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""

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

    def test_seed_creates_active_prompt_versions_idempotently(self):
        from app.ai.prompt_registry import get_active_prompt, list_prompt_versions, seed_existing_ai_prompts

        first = seed_existing_ai_prompts()
        self.assertTrue(first.get("ok"))
        self.assertIn("seed_ai_questions_prep_v1", first.get("created") or [])

        expected_active_modules = [
            "ai.questions.session",
            "ai.questions.element",
            "ai.questions.prep",
            "ai.path_report",
            "ai.process.extract_from_notes",
            "ai.product_actions.suggest",
        ]
        for module_id in expected_active_modules:
            active = get_active_prompt(module_id=module_id)
            self.assertIsInstance(active, dict)
            self.assertEqual(active.get("module_id"), module_id)
            self.assertEqual(active.get("status"), "active")
            self.assertTrue(str(active.get("template") or "").strip())

        product_actions_prompt = get_active_prompt(module_id="ai.product_actions.suggest")
        template = str((product_actions_prompt or {}).get("template") or "")
        self.assertIn("физические действия сотрудников", template)
        self.assertIn("product_name", template)
        self.assertIn("evidence_text", template)
        self.assertIn("только suggestions для review", template)

        path_versions = list_prompt_versions(module_id="ai.path_report", limit=10).get("items") or []
        by_version = {str(item.get("version") or ""): item for item in path_versions}
        self.assertEqual(by_version["v1"].get("status"), "archived")
        self.assertEqual(by_version["v2"].get("status"), "active")

        count_before = list_prompt_versions(limit=50).get("count")
        second = seed_existing_ai_prompts()
        self.assertTrue(second.get("ok"))
        self.assertEqual(list_prompt_versions(limit=50).get("count"), count_before)
        for module_id in expected_active_modules:
            active_count = len(list_prompt_versions(module_id=module_id, status="active", limit=10).get("items") or [])
            self.assertEqual(active_count, 1, module_id)


if __name__ == "__main__":
    unittest.main()
