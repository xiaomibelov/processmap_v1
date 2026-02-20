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
        self.old_sessions_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_projects_dir = os.environ.get("PROJECT_STORAGE_DIR")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp_sessions.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp_projects.name

        from app.main import SessionTitleQuestionsIn, llm_session_title_questions

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
        self.tmp_sessions.cleanup()
        self.tmp_projects.cleanup()

    def test_title_required(self):
        res = self.llm_session_title_questions(self.SessionTitleQuestionsIn(title=""))
        self.assertEqual(res.get("error"), "title is required")

    @patch("app.main.load_llm_settings", return_value={"api_key": "", "base_url": "https://example.invalid"})
    def test_api_key_required(self, _mock_llm):
        res = self.llm_session_title_questions(self.SessionTitleQuestionsIn(title="Фо Бо"))
        self.assertEqual(res.get("error"), "deepseek api_key is not set")

    @patch("app.main.load_llm_settings", return_value={"api_key": "x", "base_url": "https://example.invalid"})
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


if __name__ == "__main__":
    unittest.main()
