import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class ProductActionsAiSuggestTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_api_key = os.environ.get("DEEPSEEK_API_KEY")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ.pop("PROCESS_DB_PATH", None)
        os.environ["DEEPSEEK_API_KEY"] = "SECRET_TEST_KEY"
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-issuer")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")

        from app.auth import create_user
        from app.models import Edge, Node
        from app.routers.product_actions_ai import ProductActionsSuggestIn, router, suggest_product_actions
        from app.storage import get_default_org_id, get_project_storage, get_storage, upsert_project_membership

        self.Edge = Edge
        self.Node = Node
        self.ProductActionsSuggestIn = ProductActionsSuggestIn
        self.router = router
        self.suggest_product_actions = suggest_product_actions
        self.get_storage = get_storage
        self.get_project_storage = get_project_storage
        self.upsert_project_membership = upsert_project_membership

        self.org_id = get_default_org_id()
        self.user = create_user("product-ai@local", "product-ai", is_admin=False)
        self.user_id = str(self.user.get("id") or "")
        self._insert_membership(self.org_id, self.user_id, "org_admin")
        self.project_id = self.get_project_storage().create("AI Product Project", {}, user_id=self.user_id, org_id=self.org_id, is_admin=True)
        self.session_id = self._seed_session()

    def tearDown(self):
        if self.old_storage_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_storage_dir
        if self.old_db_path is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = self.old_db_path
        if self.old_api_key is None:
            os.environ.pop("DEEPSEEK_API_KEY", None)
        else:
            os.environ["DEEPSEEK_API_KEY"] = self.old_api_key
        self.tmp.cleanup()

    def _db_path(self) -> Path:
        return Path(self.tmp.name) / "processmap.sqlite3"

    def _insert_membership(self, org_id: str, user_id: str, role: str):
        _ = self.get_storage()
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute(
                """
                INSERT OR IGNORE INTO org_memberships (org_id, user_id, role, created_at)
                VALUES (?, ?, ?, strftime('%s','now'))
                """,
                [org_id, user_id, role],
            )
            con.execute(
                "UPDATE org_memberships SET role = ? WHERE org_id = ? AND user_id = ?",
                [role, org_id, user_id],
            )
            con.commit()

    def _req(self):
        return _DummyRequest(self.user, active_org_id=self.org_id)

    def _seed_session(self):
        storage = self.get_storage()
        sid = storage.create("Product AI Session", roles=["Повар"], project_id=self.project_id, org_id=self.org_id, is_admin=True)
        session = storage.load(sid, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(session)
        session.nodes = [
            self.Node(id="Task_1", title="Нарезать курицу", type="step", actor_role="Повар"),
            self.Node(id="Task_2", title="Упаковать сэндвич", type="step", actor_role="Упаковщик"),
        ]
        session.edges = [self.Edge(from_id="Task_1", to_id="Task_2", when="далее")]
        session.interview = {
            "steps": [
                {"id": "step_1", "node_id": "Task_1", "action": "Нарезать курицу", "role": "Повар"},
                {"id": "step_2", "node_id": "Task_2", "action": "Упаковать сэндвич", "role": "Упаковщик"},
            ],
            "analysis": {
                "product_actions": [
                    {
                        "id": "manual_1",
                        "step_id": "step_1",
                        "bpmn_element_id": "Task_1",
                        "product_name": "Курица",
                        "product_group": "Птица",
                        "action_type": "нарезка",
                        "action_object": "курица",
                        "role": "Повар",
                        "source": "manual",
                    }
                ]
            },
        }
        session.bpmn_xml = "<bpmn:definitions id='unchanged'/>"
        session.diagram_state_version = 11
        storage.save(session, org_id=self.org_id, is_admin=True)
        return sid

    def _logs(self):
        from app.ai.execution_log import list_ai_executions

        return list_ai_executions(org_id=self.org_id, module_id="ai.product_actions.suggest", limit=20)

    def test_endpoint_registered(self):
        paths = {getattr(route, "path", "") for route in self.router.routes}
        self.assertIn("/api/sessions/{session_id}/analysis/product-actions/suggest", paths)

    def test_suggest_returns_candidates_without_mutation_and_logs_success(self):
        before = self.get_storage().load(self.session_id, org_id=self.org_id, is_admin=True)
        with patch(
            "app.routers.product_actions_ai.suggest_product_actions_with_deepseek",
            return_value={
                "suggestions": [
                    {
                        "id": "ai_1",
                        "step_id": "step_2",
                        "bpmn_element_id": "Task_2",
                        "step_label": "Упаковать сэндвич",
                        "product_name": "Сэндвич",
                        "product_group": "Готовые блюда",
                        "action_type": "упаковка",
                        "action_stage": "упаковка",
                        "action_object": "сэндвич",
                        "action_object_category": "готовое блюдо",
                        "action_method": "поместить",
                        "role": "Упаковщик",
                        "confidence": 0.82,
                        "evidence_text": "Шаг: Упаковать сэндвич",
                    }
                ],
                "warnings": [],
            },
        ) as provider:
            out = self.suggest_product_actions(
                self.session_id,
                self.ProductActionsSuggestIn(options={"max_suggestions": 5}),
                self._req(),
            )

        after = self.get_storage().load(self.session_id, org_id=self.org_id, is_admin=True)
        self.assertTrue(out.get("ok"))
        self.assertEqual(out.get("module_id"), "ai.product_actions.suggest")
        self.assertEqual(out.get("source"), "llm")
        self.assertEqual(len(out.get("suggestions") or []), 1)
        self.assertEqual(provider.call_args.kwargs.get("max_suggestions"), 5)
        self.assertEqual(before.interview, after.interview)
        self.assertEqual(before.nodes, after.nodes)
        self.assertEqual(before.edges, after.edges)
        self.assertEqual(before.bpmn_xml, after.bpmn_xml)
        self.assertEqual(before.diagram_state_version, after.diagram_state_version)

        logs = self._logs().get("items") or []
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0].get("status"), "success")
        self.assertEqual(logs[0].get("module_id"), "ai.product_actions.suggest")
        self.assertNotIn("SECRET_TEST_KEY", str(logs[0]))

    def test_existing_product_actions_mark_duplicate_candidates(self):
        with patch(
            "app.routers.product_actions_ai.suggest_product_actions_with_deepseek",
            return_value={
                "suggestions": [
                    {
                        "id": "ai_dup",
                        "step_id": "step_1",
                        "bpmn_element_id": "Task_1",
                        "product_name": "Курица",
                        "product_group": "Птица",
                        "action_type": "нарезка",
                        "action_object": "курица",
                        "confidence": 0.9,
                    }
                ],
                "warnings": [],
            },
        ):
            out = self.suggest_product_actions(self.session_id, self.ProductActionsSuggestIn(), self._req())
        row = (out.get("suggestions") or [])[0]
        self.assertEqual(row.get("duplicate_of"), "manual_1")
        self.assertIn("уже сохранённое", row.get("duplicate_reason", ""))

    def test_rate_limit_block_does_not_call_provider_or_mutate(self):
        before = self.get_storage().load(self.session_id, org_id=self.org_id, is_admin=True)
        with patch(
            "app.routers.product_actions_ai.check_ai_rate_limit",
            return_value={"allowed": False, "limit": 1, "window_sec": 3600, "reset_at": 123},
        ), patch("app.routers.product_actions_ai.suggest_product_actions_with_deepseek") as provider:
            out = self.suggest_product_actions(self.session_id, self.ProductActionsSuggestIn(), self._req())
        after = self.get_storage().load(self.session_id, org_id=self.org_id, is_admin=True)
        self.assertFalse(out.get("ok"))
        self.assertEqual(out.get("error"), "ai_rate_limit_exceeded")
        provider.assert_not_called()
        self.assertEqual(before.interview, after.interview)
        self.assertEqual(before.diagram_state_version, after.diagram_state_version)

    def test_active_prompt_seed_is_used_and_fallback_kept(self):
        with patch(
            "app.routers.product_actions_ai.suggest_product_actions_with_deepseek",
            return_value={"suggestions": [], "warnings": []},
        ) as provider:
            out = self.suggest_product_actions(self.session_id, self.ProductActionsSuggestIn(), self._req())
        self.assertTrue(out.get("ok"))
        self.assertEqual(out.get("prompt_id"), "seed_ai_product_actions_suggest_v1")
        self.assertEqual(provider.call_args.kwargs.get("prompt_template"), provider.call_args.kwargs.get("prompt_template"))
        self.assertTrue(str(provider.call_args.kwargs.get("prompt_template") or "").strip())


if __name__ == "__main__":
    unittest.main()
