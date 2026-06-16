import os
import unittest

from app.auth import create_user
from app.storage import (
    get_storage,
    upsert_org_membership,
    upsert_project_membership,
)


class TestSessionReadRbac(unittest.TestCase):
    def setUp(self):
        os.environ["PROCESS_STORAGE_DIR"] = "/tmp/processmap_rbac_test_sessions"
        os.environ["PROJECT_STORAGE_DIR"] = "/tmp/processmap_rbac_test_projects"
        os.makedirs(os.environ["PROCESS_STORAGE_DIR"], exist_ok=True)
        os.makedirs(os.environ["PROJECT_STORAGE_DIR"], exist_ok=True)
        self.st = get_storage()

    def tearDown(self):
        import shutil
        shutil.rmtree(os.environ["PROCESS_STORAGE_DIR"], ignore_errors=True)
        shutil.rmtree(os.environ["PROJECT_STORAGE_DIR"], ignore_errors=True)

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
        upsert_org_membership(org_id, str(admin["id"]), "org_admin")
        sid = self._create_session(str(owner["id"]), org_id, project_id="proj_1")
        sess = self.st.load(sid, user_id=str(admin["id"]), org_id=org_id, is_admin=False)
        self.assertIsNotNone(sess)

    def test_editor_cannot_read_session_in_unrelated_project(self):
        owner = self._make_user("owner@local")
        editor = self._make_user("editor@local")
        org_id = "org_1"
        upsert_org_membership(org_id, str(editor["id"]), "editor")
        upsert_project_membership(org_id, "proj_1", str(editor["id"]), "editor")
        sid = self._create_session(str(owner["id"]), org_id, project_id="proj_2")
        sess = self.st.load(sid, user_id=str(editor["id"]), org_id=org_id, is_admin=False)
        self.assertIsNone(sess)
