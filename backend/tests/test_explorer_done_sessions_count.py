import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
import sys

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class ExplorerDoneSessionsCountTest(unittest.TestCase):
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
        from app.routers.explorer import (
            CreateFolderBody,
            CreateProjectBody,
            create_folder,
            create_project_in_folder,
            get_explorer_page,
        )
        from app.storage import (
            get_default_org_id,
            get_storage,
            list_org_workspaces,
            upsert_org_membership,
        )

        self.CreateProjectBody = CreateProjectBody
        self.get_explorer_page = get_explorer_page

        self.storage = get_storage()
        self.org_id = get_default_org_id()
        self.admin = create_user("explorer_done_admin@local", "admin", is_admin=False)
        self.admin_id = str(self.admin.get("id") or "")
        upsert_org_membership(self.org_id, self.admin_id, "org_admin")

        self.workspace_id = str(list_org_workspaces(self.org_id)[0].get("id") or "")
        self.folder = create_folder(
            self.workspace_id,
            CreateFolderBody(name="Раздел со статусами"),
            self._req(self.admin),
        )
        self.folder_id = str(self.folder.get("id") or "")

        project = create_project_in_folder(
            self.folder_id,
            CreateProjectBody(name="Проект со сессиями"),
            self._req(self.admin),
            workspace_id=self.workspace_id,
        )
        self.project_id = str(project.get("id") or "")
        self.assertTrue(self.project_id)

        # 4 sessions: ready (manual), ready (via report_versions), archived, draft
        self._make_session("Ready manual", interview={"status": "ready"})
        self._make_session(
            "Ready derived",
            interview={"report_versions": {"Path_1": [{"report_markdown": "x", "version": 1}]}},
        )
        self._make_session("Archived", interview={"status": "archived"})
        self._make_session("Plain draft", interview={})

    def tearDown(self):
        if self.old_sessions_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_sessions_dir
        if self.old_projects_dir is None:
            os.environ.pop("PROJECT_STORAGE_DIR", None)
        else:
            os.environ["PROJECT_STORAGE_DIR"] = self.old_projects_dir
        if self.old_db_path is not None:
            os.environ["PROCESS_DB_PATH"] = self.old_db_path
        self.tmp_sessions.cleanup()
        self.tmp_projects.cleanup()

    def _req(self, user):
        return _DummyRequest(user, active_org_id=self.org_id)

    def _make_session(self, title, *, interview):
        session_id = self.storage.create(
            title,
            roles=[],
            project_id=self.project_id,
            mode="quick_skeleton",
            org_id=self.org_id,
            is_admin=True,
        )
        session = self.storage.load(session_id, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(session)
        session.interview = interview
        self.storage.save(session, org_id=self.org_id, is_admin=True)
        return session_id

    def _root_items(self):
        page = self.get_explorer_page(self._req(self.admin), workspace_id=self.workspace_id, folder_id="")
        return {str(item.get("id")): item for item in page.items}

    def test_folder_and_project_done_sessions_count(self):
        items = self._root_items()
        folder_item = items.get(self.folder_id)
        self.assertIsNotNone(folder_item)
        # total (сырой) = все 4 сессии; trackable = без архивной (3); done = 2
        self.assertEqual(folder_item.get("descendant_sessions_count"), 4)
        self.assertEqual(folder_item.get("descendant_trackable_sessions_count"), 3)
        self.assertEqual(folder_item.get("descendant_done_sessions_count"), 2)

        project_item = items.get(self.project_id)
        # project is inside the folder, so root page does not list it directly
        if project_item is None:
            page = self.get_explorer_page(self._req(self.admin), workspace_id=self.workspace_id, folder_id=self.folder_id)
            project_item = {str(i.get("id")): i for i in page.items}.get(self.project_id)
        self.assertIsNotNone(project_item)
        self.assertEqual(project_item.get("descendant_sessions_count"), 4)
        self.assertEqual(project_item.get("trackable_sessions_count"), 3)
        self.assertEqual(project_item.get("done_sessions_count"), 2)

    def test_derive_session_status_helper(self):
        from app.session_status import derive_session_status

        self.assertEqual(derive_session_status(interview_raw={"status": "ready"}), "ready")
        self.assertEqual(derive_session_status(interview_raw={"status": "archived"}), "archived")
        self.assertEqual(
            derive_session_status(interview_raw={"report_versions": {"P": [{"version": 1}]}}),
            "ready",
        )
        self.assertEqual(derive_session_status(version=1, interview_raw={}), "in_progress")
        self.assertEqual(derive_session_status(interview_raw={"stage": "audit"}), "in_progress")
        self.assertEqual(derive_session_status(interview_raw={}), "draft")
        self.assertEqual(derive_session_status(interview_raw=None), "draft")


if __name__ == "__main__":
    unittest.main()
