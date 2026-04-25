import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException


class _DummyRequest:
    def __init__(self, user: dict | None, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user or {}, active_org_id=active_org_id)
        self.headers = {}


class NotesMvp1AggregationApiTest(unittest.TestCase):
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
        from app.routers.notes import (
            CreateNoteThreadBody,
            PatchNoteThreadBody,
            create_session_note_thread,
            get_folder_note_aggregate,
            get_project_note_aggregate,
            get_session_note_aggregate,
            patch_note_thread,
        )
        from app.storage import (
            create_project_in_folder,
            create_workspace_folder,
            get_default_org_id,
            get_storage,
            list_org_workspaces,
            upsert_project_membership,
        )

        self.create_user = create_user
        self.CreateNoteThreadBody = CreateNoteThreadBody
        self.PatchNoteThreadBody = PatchNoteThreadBody
        self.create_session_note_thread = create_session_note_thread
        self.patch_note_thread = patch_note_thread
        self.get_session_note_aggregate = get_session_note_aggregate
        self.get_project_note_aggregate = get_project_note_aggregate
        self.get_folder_note_aggregate = get_folder_note_aggregate
        self.create_project_in_folder = create_project_in_folder
        self.create_workspace_folder = create_workspace_folder
        self.get_storage = get_storage
        self.upsert_project_membership = upsert_project_membership

        _ = get_storage()
        self.org_id = get_default_org_id()
        self.editor = create_user("notes_agg_editor@local", "editor", is_admin=False)
        self.viewer = create_user("notes_agg_viewer@local", "viewer", is_admin=False)
        self.outsider = create_user("notes_agg_outsider@local", "outsider", is_admin=False)
        self._insert_membership(self.org_id, str(self.editor.get("id") or ""), "editor")
        self._insert_membership(self.org_id, str(self.viewer.get("id") or ""), "viewer")
        self.workspace_id = str(list_org_workspaces(self.org_id)[0].get("id") or "")

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
                "UPDATE org_memberships SET role = ? WHERE org_id = ? AND user_id = ?",
                [role, org_id, user_id],
            )
            con.commit()

    def _req(self, user: dict | None = None):
        return _DummyRequest(user if user is not None else self.editor, active_org_id=self.org_id)

    def _create_project_session(self, folder_id: str, project_title: str, session_title: str):
        pid = self.create_project_in_folder(
            self.org_id,
            self.workspace_id,
            folder_id,
            project_title,
            user_id=str(self.editor.get("id") or ""),
        )
        sid = self.get_storage().create(
            title=session_title,
            roles=["operator"],
            project_id=pid,
            user_id=str(self.editor.get("id") or ""),
            org_id=self.org_id,
            is_admin=True,
        )
        return pid, sid

    def _create_note(self, session_id: str, scope_type: str, body: str, *, element_id: str = "") -> str:
        scope_ref = {"element_id": element_id} if scope_type == "diagram_element" else {}
        payload = self.create_session_note_thread(
            session_id,
            self.CreateNoteThreadBody(scope_type=scope_type, scope_ref=scope_ref, body=body),
            self._req(),
        )
        return str((payload.get("thread") or {}).get("id") or "")

    def test_zero_state_returns_false_and_zero(self):
        folder_id = str(
            self.create_workspace_folder(
                self.org_id,
                self.workspace_id,
                "Zero Folder",
                user_id=str(self.editor.get("id") or ""),
            ).get("id") or ""
        )
        project_id, session_id = self._create_project_session(folder_id, "Zero Project", "Zero Session")

        self.assertEqual(
            self.get_session_note_aggregate(session_id, self._req()),
            {"scope_type": "session", "session_id": session_id, "open_notes_count": 0, "has_open_notes": False},
        )
        self.assertEqual(
            self.get_project_note_aggregate(project_id, self._req()),
            {"scope_type": "project", "project_id": project_id, "open_notes_count": 0, "has_open_notes": False},
        )
        self.assertEqual(
            self.get_folder_note_aggregate(folder_id, self._req(), workspace_id=self.workspace_id),
            {
                "scope_type": "folder",
                "folder_id": folder_id,
                "workspace_id": self.workspace_id,
                "open_notes_count": 0,
                "has_open_notes": False,
            },
        )

    def test_session_project_and_recursive_folder_aggregation_counts_only_open_threads(self):
        parent_folder_id = str(
            self.create_workspace_folder(
                self.org_id,
                self.workspace_id,
                "Parent Folder",
                user_id=str(self.editor.get("id") or ""),
            ).get("id") or ""
        )
        child_folder_id = str(
            self.create_workspace_folder(
                self.org_id,
                self.workspace_id,
                "Child Folder",
                parent_id=parent_folder_id,
                user_id=str(self.editor.get("id") or ""),
            ).get("id") or ""
        )
        parent_project_id, parent_session_id = self._create_project_session(parent_folder_id, "Parent Project", "Parent Session")
        child_project_id, child_session_id = self._create_project_session(child_folder_id, "Child Project", "Child Session")

        self._create_note(parent_session_id, "diagram_element", "open element", element_id="Task_1")
        self._create_note(parent_session_id, "diagram", "open diagram")
        resolved_thread_id = self._create_note(parent_session_id, "session", "resolved session")
        self.patch_note_thread(
            resolved_thread_id,
            self.PatchNoteThreadBody(status="resolved"),
            self._req(),
        )
        self._create_note(child_session_id, "session", "child open session")

        session_aggregate = self.get_session_note_aggregate(parent_session_id, self._req(self.viewer))
        self.assertEqual(session_aggregate["open_notes_count"], 2)
        self.assertTrue(session_aggregate["has_open_notes"])

        parent_project_aggregate = self.get_project_note_aggregate(parent_project_id, self._req())
        self.assertEqual(parent_project_aggregate["open_notes_count"], 2)
        self.assertTrue(parent_project_aggregate["has_open_notes"])

        child_project_aggregate = self.get_project_note_aggregate(child_project_id, self._req())
        self.assertEqual(child_project_aggregate["open_notes_count"], 1)

        child_folder_aggregate = self.get_folder_note_aggregate(child_folder_id, self._req(), workspace_id=self.workspace_id)
        self.assertEqual(child_folder_aggregate["open_notes_count"], 1)
        self.assertTrue(child_folder_aggregate["has_open_notes"])

        parent_folder_aggregate = self.get_folder_note_aggregate(parent_folder_id, self._req(), workspace_id=self.workspace_id)
        self.assertEqual(parent_folder_aggregate["open_notes_count"], 3)
        self.assertTrue(parent_folder_aggregate["has_open_notes"])

    def test_auth_and_permission_denial_for_aggregate_reads(self):
        folder_id = str(
            self.create_workspace_folder(
                self.org_id,
                self.workspace_id,
                "Auth Folder",
                user_id=str(self.editor.get("id") or ""),
            ).get("id") or ""
        )
        project_id, session_id = self._create_project_session(folder_id, "Auth Project", "Auth Session")
        other_project_id, _other_session_id = self._create_project_session(folder_id, "Assigned Other Project", "Assigned Other Session")
        self._create_note(session_id, "session", "hidden from scoped viewer")
        self.upsert_project_membership(
            self.org_id,
            other_project_id,
            str(self.viewer.get("id") or ""),
            "viewer",
        )

        with self.assertRaises(HTTPException) as unauthenticated:
            self.get_session_note_aggregate(session_id, self._req({}))
        self.assertEqual(unauthenticated.exception.status_code, 401)

        for call in (
            lambda: self.get_session_note_aggregate(session_id, self._req(self.viewer)),
            lambda: self.get_project_note_aggregate(project_id, self._req(self.viewer)),
        ):
            with self.subTest(call=call):
                with self.assertRaises(HTTPException) as denied:
                    call()
                self.assertEqual(denied.exception.status_code, 404)

        scoped_folder_aggregate = self.get_folder_note_aggregate(folder_id, self._req(self.viewer), workspace_id=self.workspace_id)
        self.assertEqual(scoped_folder_aggregate["open_notes_count"], 0)
        self.assertFalse(scoped_folder_aggregate["has_open_notes"])

        with self.assertRaises(HTTPException) as missing_workspace:
            self.get_folder_note_aggregate(folder_id, self._req(), workspace_id="")
        self.assertEqual(missing_workspace.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
