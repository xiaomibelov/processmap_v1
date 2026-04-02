import unittest
from unittest.mock import patch

from app.ai.deepseek_questions import _LLM_QUESTIONS_TIMEOUT_SEC, generate_llm_questions
from app.models import Node, Session


class AiQuestionsTimeoutTest(unittest.TestCase):
    @patch("app.ai.deepseek_questions._deepseek_chat_json")
    def test_global_questions_use_extended_timeout(self, mock_chat):
        captured = {}

        def _fake_chat(*, api_key, base_url, messages, timeout=30, max_tokens=None):
            captured["timeout"] = timeout
            return {
                "questions": [
                    {
                        "question_id": "Q001",
                        "issue_type": "MISSING",
                        "node_id": "Task_1",
                        "question": "Уточните критерий завершения шага.",
                        "expected_answer_format": "short_text",
                    }
                ]
            }

        mock_chat.side_effect = _fake_chat

        session = Session(
            id="s_timeout",
            title="Timeout test",
            nodes=[Node(id="Task_1", type="step", title="Шаг 1", actor_role="Повар")],
            bpmn_xml="<definitions><process id='Process_1'><task id='Task_1' name='Шаг 1'/></process></definitions>",
        )

        out = generate_llm_questions(
            session,
            api_key="x",
            base_url="https://example.invalid",
            limit=3,
            mode="strict",
        )

        self.assertEqual(len(out), 1)
        self.assertEqual(captured.get("timeout"), _LLM_QUESTIONS_TIMEOUT_SEC)


if __name__ == "__main__":
    unittest.main()
