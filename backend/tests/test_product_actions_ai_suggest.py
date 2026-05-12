import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException


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
        from app.routers.product_actions_ai import (
            ProductActionsBulkSuggestIn,
            ProductActionsSuggestIn,
            router,
            suggest_product_actions,
            suggest_product_actions_bulk,
        )
        from app.storage import get_default_org_id, get_project_storage, get_storage, upsert_project_membership

        self.Edge = Edge
        self.Node = Node
        self.ProductActionsBulkSuggestIn = ProductActionsBulkSuggestIn
        self.ProductActionsSuggestIn = ProductActionsSuggestIn
        self.router = router
        self.suggest_product_actions = suggest_product_actions
        self.suggest_product_actions_bulk = suggest_product_actions_bulk
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
        self.assertIn("/api/analysis/product-actions/suggest-bulk", paths)

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
        suggestion = (out.get("suggestions") or [])[0]
        for key in (
            "step_id",
            "bpmn_element_id",
            "step_label",
            "product_name",
            "product_group",
            "action_type",
            "action_stage",
            "action_object",
            "action_object_category",
            "action_method",
            "role",
            "confidence",
            "evidence_text",
            "warnings",
            "missing_fields",
            "duplicate_of",
            "duplicate_reason",
        ):
            self.assertIn(key, suggestion)
        self.assertEqual(suggestion.get("duplicate_of"), "")
        self.assertEqual(suggestion.get("duplicate_reason"), "")
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

    def test_selected_step_suggest_filters_context_and_unrelated_rows_without_mutation(self):
        before = self.get_storage().load(self.session_id, org_id=self.org_id, is_admin=True)
        with patch(
            "app.routers.product_actions_ai.suggest_product_actions_with_deepseek",
            return_value={
                "suggestions": [
                    {
                        "id": "ai_wrong",
                        "step_id": "step_1",
                        "bpmn_element_id": "Task_1",
                        "product_name": "Курица",
                        "product_group": "Птица",
                        "action_type": "нарезка",
                        "action_object": "курица",
                        "confidence": 0.8,
                    },
                    {
                        "id": "ai_right",
                        "step_id": "step_2",
                        "bpmn_element_id": "Task_2",
                        "product_name": "Сэндвич",
                        "product_group": "Готовые блюда",
                        "action_type": "упаковка",
                        "action_object": "сэндвич",
                        "confidence": 0.9,
                    },
                ],
                "warnings": [],
            },
        ) as provider:
            out = self.suggest_product_actions(
                self.session_id,
                self.ProductActionsSuggestIn(
                    options={
                        "max_suggestions": 5,
                        "selected_step_id": "step_2",
                        "selected_step_label": "Упаковать сэндвич",
                        "selected_step_bpmn_id": "Task_2",
                    }
                ),
                self._req(),
            )

        after = self.get_storage().load(self.session_id, org_id=self.org_id, is_admin=True)
        provider_context = provider.call_args.kwargs.get("context")
        self.assertEqual([step.get("step_id") for step in provider_context.get("steps")], ["step_2"])
        self.assertEqual(provider_context.get("selected_step", {}).get("bpmn_element_id"), "Task_2")
        suggestions = out.get("suggestions") or []
        self.assertEqual([row.get("id") for row in suggestions], ["ai_right"])
        self.assertEqual(suggestions[0].get("step_id"), "step_2")
        self.assertEqual(suggestions[0].get("bpmn_element_id"), "Task_2")
        self.assertTrue(any(w.get("code") == "selected_step_filter_removed_unrelated" for w in out.get("warnings") or []))
        self.assertEqual(before.interview, after.interview)
        self.assertEqual(before.bpmn_xml, after.bpmn_xml)
        self.assertEqual(before.diagram_state_version, after.diagram_state_version)

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
        self.assertEqual(out.get("message"), "AI_RATE_LIMIT_EXCEEDED")
        provider.assert_not_called()
        self.assertEqual(before.interview, after.interview)
        self.assertEqual(before.bpmn_xml, after.bpmn_xml)
        self.assertEqual(before.diagram_state_version, after.diagram_state_version)
        logs = self._logs().get("items") or []
        self.assertEqual(logs[0].get("error_code"), "ai_rate_limit_exceeded")

    def test_missing_provider_key_returns_controlled_error_without_provider_call(self):
        os.environ.pop("DEEPSEEK_API_KEY", None)
        before = self.get_storage().load(self.session_id, org_id=self.org_id, is_admin=True)
        with patch("app.routers.product_actions_ai.suggest_product_actions_with_deepseek") as provider:
            out = self.suggest_product_actions(self.session_id, self.ProductActionsSuggestIn(), self._req())
        after = self.get_storage().load(self.session_id, org_id=self.org_id, is_admin=True)
        self.assertFalse(out.get("ok"))
        self.assertEqual(out.get("error"), "AI_PROVIDER_NOT_CONFIGURED")
        provider.assert_not_called()
        self.assertEqual(before.interview, after.interview)
        self.assertEqual(before.bpmn_xml, after.bpmn_xml)
        logs = self._logs().get("items") or []
        self.assertEqual(logs[0].get("error_code"), "AI_PROVIDER_NOT_CONFIGURED")

    def test_missing_active_prompt_returns_controlled_error_without_provider_call(self):
        before = self.get_storage().load(self.session_id, org_id=self.org_id, is_admin=True)
        with patch("app.routers.product_actions_ai.seed_existing_ai_prompts", return_value={"ok": True}), patch(
            "app.routers.product_actions_ai.get_active_prompt",
            return_value=None,
        ), patch("app.routers.product_actions_ai.suggest_product_actions_with_deepseek") as provider:
            out = self.suggest_product_actions(self.session_id, self.ProductActionsSuggestIn(), self._req())
        after = self.get_storage().load(self.session_id, org_id=self.org_id, is_admin=True)
        self.assertFalse(out.get("ok"))
        self.assertEqual(out.get("error"), "AI_PROMPT_NOT_CONFIGURED")
        provider.assert_not_called()
        self.assertEqual(before.interview, after.interview)
        self.assertEqual(before.bpmn_xml, after.bpmn_xml)
        logs = self._logs().get("items") or []
        self.assertEqual(logs[0].get("error_code"), "AI_PROMPT_NOT_CONFIGURED")

    def test_prompt_lookup_exception_returns_controlled_error_without_provider_call(self):
        with patch(
            "app.routers.product_actions_ai.seed_existing_ai_prompts",
            side_effect=RuntimeError("prompt table unavailable"),
        ), patch("app.routers.product_actions_ai.suggest_product_actions_with_deepseek") as provider:
            out = self.suggest_product_actions(self.session_id, self.ProductActionsSuggestIn(), self._req())
        self.assertFalse(out.get("ok"))
        self.assertEqual(out.get("error"), "AI_PROMPT_NOT_CONFIGURED")
        provider.assert_not_called()
        logs = self._logs().get("items") or []
        self.assertEqual(logs[0].get("error_code"), "AI_PROMPT_NOT_CONFIGURED")

    def test_execution_log_failure_does_not_turn_setup_error_into_500(self):
        os.environ.pop("DEEPSEEK_API_KEY", None)
        with patch("app.routers.product_actions_ai.record_ai_execution", side_effect=RuntimeError("log table unavailable")):
            out = self.suggest_product_actions(self.session_id, self.ProductActionsSuggestIn(), self._req())
        self.assertFalse(out.get("ok"))
        self.assertEqual(out.get("error"), "AI_PROVIDER_NOT_CONFIGURED")
        warnings = out.get("warnings") or []
        self.assertTrue(any((item or {}).get("code") == "ai_execution_log_failed" for item in warnings))

    def test_provider_failure_returns_controlled_error_without_secret(self):
        with patch(
            "app.routers.product_actions_ai.suggest_product_actions_with_deepseek",
            side_effect=RuntimeError("provider denied SECRET_TEST_KEY"),
        ):
            out = self.suggest_product_actions(self.session_id, self.ProductActionsSuggestIn(), self._req())
        self.assertFalse(out.get("ok"))
        self.assertEqual(out.get("error"), "AI_PROVIDER_ERROR")
        self.assertNotIn("SECRET_TEST_KEY", str(out))
        logs = self._logs().get("items") or []
        self.assertEqual(logs[0].get("error_code"), "AI_PROVIDER_ERROR")
        self.assertNotIn("SECRET_TEST_KEY", str(logs[0]))

    def test_malformed_provider_json_returns_parse_error_without_mutation(self):
        before = self.get_storage().load(self.session_id, org_id=self.org_id, is_admin=True)
        with patch(
            "app.ai.deepseek_questions._deepseek_chat_request",
            return_value={"choices": [{"message": {"content": '{"suggestions":[{"product_name":"Сэндвич"}'}}]},
        ):
            out = self.suggest_product_actions(self.session_id, self.ProductActionsSuggestIn(), self._req())
        after = self.get_storage().load(self.session_id, org_id=self.org_id, is_admin=True)

        self.assertFalse(out.get("ok"))
        self.assertEqual(out.get("error"), "AI_RESPONSE_PARSE_ERROR")
        self.assertNotIn("Expecting", str(out.get("message") or ""))
        self.assertNotIn("Expecting", str(out.get("error") or ""))
        self.assertEqual(before.interview, after.interview)
        self.assertEqual(before.bpmn_xml, after.bpmn_xml)
        logs = self._logs().get("items") or []
        self.assertEqual(logs[0].get("error_code"), "AI_RESPONSE_PARSE_ERROR")
        self.assertIn("line", str(logs[0].get("error_message") or ""))
        self.assertNotIn("Сэндвич", str(logs[0]))

    def test_markdown_wrapped_valid_json_is_parsed(self):
        content = """```json
{"suggestions":[{"step_id":"step_2","bpmn_element_id":"Task_2","product_name":"Сэндвич","product_group":"Готовые блюда","action_type":"упаковка","action_object":"сэндвич","confidence":0.8,"evidence_text":"Упаковать сэндвич"}],"warnings":[]}
```"""
        with patch(
            "app.ai.deepseek_questions._deepseek_chat_request",
            return_value={"choices": [{"message": {"content": content}}]},
        ):
            out = self.suggest_product_actions(self.session_id, self.ProductActionsSuggestIn(), self._req())

        self.assertTrue(out.get("ok"))
        self.assertEqual(len(out.get("suggestions") or []), 1)
        self.assertEqual((out.get("suggestions") or [{}])[0].get("product_name"), "Сэндвич")

    def test_active_prompt_seed_is_used_and_fallback_kept(self):
        with patch(
            "app.routers.product_actions_ai.suggest_product_actions_with_deepseek",
            return_value={"suggestions": [], "warnings": []},
        ) as provider:
            out = self.suggest_product_actions(self.session_id, self.ProductActionsSuggestIn(), self._req())
        self.assertTrue(out.get("ok"))
        self.assertEqual(out.get("prompt_id"), "seed_ai_product_actions_suggest_v4")
        prompt_template = str(provider.call_args.kwargs.get("prompt_template") or "")
        self.assertIn("физические действия сотрудников", prompt_template)
        self.assertIn("product_name", prompt_template)
        self.assertIn("No markdown, no comments, no trailing commas", prompt_template)

    def test_bulk_suggest_returns_per_session_results_without_mutation(self):
        second_session_id = self._seed_session()
        before_first = self.get_storage().load(self.session_id, org_id=self.org_id, is_admin=True)
        before_second = self.get_storage().load(second_session_id, org_id=self.org_id, is_admin=True)
        with patch(
            "app.routers.product_actions_ai.suggest_product_actions_with_deepseek",
            return_value={
                "suggestions": [
                    {
                        "id": "ai_bulk",
                        "step_id": "step_2",
                        "bpmn_element_id": "Task_2",
                        "product_name": "Сэндвич",
                        "product_group": "Готовые блюда",
                        "action_type": "упаковка",
                        "action_object": "сэндвич",
                        "confidence": 0.8,
                    }
                ],
                "warnings": [],
            },
        ) as provider:
            out = self.suggest_product_actions_bulk(
                self.ProductActionsBulkSuggestIn(
                    session_ids=[self.session_id, second_session_id],
                    options={"max_suggestions": 3},
                ),
                self._req(),
            )
        after_first = self.get_storage().load(self.session_id, org_id=self.org_id, is_admin=True)
        after_second = self.get_storage().load(second_session_id, org_id=self.org_id, is_admin=True)

        self.assertTrue(out.get("ok"))
        self.assertEqual(out.get("requested_sessions"), 2)
        self.assertEqual(out.get("success_count"), 2)
        self.assertEqual(out.get("suggestions_count"), 2)
        self.assertEqual(len(out.get("results") or []), 2)
        self.assertEqual(provider.call_count, 2)
        for item in out.get("results") or []:
            self.assertEqual(item.get("status"), "success")
            self.assertTrue(item.get("ok"))
            self.assertEqual(len(item.get("suggestions") or []), 1)
            self.assertIn("input_hash", item)
        self.assertEqual(before_first.interview, after_first.interview)
        self.assertEqual(before_first.bpmn_xml, after_first.bpmn_xml)
        self.assertEqual(before_first.diagram_state_version, after_first.diagram_state_version)
        self.assertEqual(before_second.interview, after_second.interview)
        self.assertEqual(before_second.bpmn_xml, after_second.bpmn_xml)
        self.assertEqual(before_second.diagram_state_version, after_second.diagram_state_version)
        logs = self._logs().get("items") or []
        self.assertEqual(len(logs), 2)

    def test_bulk_suggest_respects_session_cap(self):
        with self.assertRaises(HTTPException) as ctx:
            self.suggest_product_actions_bulk(
                self.ProductActionsBulkSuggestIn(session_ids=[f"s_{idx}" for idx in range(11)]),
                self._req(),
            )
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(ctx.exception.detail.get("error"), "bulk_session_cap_exceeded")

    def test_bulk_suggest_returns_per_session_error_for_unexpected_session_failure(self):
        with patch("app.routers.product_actions_ai.suggest_product_actions", side_effect=RuntimeError("session suggest exploded")):
            out = self.suggest_product_actions_bulk(
                self.ProductActionsBulkSuggestIn(session_ids=[self.session_id]),
                self._req(),
            )
        self.assertTrue(out.get("ok"))
        self.assertEqual(out.get("success_count"), 0)
        self.assertEqual(out.get("error_count"), 1)
        result = (out.get("results") or [])[0]
        self.assertEqual(result.get("status"), "error")
        self.assertEqual(result.get("error_code"), "AI_PROVIDER_ERROR")
        self.assertIn("session suggest exploded", result.get("error_message", ""))

    def test_parse_error_response_includes_diagnostics_block(self):
        with patch(
            "app.ai.deepseek_questions._deepseek_chat_request",
            return_value={"choices": [{"message": {"content": '{"suggestions":[{"product_name":"X"}'}}]},
        ):
            out = self.suggest_product_actions(self.session_id, self.ProductActionsSuggestIn(), self._req())
        self.assertFalse(out.get("ok"))
        self.assertEqual(out.get("error"), "AI_RESPONSE_PARSE_ERROR")
        diagnostics = out.get("diagnostics")
        self.assertIsNotNone(diagnostics, "diagnostics block must be present on parse error")
        for key in ("execution_id", "parse_error", "response_excerpt", "provider", "model", "request_payload"):
            self.assertIn(key, diagnostics, f"diagnostics missing key: {key}")
        self.assertTrue(str(diagnostics.get("execution_id") or "").startswith("exec_"))
        self.assertEqual(diagnostics.get("provider"), "deepseek")
        self.assertIsInstance(diagnostics.get("request_payload"), dict)
        self.assertIn("steps_count", diagnostics.get("request_payload", {}))

    def test_parse_error_diagnostics_response_excerpt_sanitized(self):
        poisoned_content = f'{{"suggestions":[{{"product_name":"X"}}, SECRET_TEST_KEY_IN_BODY'
        with patch(
            "app.ai.deepseek_questions._deepseek_chat_request",
            return_value={"choices": [{"message": {"content": poisoned_content}}]},
        ):
            out = self.suggest_product_actions(self.session_id, self.ProductActionsSuggestIn(), self._req())
        self.assertFalse(out.get("ok"))
        diagnostics = out.get("diagnostics") or {}
        self.assertNotIn("SECRET_TEST_KEY", str(diagnostics.get("response_excerpt") or ""))
        self.assertNotIn("SECRET_TEST_KEY", str(diagnostics.get("parse_error") or ""))

    def test_success_response_has_no_diagnostics_block(self):
        with patch(
            "app.routers.product_actions_ai.suggest_product_actions_with_deepseek",
            return_value={
                "suggestions": [
                    {
                        "id": "ai_ok",
                        "step_id": "step_2",
                        "bpmn_element_id": "Task_2",
                        "product_name": "Сэндвич",
                        "product_group": "Готовые блюда",
                        "action_type": "упаковка",
                        "action_object": "сэндвич",
                        "confidence": 0.9,
                    }
                ],
                "warnings": [],
            },
        ):
            out = self.suggest_product_actions(self.session_id, self.ProductActionsSuggestIn(), self._req())
        self.assertTrue(out.get("ok"))
        self.assertNotIn("diagnostics", out)

    def test_confidence_normalizer_accepts_string_enum(self):
        from app.ai.product_actions_suggest import _confidence

        self.assertEqual(_confidence("high"), 1.0)
        self.assertEqual(_confidence("medium"), 0.6)
        self.assertEqual(_confidence("low"), 0.3)
        self.assertEqual(_confidence("unknown"), 0.0)
        self.assertAlmostEqual(_confidence(0.8), 0.8)
        self.assertEqual(_confidence("HIGH"), 1.0)
        self.assertEqual(_confidence("  Medium  "), 0.6)

    def test_max_suggestions_cap_limits_output(self):
        ten_suggestions = [
            {
                "id": f"ai_{i}",
                "step_id": f"step_{i}",
                "bpmn_element_id": f"Task_{i}",
                "product_name": f"Продукт{i}",
                "confidence": "medium",
            }
            for i in range(10)
        ]
        with patch(
            "app.routers.product_actions_ai.suggest_product_actions_with_deepseek",
            return_value={"suggestions": ten_suggestions, "warnings": []},
        ):
            out = self.suggest_product_actions(
                self.session_id,
                self.ProductActionsSuggestIn(options={"max_suggestions": 3}),
                self._req(),
            )
        self.assertTrue(out.get("ok"))
        self.assertEqual(len(out.get("suggestions") or []), 3)

    def test_normalize_includes_reason_field(self):
        from app.ai.product_actions_suggest import normalize_product_action_suggestion

        result = normalize_product_action_suggestion(
            {"reason": "кратко", "evidence_text": "тест", "product_name": "X"},
            index=0,
        )
        self.assertEqual(result.get("reason"), "кратко")
        self.assertEqual(result.get("evidence_text"), "тест")

    def test_success_result_has_empty_suggestions_list_not_none(self):
        from app.ai.product_actions_suggest import normalize_product_action_suggestions_response

        result = normalize_product_action_suggestions_response({"suggestions": [], "warnings": []})
        self.assertIn("suggestions", result)
        self.assertIsNotNone(result["suggestions"])
        self.assertEqual(result["suggestions"], [])


if __name__ == "__main__":
    unittest.main()
