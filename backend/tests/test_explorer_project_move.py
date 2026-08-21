import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class ExplorerProjectMoveTest(unittest.TestCase):
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
            CreateSessionBody,
            MoveProjectBody,
            create_session_in_project,
            get_explorer_page,
            move_project,
        )
        from app.storage import (
            create_org_record,
            create_project_in_folder,
            create_workspace_folder,
            create_workspace_record,
            get_default_org_id,
            get_project_storage,
            get_storage,
            list_org_workspaces,
        )

        self.create_user = create_user
        self.CreateSessionBody = CreateSessionBody
        self.MoveProjectBody = MoveProjectBody
        self.create_session_in_project = create_session_in_project
        self.get_explorer_page = get_explorer_page
        self.move_project = move_project
        self.create_org_record = create_org_record
        self.create_project_in_folder = create_project_in_folder
        self.create_workspace_folder = create_workspace_folder
        self.create_workspace_record = create_workspace_record
        self.get_default_org_id = get_default_org_id
        self.get_project_storage = get_project_storage
        self.list_org_workspaces = list_org_workspaces
        _ = get_storage()

        self.admin = create_user("explorer_project_move_admin@local", "admin", is_admin=False)
        self.viewer = create_user("explorer_project_move_viewer@local", "viewer", is_admin=False)
        self.org_id = get_default_org_id()
        self.admin_id = str(self.admin.get("id") or "")
        self.viewer_id = str(self.viewer.get("id") or "")
        self._insert_membership(self.org_id, self.admin_id, "org_admin")
        self._insert_membership(self.org_id, self.viewer_id, "viewer")
        self.workspace_id = str(self.list_org_workspaces(self.org_id)[0].get("id") or "")
        self.source_folder_id = str(self.create_workspace_folder(
            self.org_id,
            self.workspace_id,
            "Раздел A",
            user_id=self.admin_id,
        ).get("id") or "")
        self.target_folder_id = str(self.create_workspace_folder(
            self.org_id,
            self.workspace_id,
            "Раздел B",
            user_id=self.admin_id,
        ).get("id") or "")
        self.project_id = self.create_project_in_folder(
            self.org_id,
            self.workspace_id,
            self.source_folder_id,
            "Movable Project",
            user_id=self.admin_id,
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

    def _db_path(self) -> Path:
        return Path(self.tmp_sessions.name) / "processmap.sqlite3"

    def _insert_membership(self, org_id: str, user_id: str, role: str):
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute(
                """
                INSERT OR IGNORE INTO org_memberships (org_id, user_id, role, created_at)
                VALUES (?, ?, ?, strftime('%s','now'))
                """,
                [org_id, user_id, role],
            )
            con.execute(
                """
                UPDATE org_memberships
                   SET role = ?
                 WHERE org_id = ? AND user_id = ?
                """,
                [role, org_id, user_id],
            )
            con.commit()

    def _req(self, user: dict):
        return _DummyRequest(user, active_org_id=self.org_id)

    def _project_folder_id(self, project_id: str) -> str:
        project = self.get_project_storage().load(project_id, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(project)
        return str(getattr(project, "folder_id", "") or "")

    def _page_project_ids(self, folder_id: str) -> set[str]:
        page = self.get_explorer_page(self._req(self.admin), workspace_id=self.workspace_id, folder_id=folder_id)
        return {
            str((item or {}).get("id") or "")
            for item in (page.items or [])
            if str((item or {}).get("type") or "") == "project"
        }

    def test_move_project_to_another_folder_updates_listing(self):
        response = self.move_project(
            self.project_id,
            self.MoveProjectBody(folder_id=self.target_folder_id),
            self._req(self.admin),
            workspace_id=self.workspace_id,
        )

        self.assertTrue(bool(response.get("ok")))
        self.assertEqual(str((response.get("project") or {}).get("folder_id") or ""), self.target_folder_id)
        self.assertEqual(self._project_folder_id(self.project_id), self.target_folder_id)
        self.assertNotIn(self.project_id, self._page_project_ids(self.source_folder_id))
        self.assertIn(self.project_id, self._page_project_ids(self.target_folder_id))

    def test_move_project_to_missing_folder_fails_controlled(self):
        with self.assertRaises(HTTPException) as err:
            self.move_project(
                self.project_id,
                self.MoveProjectBody(folder_id="missing_folder"),
                self._req(self.admin),
                workspace_id=self.workspace_id,
            )
        self.assertEqual(int(err.exception.status_code or 0), 404)
        self.assertEqual(self._project_folder_id(self.project_id), self.source_folder_id)

    def test_move_missing_project_fails_controlled(self):
        with self.assertRaises(HTTPException) as err:
            self.move_project(
                "missing_project",
                self.MoveProjectBody(folder_id=self.target_folder_id),
                self._req(self.admin),
                workspace_id=self.workspace_id,
            )
        self.assertEqual(int(err.exception.status_code or 0), 404)

    def test_move_without_edit_permission_fails(self):
        with self.assertRaises(HTTPException) as err:
            self.move_project(
                self.project_id,
                self.MoveProjectBody(folder_id=self.target_folder_id),
                self._req(self.viewer),
                workspace_id=self.workspace_id,
            )
        self.assertEqual(int(err.exception.status_code or 0), 403)
        self.assertEqual(self._project_folder_id(self.project_id), self.source_folder_id)

    def test_move_to_same_folder_is_noop_ok(self):
        response = self.move_project(
            self.project_id,
            self.MoveProjectBody(folder_id=self.source_folder_id),
            self._req(self.admin),
            workspace_id=self.workspace_id,
        )

        self.assertTrue(bool(response.get("ok")))
        self.assertEqual(str((response.get("project") or {}).get("folder_id") or ""), self.source_folder_id)
        self.assertIn(self.project_id, self._page_project_ids(self.source_folder_id))

    def test_move_to_folder_in_another_workspace_or_org_fails(self):
        other_workspace = self.create_workspace_record(self.org_id, "Other workspace", created_by=self.admin_id)
        other_workspace_id = str(other_workspace.get("id") or "")
        other_workspace_folder_id = str(self.create_workspace_folder(
            self.org_id,
            other_workspace_id,
            "Other workspace folder",
            user_id=self.admin_id,
        ).get("id") or "")

        with self.assertRaises(HTTPException) as workspace_err:
            self.move_project(
                self.project_id,
                self.MoveProjectBody(folder_id=other_workspace_folder_id),
                self._req(self.admin),
                workspace_id=self.workspace_id,
            )
        self.assertEqual(int(workspace_err.exception.status_code or 0), 404)

        other_org = self.create_org_record("Other Org", created_by=self.admin_id)
        other_org_id = str(other_org.get("id") or "")
        other_org_workspace_id = str(self.list_org_workspaces(other_org_id)[0].get("id") or "")
        other_org_folder_id = str(self.create_workspace_folder(
            other_org_id,
            other_org_workspace_id,
            "Other org folder",
            user_id=self.admin_id,
        ).get("id") or "")

        with self.assertRaises(HTTPException) as org_err:
            self.move_project(
                self.project_id,
                self.MoveProjectBody(folder_id=other_org_folder_id),
                self._req(self.admin),
                workspace_id=self.workspace_id,
            )
        self.assertEqual(int(org_err.exception.status_code or 0), 404)
        self.assertEqual(self._project_folder_id(self.project_id), self.source_folder_id)

    def test_project_sessions_remain_attached_after_project_move(self):
        session = self.create_session_in_project(
            self.project_id,
            self.CreateSessionBody(name="Session inside project"),
            self._req(self.admin),
            workspace_id=self.workspace_id,
        )
        session_id = str(session.get("id") or "")

        self.move_project(
            self.project_id,
            self.MoveProjectBody(folder_id=self.target_folder_id),
            self._req(self.admin),
            workspace_id=self.workspace_id,
        )

        page = self.get_explorer_page(self._req(self.admin), workspace_id=self.workspace_id, folder_id=self.target_folder_id)
        moved_project = next(item for item in page.items if str((item or {}).get("id") or "") == self.project_id)
        self.assertEqual(int(moved_project.get("sessions_count") or 0), 1)

        with sqlite3.connect(str(self._db_path())) as con:
            row = con.execute("SELECT project_id FROM sessions WHERE id = ? LIMIT 1", [session_id]).fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(str(row[0] or ""), self.project_id)


if __name__ == "__main__":
    unittest.main()
