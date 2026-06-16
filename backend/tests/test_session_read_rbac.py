import os
import shutil
import tempfile
import unittest
from types import SimpleNamespace

from fastapi import HTTPException

from app.auth import create_user
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


class TestSessionReadRbac(unittest.TestCase):
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

    def test_org_admin_can_read_any_session_in_org(self):
        owner = self._make_user("owner@local")
        admin = self._make_user("admin@local")
        org_id = "org_1"
        create_org_record("Org 1", created_by=str(owner["id"]), org_id=org_id)
        upsert_org_membership(org_id, str(admin["id"]), "org_admin")
        sid = self._create_session(str(owner["id"]), org_id, project_id="proj_1")
        sess = self.st.load(sid, user_id=str(admin["id"]), org_id=org_id, is_admin=False)
        self.assertIsNotNone(sess)

    def test_editor_cannot_read_session_in_unrelated_project(self):
        owner = self._make_user("owner2@local")
        editor = self._make_user("editor2@local")
        org_id = "org_2"
        create_org_record("Org 2", created_by=str(owner["id"]), org_id=org_id)
        upsert_org_membership(org_id, str(editor["id"]), "editor")
        upsert_project_membership(org_id, "proj_1", str(editor["id"]), "editor")
        sid = self._create_session(str(owner["id"]), org_id, project_id="proj_2")
        sess = self.st.load(sid, user_id=str(editor["id"]), org_id=org_id, is_admin=False)
        self.assertIsNone(sess)

    def test_non_member_cannot_read_org_session(self):
        owner = self._make_user("owner3@local")
        rando = self._make_user("rando3@local")
        org_id = "org_3"
        create_org_record("Org 3", created_by=str(owner["id"]), org_id=org_id)
        sid = self._create_session(str(owner["id"]), org_id, project_id="proj_1")
        sess = self.st.load(sid, user_id=str(rando["id"]), org_id=org_id, is_admin=False)
        self.assertIsNone(sess)

    def _create_org(self, org_id, name):
        owner = self._make_user(f"owner_{org_id}@local")
        create_org_record(name, created_by=str(owner["id"]), org_id=org_id)

    def test_list_filters_sessions_by_project_scope_for_editor(self):
        owner = self._make_user("owner4@local")
        editor = self._make_user("editor4@local")
        org_id = "org_4"
        self._create_org(org_id, "Org")
        upsert_org_membership(org_id, str(editor["id"]), "editor")
        upsert_project_membership(org_id, "proj_1", str(editor["id"]), "editor")
        sid1 = self._create_session(str(owner["id"]), org_id, project_id="proj_1", title="alpha")
        sid2 = self._create_session(str(owner["id"]), org_id, project_id="proj_2", title="beta")
        rows = self.st.list(
            org_id=org_id,
            user_id=str(editor["id"]),
            is_admin=False,
            limit=500,
        )
        ids = {str((r or {}).get("id") or "").strip() for r in rows}
        self.assertIn(sid1, ids)
        self.assertNotIn(sid2, ids)

    def test_list_project_session_summaries_filters_by_project_scope(self):
        owner = self._make_user("owner5@local")
        viewer = self._make_user("viewer5@local")
        org_id = "org_5"
        self._create_org(org_id, "Org")
        upsert_org_membership(org_id, str(viewer["id"]), "org_viewer")
        upsert_project_membership(org_id, "proj_1", str(viewer["id"]), "viewer")
        sid1 = self._create_session(str(owner["id"]), org_id, project_id="proj_1", title="alpha")
        self._create_session(str(owner["id"]), org_id, project_id="proj_2", title="beta")
        rows = self.st.list_project_session_summaries(
            project_id="proj_1",
            org_id=org_id,
            user_id=str(viewer["id"]),
            is_admin=False,
            limit=500,
        )
        ids = {str((r or {}).get("id") or "").strip() for r in rows}
        self.assertIn(sid1, ids)
        self.assertEqual(len(ids), 1)
        rows_proj2 = self.st.list_project_session_summaries(
            project_id="proj_2",
            org_id=org_id,
            user_id=str(viewer["id"]),
            is_admin=False,
            limit=500,
        )
        self.assertEqual(len(rows_proj2), 0)

    def test_global_admin_can_read_any_session(self):
        owner = self._make_user("owner_global@local")
        admin = self._make_user("admin_global@local", is_admin=True)
        org_id = "org_global"
        create_org_record("Global Org", created_by=str(owner["id"]), org_id=org_id)
        sid = self._create_session(str(owner["id"]), org_id, project_id="proj_1")
        req = _DummyRequest(admin, org_id)
        result = svc.get_session(sid, request=req)
        self.assertEqual(result.get("id"), sid)

    def test_auditor_can_read_any_session_in_org(self):
        owner = self._make_user("owner_auditor@local")
        auditor = self._make_user("auditor@local")
        org_id = "org_auditor"
        create_org_record("Auditor Org", created_by=str(owner["id"]), org_id=org_id)
        upsert_org_membership(org_id, str(auditor["id"]), "auditor")
        sid = self._create_session(str(owner["id"]), org_id, project_id="proj_1")
        sess = self.st.load(sid, user_id=str(auditor["id"]), org_id=org_id, is_admin=False)
        self.assertIsNotNone(sess)

    def test_editor_can_read_session_in_allowed_project(self):
        owner = self._make_user("owner_editor_allowed@local")
        editor = self._make_user("editor_allowed@local")
        org_id = "org_editor_allowed"
        create_org_record("Editor Allowed Org", created_by=str(owner["id"]), org_id=org_id)
        upsert_org_membership(org_id, str(editor["id"]), "editor")
        upsert_project_membership(org_id, "proj_1", str(editor["id"]), "editor")
        sid = self._create_session(str(owner["id"]), org_id, project_id="proj_1", title="allowed")
        sess = self.st.load(sid, user_id=str(editor["id"]), org_id=org_id, is_admin=False)
        self.assertIsNotNone(sess)

    def test_org_viewer_can_read_session_in_allowed_project(self):
        owner = self._make_user("owner_viewer_allowed@local")
        viewer = self._make_user("viewer_allowed@local")
        org_id = "org_viewer_allowed"
        create_org_record("Viewer Allowed Org", created_by=str(owner["id"]), org_id=org_id)
        upsert_org_membership(org_id, str(viewer["id"]), "org_viewer")
        upsert_project_membership(org_id, "proj_1", str(viewer["id"]), "viewer")
        sid = self._create_session(str(owner["id"]), org_id, project_id="proj_1", title="allowed")
        sess = self.st.load(sid, user_id=str(viewer["id"]), org_id=org_id, is_admin=False)
        self.assertIsNotNone(sess)

    def test_owner_can_read_own_session(self):
        owner = self._make_user("owner_own@local")
        org_id = "org_owner_own"
        create_org_record("Owner Own Org", created_by=str(owner["id"]), org_id=org_id)
        sid = self._create_session(str(owner["id"]), org_id, project_id="proj_1", title="own")
        sess = self.st.load(sid, user_id=str(owner["id"]), org_id=org_id, is_admin=False)
        self.assertIsNotNone(sess)

    def test_org_admin_cannot_delete_someone_elses_session(self):
        owner = self._make_user("owner_admin_delete@local")
        admin = self._make_user("admin_delete@local")
        org_id = "org_admin_delete"
        create_org_record("Admin Delete Org", created_by=str(owner["id"]), org_id=org_id)
        upsert_org_membership(org_id, str(admin["id"]), "org_admin")
        sid = self._create_session(str(owner["id"]), org_id, project_id="proj_1")
        req = _DummyRequest(admin, org_id)
        with self.assertRaises(HTTPException) as cm:
            svc.delete_session(sid, request=req)
        self.assertEqual(cm.exception.status_code, 403)

    def test_editor_cannot_delete_someone_elses_session(self):
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

    def test_owner_can_delete_own_session(self):
        owner = self._make_user("owner_self_delete@local")
        org_id = "org_owner_self_delete"
        create_org_record("Owner Self Delete Org", created_by=str(owner["id"]), org_id=org_id)
        sid = self._create_session(str(owner["id"]), org_id, project_id="proj_1")
        req = _DummyRequest(owner, org_id)
        result = svc.delete_session(sid, request=req)
        self.assertTrue(result)
        self.assertIsNone(self.st.load(sid, user_id=str(owner["id"]), org_id=org_id, is_admin=False))

    def test_list_project_sessions_does_not_leak_other_projects_for_editor(self):
        owner = self._make_user("owner_list_leak@local")
        editor = self._make_user("editor_list_leak@local")
        org_id = "org_list_leak"
        create_org_record("List Leak Org", created_by=str(owner["id"]), org_id=org_id)
        upsert_org_membership(org_id, str(editor["id"]), "editor")
        upsert_project_membership(org_id, "proj_1", str(editor["id"]), "editor")
        sid1 = self._create_session(str(owner["id"]), org_id, project_id="proj_1", title="alpha")
        sid2 = self._create_session(str(owner["id"]), org_id, project_id="proj_2", title="beta")
        req = _DummyRequest(editor, org_id)
        rows = svc.list_project_sessions("proj_1", request=req)
        ids = {str((r or {}).get("id") or "").strip() for r in rows}
        self.assertIn(sid1, ids)
        self.assertNotIn(sid2, ids)

    def test_get_session_returns_403_for_access_denied(self):
        owner = self._make_user("owner_access_denied@local")
        rando = self._make_user("rando_access_denied@local")
        org_id = "org_access_denied"
        create_org_record("Access Denied Org", created_by=str(owner["id"]), org_id=org_id)
        sid = self._create_session(str(owner["id"]), org_id, project_id="proj_1")
        req = _DummyRequest(rando, org_id)
        with self.assertRaises(HTTPException) as cm:
            svc.get_session(sid, request=req)
        self.assertEqual(cm.exception.status_code, 403)
