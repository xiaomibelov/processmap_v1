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


class ExplorerGlobalSearchTest(unittest.TestCase):
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
        from app.routers.explorer import CreateSessionBody, create_session_in_project, search_explorer
        from app.storage import (
            create_org_record,
            create_project_in_folder,
            create_workspace_folder,
            create_workspace_record,
            get_default_org_id,
            get_storage,
            list_org_workspaces,
            upsert_org_membership,
        )

        self.create_user = create_user
        self.CreateSessionBody = CreateSessionBody
        self.create_session_in_project = create_session_in_project
        self.search_explorer = search_explorer
        self.create_org_record = create_org_record
        self.create_project_in_folder = create_project_in_folder
        self.create_workspace_folder = create_workspace_folder
        self.create_workspace_record = create_workspace_record
        self.list_org_workspaces = list_org_workspaces
        self.upsert_org_membership = upsert_org_membership
        _ = get_storage()

        self.org_id = get_default_org_id()
        self.admin = create_user("explorer_global_search_admin@local", "admin", is_admin=False)
        self.admin_id = str(self.admin.get("id") or "")
        self.upsert_org_membership(self.org_id, self.admin_id, "org_admin")
        self.workspace_id = str(self.list_org_workspaces(self.org_id)[0].get("id") or "")

        self.section_id = str(self.create_workspace_folder(
            self.org_id,
            self.workspace_id,
            "Глобальный раздел продаж",
            user_id=self.admin_id,
            context_status="as_is",
        ).get("id") or "")
        self.folder_id = str(self.create_workspace_folder(
            self.org_id,
            self.workspace_id,
            "Вложенная папка регламентов",
            parent_id=self.section_id,
            user_id=self.admin_id,
            context_status="to_be",
        ).get("id") or "")
        self.project_id = self.create_project_in_folder(
            self.org_id,
            self.workspace_id,
            self.folder_id,
            "Проект глобального внедрения",
            user_id=self.admin_id,
            passport={"status": "active"},
        )
        self.session = self.create_session_in_project(
            self.project_id,
            self.CreateSessionBody(name="Сессия глобального интервью"),
            self._req(self.admin),
            workspace_id=self.workspace_id,
        )

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

    def _req(self, user: dict, org_id: str | None = None):
        return _DummyRequest(user, active_org_id=org_id or self.org_id)

    def _search(self, q: str, *, limit: int = 50):
        return self.search_explorer(self._req(self.admin), workspace_id=self.workspace_id, q=q, limit=limit)

    def test_search_finds_section_nested_folder_project_and_session(self):
        section = self._search("раздел продаж")
        folder = self._search("папка регламентов")
        project = self._search("глобального внедрения")
        session = self._search("глобального интервью")

        self.assertEqual(section["groups"]["sections"][0]["id"], self.section_id)
        self.assertEqual(folder["groups"]["folders"][0]["id"], self.folder_id)
        self.assertEqual(project["groups"]["projects"][0]["id"], self.project_id)
        self.assertEqual(session["groups"]["sessions"][0]["id"], str(self.session.get("id") or ""))

    def test_search_returns_breadcrumb_path_for_folder_project_and_session(self):
        folder_item = self._search("регламентов")["groups"]["folders"][0]
        project_item = self._search("внедрения")["groups"]["projects"][0]
        session_item = self._search("интервью")["groups"]["sessions"][0]

        self.assertEqual([item["type"] for item in folder_item["path"]], ["workspace", "section", "folder"])
        self.assertEqual([item["type"] for item in project_item["path"]], ["workspace", "section", "folder", "project"])
        self.assertEqual([item["type"] for item in session_item["path"]], ["workspace", "section", "folder", "project"])
        self.assertEqual(session_item["project_id"], self.project_id)

    def test_search_respects_org_workspace_scope_and_limit(self):
        foreign_org = self.create_org_record("Foreign Global Search Org", created_by=self.admin_id)
        foreign_org_id = str(foreign_org.get("id") or "")
        self.upsert_org_membership(foreign_org_id, self.admin_id, "org_admin")
        foreign_workspace = self.create_workspace_record(foreign_org_id, "Foreign Workspace", created_by=self.admin_id)
        foreign_workspace_id = str(foreign_workspace.get("id") or "")
        foreign_folder_id = str(self.create_workspace_folder(
            foreign_org_id,
            foreign_workspace_id,
            "Секретный раздел продаж",
            user_id=self.admin_id,
        ).get("id") or "")
        self.create_project_in_folder(
            foreign_org_id,
            foreign_workspace_id,
            foreign_folder_id,
            "Секретный проект продаж",
            user_id=self.admin_id,
        )

        scoped = self._search("продаж", limit=1)
        self.assertEqual(len(scoped["items"]), 1)
        self.assertNotIn("Секретный проект продаж", str(scoped))
        self.assertEqual(scoped["workspace_id"], self.workspace_id)

    def test_short_query_returns_empty_and_payload_is_lightweight(self):
        short = self._search("п")
        self.assertEqual(short["items"], [])

        session = self._search("интервью")["groups"]["sessions"][0]
        self.assertNotIn("bpmn_xml", session)
        self.assertNotIn("nodes_json", session)
        self.assertNotIn("edges_json", session)


if __name__ == "__main__":
    unittest.main()
