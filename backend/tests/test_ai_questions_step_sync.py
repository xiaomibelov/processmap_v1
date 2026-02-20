import os
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

from app.models import Question


class AiQuestionsStepSyncTest(unittest.TestCase):
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

        from app.main import (
            AiQuestionsIn,
            CreateSessionIn,
            UpdateSessionIn,
            ai_questions,
            create_session,
            patch_session,
        )

        self.AiQuestionsIn = AiQuestionsIn
        self.CreateSessionIn = CreateSessionIn
        self.UpdateSessionIn = UpdateSessionIn
        self.ai_questions = ai_questions
        self.create_session = create_session
        self.patch_session = patch_session

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

    def _create_session_with_step(self):
        created = self.create_session(
            self.CreateSessionIn(
                title="LLM sync",
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
            ),
        )
        self.assertNotIn("error", updated)
        return sid

    @patch("app.main.load_llm_settings", return_value={"api_key": "x", "base_url": "https://example.invalid"})
    @patch("app.ai.deepseek_questions.generate_llm_questions_for_node")
    def test_node_step_saves_and_returns_questions_for_step(self, mock_generate, _mock_llm):
        mock_generate.return_value = [
            Question(
                id="llm_q_1",
                node_id="Activity_1",
                issue_type="MISSING",
                question="Какая температура шага?",
            )
        ]

        sid = self._create_session_with_step()
        res = self.ai_questions(
            sid,
            self.AiQuestionsIn(mode="node_step", node_id="Activity_1", step_id="step_1", limit=5),
        )
        self.assertNotIn("error", res)
        self.assertIn("llm_step", res)
        llm_step = res.get("llm_step") or {}
        self.assertEqual(llm_step.get("node_id"), "Activity_1")
        self.assertEqual(llm_step.get("step_id"), "step_1")
        self.assertTrue(isinstance(llm_step.get("questions"), list))
        self.assertGreaterEqual(len(llm_step.get("questions") or []), 1)
        self.assertEqual((llm_step.get("questions") or [{}])[0].get("text"), "Какая температура шага?")

        interview = res.get("interview") or {}
        ai_map = interview.get("ai_questions") or {}
        self.assertIn("step_1", ai_map)
        self.assertEqual((ai_map.get("step_1") or [{}])[0].get("text"), "Какая температура шага?")
        self.assertEqual((ai_map.get("step_1") or [{}])[0].get("status"), "уточнить")

    @patch("app.main.load_llm_settings", return_value={"api_key": "x", "base_url": "https://example.invalid"})
    @patch("app.ai.deepseek_questions.generate_llm_questions_for_node")
    def test_node_step_with_existing_five_questions_returns_saved_step_list(self, mock_generate, _mock_llm):
        sid = self._create_session_with_step()

        q_list = []
        for i in range(5):
            q_list.append(
                {
                    "id": f"llm_existing_{i+1}",
                    "node_id": "Activity_1",
                    "issue_type": "MISSING",
                    "question": f"Вопрос {i+1}",
                    "status": "open",
                }
            )
        updated = self.patch_session(
            sid,
            self.UpdateSessionIn(questions=q_list),
        )
        self.assertNotIn("error", updated)

        res = self.ai_questions(
            sid,
            self.AiQuestionsIn(mode="node_step", node_id="Activity_1", step_id="step_1", limit=5),
        )
        self.assertNotIn("error", res)
        llm_step = res.get("llm_step") or {}
        self.assertTrue(llm_step.get("reused"))
        self.assertEqual(len(llm_step.get("questions") or []), 5)
        interview = res.get("interview") or {}
        ai_map = interview.get("ai_questions") or {}
        self.assertEqual(len(ai_map.get("step_1") or []), 5)
        mock_generate.assert_not_called()


if __name__ == "__main__":
    unittest.main()
