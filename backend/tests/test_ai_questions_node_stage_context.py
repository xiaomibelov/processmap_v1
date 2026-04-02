import json
import unittest
from unittest.mock import patch

from app.ai.deepseek_questions import _LLM_QUESTIONS_TIMEOUT_SEC, generate_llm_questions_for_node
from app.models import Edge, Node, Session


class AiQuestionsNodeStageContextTest(unittest.TestCase):
    @patch("app.ai.deepseek_questions._deepseek_chat_json")
    def test_node_prompt_includes_previous_and_next_steps_context(self, mock_chat):
        captured = {}

        def _fake_chat(*, api_key, base_url, messages, timeout=30, max_tokens=None):
            captured["messages"] = messages
            return {
                "questions": [
                    {
                        "question_id": "Q001",
                        "issue_type": "MISSING",
                        "node_id": "Task_2",
                        "question": "Уточните критерий завершения шага.",
                        "expected_answer_format": "short_text",
                    }
                ]
            }

        mock_chat.side_effect = _fake_chat

        session = Session(
            id="s_ctx",
            title="Контекст узла",
            roles=["Повар", "Контроль"],
            nodes=[
                Node(id="Task_1", type="step", title="Подготовка", actor_role="Повар"),
                Node(id="Task_2", type="step", title="Варка", actor_role="Повар"),
                Node(id="Task_3", type="step", title="Проверка", actor_role="Контроль"),
            ],
            edges=[
                Edge(from_id="Task_1", to_id="Task_2"),
                Edge(from_id="Task_2", to_id="Task_3"),
            ],
            interview={
                "steps": [
                    {"id": "step_1", "node_id": "Task_1", "action": "Подготовка", "role": "Повар"},
                    {"id": "step_2", "node_id": "Task_2", "action": "Варка", "role": "Повар"},
                    {"id": "step_3", "node_id": "Task_3", "action": "Проверка", "role": "Контроль"},
                ]
            },
        )

        target_node = session.nodes[1]
        out = generate_llm_questions_for_node(
            session,
            target_node,
            api_key="x",
            base_url="https://example.invalid",
            limit=5,
        )

        self.assertEqual(len(out), 1)
        self.assertEqual(out[0].node_id, "Task_2")

        self.assertIn("messages", captured)
        sys_prompt = str((captured["messages"][0] or {}).get("content") or "")
        self.assertIn("previous_step/current_step/next_step", sys_prompt)

        user_payload = json.loads(str((captured["messages"][1] or {}).get("content") or "{}"))
        node_focus = user_payload.get("node_focus") or {}
        stage = node_focus.get("stage_context") or {}
        prev_step = stage.get("previous_step") or {}
        curr_step = stage.get("current_step") or {}
        next_step = stage.get("next_step") or {}

        self.assertEqual(curr_step.get("node_id"), "Task_2")
        self.assertEqual(prev_step.get("node_id"), "Task_1")
        self.assertEqual(next_step.get("node_id"), "Task_3")

        neighbors = node_focus.get("graph_neighbors") or {}
        incoming = neighbors.get("incoming_sample") or []
        outgoing = neighbors.get("outgoing_sample") or []
        self.assertEqual((incoming[0] or {}).get("id"), "Task_1")
        self.assertEqual((outgoing[0] or {}).get("id"), "Task_3")
        self.assertEqual(mock_chat.call_args.kwargs.get("timeout"), _LLM_QUESTIONS_TIMEOUT_SEC)


if __name__ == "__main__":
    unittest.main()
