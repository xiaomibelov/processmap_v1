import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str = ""):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class WorkspaceAccessControlsTest(unittest.TestCase):
    def setUp(self):
        self.tmp_sessions = tempfile.TemporaryDirectory()
        self.tmp_projects = tempfile.TemporaryDirectory()
        self.old_sessions_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_projects_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_invite_email_enabled = os.environ.get("INVITE_EMAIL_ENABLED")

        os.environ["PROCESS_STORAGE_DIR"] = self.tmp_sessions.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp_projects.name
        os.environ.pop("PROCESS_DB_PATH", None)
        os.environ["INVITE_EMAIL_ENABLED"] = "0"

        from app.auth import create_user
        from app.models import CreateProjectIn
        from app._legacy_main import (
            CreateSessionIn,
            OrgInviteCreateIn,
            OrgPatchIn,
            UpdateSessionIn,
            create_org_invite_endpoint,
            create_project,
            create_project_session,
            delete_session_api,
            patch_org_endpoint,
            patch_session,
        )
        from app.routers.explorer import (
            CreateWorkspaceBody,
            create_workspace as create_workspace_endpoint,
            get_project_explorer,
            list_workspaces as list_workspaces_endpoint,
        )
        from app.storage import (
            create_project_in_folder,
            create_workspace_folder,
            get_default_org_id,
            get_storage,
            list_org_workspaces,
        )

        self.create_user = create_user
        self.CreateProjectIn = CreateProjectIn
        self.CreateSessionIn = CreateSessionIn
        self.UpdateSessionIn = UpdateSessionIn
        self.OrgPatchIn = OrgPatchIn
        self.OrgInviteCreateIn = OrgInviteCreateIn
        self.create_project = create_project
        self.create_project_session = create_project_session
        self.delete_session_api = delete_session_api
        self.patch_session = patch_session
        self.patch_org_endpoint = patch_org_endpoint
        self.create_org_invite_endpoint = create_org_invite_endpoint
        self.CreateWorkspaceBody = CreateWorkspaceBody
        self.create_workspace_endpoint = create_workspace_endpoint
        self.get_project_explorer = get_project_explorer
        self.list_workspaces_endpoint = list_workspaces_endpoint
        self.create_project_in_folder = create_project_in_folder
        self.create_workspace_folder = create_workspace_folder
        self.get_default_org_id = get_default_org_id
        self.list_org_workspaces = list_org_workspaces
        _ = get_storage()

        self.admin = create_user("workspace_admin@local", "admin", is_admin=False)
        self.editor = create_user("workspace_editor@local", "editor", is_admin=False)
        self.viewer = create_user("workspace_viewer@local", "viewer", is_admin=False)
        self.default_org_id = get_default_org_id()

        self._insert_membership(self.default_org_id, str(self.admin.get("id") or ""), "org_admin")
        self._insert_membership(self.default_org_id, str(self.editor.get("id") or ""), "editor")
        self._insert_membership(self.default_org_id, str(self.viewer.get("id") or ""), "viewer")

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
        if self.old_invite_email_enabled is None:
            os.environ.pop("INVITE_EMAIL_ENABLED", None)
        else:
            os.environ["INVITE_EMAIL_ENABLED"] = self.old_invite_email_enabled
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

    def _mk_req(self, user: dict):
        return _DummyRequest(user, active_org_id=self.default_org_id)

    def _seed_project_and_session(self):
        project = self.create_project(self.CreateProjectIn(title="Пилотный проект"), self._mk_req(self.admin))
        session = self.create_project_session(
            str(project.get("id") or ""),
            self.CreateSessionIn(title="Сессия 1"),
            "quick_skeleton",
            request=self._mk_req(self.admin),
        )
        return project, session

    def test_editor_can_change_status_but_cannot_delete_session(self):
        _, session = self._seed_project_and_session()
        sid = str(session.get("id") or "")

        patched = self.patch_session(
            sid,
            self.UpdateSessionIn(status="in_progress"),
            self._mk_req(self.editor),
        )
        self.assertEqual(str(((patched.get("interview") or {}).get("status") or "")), "in_progress")

        with self.assertRaises(HTTPException) as delete_err:
            self.delete_session_api(sid, self._mk_req(self.editor))
        self.assertEqual(int(delete_err.exception.status_code or 0), 403)

    def test_viewer_cannot_change_status(self):
        _, session = self._seed_project_and_session()
        sid = str(session.get("id") or "")

        with self.assertRaises(HTTPException) as err:
            self.patch_session(
                sid,
                self.UpdateSessionIn(status="in_progress"),
                self._mk_req(self.viewer),
            )
        self.assertEqual(int(err.exception.status_code or 0), 403)

    def test_admin_can_archive_and_delete_session(self):
        _, session = self._seed_project_and_session()
        sid = str(session.get("id") or "")

        self.patch_session(sid, self.UpdateSessionIn(status="in_progress"), self._mk_req(self.admin))
        archived = self.patch_session(sid, self.UpdateSessionIn(status="archived"), self._mk_req(self.admin))
        self.assertEqual(str(((archived.get("interview") or {}).get("status") or "")), "archived")

        deleted = self.delete_session_api(sid, self._mk_req(self.admin))
        self.assertTrue(bool((deleted or {}).get("ok")))

    def test_workspace_rename_requires_admin(self):
        forbidden = self.patch_org_endpoint(
            self.default_org_id,
            self.OrgPatchIn(name="Новый workspace"),
            self._mk_req(self.viewer),
        )
        self.assertEqual(int(getattr(forbidden, "status_code", 0) or 0), 403)

        updated = self.patch_org_endpoint(
            self.default_org_id,
            self.OrgPatchIn(name="Новый workspace"),
            self._mk_req(self.admin),
        )
        self.assertEqual(str((updated or {}).get("name") or ""), "Новый workspace")

    def test_invite_rejects_owner_role_and_keeps_requested_editor_role(self):
        owner_attempt = self.create_org_invite_endpoint(
            self.default_org_id,
            self.OrgInviteCreateIn(email="new_owner@local", role="owner"),
            self._mk_req(self.admin),
        )
        self.assertEqual(int(getattr(owner_attempt, "status_code", 0) or 0), 422)

        editor_invite = self.create_org_invite_endpoint(
            self.default_org_id,
            self.OrgInviteCreateIn(email="new_editor@local", role="editor"),
            self._mk_req(self.admin),
        )
        invite = editor_invite.get("invite") or {}
        self.assertEqual(str(invite.get("role") or ""), "editor")

    def test_workspace_create_requires_org_admin_or_platform_admin(self):
        viewer_req = self._mk_req(self.viewer)
        with self.assertRaises(HTTPException) as viewer_err:
            self.create_workspace_endpoint(self.CreateWorkspaceBody(name="Viewer blocked"), viewer_req)
        self.assertEqual(int(viewer_err.exception.status_code or 0), 403)

        created = self.create_workspace_endpoint(self.CreateWorkspaceBody(name="Admin workspace"), self._mk_req(self.admin))
        self.assertEqual(str(created.get("name") or ""), "Admin workspace")
        self.assertTrue(str(created.get("id") or "").strip())

    def test_workspace_list_is_scoped_to_active_org(self):
        from app.storage import create_org_record

        admin_id = str(self.admin.get("id") or "")
        org_b = create_org_record("Second Org", created_by=admin_id)
        org_b_id = str(org_b.get("id") or "")
        self._insert_membership(org_b_id, admin_id, "org_admin")
        created = self.create_workspace_endpoint(self.CreateWorkspaceBody(name="Org B workspace"), _DummyRequest(self.admin, active_org_id=org_b_id))
        self.assertEqual(str(created.get("org_id") or ""), org_b_id)

        default_rows = self.list_workspaces_endpoint(self._mk_req(self.admin))
        default_org_ids = {str(item.id or "") for item in default_rows}
        self.assertIn(f"ws_{self.default_org_id}_main", default_org_ids)
        self.assertNotIn(str(created.get("id") or ""), default_org_ids)

        org_b_rows = self.list_workspaces_endpoint(_DummyRequest(self.admin, active_org_id=org_b_id))
        org_b_workspace_ids = {str(item.id or "") for item in org_b_rows}
        self.assertIn(str(created.get("id") or ""), org_b_workspace_ids)
        self.assertNotIn(f"ws_{self.default_org_id}_main", org_b_workspace_ids)

    def test_project_explorer_tolerates_legacy_non_dict_passport(self):
        admin_id = str(self.admin.get("id") or "")
        workspace_id = str(self.list_org_workspaces(self.default_org_id)[0].get("id") or "")
        folder_id = str(
            self.create_workspace_folder(
                self.default_org_id,
                workspace_id,
                "Explorer Folder",
                user_id=admin_id,
            ).get("id") or ""
        )
        project_id = self.create_project_in_folder(
            self.default_org_id,
            workspace_id,
            folder_id,
            "Explorer Project",
            user_id=admin_id,
        )
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute("UPDATE projects SET passport_json = ? WHERE id = ?", ['\"broken-passport\"', project_id])
            con.commit()

        page = self.get_project_explorer(project_id, self._mk_req(self.admin), workspace_id=workspace_id)
        self.assertEqual(str(page.project.id or ""), project_id)
        self.assertEqual(str(page.project.name or ""), "Explorer Project")
        self.assertEqual(int(page.project.dod_percent or 0), 0)


if __name__ == "__main__":
    unittest.main()
