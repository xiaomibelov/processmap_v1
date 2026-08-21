import os
import tempfile
import unittest
from types import SimpleNamespace


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class ProjectsApiWorkspaceIdTest(unittest.TestCase):
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
        from app._legacy_main import create_project, list_projects
        from app.models import CreateProjectIn
        from app.storage import get_default_org_id, get_project_storage

        self.create_user = create_user
        self.create_project = create_project
        self.list_projects = list_projects
        self.CreateProjectIn = CreateProjectIn
        self.get_default_org_id = get_default_org_id
        self.get_project_storage = get_project_storage

        self.admin = create_user("projects_workspace_id_admin@local", "admin", is_admin=True)
        self.org_id = get_default_org_id()

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

    def test_list_projects_includes_workspace_id(self):
        request = _DummyRequest(self.admin, active_org_id=self.org_id)
        created = self.create_project(
            self.CreateProjectIn(title="Workspace field project", passport={}),
            request=request,
        )
        pid = str(created.get("id") or "").strip()
        self.assertTrue(pid)

        projects = self.list_projects(request=request)
        self.assertIsInstance(projects, list)
        found = next((row for row in projects if str((row or {}).get("id") or "").strip() == pid), None)
        self.assertIsNotNone(found)

        storage_project = self.get_project_storage().load(pid, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(storage_project)
        expected_workspace_id = str(getattr(storage_project, "workspace_id", "") or "").strip()

        self.assertEqual(str(found.get("workspace_id") or "").strip(), expected_workspace_id)
        self.assertNotEqual(str(found.get("workspace_id") or "").strip(), "")


if __name__ == "__main__":
    unittest.main()
