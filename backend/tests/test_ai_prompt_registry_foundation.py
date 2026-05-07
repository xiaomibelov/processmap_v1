import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str, org_memberships: list | None = None):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.state.org_memberships = list(org_memberships or [])
        self.headers = {}


class AiPromptRegistryFoundationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_process_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_project_storage_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_database_url = os.environ.get("DATABASE_URL")
        self.old_backend = os.environ.get("FPC_DB_BACKEND")
        self.old_deepseek_key = os.environ.get("DEEPSEEK_API_KEY")
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp.name) / "ai_prompt_registry.sqlite3")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp.name
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)
        os.environ.pop("DEEPSEEK_API_KEY", None)

        from app.db.config import get_db_runtime_config
        import app.storage as storage

        get_db_runtime_config.cache_clear()
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""

        from app.auth import create_user
        from app.routers.admin import (
            AdminAiPromptDraftBody,
            admin_activate_ai_prompt,
            admin_ai_active_prompt,
            admin_ai_prompt_detail,
            admin_ai_prompts,
            admin_archive_ai_prompt,
            admin_create_ai_prompt,
            router as admin_router,
        )
        from app.storage import get_default_org_id, list_user_org_memberships, upsert_org_membership

        self.AdminAiPromptDraftBody = AdminAiPromptDraftBody
        self.admin_ai_prompts = admin_ai_prompts
        self.admin_ai_active_prompt = admin_ai_active_prompt
        self.admin_ai_prompt_detail = admin_ai_prompt_detail
        self.admin_create_ai_prompt = admin_create_ai_prompt
        self.admin_activate_ai_prompt = admin_activate_ai_prompt
        self.admin_archive_ai_prompt = admin_archive_ai_prompt
        self.admin_router = admin_router
        self.upsert_org_membership = upsert_org_membership
        self.org_id = get_default_org_id()
        self.admin = create_user("ai_prompt_admin@local", "strongpass1", is_admin=True)
        self.viewer = create_user("ai_prompt_viewer@local", "strongpass1", is_admin=False)
        viewer_id = str(self.viewer.get("id") or "")
        self.upsert_org_membership(self.org_id, viewer_id, "viewer")
        admin_memberships = list_user_org_memberships(str(self.admin.get("id") or ""), is_admin=True)
        viewer_memberships = list_user_org_memberships(viewer_id, is_admin=False)
        self.request = _DummyRequest(self.admin, active_org_id=self.org_id, org_memberships=admin_memberships)
        self.viewer_request = _DummyRequest(self.viewer, active_org_id=self.org_id, org_memberships=viewer_memberships)

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
        if self.old_deepseek_key is None:
            os.environ.pop("DEEPSEEK_API_KEY", None)
        else:
            os.environ["DEEPSEEK_API_KEY"] = self.old_deepseek_key
        self.tmp.cleanup()

    def test_storage_create_list_get_and_active_lookup(self):
        from app.ai.prompt_registry import create_prompt_draft, get_active_prompt, get_prompt_detail, list_prompt_versions

        draft = create_prompt_draft(
            module_id="ai.questions.session",
            version="v1",
            template="Ask questions for {{process}}",
            variables_schema={"type": "object", "required": ["process"]},
            output_schema={"type": "array"},
            created_by=str(self.admin.get("id") or ""),
        )
        self.assertEqual(draft.get("status"), "draft")
        self.assertEqual((draft.get("scope") or {}).get("level"), "global")
        self.assertEqual((draft.get("variables_schema") or {}).get("type"), "object")

        listed = list_prompt_versions(module_id="ai.questions.session", limit=10)
        self.assertEqual(int((listed.get("page") or {}).get("total") or 0), 1)
        detail = get_prompt_detail(str(draft.get("prompt_id") or ""))
        self.assertEqual(detail.get("template"), "Ask questions for {{process}}")
        self.assertIsNone(get_active_prompt(module_id="ai.questions.session"))

    def test_lifecycle_draft_active_archived_and_one_active_per_scope(self):
        from app.ai.prompt_registry import (
            activate_prompt_version,
            archive_prompt_version,
            create_prompt_draft,
            get_active_prompt,
            get_prompt_detail,
        )

        v1 = create_prompt_draft(module_id="ai.path_report", version="v1", template="Report v1")
        v2 = create_prompt_draft(module_id="ai.path_report", version="v2", template="Report v2")
        activated_v1 = activate_prompt_version(str(v1.get("prompt_id") or ""), actor_user_id="admin")
        self.assertEqual(activated_v1.get("status"), "active")
        self.assertEqual((get_active_prompt(module_id="ai.path_report") or {}).get("version"), "v1")

        activated_v2 = activate_prompt_version(str(v2.get("prompt_id") or ""), actor_user_id="admin")
        self.assertEqual(activated_v2.get("status"), "active")
        self.assertEqual((get_active_prompt(module_id="ai.path_report") or {}).get("version"), "v2")
        self.assertEqual((get_prompt_detail(str(v1.get("prompt_id") or "")) or {}).get("status"), "archived")

        archived_v2 = archive_prompt_version(str(v2.get("prompt_id") or ""), actor_user_id="admin")
        self.assertEqual(archived_v2.get("status"), "archived")
        self.assertIsNone(get_active_prompt(module_id="ai.path_report"))

    def test_one_active_prompt_is_per_module_and_scope(self):
        from app.ai.prompt_registry import activate_prompt_version, create_prompt_draft, get_active_prompt

        global_prompt = create_prompt_draft(module_id="ai.questions.element", version="v1", template="Global")
        project_prompt = create_prompt_draft(
            module_id="ai.questions.element",
            version="v1",
            template="Project",
            scope_level="project",
            scope_id="proj_1",
        )
        activate_prompt_version(str(global_prompt.get("prompt_id") or ""))
        activate_prompt_version(str(project_prompt.get("prompt_id") or ""))

        self.assertEqual((get_active_prompt(module_id="ai.questions.element") or {}).get("template"), "Global")
        self.assertEqual(
            (get_active_prompt(module_id="ai.questions.element", scope_level="project", scope_id="proj_1") or {}).get("template"),
            "Project",
        )

    def test_invalid_status_rejected(self):
        from app.ai.prompt_registry import list_prompt_versions

        with self.assertRaises(ValueError):
            list_prompt_versions(status="pending")

    def test_admin_endpoints_and_permission_guard(self):
        paths = {getattr(route, "path", "") for route in self.admin_router.routes}
        self.assertIn("/api/admin/ai/prompts", paths)
        self.assertIn("/api/admin/ai/prompts/{prompt_id}", paths)
        self.assertIn("/api/admin/ai/prompts/{prompt_id}/activate", paths)
        self.assertIn("/api/admin/ai/prompts/{prompt_id}/archive", paths)

        body = self.AdminAiPromptDraftBody(
            module_id="ai.product_actions.suggest",
            version="v1",
            template="Suggest product actions",
            variables_schema={"type": "object"},
            output_schema={"type": "array"},
            scope_level="workspace",
            scope_id="ws_1",
        )
        created = self.admin_create_ai_prompt(body, self.request)
        self.assertTrue(bool(created.get("ok")))
        prompt_id = str((created.get("item") or {}).get("prompt_id") or "")
        self.assertTrue(prompt_id)

        active = self.admin_activate_ai_prompt(prompt_id, self.request)
        self.assertEqual((active.get("item") or {}).get("status"), "active")
        active_lookup = self.admin_ai_active_prompt(
            self.request,
            module_id="ai.product_actions.suggest",
            scope_level="workspace",
            scope_id="ws_1",
        )
        self.assertEqual((active_lookup.get("item") or {}).get("prompt_id"), prompt_id)

        listed = self.admin_ai_prompts(
            self.request,
            module_id="ai.product_actions.suggest",
            status="active",
            scope_level="workspace",
            scope_id="ws_1",
            limit=10,
            offset=0,
        )
        self.assertEqual(int((listed.get("page") or {}).get("total") or 0), 1)
        detail = self.admin_ai_prompt_detail(prompt_id, self.request)
        self.assertEqual((detail.get("item") or {}).get("template"), "Suggest product actions")
        archived = self.admin_archive_ai_prompt(prompt_id, self.request)
        self.assertEqual((archived.get("item") or {}).get("status"), "archived")

        denied = self.admin_ai_prompts(
            self.viewer_request,
            module_id="",
            status="",
            scope_level="",
            scope_id="",
            limit=10,
            offset=0,
        )
        self.assertEqual(getattr(denied, "status_code", 0), 403)

    def test_existing_ai_behavior_unchanged_without_api_key(self):
        from app._legacy_main import SessionTitleQuestionsIn, llm_session_title_questions

        response = llm_session_title_questions(SessionTitleQuestionsIn(title="Process title"))
        self.assertEqual(response.get("error"), "deepseek api_key is not set")


if __name__ == "__main__":
    unittest.main()
