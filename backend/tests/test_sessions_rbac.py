import os
import shutil
import tempfile
import unittest
from types import SimpleNamespace

from fastapi import HTTPException

from app.auth import create_user
from app.schemas.legacy_api import BpmnXmlIn
from app.services import session_service as svc
from app.storage import (
    create_org_record,
    get_storage,
    upsert_org_membership,
    upsert_project_membership,
)


class _DummyRequest:
    def __init__(self, user, active_org_id):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class TestSessionsRbac(unittest.TestCase):
    def setUp(self):
        self._orig_process_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self._orig_project_storage_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self._temp_dir = tempfile.TemporaryDirectory()
        os.environ["PROCESS_STORAGE_DIR"] = os.path.join(self._temp_dir.name, "sessions")
        os.environ["PROJECT_STORAGE_DIR"] = os.path.join(self._temp_dir.name, "projects")
        os.makedirs(os.environ["PROCESS_STORAGE_DIR"], exist_ok=True)
        os.makedirs(os.environ["PROJECT_STORAGE_DIR"], exist_ok=True)
        self.st = get_storage()

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

    def _make_user(self, email, is_admin=False):
        return create_user(email, "password", is_admin=is_admin)

    def _create_session(self, owner_id, org_id, project_id=None, title="test"):
        return self.st.create(
            title=title,
            user_id=owner_id,
            org_id=org_id,
            project_id=project_id,
        )

    def test_editor_can_read_session_in_assigned_project(self):
        owner = self._make_user("owner_editor_allowed@local")
        editor = self._make_user("editor_allowed@local")
        org_id = "org_editor_allowed"
        create_org_record("Editor Allowed Org", created_by=str(owner["id"]), org_id=org_id)
        upsert_org_membership(org_id, str(editor["id"]), "editor")
        upsert_project_membership(org_id, "proj_1", str(editor["id"]), "editor")
        sid = self._create_session(str(owner["id"]), org_id, project_id="proj_1", title="allowed")
        req = _DummyRequest(editor, org_id)
        result = svc.get_session(sid, request=req)
        self.assertEqual(result.get("id"), sid)

    def test_editor_org_member_can_read_session_without_project_assignment(self):
        owner = self._make_user("owner_editor_org_only@local")
        editor = self._make_user("editor_org_only@local")
        org_id = "org_editor_org_only"
        create_org_record("Editor Org Only Org", created_by=str(owner["id"]), org_id=org_id)
        upsert_org_membership(org_id, str(editor["id"]), "editor")
        sid = self._create_session(str(owner["id"]), org_id, project_id="proj_1", title="org-wide")
        req = _DummyRequest(editor, org_id)
        result = svc.get_session(sid, request=req)
        self.assertEqual(result.get("id"), sid)

    def test_editor_cannot_read_session_in_unrelated_project(self):
        owner = self._make_user("owner_editor_unrelated@local")
        editor = self._make_user("editor_unrelated@local")
        org_id = "org_editor_unrelated"
        create_org_record("Editor Unrelated Org", created_by=str(owner["id"]), org_id=org_id)
        upsert_org_membership(org_id, str(editor["id"]), "editor")
        upsert_project_membership(org_id, "proj_1", str(editor["id"]), "editor")
        sid = self._create_session(str(owner["id"]), org_id, project_id="proj_2", title="unrelated")
        req = _DummyRequest(editor, org_id)
        with self.assertRaises(HTTPException) as cm:
            svc.get_session(sid, request=req)
        self.assertEqual(cm.exception.status_code, 403)

    def test_editor_can_save_bpmn(self):
        owner = self._make_user("owner_editor_save@local")
        editor = self._make_user("editor_save@local")
        org_id = "org_editor_save"
        create_org_record("Editor Save Org", created_by=str(owner["id"]), org_id=org_id)
        upsert_org_membership(org_id, str(editor["id"]), "editor")
        upsert_project_membership(org_id, "proj_1", str(editor["id"]), "editor")
        sid = self._create_session(str(owner["id"]), org_id, project_id="proj_1", title="save")
        # seed minimal BPMN so the save has a base diagram state version to compare against
        xml = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="def" targetNamespace="ns">'
            '<process id="p1"><startEvent id="start"/><task id="t1"/><endEvent id="end"/></process>'
            '</definitions>'
        )
        self.st.save(
            self.st.load(sid, org_id=org_id, is_admin=True),
            user_id=str(owner["id"]),
            org_id=org_id,
            is_admin=True,
        )
        req = _DummyRequest(editor, org_id)
        inp = BpmnXmlIn(
            xml=xml,
            bpmn_meta={},
            source_action="test_save",
            import_note="",
        )
        result = svc.session_bpmn_save(sid, inp, request=req)
        self.assertNotIn("error", result)

    def test_editor_cannot_delete_session(self):
        owner = self._make_user("owner_editor_delete@local")
        editor = self._make_user("editor_delete@local")
        org_id = "org_editor_delete"
        create_org_record("Editor Delete Org", created_by=str(owner["id"]), org_id=org_id)
        upsert_org_membership(org_id, str(editor["id"]), "editor")
        upsert_project_membership(org_id, "proj_1", str(editor["id"]), "editor")
        sid = self._create_session(str(owner["id"]), org_id, project_id="proj_1")
        req = _DummyRequest(editor, org_id)
        with self.assertRaises(HTTPException) as cm:
            svc.delete_session(sid, request=req)
        self.assertEqual(cm.exception.status_code, 403)
