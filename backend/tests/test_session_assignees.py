"""Tests for session assignees feature (many-to-many responsible users)."""

from __future__ import annotations

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


class SessionAssigneesTests(unittest.TestCase):
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
            get_project_explorer,
        )
        from app.services import session_assignment_service as assign_svc
        from app.services.session_event_bus import reset_session_event_bus, get_session_event_bus
        from app.storage import (
            create_org_record,
            get_default_org_id,
            get_storage,
            list_org_memberships,
            list_org_workspaces,
            upsert_org_membership,
        )

        self.create_folder = create_folder
        self.create_project_in_folder = create_project_in_folder
        self.get_project_explorer = get_project_explorer
        self.CreateFolderBody = CreateFolderBody
        self.CreateProjectBody = CreateProjectBody
        self.assign_svc = assign_svc
        self.list_org_memberships = list_org_memberships
        self.upsert_org_membership = upsert_org_membership
        self.list_org_workspaces = list_org_workspaces
        self.get_storage = get_storage
        self.reset_event_bus = reset_session_event_bus
        self.get_event_bus = get_session_event_bus

        _ = get_storage()
        self.reset_event_bus()

        self.org_id = get_default_org_id()
        self.admin = create_user(
            "assign_admin@local",
            "admin",
            is_admin=False,
            full_name="Админ",
            job_title="Руководитель",
        )
        self.owner = create_user(
            "assign_owner@local",
            "owner",
            is_admin=False,
            full_name="Владелец проекта",
            job_title="Владелец",
        )
        self.executor = create_user(
            "assign_executor@local",
            "executor",
            is_admin=False,
            full_name="Исполнитель проекта",
            job_title="Исполнитель",
        )
        self.editor = create_user(
            "assign_editor@local",
            "editor",
            is_admin=False,
            full_name="Редактор",
            job_title="Технолог",
        )
        self.viewer = create_user("assign_viewer@local", "viewer", is_admin=False)
        self.platform_admin = create_user(
            "assign_platform_admin@local",
            "platform-admin",
            is_admin=True,
            full_name="Платформенный админ",
            job_title="Администратор платформы",
        )
        self.assignee_a = create_user(
            "assignee_a@local",
            "assignee-a",
            is_admin=False,
            full_name="Исполнитель А",
            job_title="Технолог",
        )
        self.assignee_b = create_user(
            "assignee_b@local",
            "assignee-b",
            is_admin=False,
            full_name="Исполнитель Б",
            job_title="Технолог",
        )

        self.admin_id = str(self.admin.get("id") or "")
        self.owner_id = str(self.owner.get("id") or "")
        self.executor_id = str(self.executor.get("id") or "")
        self.editor_id = str(self.editor.get("id") or "")
        self.viewer_id = str(self.viewer.get("id") or "")
        self.platform_admin_id = str(self.platform_admin.get("id") or "")
        self.assignee_a_id = str(self.assignee_a.get("id") or "")
        self.assignee_b_id = str(self.assignee_b.get("id") or "")

        self.upsert_org_membership(self.org_id, self.admin_id, "org_admin")
        self.upsert_org_membership(self.org_id, self.owner_id, "editor")
        self.upsert_org_membership(self.org_id, self.executor_id, "editor")
        self.upsert_org_membership(self.org_id, self.editor_id, "editor")
        self.upsert_org_membership(self.org_id, self.viewer_id, "viewer")
        self.upsert_org_membership(self.org_id, self.assignee_a_id, "editor")
        self.upsert_org_membership(self.org_id, self.assignee_b_id, "editor")

        self.foreign_org = create_org_record("Foreign Assignee Org", created_by=self.admin_id)
        self.foreign_org_id = str(self.foreign_org.get("id") or "")
        self.foreign_user = create_user("assign_foreign@local", "foreign", is_admin=False)
        self.foreign_user_id = str(self.foreign_user.get("id") or "")
        self.upsert_org_membership(self.foreign_org_id, self.foreign_user_id, "editor")

        self.workspace_id = str(self.list_org_workspaces(self.org_id)[0].get("id") or "")
        self.folder = self.create_folder(
            self.workspace_id,
            self.CreateFolderBody(name="Раздел"),
            self._req(self.admin),
        )
        self.folder_id = str(self.folder.get("id") or "")

        project_out = self.create_project_in_folder(
            self.folder_id,
            self.CreateProjectBody(
                name="Проект",
                executor_user_id=self.executor_id,
            ),
            self._req(self.admin),
            workspace_id=self.workspace_id,
        )
        self.project_id = str(project_out.get("id") or "")

        # Transfer project ownership to self.owner via legacy patch_project so
        # owner_user_id is set.
        from app._legacy_main import patch_project
        from app.models import UpdateProjectIn
        patched = patch_project(
            self.project_id,
            UpdateProjectIn(title="Проект"),
            self._req(self.admin),
        )
        # Set project owner directly in the DB (legacy project save guards
        # owner changes, so we bypass them for test fixture setup).
        from app.storage import _connect
        with _connect() as con:
            con.execute(
                "UPDATE projects SET owner_user_id = ? WHERE id = ?",
                [self.owner_id, self.project_id],
            )
            con.commit()

        storage = self.get_storage()
        self.session_id = storage.create(
            "Схема",
            roles=["cook"],
            project_id=self.project_id,
            mode="quick_skeleton",
            org_id=self.org_id,
            is_admin=True,
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

    def _req(self, user: dict):
        return _DummyRequest(user, active_org_id=self.org_id)

    def _db_path(self) -> Path:
        return Path(self.tmp_sessions.name) / "processmap.sqlite3"

    def _columns(self, table: str) -> set[str]:
        with sqlite3.connect(str(self._db_path())) as con:
            return {str(row[1]) for row in con.execute(f"PRAGMA table_info({table})").fetchall()}

    def test_schema_has_session_assignees_table(self):
        columns = self._columns("session_assignees")
        self.assertIn("session_id", columns)
        self.assertIn("user_id", columns)
        self.assertIn("assigned_by", columns)
        self.assertIn("assigned_at", columns)

    def test_replace_assignees_adds_multiple_and_lists_them(self):
        result = self.assign_svc.replace_assignees(
            self.session_id,
            [self.assignee_a_id, self.assignee_b_id],
            self._req(self.admin),
        )
        self.assertEqual(set(result["user_ids"]), {self.assignee_a_id, self.assignee_b_id})

        listed = self.assign_svc.list_assignees(self.session_id, self._req(self.viewer))
        self.assertEqual(len(listed), 2)
        user_ids = {row["user_id"] for row in listed}
        self.assertEqual(user_ids, {self.assignee_a_id, self.assignee_b_id})

    def test_replace_assignees_handles_existing_table_with_org_project_columns(self):
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute("DROP TABLE session_assignees")
            con.execute(
                """
                CREATE TABLE session_assignees (
                  session_id TEXT NOT NULL,
                  user_id TEXT NOT NULL,
                  assigned_by TEXT NOT NULL,
                  assigned_at INTEGER NOT NULL,
                  org_id TEXT NOT NULL,
                  project_id TEXT NOT NULL,
                  PRIMARY KEY (session_id, user_id)
                )
                """
            )
            con.commit()

        result = self.assign_svc.replace_assignees(
            self.session_id,
            [self.assignee_a_id],
            self._req(self.admin),
        )
        self.assertEqual(result["user_ids"], [self.assignee_a_id])
        with sqlite3.connect(str(self._db_path())) as con:
            row = con.execute(
                "SELECT org_id, project_id FROM session_assignees WHERE session_id = ? AND user_id = ?",
                [self.session_id, self.assignee_a_id],
            ).fetchone()
        self.assertEqual(row, (self.org_id, self.project_id))

    def test_replace_assignees_is_idempotent_replace(self):
        self.assign_svc.replace_assignees(
            self.session_id,
            [self.assignee_a_id, self.assignee_b_id],
            self._req(self.admin),
        )
        result = self.assign_svc.replace_assignees(
            self.session_id,
            [self.assignee_b_id, self.assignee_a_id, self.assignee_b_id],
            self._req(self.admin),
        )
        self.assertEqual(set(result["user_ids"]), {self.assignee_a_id, self.assignee_b_id})
        listed = self.assign_svc.list_assignees(self.session_id, self._req(self.admin))
        self.assertEqual(len(listed), 2)

    def test_replace_assignees_clears_all(self):
        self.assign_svc.replace_assignees(
            self.session_id,
            [self.assignee_a_id],
            self._req(self.admin),
        )
        result = self.assign_svc.replace_assignees(
            self.session_id,
            [],
            self._req(self.admin),
        )
        self.assertEqual(result["user_ids"], [])
        listed = self.assign_svc.list_assignees(self.session_id, self._req(self.admin))
        self.assertEqual(listed, [])

    def test_project_owner_can_assign(self):
        result = self.assign_svc.replace_assignees(
            self.session_id,
            [self.assignee_a_id],
            self._req(self.owner),
        )
        self.assertEqual(result["user_ids"], [self.assignee_a_id])

    def test_project_executor_can_assign(self):
        result = self.assign_svc.replace_assignees(
            self.session_id,
            [self.assignee_a_id],
            self._req(self.executor),
        )
        self.assertEqual(result["user_ids"], [self.assignee_a_id])

    def test_org_admin_can_assign(self):
        result = self.assign_svc.replace_assignees(
            self.session_id,
            [self.assignee_a_id],
            self._req(self.admin),
        )
        self.assertEqual(result["user_ids"], [self.assignee_a_id])

    def test_platform_admin_without_membership_can_assign(self):
        memberships = [row for row in self.list_org_memberships(self.org_id) if row.get("user_id") == self.platform_admin_id]
        self.assertEqual(memberships, [])
        result = self.assign_svc.replace_assignees(
            self.session_id,
            [self.platform_admin_id],
            self._req(self.platform_admin),
        )
        self.assertEqual(result["user_ids"], [self.platform_admin_id])

    def test_platform_admin_without_membership_can_be_assigned(self):
        result = self.assign_svc.replace_assignees(
            self.session_id,
            [self.platform_admin_id],
            self._req(self.admin),
        )
        self.assertEqual(result["user_ids"], [self.platform_admin_id])

    def test_viewer_cannot_assign(self):
        with self.assertRaises(HTTPException) as ctx:
            self.assign_svc.replace_assignees(
                self.session_id,
                [self.assignee_a_id],
                self._req(self.viewer),
            )
        self.assertEqual(ctx.exception.status_code, 403)

    def test_editor_cannot_assign(self):
        with self.assertRaises(HTTPException) as ctx:
            self.assign_svc.replace_assignees(
                self.session_id,
                [self.assignee_a_id],
                self._req(self.editor),
            )
        self.assertEqual(ctx.exception.status_code, 403)

    def test_foreign_user_cannot_be_assigned(self):
        with self.assertRaises(HTTPException) as ctx:
            self.assign_svc.replace_assignees(
                self.session_id,
                [self.foreign_user_id],
                self._req(self.admin),
            )
        self.assertEqual(ctx.exception.status_code, 422)

    def test_missing_user_cannot_be_assigned(self):
        with self.assertRaises(HTTPException) as ctx:
            self.assign_svc.replace_assignees(
                self.session_id,
                ["missing_user_id"],
                self._req(self.admin),
            )
        self.assertEqual(ctx.exception.status_code, 422)

    def test_list_assignees_requires_org_member(self):
        with self.assertRaises(HTTPException) as ctx:
            self.assign_svc.list_assignees(self.session_id, self._req(self.foreign_user))
        self.assertEqual(ctx.exception.status_code, 403)

    def test_explorer_project_page_includes_assignees(self):
        self.assign_svc.replace_assignees(
            self.session_id,
            [self.assignee_a_id, self.assignee_b_id],
            self._req(self.admin),
        )
        page = self.get_project_explorer(self.project_id, self._req(self.admin), workspace_id=self.workspace_id)
        session_item = next(item for item in page.sessions if item.id == self.session_id)
        self.assertEqual(len(session_item.assignees), 2)
        user_ids = {a["user_id"] for a in session_item.assignees}
        self.assertEqual(user_ids, {self.assignee_a_id, self.assignee_b_id})

    def test_assignees_changed_event_is_emitted(self):
        bus = self.get_event_bus()
        queue = bus.subscribe(self.session_id)
        self.assign_svc.replace_assignees(
            self.session_id,
            [self.assignee_a_id],
            self._req(self.admin),
        )
        self.assertFalse(queue.empty())
        event = queue.get_nowait()
        self.assertEqual(event["type"], "session_assignees_changed")
        self.assertEqual(event["data"]["session_id"], self.session_id)
        self.assertEqual(event["data"]["user_ids"], [self.assignee_a_id])
        self.assertEqual(event["data"]["actor_id"], self.admin_id)


if __name__ == "__main__":
    unittest.main()
