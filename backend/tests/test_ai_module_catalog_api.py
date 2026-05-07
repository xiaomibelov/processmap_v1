import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str, org_memberships: list | None = None):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.state.org_memberships = list(org_memberships or [])
        self.headers = {}


class AiModuleCatalogApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_deepseek_key = os.environ.get("DEEPSEEK_API_KEY")
        self.old_deepseek_base_url = os.environ.get("DEEPSEEK_BASE_URL")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ.pop("PROCESS_DB_PATH", None)
        os.environ.pop("DEEPSEEK_API_KEY", None)
        os.environ.pop("DEEPSEEK_BASE_URL", None)

        from app.auth import create_user
        from app.routers.admin import admin_ai_modules, router as admin_router
        from app.storage import get_default_org_id, get_storage, list_user_org_memberships

        self.admin_ai_modules = admin_ai_modules
        self.admin_router = admin_router
        self.get_storage = get_storage
        self.org_id = get_default_org_id()
        self.admin = create_user("ai_catalog_admin@local", "admin", is_admin=True)
        memberships = list_user_org_memberships(str(self.admin.get("id") or ""), is_admin=True)
        self.request = _DummyRequest(self.admin, active_org_id=self.org_id, org_memberships=memberships)

    def tearDown(self):
        if self.old_storage_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_storage_dir
        if self.old_db_path is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = self.old_db_path
        if self.old_deepseek_key is None:
            os.environ.pop("DEEPSEEK_API_KEY", None)
        else:
            os.environ["DEEPSEEK_API_KEY"] = self.old_deepseek_key
        if self.old_deepseek_base_url is None:
            os.environ.pop("DEEPSEEK_BASE_URL", None)
        else:
            os.environ["DEEPSEEK_BASE_URL"] = self.old_deepseek_base_url
        self.tmp.cleanup()

    def _catalog(self):
        response = self.admin_ai_modules(self.request)
        self.assertIsInstance(response, dict)
        self.assertTrue(bool(response.get("ok")))
        return response

    def test_endpoint_route_and_catalog_module_ids_match_spec(self):
        paths = {getattr(route, "path", "") for route in self.admin_router.routes}
        self.assertIn("/api/admin/ai/modules", paths)

        response = self._catalog()
        modules = response.get("modules") or []
        ids = [str(item.get("module_id") or "") for item in modules]
        self.assertEqual(
            ids,
            [
                "ai.questions.session",
                "ai.questions.element",
                "ai.questions.prep",
                "ai.process.extract_from_notes",
                "ai.path_report",
                "ai.product_actions.suggest",
                "ai.doc.summarize",
            ],
        )
        for module in modules:
            self.assertIn(str(module.get("status") or ""), {"active", "legacy", "future", "disabled"})
            if module.get("module_id") in {"ai.questions.session", "ai.questions.element"}:
                self.assertTrue(bool(module.get("has_prompt_registry")))
                self.assertTrue(bool(module.get("has_execution_log")))
                self.assertTrue(bool(module.get("has_rate_limits")))
            else:
                self.assertFalse(bool(module.get("has_prompt_registry")))
                self.assertFalse(bool(module.get("has_execution_log")))
                self.assertFalse(bool(module.get("has_rate_limits")))
            self.assertIn("current_sources", module)
            self.assertIn("risks", module)
            self.assertIn("migration_priority", module)

    def test_provider_settings_summary_does_not_expose_api_key(self):
        settings_path = Path(self.tmp.name) / "_llm_settings.json"
        settings_path.write_text(
            '{"api_key":"SECRET_SHOULD_NOT_LEAK","base_url":"https://deepseek.example"}',
            encoding="utf-8",
        )

        response = self._catalog()
        provider = response.get("provider_settings") or {}
        self.assertEqual(provider.get("provider"), "DeepSeek")
        self.assertTrue(bool(provider.get("has_api_key")))
        self.assertEqual(provider.get("base_url"), "https://deepseek.example")
        self.assertEqual(provider.get("source"), "settings_file")
        self.assertTrue(bool(provider.get("verify_supported")))
        self.assertFalse(bool(provider.get("admin_managed")))
        self.assertNotIn("api_key", provider)
        self.assertNotIn("SECRET_SHOULD_NOT_LEAK", str(response))

    def test_future_modules_are_disabled_and_review_apply_required(self):
        response = self._catalog()
        by_id = {str(item.get("module_id") or ""): item for item in response.get("modules") or []}
        for module_id in ("ai.product_actions.suggest", "ai.doc.summarize"):
            module = by_id[module_id]
            self.assertEqual(module.get("status"), "future")
            self.assertFalse(bool(module.get("enabled")))
            self.assertEqual(module.get("prompt_source"), "future_registry")
            self.assertTrue(bool(module.get("review_apply_required")))
        self.assertFalse(bool(by_id["ai.product_actions.suggest"].get("writes_domain_state")))

    def test_catalog_endpoint_is_read_only_for_session_domain_state(self):
        storage = self.get_storage()
        sid = storage.create(
            title="AI catalog readonly session",
            user_id=str(self.admin.get("id") or ""),
            org_id=self.org_id,
            is_admin=True,
        )
        session = storage.load(sid, org_id=self.org_id, is_admin=True)
        session.bpmn_xml = "<definitions id='before' />"
        session.diagram_state_version = 42
        session.interview = {"analysis": {"product_actions": [{"id": "pa_1"}]}}
        storage.save(session, user_id=str(self.admin.get("id") or ""), org_id=self.org_id, is_admin=True)

        before = storage.load(sid, org_id=self.org_id, is_admin=True)
        response = self._catalog()
        self.assertTrue(bool(response.get("ok")))
        after = storage.load(sid, org_id=self.org_id, is_admin=True)

        self.assertEqual(str(getattr(after, "bpmn_xml", "") or ""), str(getattr(before, "bpmn_xml", "") or ""))
        self.assertEqual(int(getattr(after, "diagram_state_version", 0) or 0), int(getattr(before, "diagram_state_version", 0) or 0))
        self.assertEqual(getattr(after, "interview", {}) or {}, getattr(before, "interview", {}) or {})


if __name__ == "__main__":
    unittest.main()
