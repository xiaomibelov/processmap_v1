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


class NotesMvp1ApiTest(unittest.TestCase):
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
            AddNoteCommentBody,
            CreateNoteThreadBody,
            PatchNoteThreadBody,
            add_note_thread_comment,
            create_session_note_thread,
            list_session_note_threads,
            patch_note_thread,
        )
        from app.storage import get_default_org_id, get_project_storage, get_storage

        self.create_user = create_user
        self.get_default_org_id = get_default_org_id
        self.get_project_storage = get_project_storage
        self.get_storage = get_storage
        self.CreateNoteThreadBody = CreateNoteThreadBody
        self.AddNoteCommentBody = AddNoteCommentBody
        self.PatchNoteThreadBody = PatchNoteThreadBody
        self.create_session_note_thread = create_session_note_thread
        self.list_session_note_threads = list_session_note_threads
        self.add_note_thread_comment = add_note_thread_comment
        self.patch_note_thread = patch_note_thread

        _ = get_storage()
        self.org_id = get_default_org_id()
        self.editor = create_user("notes_editor@local", "editor", is_admin=False)
        self.viewer = create_user("notes_viewer@local", "viewer", is_admin=False)
        self._insert_membership(self.org_id, str(self.editor.get("id") or ""), "editor")
        self._insert_membership(self.org_id, str(self.viewer.get("id") or ""), "viewer")

        ps = get_project_storage()
        self.project_id = ps.create(
            "Notes Project",
            {},
            user_id=str(self.editor.get("id") or ""),
            org_id=self.org_id,
            is_admin=True,
        )
        st = get_storage()
        self.session_id = st.create(
            title="Notes Session",
            roles=["operator"],
            project_id=self.project_id,
            user_id=str(self.editor.get("id") or ""),
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

    def test_create_comment_resolve_reopen_and_filter_threads(self):
        created = self.create_session_note_thread(
            self.session_id,
            self.CreateNoteThreadBody(
                scope_type="diagram_element",
                scope_ref={"element_id": "Task_1"},
                body="Проверить температуру",
            ),
            self._req(),
        )
        thread = created["thread"]
        self.assertEqual(thread["session_id"], self.session_id)
        self.assertEqual(thread["scope_type"], "diagram_element")
        self.assertEqual(thread["scope_ref"], {"element_id": "Task_1"})
        self.assertEqual(thread["status"], "open")
        self.assertEqual(len(thread["comments"]), 1)

        self.create_session_note_thread(
            self.session_id,
            self.CreateNoteThreadBody(scope_type="diagram", scope_ref={}, body="Общая заметка по диаграмме"),
            self._req(),
        )

        with_comment = self.add_note_thread_comment(
            thread["id"],
            self.AddNoteCommentBody(body="Комментарий технолога"),
            self._req(),
        )["thread"]
        self.assertEqual(len(with_comment["comments"]), 2)

        resolved = self.patch_note_thread(
            thread["id"],
            self.PatchNoteThreadBody(status="resolved"),
            self._req(),
        )["thread"]
        self.assertEqual(resolved["status"], "resolved")
        self.assertEqual(resolved["resolved_by"], str(self.editor.get("id") or ""))
        self.assertGreater(int(resolved["resolved_at"] or 0), 0)

        resolved_list = self.list_session_note_threads(self.session_id, self._req(), status="resolved")
        self.assertEqual(resolved_list["count"], 1)
        element_list = self.list_session_note_threads(
            self.session_id,
            self._req(),
            scope_type="diagram_element",
            element_id="Task_1",
        )
        self.assertEqual(element_list["count"], 1)

        reopened = self.patch_note_thread(
            thread["id"],
            self.PatchNoteThreadBody(status="open"),
            self._req(),
        )["thread"]
        self.assertEqual(reopened["status"], "open")
        self.assertEqual(reopened["resolved_by"], "")
        self.assertEqual(reopened["resolved_at"], 0)

    def test_scope_validation_rejects_invalid_scope_and_missing_element_id(self):
        for body in (
            self.CreateNoteThreadBody(scope_type="project", scope_ref={}, body="bad"),
            self.CreateNoteThreadBody(scope_type="diagram_element", scope_ref={}, body="bad"),
        ):
            with self.subTest(scope_type=body.scope_type):
                with self.assertRaises(HTTPException) as err:
                    self.create_session_note_thread(self.session_id, body, self._req())
                self.assertEqual(err.exception.status_code, 422)

    def test_auth_and_permission_denial(self):
        with self.assertRaises(HTTPException) as unauthorized:
            self.list_session_note_threads(self.session_id, self._req({}))
        self.assertEqual(unauthorized.exception.status_code, 401)

        with self.assertRaises(HTTPException) as forbidden:
            self.create_session_note_thread(
                self.session_id,
                self.CreateNoteThreadBody(scope_type="session", scope_ref={}, body="viewer write"),
                self._req(self.viewer),
            )
        self.assertEqual(forbidden.exception.status_code, 403)

        read_payload = self.list_session_note_threads(self.session_id, self._req(self.viewer))
        self.assertEqual(read_payload["count"], 0)

    def test_legacy_notes_by_element_write_path_is_not_touched(self):
        st = self.get_storage()
        sess = st.load(self.session_id, org_id=self.org_id, is_admin=True)
        sess.notes_by_element = {"Task_Legacy": {"summary": "legacy"}}
        st.save(sess, user_id=str(self.editor.get("id") or ""), org_id=self.org_id, is_admin=True)

        self.create_session_note_thread(
            self.session_id,
            self.CreateNoteThreadBody(
                scope_type="diagram_element",
                scope_ref={"element_id": "Task_New"},
                body="new notes truth",
            ),
            self._req(),
        )

        reloaded = st.load(self.session_id, org_id=self.org_id, is_admin=True)
        self.assertEqual(reloaded.notes_by_element, {"Task_Legacy": {"summary": "legacy"}})


if __name__ == "__main__":
    unittest.main()
