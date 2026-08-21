import os
import sys
import tempfile
import types
import unittest
from unittest.mock import patch


class SessionTitleQuestionsApiTest(unittest.TestCase):
    def setUp(self):
        if "yaml" not in sys.modules:
            mod = types.ModuleType("yaml")
            mod.safe_dump = lambda *args, **kwargs: ""
            mod.safe_load = lambda *args, **kwargs: {}
            sys.modules["yaml"] = mod

        self.tmp_sessions = tempfile.TemporaryDirectory()
        self.tmp_projects = tempfile.TemporaryDirectory()
        self.tmp_db = tempfile.TemporaryDirectory()
        self.old_sessions_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_projects_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_process_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_database_url = os.environ.get("DATABASE_URL")
        self.old_backend = os.environ.get("FPC_DB_BACKEND")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp_sessions.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp_projects.name
        os.environ["PROCESS_DB_PATH"] = os.path.join(self.tmp_db.name, "session_title_questions.sqlite3")
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)

        from app.db.config import get_db_runtime_config
        import app.storage as storage

        get_db_runtime_config.cache_clear()
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""

        from app._legacy_main import SessionTitleQuestionsIn, llm_session_title_questions

        self.SessionTitleQuestionsIn = SessionTitleQuestionsIn
        self.llm_session_title_questions = llm_session_title_questions

    def tearDown(self):
        if self.old_sessions_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_sessions_dir
        if self.old_projects_dir is None:
            os.environ.pop("PROJECT_STORAGE_DIR", None)
        else:
            os.environ["PROJECT_STORAGE_DIR"] = self.old_projects_dir
        if self.old_process_db_path is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = self.old_process_db_path
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
        self.tmp_sessions.cleanup()
        self.tmp_projects.cleanup()
        self.tmp_db.cleanup()

    def test_title_required(self):
        res = self.llm_session_title_questions(self.SessionTitleQuestionsIn(title=""))
        self.assertEqual(res.get("error"), "title is required")

    @patch("app._legacy_main.load_llm_settings", return_value={"api_key": "", "base_url": "https://example.invalid"})
    def test_api_key_required(self, _mock_llm):
        res = self.llm_session_title_questions(self.SessionTitleQuestionsIn(title="Фо Бо"))
        self.assertEqual(res.get("error"), "deepseek api_key is not set")

    @patch("app._legacy_main.load_llm_settings", return_value={"api_key": "x", "base_url": "https://example.invalid"})
    @patch("app.ai.deepseek_questions.generate_session_title_questions")
    def test_returns_generated_questions(self, mock_generate, _mock_llm):
        mock_generate.return_value = {
            "title": "Фо Бо",
            "questions": [
                {
                    "id": "Q1",
                    "block": "Границы и готово",
                    "question": "Какой точный старт процесса?",
                    "ask_to": "Бригадир",
                    "answer_type": "коротко",
                    "follow_up": "Как фиксируете факт старта?",
                }
            ],
            "count": 1,
            "raw": "stub",
        }
        res = self.llm_session_title_questions(
            self.SessionTitleQuestionsIn(
                title="Фо Бо",
                min_questions=20,
                max_questions=10,
            )
        )
        self.assertEqual(res.get("count"), 1)
        self.assertEqual((res.get("questions") or [{}])[0].get("id"), "Q1")
        kwargs = mock_generate.call_args.kwargs
        # min is normalized down to max when min > max
        self.assertEqual(kwargs.get("min_questions"), 10)
        self.assertEqual(kwargs.get("max_questions"), 10)
        self.assertIn("{{НАЗВАНИЕ}}", kwargs.get("prompt_template") or "")
        self.assertEqual(res.get("prompt_source"), "registry")
        self.assertEqual(res.get("prompt_id"), "seed_ai_questions_prep_v1")

    @patch("app._legacy_main.get_active_prompt", return_value=None)
    @patch("app._legacy_main.seed_existing_ai_prompts", return_value={"ok": True})
    @patch("app._legacy_main.load_llm_settings", return_value={"api_key": "x", "base_url": "https://example.invalid"})
    @patch("app.ai.deepseek_questions.generate_session_title_questions")
    def test_falls_back_to_backend_prompt_when_registry_prompt_absent(
        self,
        mock_generate,
        _mock_llm,
        _mock_seed,
        _mock_active,
    ):
        mock_generate.return_value = {"title": "Фо Бо", "questions": [], "count": 0}
        res = self.llm_session_title_questions(self.SessionTitleQuestionsIn(title="Фо Бо"))
        self.assertEqual(res.get("prompt_source"), "code_fallback")
        self.assertEqual(mock_generate.call_args.kwargs.get("prompt_template"), "")


if __name__ == "__main__":
    unittest.main()
