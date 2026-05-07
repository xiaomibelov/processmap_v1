import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from app.models import Question


class AiQuestionsRuntimeLoggingTests(unittest.TestCase):
    def setUp(self):
        if "yaml" not in sys.modules:
            mod = types.ModuleType("yaml")
            mod.safe_dump = lambda *args, **kwargs: ""
            mod.safe_load = lambda *args, **kwargs: {}
            sys.modules["yaml"] = mod

        self.tmp_sessions = tempfile.TemporaryDirectory()
        self.tmp_projects = tempfile.TemporaryDirectory()
        self.old_process_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_project_storage_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_database_url = os.environ.get("DATABASE_URL")
        self.old_backend = os.environ.get("FPC_DB_BACKEND")
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp_sessions.name) / "ai_questions_runtime.sqlite3")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp_sessions.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp_projects.name
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)

        from app.db.config import get_db_runtime_config
        import app.storage as storage

        get_db_runtime_config.cache_clear()
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""

        from app._legacy_main import (
            AiQuestionsIn,
            CreateSessionIn,
            UpdateSessionIn,
            ai_questions,
            create_session,
            patch_session,
        )
        from app.storage import get_default_org_id

        self.AiQuestionsIn = AiQuestionsIn
        self.CreateSessionIn = CreateSessionIn
        self.UpdateSessionIn = UpdateSessionIn
        self.ai_questions = ai_questions
        self.create_session = create_session
        self.patch_session = patch_session
        self.org_id = get_default_org_id()

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
        self.tmp_sessions.cleanup()
        self.tmp_projects.cleanup()

    def _create_session_with_step(self):
        created = self.create_session(
            self.CreateSessionIn(
                title="AI runtime questions",
                roles=["Повар"],
                start_role="Повар",
            )
        )
        sid = str(created["id"])
        updated = self.patch_session(
            sid,
            self.UpdateSessionIn(
                nodes=[
                    {
                        "id": "Activity_1",
                        "type": "step",
                        "title": "Шаг 1",
                        "actor_role": "Повар",
                    }
                ],
                interview={
                    "steps": [
                        {
                            "id": "step_1",
                            "node_id": "Activity_1",
                            "action": "Шаг 1",
                            "comment": "",
                        }
                    ],
                    "ai_questions": {},
                },
                bpmn_xml=(
                    "<definitions><process id='p1'>"
                    "<task id='Activity_1' name='Шаг 1' />"
                    "</process></definitions>"
                ),
            ),
        )
        self.assertNotIn("error", updated)
        return sid

    def _logs(self, *, module_id="", session_id=""):
        from app.ai.execution_log import list_ai_executions

        return list_ai_executions(
            org_id=self.org_id,
            module_id=module_id,
            session_id=session_id,
            limit=20,
            offset=0,
        ).get("items") or []

    @patch("app._legacy_main.load_llm_settings", return_value={"api_key": "x", "base_url": "https://example.invalid"})
    @patch("app.ai.deepseek_questions.generate_llm_questions")
    def test_session_generation_writes_success_execution_log(self, mock_generate, _mock_llm):
        mock_generate.return_value = [
            Question(id="llm_q_1", node_id="Activity_1", issue_type="MISSING", question="Какая температура?")
        ]

        sid = self._create_session_with_step()
        res = self.ai_questions(sid, self.AiQuestionsIn(mode="strict", limit=3))

        self.assertNotIn("error", res)
        logs = self._logs(module_id="ai.questions.session", session_id=sid)
        self.assertEqual(len(logs), 1)
        row = logs[0]
        self.assertEqual(row.get("status"), "success")
        self.assertEqual(row.get("module_id"), "ai.questions.session")
        self.assertEqual(row.get("provider"), "deepseek")
        self.assertEqual(row.get("model"), "deepseek-chat")
        self.assertTrue(str(row.get("input_hash") or ""))
        self.assertIn("generated=1", str(row.get("output_summary") or ""))

    @patch("app._legacy_main.load_llm_settings", return_value={"api_key": "x", "base_url": "https://example.invalid"})
    @patch("app.ai.deepseek_questions.generate_llm_questions_for_node")
    def test_element_generation_writes_element_module_log(self, mock_generate, _mock_llm):
        mock_generate.return_value = [
            Question(id="llm_q_1", node_id="Activity_1", issue_type="MISSING", question="Какая температура?")
        ]

        sid = self._create_session_with_step()
        res = self.ai_questions(
            sid,
            self.AiQuestionsIn(mode="node_step", node_id="Activity_1", step_id="step_1", limit=5),
        )

        self.assertNotIn("error", res)
        logs = self._logs(module_id="ai.questions.element", session_id=sid)
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0].get("status"), "success")
        self.assertEqual(logs[0].get("module_id"), "ai.questions.element")
        self.assertIn("node_id=Activity_1", str(logs[0].get("output_summary") or ""))

    @patch("app._legacy_main.load_llm_settings", return_value={"api_key": "x", "base_url": "https://example.invalid"})
    @patch("app.ai.deepseek_questions.generate_llm_questions", side_effect=RuntimeError("provider failed"))
    def test_provider_error_writes_error_log(self, _mock_generate, _mock_llm):
        sid = self._create_session_with_step()
        res = self.ai_questions(sid, self.AiQuestionsIn(mode="strict", limit=3))

        self.assertIn("error", res)
        logs = self._logs(module_id="ai.questions.session", session_id=sid)
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0].get("status"), "error")
        self.assertEqual(logs[0].get("error_code"), "provider_error")
        self.assertEqual(logs[0].get("error_message"), "provider failed")

    @patch("app._legacy_main.load_llm_settings", return_value={"api_key": "SECRET_SHOULD_NOT_LEAK", "base_url": "https://example.invalid"})
    @patch("app.ai.deepseek_questions.generate_llm_questions")
    def test_log_keeps_hash_not_raw_input_or_api_key(self, mock_generate, _mock_llm):
        mock_generate.return_value = [
            Question(id="llm_q_1", node_id="Activity_1", issue_type="MISSING", question="Какая температура?")
        ]
        sid = self._create_session_with_step()

        self.ai_questions(sid, self.AiQuestionsIn(mode="strict", step_id="RAW_STEP_SHOULD_NOT_BE_STORED", limit=3))

        logs = self._logs(module_id="ai.questions.session", session_id=sid)
        self.assertEqual(len(logs), 1)
        row_text = str(logs[0])
        self.assertTrue(str(logs[0].get("input_hash") or ""))
        self.assertNotIn("SECRET_SHOULD_NOT_LEAK", row_text)
        self.assertNotIn("RAW_STEP_SHOULD_NOT_BE_STORED", row_text)
        self.assertNotIn("input_payload", row_text)

    @patch("app._legacy_main.load_llm_settings", return_value={"api_key": "x", "base_url": "https://example.invalid"})
    @patch("app.ai.deepseek_questions._deepseek_chat_json")
    def test_active_prompt_overrides_and_fallback_preserves_hardcoded_prompt(self, mock_chat, _mock_llm):
        from app.ai.deepseek_questions import _LLM_QUESTION_POLICY_PROMPT
        from app.ai.prompt_registry import activate_prompt_version, create_prompt_draft

        captured = []

        def _fake_chat(*, api_key, base_url, messages, timeout=30, max_tokens=None):
            captured.append(messages)
            return {
                "questions": [
                    {
                        "question_id": "Q001",
                        "issue_type": "MISSING",
                        "node_id": "Activity_1",
                        "question": "Какая температура?",
                    }
                ]
            }

        mock_chat.side_effect = _fake_chat
        sid = self._create_session_with_step()

        self.ai_questions(sid, self.AiQuestionsIn(mode="strict", limit=3))
        self.assertEqual(str((captured[-1][0] or {}).get("content") or ""), _LLM_QUESTION_POLICY_PROMPT)

        draft = create_prompt_draft(
            module_id="ai.questions.session",
            version="v-test",
            template="ACTIVE PROMPT TEMPLATE",
            created_by="tester",
            scope_level="global",
        )
        activate_prompt_version(str(draft.get("prompt_id") or ""), actor_user_id="tester")

        sid2 = self._create_session_with_step()
        self.ai_questions(sid2, self.AiQuestionsIn(mode="strict", limit=3))
        self.assertEqual(str((captured[-1][0] or {}).get("content") or ""), "ACTIVE PROMPT TEMPLATE")

        logs = self._logs(module_id="ai.questions.session", session_id=sid2)
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0].get("prompt_id"), draft.get("prompt_id"))
        self.assertEqual(logs[0].get("prompt_version"), "v-test")

    @patch("app._legacy_main.load_llm_settings", return_value={"api_key": "x", "base_url": "https://example.invalid"})
    @patch("app._legacy_main.check_ai_rate_limit")
    @patch("app.ai.deepseek_questions.generate_llm_questions")
    def test_rate_limit_block_returns_legacy_error_and_logs(self, mock_generate, mock_rate_limit, _mock_llm):
        mock_rate_limit.return_value = {
            "allowed": False,
            "limit": 1,
            "window_sec": 3600,
            "reset_at": 12345,
        }
        sid = self._create_session_with_step()

        res = self.ai_questions(sid, self.AiQuestionsIn(mode="strict", limit=3))

        self.assertEqual(res.get("error"), "ai_rate_limit_exceeded")
        self.assertEqual((res.get("rate_limit") or {}).get("limit"), 1)
        mock_generate.assert_not_called()
        logs = self._logs(module_id="ai.questions.session", session_id=sid)
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0].get("status"), "error")
        self.assertEqual(logs[0].get("error_code"), "ai_rate_limit_exceeded")


if __name__ == "__main__":
    unittest.main()
