import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
import sys

from fastapi import HTTPException

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class ExplorerResponsibleContextFieldsTest(unittest.TestCase):
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
        from app.models import CreateProjectIn, UpdateProjectIn
        from app._legacy_main import create_project, patch_project
        from app.routers.explorer import (
            CreateFolderBody,
            CreateProjectBody,
            RenameFolderBody,
            create_folder,
            create_project_in_folder,
            get_explorer_page,
            get_folder,
            get_project_explorer,
            rename_folder,
        )
        from app.storage import (
            create_org_record,
            get_default_org_id,
            get_storage,
            list_org_workspaces,
            upsert_org_membership,
        )

        self.CreateProjectIn = CreateProjectIn
        self.UpdateProjectIn = UpdateProjectIn
        self.create_project = create_project
        self.patch_project = patch_project
        self.CreateFolderBody = CreateFolderBody
        self.CreateProjectBody = CreateProjectBody
        self.RenameFolderBody = RenameFolderBody
        self.create_folder = create_folder
        self.create_project_in_folder = create_project_in_folder
        self.get_explorer_page = get_explorer_page
        self.get_folder = get_folder
        self.get_project_explorer = get_project_explorer
        self.rename_folder = rename_folder
        self.list_org_workspaces = list_org_workspaces
        self.upsert_org_membership = upsert_org_membership

        _ = get_storage()
        self.org_id = get_default_org_id()
        self.admin = create_user(
            "explorer_resp_admin@local",
            "admin",
            is_admin=False,
            full_name="Админ Explorer",
            job_title="Руководитель",
        )
        self.editor = create_user(
            "explorer_resp_editor@local",
            "editor",
            is_admin=False,
            full_name="Исполнитель Explorer",
            job_title="Технолог",
        )
        self.viewer = create_user("explorer_resp_viewer@local", "viewer", is_admin=False)
        self.admin_id = str(self.admin.get("id") or "")
        self.editor_id = str(self.editor.get("id") or "")
        self.viewer_id = str(self.viewer.get("id") or "")
        self.upsert_org_membership(self.org_id, self.admin_id, "org_admin")
        self.upsert_org_membership(self.org_id, self.editor_id, "editor")
        self.upsert_org_membership(self.org_id, self.viewer_id, "viewer")

        foreign_org = create_org_record("Foreign Responsible Org", created_by=self.admin_id)
        self.foreign_org_id = str(foreign_org.get("id") or "")
        self.foreign_user = create_user("explorer_resp_foreign@local", "foreign", is_admin=False)
        self.foreign_user_id = str(self.foreign_user.get("id") or "")
        self.upsert_org_membership(self.foreign_org_id, self.foreign_user_id, "editor")

        self.workspace_id = str(self.list_org_workspaces(self.org_id)[0].get("id") or "")
        self.folder = self.create_folder(
            self.workspace_id,
            self.CreateFolderBody(name="Ответственный раздел"),
            self._req(self.admin),
        )
        self.folder_id = str(self.folder.get("id") or "")

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

    def _req(self, user: dict):
        return _DummyRequest(user, active_org_id=self.org_id)

    def _columns(self, table: str) -> set[str]:
        with sqlite3.connect(str(self._db_path())) as con:
            return {str(row[1]) for row in con.execute(f"PRAGMA table_info({table})").fetchall()}

    def _patch_folder(self, **kwargs):
        return self.rename_folder(
            self.folder_id,
            self.RenameFolderBody(**kwargs),
            self._req(self.admin),
            workspace_id=self.workspace_id,
        )

    def test_schema_has_folder_responsible_context_and_project_executor_fields(self):
        folder_columns = self._columns("workspace_folders")
        project_columns = self._columns("projects")

        self.assertIn("responsible_user_id", folder_columns)
        self.assertIn("context_status", folder_columns)
        self.assertIn("responsible_assigned_at", folder_columns)
        self.assertIn("responsible_assigned_by", folder_columns)
        self.assertIn("executor_user_id", project_columns)

    def test_existing_folder_defaults_and_lists_with_new_fields(self):
        folder = self.get_folder(self.folder_id, self._req(self.admin), workspace_id=self.workspace_id)
        self.assertEqual(folder.get("context_status"), "none")
        self.assertIsNone(folder.get("responsible_user_id"))
        self.assertIsNone(folder.get("responsible_user"))

        page = self.get_explorer_page(self._req(self.admin), workspace_id=self.workspace_id, folder_id="")
        folder_item = next(item for item in page.items if item.get("id") == self.folder_id)
        self.assertEqual(folder_item.get("context_status"), "none")
        self.assertIn("responsible_user_id", folder_item)

    def test_folder_context_status_accepts_allowed_values_and_rejects_invalid(self):
        for status in ("as_is", "to_be", "none"):
            updated = self._patch_folder(context_status=status)
            self.assertEqual(updated.get("context_status"), status)

        with self.assertRaises(HTTPException) as err:
            self._patch_folder(context_status="done")
        self.assertEqual(err.exception.status_code, 400)

    def test_folder_responsible_can_be_set_enriched_and_cleared(self):
        updated = self._patch_folder(responsible_user_id=self.editor_id, context_status="as_is")

        self.assertEqual(updated.get("responsible_user_id"), self.editor_id)
        responsible = updated.get("responsible_user") or {}
        self.assertEqual(responsible.get("user_id"), self.editor_id)
        self.assertEqual(responsible.get("full_name"), "Исполнитель Explorer")
        self.assertNotIn("password_hash", responsible)
        self.assertTrue(updated.get("responsible_assigned_at"))
        self.assertEqual(updated.get("responsible_assigned_by"), self.admin_id)

        cleared = self._patch_folder(responsible_user_id="")
        self.assertIsNone(cleared.get("responsible_user_id"))
        self.assertIsNone(cleared.get("responsible_user"))
        self.assertIsNone(cleared.get("responsible_assigned_at"))

    def test_folder_responsible_rejects_missing_cross_org_and_viewer_updates(self):
        with self.assertRaises(HTTPException) as missing:
            self._patch_folder(responsible_user_id="missing_user")
        self.assertEqual(missing.exception.status_code, 422)

        with self.assertRaises(HTTPException) as cross_org:
            self._patch_folder(responsible_user_id=self.foreign_user_id)
        self.assertEqual(cross_org.exception.status_code, 422)

        with self.assertRaises(HTTPException) as forbidden:
            self.rename_folder(
                self.folder_id,
                self.RenameFolderBody(responsible_user_id=self.editor_id),
                self._req(self.viewer),
                workspace_id=self.workspace_id,
            )
        self.assertEqual(forbidden.exception.status_code, 403)

    def test_project_create_and_explorer_payload_include_executor(self):
        out = self.create_project_in_folder(
            self.folder_id,
            self.CreateProjectBody(name="Проект с исполнителем", executor_user_id=self.editor_id),
            self._req(self.admin),
            workspace_id=self.workspace_id,
        )
        project_id = str(out.get("id") or "")
        self.assertEqual(out.get("executor_user_id"), self.editor_id)
        self.assertEqual((out.get("executor") or {}).get("display_name"), "Исполнитель Explorer")

        page = self.get_explorer_page(self._req(self.admin), workspace_id=self.workspace_id, folder_id=self.folder_id)
        project_item = next(item for item in page.items if item.get("id") == project_id)
        self.assertEqual(project_item.get("executor_user_id"), self.editor_id)
        self.assertEqual((project_item.get("executor") or {}).get("job_title"), "Технолог")
        self.assertNotIn("password_hash", project_item.get("executor") or {})

        project_page = self.get_project_explorer(project_id, self._req(self.admin), workspace_id=self.workspace_id)
        self.assertEqual(project_page.project.executor_user_id, self.editor_id)
        self.assertEqual((project_page.project.executor or {}).get("email"), "explorer_resp_editor@local")

    def test_project_executor_can_be_set_cleared_and_rejects_invalid_users(self):
        project = self.create_project(
            self.CreateProjectIn(title="Legacy Executor Project", executor_user_id=self.editor_id),
            self._req(self.admin),
        )
        project_id = str(project.get("id") or "")
        self.assertEqual(str(project.get("executor_user_id") or ""), self.editor_id)

        cleared = self.patch_project(
            project_id,
            self.UpdateProjectIn(executor_user_id=""),
            self._req(self.admin),
        )
        self.assertIsNone(cleared.get("executor_user_id"))

        with self.assertRaises(HTTPException) as missing:
            self.patch_project(
                project_id,
                self.UpdateProjectIn(executor_user_id="missing_user"),
                self._req(self.admin),
            )
        self.assertEqual(missing.exception.status_code, 422)

        with self.assertRaises(HTTPException) as cross_org:
            self.patch_project(
                project_id,
                self.UpdateProjectIn(executor_user_id=self.foreign_user_id),
                self._req(self.admin),
            )
        self.assertEqual(cross_org.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
