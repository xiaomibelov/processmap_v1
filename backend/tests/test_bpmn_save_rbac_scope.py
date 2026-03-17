import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
import sys

from fastapi import HTTPException

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

SAMPLE_BPMN_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>
"""


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class BpmnSaveRbacScopeTests(unittest.TestCase):
    def setUp(self):
        self.tmp_sessions = tempfile.TemporaryDirectory()
        self.tmp_projects = tempfile.TemporaryDirectory()
        self.old_sessions_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_projects_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp_sessions.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp_projects.name
        os.environ.pop("PROCESS_DB_PATH", None)

        from app.auth import create_user
        from app._legacy_main import (
            BpmnXmlIn,
            CreateProjectIn,
            CreateSessionIn,
            create_project,
            create_project_session,
            get_session,
            session_bpmn_export,
            session_bpmn_save,
        )
        from app.storage import create_org_record, get_default_org_id, upsert_org_membership, upsert_project_membership

        self.BpmnXmlIn = BpmnXmlIn
        self.CreateProjectIn = CreateProjectIn
        self.CreateSessionIn = CreateSessionIn
        self.create_project = create_project
        self.create_project_session = create_project_session
        self.get_session = get_session
        self.session_bpmn_export = session_bpmn_export
        self.session_bpmn_save = session_bpmn_save
        self.create_org_record = create_org_record
        self.upsert_org_membership = upsert_org_membership
        self.upsert_project_membership = upsert_project_membership

        self.platform_admin = create_user("rbac_platform_admin@local", "strongpass", is_admin=True)
        self.org_admin = create_user("rbac_org_admin@local", "strongpass", is_admin=False)
        self.editor = create_user("rbac_editor@local", "strongpass", is_admin=False)
        self.viewer = create_user("rbac_viewer@local", "strongpass", is_admin=False)
        self.multi_org_editor = create_user("rbac_multi_org_editor@local", "strongpass", is_admin=False)

        self.default_org_id = get_default_org_id()
        self.upsert_org_membership(self.default_org_id, str(self.org_admin.get("id") or ""), "org_admin")
        self.upsert_org_membership(self.default_org_id, str(self.editor.get("id") or ""), "editor")
        self.upsert_org_membership(self.default_org_id, str(self.viewer.get("id") or ""), "viewer")
        self.upsert_org_membership(self.default_org_id, str(self.multi_org_editor.get("id") or ""), "editor")

        project = self.create_project(self.CreateProjectIn(title="RBAC project"), self._mk_req(self.org_admin, self.default_org_id))
        self.project_id = str(project.get("id") or "")
        session = self.create_project_session(
            self.project_id,
            self.CreateSessionIn(title="RBAC session"),
            "quick_skeleton",
            request=self._mk_req(self.org_admin, self.default_org_id),
        )
        self.session_id = str(session.get("id") or "")
        self.assertTrue(self.session_id)

        self.upsert_project_membership(self.default_org_id, self.project_id, str(self.editor.get("id") or ""), "editor")
        self.upsert_project_membership(self.default_org_id, self.project_id, str(self.viewer.get("id") or ""), "viewer")
        self.upsert_project_membership(
            self.default_org_id,
            self.project_id,
            str(self.multi_org_editor.get("id") or ""),
            "editor",
        )

        foreign_org = self.create_org_record("Foreign Org", created_by=str(self.platform_admin.get("id") or ""))
        self.foreign_org_id = str(foreign_org.get("id") or "")
        foreign_project = self.create_project(
            self.CreateProjectIn(title="Foreign project"),
            self._mk_req(self.platform_admin, self.foreign_org_id),
        )
        foreign_session = self.create_project_session(
            str(foreign_project.get("id") or ""),
            self.CreateSessionIn(title="Foreign session"),
            "quick_skeleton",
            request=self._mk_req(self.platform_admin, self.foreign_org_id),
        )
        self.foreign_session_id = str(foreign_session.get("id") or "")
        self.assertTrue(self.foreign_session_id)
        self.upsert_org_membership(self.foreign_org_id, str(self.multi_org_editor.get("id") or ""), "viewer")

    def tearDown(self):
        if self.old_sessions_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_sessions_dir
        if self.old_projects_dir is None:
            os.environ.pop("PROJECT_STORAGE_DIR", None)
        else:
            os.environ["PROJECT_STORAGE_DIR"] = self.old_projects_dir
        if self.old_db_path is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = self.old_db_path
        self.tmp_sessions.cleanup()
        self.tmp_projects.cleanup()

    def _mk_req(self, user: dict, org_id: str):
        return _DummyRequest(user, active_org_id=org_id)

    def test_platform_admin_and_org_admin_can_read_and_save(self):
        opened = self.get_session(self.session_id, self._mk_req(self.org_admin, self.default_org_id))
        self.assertEqual(str(opened.get("id") or ""), self.session_id)

        org_admin_saved = self.session_bpmn_save(
            self.session_id,
            self.BpmnXmlIn(xml=SAMPLE_BPMN_XML),
            self._mk_req(self.org_admin, self.default_org_id),
        )
        self.assertTrue(bool((org_admin_saved or {}).get("ok")))

        platform_saved = self.session_bpmn_save(
            self.session_id,
            self.BpmnXmlIn(xml=SAMPLE_BPMN_XML),
            self._mk_req(self.platform_admin, self.default_org_id),
        )
        self.assertTrue(bool((platform_saved or {}).get("ok")))

    def test_editor_can_save_and_viewer_is_denied(self):
        editor_saved = self.session_bpmn_save(
            self.session_id,
            self.BpmnXmlIn(xml=SAMPLE_BPMN_XML),
            self._mk_req(self.editor, self.default_org_id),
        )
        self.assertTrue(bool((editor_saved or {}).get("ok")))

        with self.assertRaises(HTTPException) as denied:
            self.session_bpmn_save(
                self.session_id,
                self.BpmnXmlIn(xml=SAMPLE_BPMN_XML),
                self._mk_req(self.viewer, self.default_org_id),
            )
        self.assertEqual(int(getattr(denied.exception, "status_code", 0) or 0), 403)

    def test_editor_can_export_bpmn_for_project_session(self):
        response = self.session_bpmn_export(
            self.session_id,
            raw=0,
            include_overlay=1,
            request=self._mk_req(self.editor, self.default_org_id),
        )
        self.assertEqual(int(getattr(response, "status_code", 0) or 0), 200)
        media_type = str(getattr(response, "media_type", "") or "")
        self.assertIn("xml", media_type.lower())

    def test_org_admin_cannot_write_foreign_org_session(self):
        blocked = self.session_bpmn_save(
            self.foreign_session_id,
            self.BpmnXmlIn(xml=SAMPLE_BPMN_XML),
            self._mk_req(self.org_admin, self.default_org_id),
        )
        self.assertEqual(str((blocked or {}).get("error") or ""), "not found")

    def test_denied_writer_does_not_poison_lock_for_next_allowed_save(self):
        with self.assertRaises(HTTPException) as denied:
            self.session_bpmn_save(
                self.session_id,
                self.BpmnXmlIn(xml=SAMPLE_BPMN_XML),
                self._mk_req(self.viewer, self.default_org_id),
            )
        self.assertEqual(int(getattr(denied.exception, "status_code", 0) or 0), 403)

        saved = self.session_bpmn_save(
            self.session_id,
            self.BpmnXmlIn(xml=SAMPLE_BPMN_XML),
            self._mk_req(self.org_admin, self.default_org_id),
        )
        self.assertTrue(bool((saved or {}).get("ok")))

    def test_save_uses_membership_fallback_when_active_org_mismatch(self):
        # User can be member of multiple orgs; active org context may point to another org.
        # Save/read must still resolve the target session in an org where the user is allowed.
        saved = self.session_bpmn_save(
            self.session_id,
            self.BpmnXmlIn(xml=SAMPLE_BPMN_XML),
            self._mk_req(self.multi_org_editor, self.foreign_org_id),
        )
        self.assertTrue(bool((saved or {}).get("ok")))


if __name__ == "__main__":
    unittest.main()
