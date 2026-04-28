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
            PatchNoteCommentBody,
            PatchNoteThreadBody,
            add_note_thread_comment,
            acknowledge_note_mention,
            acknowledge_note_thread_attention,
            create_session_note_thread,
            list_my_note_mentions,
            list_session_mentionable_users,
            list_session_note_threads,
            mark_note_thread_read,
            patch_note_comment,
            patch_note_thread,
        )
        from app.storage import get_default_org_id, get_project_storage, get_storage, upsert_project_membership

        self.create_user = create_user
        self.get_default_org_id = get_default_org_id
        self.get_project_storage = get_project_storage
        self.get_storage = get_storage
        self.CreateNoteThreadBody = CreateNoteThreadBody
        self.AddNoteCommentBody = AddNoteCommentBody
        self.PatchNoteCommentBody = PatchNoteCommentBody
        self.PatchNoteThreadBody = PatchNoteThreadBody
        self.acknowledge_note_mention = acknowledge_note_mention
        self.acknowledge_note_thread_attention = acknowledge_note_thread_attention
        self.create_session_note_thread = create_session_note_thread
        self.list_my_note_mentions = list_my_note_mentions
        self.list_session_mentionable_users = list_session_mentionable_users
        self.list_session_note_threads = list_session_note_threads
        self.mark_note_thread_read = mark_note_thread_read
        self.add_note_thread_comment = add_note_thread_comment
        self.patch_note_comment = patch_note_comment
        self.patch_note_thread = patch_note_thread
        self.upsert_project_membership = upsert_project_membership

        _ = get_storage()
        self.org_id = get_default_org_id()
        self.editor = create_user(
            "notes_editor@local",
            "editor",
            is_admin=False,
            full_name="Редактор Обсуждений",
            job_title="Технолог",
        )
        self.viewer = create_user(
            "notes_viewer@local",
            "viewer",
            is_admin=False,
            full_name="Наблюдатель Обсуждений",
            job_title="Аудитор",
        )
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

    def _add_project_member(self, user: dict, role: str = "viewer"):
        self.upsert_project_membership(
            self.org_id,
            self.project_id,
            str(user.get("id") or ""),
            role,
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
        self.assertEqual(thread["priority"], "normal")
        self.assertFalse(thread["requires_attention"])
        self.assertEqual(len(thread["comments"]), 1)

        high_priority = self.create_session_note_thread(
            self.session_id,
            self.CreateNoteThreadBody(
                scope_type="diagram",
                scope_ref={},
                body="Общая заметка по диаграмме",
                priority="high",
                requires_attention=True,
            ),
            self._req(),
        )["thread"]
        self.assertEqual(high_priority["priority"], "high")
        self.assertTrue(high_priority["requires_attention"])
        self.assertFalse(high_priority["attention_acknowledged_by_me"])

        acknowledged = self.acknowledge_note_thread_attention(high_priority["id"], self._req())["thread"]
        self.assertTrue(acknowledged["requires_attention"])
        self.assertTrue(acknowledged["attention_acknowledged_by_me"])
        self.assertGreater(int(acknowledged["attention_acknowledged_at"] or 0), 0)

        with_comment = self.add_note_thread_comment(
            thread["id"],
            self.AddNoteCommentBody(body="Комментарий технолога", mention_user_ids=[str(self.viewer.get("id") or "")]),
            self._req(),
        )["thread"]
        self.assertEqual(len(with_comment["comments"]), 2)
        reply_comment = next(comment for comment in with_comment["comments"] if comment["body"] == "Комментарий технолога")
        self.assertEqual(reply_comment["mentions"][0]["mentioned_user_id"], str(self.viewer.get("id") or ""))

        mentionable = self.list_session_mentionable_users(self.session_id, self._req())
        self.assertGreaterEqual(mentionable["count"], 1)
        self.assertTrue(any(item["user_id"] == str(self.viewer.get("id") or "") for item in mentionable["items"]))

        viewer_mentions = self.list_my_note_mentions(self._req(self.viewer))
        self.assertEqual(viewer_mentions["count"], 1)
        self.assertEqual(viewer_mentions["items"][0]["thread_id"], thread["id"])

        acknowledged_mention = self.acknowledge_note_mention(viewer_mentions["items"][0]["id"], self._req(self.viewer))["mention"]
        self.assertGreater(int(acknowledged_mention["acknowledged_at"] or 0), 0)
        viewer_mentions_after_ack = self.list_my_note_mentions(self._req(self.viewer))
        self.assertEqual(viewer_mentions_after_ack["count"], 0)

        resolved = self.patch_note_thread(
            thread["id"],
            self.PatchNoteThreadBody(status="resolved"),
            self._req(),
        )["thread"]
        self.assertEqual(resolved["status"], "resolved")
        self.assertEqual(resolved["resolved_by"], str(self.editor.get("id") or ""))
        self.assertGreater(int(resolved["resolved_at"] or 0), 0)

        meta_updated = self.patch_note_thread(
            thread["id"],
            self.PatchNoteThreadBody(priority="low", requires_attention=True),
            self._req(),
        )["thread"]
        self.assertEqual(meta_updated["priority"], "low")
        self.assertTrue(meta_updated["requires_attention"])

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

    def test_note_threads_include_db_backed_author_profile_identity(self):
        created = self.create_session_note_thread(
            self.session_id,
            self.CreateNoteThreadBody(
                scope_type="session",
                scope_ref={},
                body="Проверить отображение автора",
                mention_user_ids=[str(self.viewer.get("id") or "")],
            ),
            self._req(),
        )["thread"]

        self.assertEqual(created["created_by"], str(self.editor.get("id") or ""))
        self.assertEqual(created["created_by_full_name"], "Редактор Обсуждений")
        self.assertEqual(created["created_by_email"], "notes_editor@local")
        self.assertEqual(created["created_by_job_title"], "Технолог")
        self.assertEqual(created["comments"][0]["author_user_id"], str(self.editor.get("id") or ""))
        self.assertEqual(created["comments"][0]["author_full_name"], "Редактор Обсуждений")
        self.assertEqual(created["comments"][0]["author_email"], "notes_editor@local")
        self.assertEqual(created["comments"][0]["author_job_title"], "Технолог")
        self.assertEqual(created["comments"][0]["mentions"][0]["mentioned_label"], "Наблюдатель Обсуждений")

        listed = self.list_session_note_threads(self.session_id, self._req(), status="")["items"][0]
        self.assertEqual(listed["created_by_full_name"], "Редактор Обсуждений")
        self.assertEqual(listed["comments"][0]["author_full_name"], "Редактор Обсуждений")

    def test_note_comment_reply_and_edit_contract(self):
        self._add_project_member(self.viewer, "viewer")
        peer = self.create_user(
            "notes_edit_peer@local",
            "editor",
            is_admin=False,
            full_name="Редактор Коллега",
        )
        self._insert_membership(self.org_id, str(peer.get("id") or ""), "editor")
        self._add_project_member(peer, "editor")

        created = self.create_session_note_thread(
            self.session_id,
            self.CreateNoteThreadBody(scope_type="session", scope_ref={}, body="Исходное **сообщение**"),
            self._req(),
        )["thread"]
        thread_id = created["id"]
        root_comment = created["comments"][0]

        replied = self.add_note_thread_comment(
            thread_id,
            self.AddNoteCommentBody(
                body="Ответ с @Наблюдатель Обсуждений",
                mention_user_ids=[str(self.viewer.get("id") or "")],
                reply_to_comment_id=root_comment["id"],
            ),
            self._req(),
        )["thread"]
        reply_comment = next(comment for comment in replied["comments"] if comment["body"].startswith("Ответ"))
        self.assertEqual(reply_comment["reply_to_comment_id"], root_comment["id"])
        self.assertEqual(reply_comment["reply_to"]["id"], root_comment["id"])
        self.assertEqual(reply_comment["reply_to"]["author_display"], "Редактор Обсуждений")
        self.assertIn("Исходное", reply_comment["reply_to"]["body_preview"])
        self.assertEqual(reply_comment["mentions"][0]["mentioned_user_id"], str(self.viewer.get("id") or ""))

        listed = self.list_session_note_threads(self.session_id, self._req(), status="")["items"]
        listed_reply = next(
            comment
            for item in listed if item["id"] == thread_id
            for comment in item["comments"]
            if comment["id"] == reply_comment["id"]
        )
        self.assertEqual(listed_reply["reply_to"]["id"], root_comment["id"])

        other_thread = self.create_session_note_thread(
            self.session_id,
            self.CreateNoteThreadBody(scope_type="diagram", scope_ref={}, body="Другая тема"),
            self._req(),
        )["thread"]
        with self.assertRaises(HTTPException) as cross_thread:
            self.add_note_thread_comment(
                other_thread["id"],
                self.AddNoteCommentBody(body="bad", reply_to_comment_id=root_comment["id"]),
                self._req(),
            )
        self.assertEqual(cross_thread.exception.status_code, 400)

        with self.assertRaises(HTTPException) as missing_reply:
            self.add_note_thread_comment(
                thread_id,
                self.AddNoteCommentBody(body="bad", reply_to_comment_id="missing_comment"),
                self._req(),
            )
        self.assertEqual(missing_reply.exception.status_code, 404)

        read_result = self.mark_note_thread_read(thread_id, self._req(self.viewer))
        self.assertEqual(read_result["unread_count"], 0)

        edited = self.patch_note_comment(
            reply_comment["id"],
            self.PatchNoteCommentBody(
                body="Обновлённый **Markdown** для @Наблюдатель Обсуждений",
                mention_user_ids=[str(self.viewer.get("id") or "")],
            ),
            self._req(),
        )
        edited_comment = edited["comment"]
        self.assertEqual(edited_comment["body"], "Обновлённый **Markdown** для @Наблюдатель Обсуждений")
        self.assertGreater(int(edited_comment["edited_at"] or 0), 0)
        self.assertEqual(edited_comment["edited_by_user_id"], str(self.editor.get("id") or ""))
        self.assertEqual(edited_comment["mentions"][0]["mentioned_user_id"], str(self.viewer.get("id") or ""))

        edited_without_mention = self.patch_note_comment(
            reply_comment["id"],
            self.PatchNoteCommentBody(body="Обновлённый **Markdown** без адресата", mention_user_ids=[]),
            self._req(),
        )["comment"]
        self.assertEqual(edited_without_mention["mentions"], [])

        viewer_after_edit = self.list_session_note_threads(self.session_id, self._req(self.viewer), status="")["items"]
        viewer_thread = next(item for item in viewer_after_edit if item["id"] == thread_id)
        self.assertEqual(viewer_thread["unread_count"], 0)

        with self.assertRaises(HTTPException) as forbidden_edit:
            self.patch_note_comment(
                reply_comment["id"],
                self.PatchNoteCommentBody(body="Попытка чужого редактирования"),
                self._req(peer),
            )
        self.assertEqual(forbidden_edit.exception.status_code, 403)

        with self.assertRaises(HTTPException) as missing_edit:
            self.patch_note_comment(
                "missing_comment",
                self.PatchNoteCommentBody(body="Нет сообщения"),
                self._req(),
            )
        self.assertEqual(missing_edit.exception.status_code, 404)

    def test_scope_validation_rejects_invalid_scope_and_missing_element_id(self):
        for body in (
            self.CreateNoteThreadBody(scope_type="project", scope_ref={}, body="bad"),
            self.CreateNoteThreadBody(scope_type="diagram_element", scope_ref={}, body="bad"),
        ):
            with self.subTest(scope_type=body.scope_type):
                with self.assertRaises(HTTPException) as err:
                    self.create_session_note_thread(self.session_id, body, self._req())
                self.assertEqual(err.exception.status_code, 422)

    def test_attention_threads_remain_queryable_for_bounded_notification_history(self):
        active = self.create_session_note_thread(
            self.session_id,
            self.CreateNoteThreadBody(
                scope_type="diagram_element",
                scope_ref={"element_id": "Task_Active"},
                body="Активное внимание",
                requires_attention=True,
            ),
            self._req(),
        )["thread"]
        acknowledged = self.create_session_note_thread(
            self.session_id,
            self.CreateNoteThreadBody(
                scope_type="diagram",
                scope_ref={},
                body="Подтверждённое внимание",
                requires_attention=True,
            ),
            self._req(),
        )["thread"]
        resolved = self.create_session_note_thread(
            self.session_id,
            self.CreateNoteThreadBody(
                scope_type="session",
                scope_ref={},
                body="Закрытое внимание",
                requires_attention=True,
            ),
            self._req(),
        )["thread"]

        acknowledged = self.acknowledge_note_thread_attention(acknowledged["id"], self._req())["thread"]
        resolved = self.patch_note_thread(
            resolved["id"],
            self.PatchNoteThreadBody(status="resolved"),
            self._req(),
        )["thread"]

        all_items = self.list_session_note_threads(self.session_id, self._req(), status="")["items"]
        by_id = {item["id"]: item for item in all_items}
        self.assertIn(active["id"], by_id)
        self.assertIn(acknowledged["id"], by_id)
        self.assertIn(resolved["id"], by_id)

        active_items = [
            item for item in all_items
            if item["status"] == "open" and item["requires_attention"] and not item["attention_acknowledged_by_me"]
        ]
        history_items = [
            item for item in all_items
            if item["requires_attention"] and (item["attention_acknowledged_by_me"] or item["status"] == "resolved")
        ]
        self.assertEqual([item["id"] for item in active_items], [active["id"]])
        self.assertEqual({item["id"] for item in history_items}, {acknowledged["id"], resolved["id"]})
        self.assertGreater(int(by_id[acknowledged["id"]]["attention_acknowledged_at"] or 0), 0)

    def test_note_thread_unread_counts_are_per_user_and_mark_read(self):
        self._add_project_member(self.viewer, "viewer")
        peer = self.create_user(
            "notes_peer@local",
            "editor",
            is_admin=False,
            full_name="Коллега Обсуждений",
        )
        self._insert_membership(self.org_id, str(peer.get("id") or ""), "editor")
        self._add_project_member(peer, "editor")

        created = self.create_session_note_thread(
            self.session_id,
            self.CreateNoteThreadBody(scope_type="session", scope_ref={}, body="Первое сообщение"),
            self._req(),
        )["thread"]
        thread_id = created["id"]
        self.assertEqual(created["unread_count"], 0)
        self.assertGreater(int(created["last_read_at"] or 0), 0)

        viewer_initial = self.list_session_note_threads(self.session_id, self._req(self.viewer), status="")["items"][0]
        self.assertEqual(viewer_initial["unread_count"], 1)
        self.assertEqual(viewer_initial["last_read_at"], 0)

        read_result = self.mark_note_thread_read(thread_id, self._req(self.viewer))
        self.assertTrue(read_result["ok"])
        self.assertEqual(read_result["unread_count"], 0)
        viewer_after_read = self.list_session_note_threads(self.session_id, self._req(self.viewer), status="")["items"][0]
        self.assertEqual(viewer_after_read["unread_count"], 0)
        self.assertGreater(int(viewer_after_read["last_read_at"] or 0), 0)

        peer_comment_thread = self.add_note_thread_comment(
            thread_id,
            self.AddNoteCommentBody(body="Новое сообщение коллеги"),
            self._req(peer),
        )["thread"]
        peer_comment = next(comment for comment in peer_comment_thread["comments"] if comment["body"] == "Новое сообщение коллеги")
        bumped_at = int(viewer_after_read["last_read_at"] or 0) + 5
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute(
                "UPDATE note_comments SET created_at = ?, updated_at = ? WHERE id = ?",
                [bumped_at, bumped_at, peer_comment["id"]],
            )
            con.execute("UPDATE note_threads SET updated_at = ? WHERE id = ?", [bumped_at, thread_id])
            con.commit()

        viewer_after_peer_comment = self.list_session_note_threads(self.session_id, self._req(self.viewer), status="")["items"][0]
        self.assertEqual(viewer_after_peer_comment["unread_count"], 1)
        self.assertEqual(viewer_after_peer_comment["last_comment_at"], bumped_at)
        self.assertEqual(viewer_after_peer_comment["last_comment_author_user_id"], str(peer.get("id") or ""))

        peer_after_own_comment = self.list_session_note_threads(self.session_id, self._req(peer), status="")["items"][0]
        self.assertEqual(peer_after_own_comment["unread_count"], 0)

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

        created = self.create_session_note_thread(
            self.session_id,
            self.CreateNoteThreadBody(scope_type="session", scope_ref={}, body="read guard"),
            self._req(),
        )["thread"]
        with self.assertRaises(HTTPException) as unauthorized_read:
            self.mark_note_thread_read(created["id"], self._req({}))
        self.assertEqual(unauthorized_read.exception.status_code, 401)
        with self.assertRaises(HTTPException) as missing_read:
            self.mark_note_thread_read("missing_thread", self._req())
        self.assertEqual(missing_read.exception.status_code, 404)

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
