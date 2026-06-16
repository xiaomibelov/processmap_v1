import os
import shutil
import tempfile
import unittest

from app.auth import create_user
from app.storage import (
    create_org_record,
    get_storage,
    upsert_org_membership,
    upsert_project_membership,
)


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
        owner = self._make_user("owner@local")
        editor = self._make_user("editor@local")
        org_id = "org_1"
        create_org_record("Org 1", created_by=str(owner["id"]), org_id=org_id)
        upsert_org_membership(org_id, str(editor["id"]), "editor")
        upsert_project_membership(org_id, "proj_1", str(editor["id"]), "editor")
        sid = self._create_session(str(owner["id"]), org_id, project_id="proj_2")
        sess = self.st.load(sid, user_id=str(editor["id"]), org_id=org_id, is_admin=False)
        self.assertIsNone(sess)

    def test_non_member_cannot_read_org_session(self):
        owner = self._make_user("owner@local")
        rando = self._make_user("rando@local")
        org_id = "org_1"
        create_org_record("Org 1", created_by=str(owner["id"]), org_id=org_id)
        sid = self._create_session(str(owner["id"]), org_id, project_id="proj_1")
        sess = self.st.load(sid, user_id=str(rando["id"]), org_id=org_id, is_admin=False)
        self.assertIsNone(sess)

    def _create_org(self, org_id, name):
        owner = self._make_user(f"owner_{org_id}@local")
        create_org_record(name, created_by=str(owner["id"]), org_id=org_id)

    def test_list_filters_sessions_by_project_scope_for_editor(self):
        owner = self._make_user("owner@local")
        editor = self._make_user("editor@local")
        org_id = "org_1"
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
        owner = self._make_user("owner@local")
        viewer = self._make_user("viewer@local")
        org_id = "org_1"
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
