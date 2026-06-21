import os
import tempfile
import unittest
from types import SimpleNamespace

from fastapi import HTTPException

from app.auth import create_user
from app.storage import create_org_record, get_default_org_id, upsert_org_membership, upsert_project_membership


class _DummyRequest:
    def __init__(self, user, active_org_id):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class SessionsDriftTests(unittest.TestCase):
    def setUp(self):
        self._orig_process_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self._orig_project_storage_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self._temp_dir = tempfile.TemporaryDirectory()
        os.environ["PROCESS_STORAGE_DIR"] = os.path.join(self._temp_dir.name, "sessions")
        os.environ["PROJECT_STORAGE_DIR"] = os.path.join(self._temp_dir.name, "projects")
        os.makedirs(os.environ["PROCESS_STORAGE_DIR"], exist_ok=True)
        os.makedirs(os.environ["PROJECT_STORAGE_DIR"], exist_ok=True)

        self.org_admin = create_user("drift_org_admin@local", "password", is_admin=False)
        self.editor = create_user("drift_editor@local", "password", is_admin=False)
        self.viewer = create_user("drift_viewer@local", "password", is_admin=False)

        self.default_org_id = get_default_org_id()
        upsert_org_membership(self.default_org_id, str(self.org_admin.get("id") or ""), "org_admin")
        upsert_org_membership(self.default_org_id, str(self.editor.get("id") or ""), "editor")
        upsert_org_membership(self.default_org_id, str(self.viewer.get("id") or ""), "viewer")

        from app._legacy_main import CreateProjectIn, create_project

        project = create_project(
            CreateProjectIn(title="Drift project"),
            self._req(self.org_admin, self.default_org_id),
        )
        self.project_id = str(project.get("id") or "")

        from app._legacy_main import CreateSessionIn, create_project_session

        session = create_project_session(
            self.project_id,
            CreateSessionIn(title="Drift session"),
            "quick_skeleton",
            request=self._req(self.org_admin, self.default_org_id),
        )
        self.session_id = str(session.get("id") or "")
        self.assertTrue(self.session_id)

        upsert_project_membership(self.default_org_id, self.project_id, str(self.editor.get("id") or ""), "editor")
        upsert_project_membership(self.default_org_id, self.project_id, str(self.viewer.get("id") or ""), "viewer")

    def tearDown(self):
        self._temp_dir.cleanup()
        if self._orig_process_storage_dir is not None:
            os.environ["PROCESS_STORAGE_DIR"] = self._orig_process_storage_dir
        else:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        if self._orig_project_storage_dir is not None:
            os.environ["PROJECT_STORAGE_DIR"] = self._orig_project_storage_dir
        else:
            os.environ.pop("PROJECT_STORAGE_DIR", None)

    def _req(self, user, org_id):
        return _DummyRequest(user, active_org_id=org_id)

    def _assert_forbidden_or_not_found(self, fn, *args, **kwargs):
        try:
            result = fn(*args, **kwargs)
        except HTTPException as exc:
            self.assertIn(int(exc.status_code), (403, 404))
            return
        if isinstance(result, dict) and str(result.get("error") or "") == "not_found":
            return
        if isinstance(result, dict) and str(result.get("error") or "") == "session_not_found":
            return
        if isinstance(result, dict) and not result.get("ok"):
            return
        self.fail(f"Expected 403/404 or not_found, got {result!r}")

    # ------------------------------------------------------------------
    # DELETE /api/sessions/{id} — viewer denied in both routers
    # ------------------------------------------------------------------
    def test_delete_session_viewer_denied_in_both_routers(self):
        from app.routers import sessions as sessions_router
        from app.routers import sessions_new as sessions_new_router

        self._assert_forbidden_or_not_found(
            sessions_router.delete_session_api,
            self.session_id,
            request=self._req(self.viewer, self.default_org_id),
        )
        self._assert_forbidden_or_not_found(
            sessions_new_router.delete_session_api,
            self.session_id,
            request=self._req(self.viewer, self.default_org_id),
        )

    # ------------------------------------------------------------------
    # PUT /api/sessions/{id}/bpmn — editor allowed, viewer denied in both routers
    # ------------------------------------------------------------------
    def test_put_bpmn_editor_allowed_viewer_denied_in_both_routers(self):
        from app.routers import sessions as sessions_router
        from app.routers import sessions_new as sessions_new_router
        from app._legacy_main import BpmnXmlIn

        SAMPLE_BPMN = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D1">
  <bpmn:process id="P1"><bpmn:startEvent id="S1"/></bpmn:process>
</bpmn:definitions>"""
        inp = BpmnXmlIn(xml=SAMPLE_BPMN)

        editor_result_sessions = sessions_router.session_bpmn_save(
            self.session_id,
            inp,
            request=self._req(self.editor, self.default_org_id),
        )
        self.assertTrue(bool((editor_result_sessions or {}).get("ok")))

        editor_result_sessions_new = sessions_new_router.session_bpmn_save(
            self.session_id,
            inp,
            request=self._req(self.editor, self.default_org_id),
        )
        self.assertTrue(bool((editor_result_sessions_new or {}).get("ok")))

        self._assert_forbidden_or_not_found(
            sessions_router.session_bpmn_save,
            self.session_id,
            inp,
            request=self._req(self.viewer, self.default_org_id),
        )
        self._assert_forbidden_or_not_found(
            sessions_new_router.session_bpmn_save,
            self.session_id,
            inp,
            request=self._req(self.viewer, self.default_org_id),
        )
