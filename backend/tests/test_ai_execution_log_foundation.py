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


class AiExecutionLogFoundationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_process_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_project_storage_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_database_url = os.environ.get("DATABASE_URL")
        self.old_backend = os.environ.get("FPC_DB_BACKEND")
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp.name) / "ai_execution_log.sqlite3")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp.name
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)

        from app.db.config import get_db_runtime_config
        import app.storage as storage

        get_db_runtime_config.cache_clear()
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""

        from app.auth import create_user
        from app.routers.admin import admin_ai_executions, router as admin_router
        from app.storage import get_default_org_id, get_project_storage, get_storage, list_user_org_memberships, upsert_org_membership

        self.admin_ai_executions = admin_ai_executions
        self.admin_router = admin_router
        self.get_storage = get_storage
        self.get_project_storage = get_project_storage
        self.upsert_org_membership = upsert_org_membership
        self.org_id = get_default_org_id()
        self.admin = create_user("ai_exec_admin@local", "strongpass1", is_admin=True)
        self.viewer = create_user("ai_exec_viewer@local", "strongpass1", is_admin=False)
        self.viewer_id = str(self.viewer.get("id") or "")
        self.upsert_org_membership(self.org_id, self.viewer_id, "viewer")
        admin_memberships = list_user_org_memberships(str(self.admin.get("id") or ""), is_admin=True)
        viewer_memberships = list_user_org_memberships(self.viewer_id, is_admin=False)
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
        self.tmp.cleanup()

    def test_route_exists_and_create_list_sanitizes_input(self):
        from app.ai.execution_log import record_ai_execution, list_ai_executions

        paths = {getattr(route, "path", "") for route in self.admin_router.routes}
        self.assertIn("/api/admin/ai/executions", paths)

        row = record_ai_execution(
            module_id="ai.questions.session",
            actor_user_id=str(self.admin.get("id") or ""),
            scope={"org_id": self.org_id, "workspace_id": "ws_1", "project_id": "proj_1", "session_id": "sess_1"},
            status="success",
            input_payload={"api_key": "SECRET_SHOULD_NOT_LEAK", "prompt": "raw prompt text"},
            output_summary="Generated 3 questions",
            usage={"input_tokens": 12, "output_tokens": 24, "api_key": "SECRET_SHOULD_NOT_LEAK"},
            latency_ms=321,
            created_at=100,
            finished_at=120,
        )
        self.assertTrue(str(row.get("execution_id") or "").startswith("ai_exec_"))
        self.assertEqual(row.get("status"), "success")
        self.assertTrue(str(row.get("input_hash") or ""))
        self.assertNotIn("api_key", row)
        self.assertNotIn("SECRET_SHOULD_NOT_LEAK", str(row))
        self.assertNotIn("raw prompt text", str(row))
        self.assertNotIn("api_key", str(row.get("usage") or {}))

        listed = list_ai_executions(org_id=self.org_id, module_id="ai.questions.session", limit=10, offset=0)
        self.assertTrue(bool(listed.get("ok")))
        self.assertEqual(int((listed.get("page") or {}).get("total") or 0), 1)
        self.assertNotIn("SECRET_SHOULD_NOT_LEAK", str(listed))

    def test_admin_endpoint_filters_and_paginates(self):
        from app.ai.execution_log import record_ai_execution

        actor = str(self.admin.get("id") or "")
        for idx in range(3):
            record_ai_execution(
                module_id="ai.path_report" if idx < 2 else "ai.questions.prep",
                actor_user_id=actor,
                scope={"org_id": self.org_id, "project_id": "proj_page"},
                status="success" if idx != 1 else "error",
                created_at=100 + idx,
            )

        first = self.admin_ai_executions(
            self.request,
            module_id="ai.path_report",
            status="",
            actor_user_id="",
            org_id="",
            workspace_id="",
            project_id="proj_page",
            session_id="",
            created_from=0,
            created_to=0,
            limit=1,
            offset=0,
        )
        self.assertTrue(bool(first.get("ok")))
        self.assertEqual(int((first.get("page") or {}).get("limit") or 0), 1)
        self.assertEqual(int((first.get("page") or {}).get("total") or 0), 2)
        self.assertEqual(len(first.get("items") or []), 1)

        only_errors = self.admin_ai_executions(
            self.request,
            module_id="ai.path_report",
            status="error",
            actor_user_id=actor,
            org_id="",
            workspace_id="",
            project_id="proj_page",
            session_id="",
            created_from=0,
            created_to=0,
            limit=10,
            offset=0,
        )
        self.assertEqual(int((only_errors.get("page") or {}).get("total") or 0), 1)
        self.assertEqual((only_errors.get("items") or [{}])[0].get("status"), "error")

    def test_rate_limit_helper_allows_and_blocks_by_config(self):
        from app.ai.execution_log import check_ai_rate_limit, record_ai_execution

        actor = str(self.admin.get("id") or "")
        scope = {"org_id": self.org_id, "session_id": "sess_rate"}
        config = {"default": {"window_sec": 60, "max_executions": 2}}
        first = check_ai_rate_limit(module_id="ai.questions.session", actor_user_id=actor, scope=scope, config=config, now_ts=1000)
        self.assertTrue(bool(first.get("allowed")))
        record_ai_execution(module_id="ai.questions.session", actor_user_id=actor, scope=scope, status="success", created_at=990)
        record_ai_execution(module_id="ai.questions.session", actor_user_id=actor, scope=scope, status="success", created_at=999)
        blocked = check_ai_rate_limit(module_id="ai.questions.session", actor_user_id=actor, scope=scope, config=config, now_ts=1000)
        self.assertFalse(bool(blocked.get("allowed")))
        self.assertEqual(blocked.get("reason"), "ai_rate_limit_exceeded")

    def test_admin_endpoint_is_permission_guarded(self):
        response = self.admin_ai_executions(
            self.viewer_request,
            module_id="",
            status="",
            actor_user_id="",
            org_id="",
            workspace_id="",
            project_id="",
            session_id="",
            created_from=0,
            created_to=0,
            limit=50,
            offset=0,
        )
        self.assertEqual(getattr(response, "status_code", 0), 403)

    def test_log_reads_do_not_mutate_session_domain_state(self):
        from app.ai.execution_log import record_ai_execution

        storage = self.get_storage()
        sid = storage.create(
            title="AI execution readonly session",
            user_id=str(self.admin.get("id") or ""),
            org_id=self.org_id,
            is_admin=True,
        )
        session = storage.load(sid, org_id=self.org_id, is_admin=True)
        session.bpmn_xml = "<definitions id='before' />"
        session.diagram_state_version = 7
        session.interview = {"analysis": {"product_actions": [{"id": "pa_1"}]}}
        storage.save(session, user_id=str(self.admin.get("id") or ""), org_id=self.org_id, is_admin=True)
        before = storage.load(sid, org_id=self.org_id, is_admin=True)

        record_ai_execution(
            module_id="ai.path_report",
            actor_user_id=str(self.admin.get("id") or ""),
            scope={"org_id": self.org_id, "session_id": sid},
            status="queued",
        )
        response = self.admin_ai_executions(
            self.request,
            module_id="ai.path_report",
            status="",
            actor_user_id="",
            org_id="",
            workspace_id="",
            project_id="",
            session_id=sid,
            created_from=0,
            created_to=0,
            limit=50,
            offset=0,
        )
        self.assertTrue(bool(response.get("ok")))
        after = storage.load(sid, org_id=self.org_id, is_admin=True)
        self.assertEqual(str(getattr(after, "bpmn_xml", "") or ""), str(getattr(before, "bpmn_xml", "") or ""))
        self.assertEqual(int(getattr(after, "diagram_state_version", 0) or 0), 7)
        self.assertEqual(getattr(after, "interview", {}) or {}, getattr(before, "interview", {}) or {})

    def test_existing_legacy_ai_routes_remain_registered(self):
        from app import _legacy_main

        paths = {getattr(route, "path", "") for route in _legacy_main.app.routes}
        self.assertIn("/api/sessions/{session_id}/ai/questions", paths)
        self.assertIn("/api/llm/session-title/questions", paths)
        self.assertIn("/api/settings/llm", paths)


if __name__ == "__main__":
    unittest.main()
