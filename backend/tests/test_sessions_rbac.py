import os
import tempfile
import unittest
from types import SimpleNamespace

from fastapi import HTTPException

from app.auth import create_user
from app.services import session_service as svc
from app.storage import (
    create_org_record,
    get_default_org_id,
    upsert_org_membership,
    upsert_project_membership,
)


class _DummyRequest:
    def __init__(self, user, active_org_id):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class SessionsRbacTests(unittest.TestCase):
    def setUp(self):
        self._orig_process_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self._orig_project_storage_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self._temp_dir = tempfile.TemporaryDirectory()
        os.environ["PROCESS_STORAGE_DIR"] = os.path.join(self._temp_dir.name, "sessions")
        os.environ["PROJECT_STORAGE_DIR"] = os.path.join(self._temp_dir.name, "projects")
        os.makedirs(os.environ["PROCESS_STORAGE_DIR"], exist_ok=True)
        os.makedirs(os.environ["PROJECT_STORAGE_DIR"], exist_ok=True)

        self.owner = create_user("rbac_owner@local", "password", is_admin=False)
        self.org_admin = create_user("rbac_org_admin@local", "password", is_admin=False)
        self.editor = create_user("rbac_editor@local", "password", is_admin=False)
        self.viewer = create_user("rbac_viewer@local", "password", is_admin=False)
        self.foreign_editor = create_user("rbac_foreign_editor@local", "password", is_admin=False)

        self.default_org_id = get_default_org_id()
        upsert_org_membership(self.default_org_id, str(self.owner.get("id") or ""), "org_owner")
        upsert_org_membership(self.default_org_id, str(self.org_admin.get("id") or ""), "org_admin")
        upsert_org_membership(self.default_org_id, str(self.editor.get("id") or ""), "editor")
        upsert_org_membership(self.default_org_id, str(self.viewer.get("id") or ""), "viewer")

        from app._legacy_main import CreateProjectIn, create_project

        self.create_project = create_project
        self.CreateProjectIn = CreateProjectIn
        project = self.create_project(
            self.CreateProjectIn(title="RBAC project"),
            self._req(self.org_admin, self.default_org_id),
        )
        self.project_id = str(project.get("id") or "")

        from app._legacy_main import CreateSessionIn, create_project_session

        self.CreateSessionIn = CreateSessionIn
        self.create_project_session = create_project_session
        session = self.create_project_session(
            self.project_id,
            self.CreateSessionIn(title="RBAC session"),
            "quick_skeleton",
            request=self._req(self.org_admin, self.default_org_id),
        )
        self.session_id = str(session.get("id") or "")
        self.assertTrue(self.session_id)

        upsert_project_membership(self.default_org_id, self.project_id, str(self.editor.get("id") or ""), "editor")
        upsert_project_membership(self.default_org_id, self.project_id, str(self.viewer.get("id") or ""), "viewer")

        foreign_org = create_org_record("Foreign Org", created_by=str(self.org_admin.get("id") or ""))
        self.foreign_org_id = str(foreign_org.get("id") or "")
        upsert_org_membership(self.foreign_org_id, str(self.foreign_editor.get("id") or ""), "editor")

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
        if isinstance(result, dict) and str(result.get("error") or "") == "not found":
            return
        self.fail(f"Expected 403/404 or not_found, got {result!r}")

    # ------------------------------------------------------------------
    # create_session
    # ------------------------------------------------------------------
    def test_create_session_viewer_is_denied(self):
        from app.routers import sessions as sessions_router
        with self.assertRaises(HTTPException) as ctx:
            sessions_router.create_session(
                self.CreateSessionIn(title="Denied"),
                request=self._req(self.viewer, self.default_org_id),
            )
        self.assertEqual(int(ctx.exception.status_code), 403)

    # ------------------------------------------------------------------
    # recompute
    # ------------------------------------------------------------------
    def test_recompute_foreign_editor_is_not_found(self):
        from app.routers import sessions as sessions_router
        self._assert_forbidden_or_not_found(
            sessions_router.recompute,
            self.session_id,
            request=self._req(self.foreign_editor, self.foreign_org_id),
        )

    # ------------------------------------------------------------------
    # ai/questions
    # ------------------------------------------------------------------
    def test_ai_questions_viewer_is_denied(self):
        from app.routers import sessions as sessions_router
        from app.schemas.legacy_api import AiQuestionsIn
        self._assert_forbidden_or_not_found(
            sessions_router.ai_questions,
            self.session_id,
            AiQuestionsIn(context="test"),
            request=self._req(self.viewer, self.default_org_id),
        )

    # ------------------------------------------------------------------
    # notes
    # ------------------------------------------------------------------
    def test_post_notes_viewer_is_denied(self):
        from app.routers import sessions as sessions_router
        from app.schemas.legacy_api import NotesIn
        self._assert_forbidden_or_not_found(
            sessions_router.post_notes,
            self.session_id,
            NotesIn(notes="test"),
            request=self._req(self.viewer, self.default_org_id),
        )

    # ------------------------------------------------------------------
    # answer / answers
    # ------------------------------------------------------------------
    def test_answer_viewer_is_denied(self):
        from app.routers import sessions as sessions_router
        from app.schemas.legacy_api import AnswerIn
        self._assert_forbidden_or_not_found(
            sessions_router.answer,
            self.session_id,
            AnswerIn(question_id="q1", answer="yes"),
            request=self._req(self.viewer, self.default_org_id),
        )

    # ------------------------------------------------------------------
    # node / edge mutations
    # ------------------------------------------------------------------
    def test_add_node_viewer_is_denied(self):
        from app.routers import sessions as sessions_router
        from app.schemas.legacy_api import CreateNodeIn
        self._assert_forbidden_or_not_found(
            sessions_router.add_node,
            self.session_id,
            CreateNodeIn(title="Node", type="step"),
            request=self._req(self.viewer, self.default_org_id),
        )

    def test_add_edge_viewer_is_denied(self):
        from app.routers import sessions as sessions_router
        from app.schemas.legacy_api import CreateEdgeIn
        self._assert_forbidden_or_not_found(
            sessions_router.add_edge,
            self.session_id,
            CreateEdgeIn(from_id="n1", to_id="n2"),
            request=self._req(self.viewer, self.default_org_id),
        )

    # ------------------------------------------------------------------
    # bpmn_meta mutations
    # ------------------------------------------------------------------
    def test_bpmn_meta_patch_viewer_is_denied(self):
        from app.routers import sessions as sessions_router
        from app.schemas.legacy_api import BpmnMetaPatchIn
        self._assert_forbidden_or_not_found(
            sessions_router.session_bpmn_meta_patch,
            self.session_id,
            BpmnMetaPatchIn(),
            request=self._req(self.viewer, self.default_org_id),
        )

    # ------------------------------------------------------------------
    # bpmn clear
    # ------------------------------------------------------------------
    def test_bpmn_clear_viewer_is_denied(self):
        from app.routers import sessions as sessions_router
        self._assert_forbidden_or_not_found(
            sessions_router.session_bpmn_clear,
            self.session_id,
            request=self._req(self.viewer, self.default_org_id),
        )

    # ------------------------------------------------------------------
    # export
    # ------------------------------------------------------------------
    def test_export_foreign_editor_is_not_found(self):
        from app.routers import sessions as sessions_router
        self._assert_forbidden_or_not_found(
            sessions_router.export,
            self.session_id,
            request=self._req(self.foreign_editor, self.foreign_org_id),
        )

    def test_export_zip_foreign_editor_is_not_found(self):
        from app.routers import sessions as sessions_router
        self._assert_forbidden_or_not_found(
            sessions_router.export_zip,
            self.session_id,
            request=self._req(self.foreign_editor, self.foreign_org_id),
        )

    # ------------------------------------------------------------------
    # sessions_new.py — session_bpmn_save receives request and rejects unauthorized
    # ------------------------------------------------------------------
    def test_sessions_new_bpmn_save_rejects_unauthorized_request(self):
        from app.routers import sessions_new as sessions_new_router
        from app.schemas.legacy_api import BpmnXmlIn
        SAMPLE_BPMN = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D1">
  <bpmn:process id="P1"><bpmn:startEvent id="S1"/></bpmn:process>
</bpmn:definitions>"""
        self._assert_forbidden_or_not_found(
            sessions_new_router.session_bpmn_save,
            self.session_id,
            BpmnXmlIn(xml=SAMPLE_BPMN),
            request=self._req(self.viewer, self.default_org_id),
        )
