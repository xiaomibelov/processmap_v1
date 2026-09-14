"""Characterization tests for notes storage repository methods migrated to
the generic base.py CRUD layer (refactor/storage-base-repository-v1, step 1).

Bootstrap mirrors test_notes_mvp1_api.py: tmpdir-backed storage via env vars,
seeded default org, users, project and session.
"""
from __future__ import annotations

import os
import tempfile
import time
import unittest
from types import SimpleNamespace


class NotesRepoCharacterizationTest(unittest.TestCase):
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
        from app.domains.storage.notes import repository as notes_repo
        from app.storage import (
            get_default_org_id,
            get_project_storage,
            get_storage,
        )

        self.notes_repo = notes_repo
        self.create_user = create_user
        self.get_default_org_id = get_default_org_id

        _ = get_storage()
        self.org_id = get_default_org_id()
        self.editor = create_user(
            "notes_repo_editor@local",
            "editor",
            is_admin=False,
            full_name="Редактор",
            job_title="Технолог",
        )
        self.other = create_user(
            "notes_repo_other@local",
            "viewer",
            is_admin=False,
            full_name="Другой",
            job_title="Аудитор",
        )
        editor_id = str(self.editor.get("id") or "")
        ps = get_project_storage()
        self.project_id = ps.create(
            "Notes Repo Project",
            {},
            user_id=editor_id,
            org_id=self.org_id,
            is_admin=True,
        )
        st = get_storage()
        self.session_id = st.create(
            title="Notes Repo Session",
            roles=["operator"],
            project_id=self.project_id,
            user_id=editor_id,
            org_id=self.org_id,
            is_admin=True,
        )
        self.editor_id = editor_id
        self.other_id = str(self.other.get("id") or "")

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

    def _sess(self):
        return SimpleNamespace(id=self.session_id, org_id=self.org_id, project_id=self.project_id)

    def _create_thread(self, body="Тестовая заметка", **kwargs):
        return self.notes_repo.create_note_thread(
            self._sess(),
            scope_type=kwargs.pop("scope_type", "diagram_element"),
            scope_ref=kwargs.pop("scope_ref", {"element_id": "Task_1"}),
            body=body,
            actor_user_id=self.editor_id,
            org_id=self.org_id,
            **kwargs,
        )

    # --- create_note_thread / add_note_comment -----------------------------

    def test_create_note_thread_persists_thread_and_first_comment(self):
        thread = self._create_thread()
        self.assertEqual(thread["session_id"], self.session_id)
        self.assertEqual(thread["org_id"], self.org_id)
        self.assertEqual(thread["status"], "open")
        self.assertEqual(len(thread["comments"]), 1)
        self.assertEqual(thread["comments"][0]["author_user_id"], self.editor_id)

    def test_add_note_comment_appends_and_bumps_thread(self):
        thread = self._create_thread()
        tid = thread["id"]
        # note_comments are ordered by (created_at ASC, id ASC) with random
        # uuid ids: same-second timestamps make the order tie on id, so
        # separate the two comments across a second boundary to keep the
        # ordering assertion deterministic.
        time.sleep(1.1)
        updated = self.notes_repo.add_note_comment(
            tid,
            body="Второй комментарий",
            actor_user_id=self.editor_id,
            org_id=self.org_id,
        )
        self.assertIsNotNone(updated)
        self.assertEqual(len(updated["comments"]), 2)
        self.assertEqual(updated["comments"][1]["body"], "Второй комментарий")
        self.assertGreaterEqual(updated["updated_at"], thread["updated_at"])

    def test_add_note_comment_wrong_org_returns_none(self):
        thread = self._create_thread()
        self.assertIsNone(
            self.notes_repo.add_note_comment(
                thread["id"],
                body="Чужой комментарий",
                actor_user_id=self.editor_id,
                org_id="org_foreign",
            )
        )

    def test_add_note_comment_reply_validation(self):
        thread = self._create_thread()
        with self.assertRaises(LookupError):
            self.notes_repo.add_note_comment(
                thread["id"],
                body="Ответ",
                reply_to_comment_id="missing_comment",
                actor_user_id=self.editor_id,
                org_id=self.org_id,
            )

    # --- patch_note_thread ---------------------------------------------------

    def test_patch_note_thread_status_resolved_sets_resolver(self):
        thread = self._create_thread()
        patched = self.notes_repo.patch_note_thread(
            thread["id"],
            status="resolved",
            actor_user_id=self.editor_id,
            org_id=self.org_id,
        )
        self.assertIsNotNone(patched)
        self.assertEqual(patched["status"], "resolved")
        self.assertEqual(patched["resolved_by"], self.editor_id)
        self.assertGreater(int(patched["resolved_at"] or 0), 0)

    def test_patch_note_thread_wrong_org_returns_none(self):
        thread = self._create_thread()
        self.assertIsNone(
            self.notes_repo.patch_note_thread(
                thread["id"],
                priority="high",
                actor_user_id=self.editor_id,
                org_id="org_foreign",
            )
        )

    def test_patch_note_thread_requires_attention_clears_ack(self):
        thread = self._create_thread(requires_attention=True)
        tid = thread["id"]
        self.notes_repo.acknowledge_note_thread_attention(
            tid, actor_user_id=self.editor_id, org_id=self.org_id
        )
        patched = self.notes_repo.patch_note_thread(
            tid,
            requires_attention=False,
            actor_user_id=self.editor_id,
            org_id=self.org_id,
        )
        self.assertIsNotNone(patched)
        self.assertFalse(patched["requires_attention"])

    def test_patch_note_thread_no_fields_raises(self):
        thread = self._create_thread()
        with self.assertRaises(ValueError):
            self.notes_repo.patch_note_thread(
                thread["id"],
                actor_user_id=self.editor_id,
                org_id=self.org_id,
            )

    # --- update_note_comment -------------------------------------------------

    def test_update_note_comment_edits_body_and_bumps_thread(self):
        thread = self._create_thread()
        cid = thread["comments"][0]["id"]
        updated = self.notes_repo.update_note_comment(
            cid,
            body="Отредактировано",
            actor_user_id=self.editor_id,
            org_id=self.org_id,
        )
        self.assertIsNotNone(updated)
        comment = self.notes_repo.get_note_comment(cid, org_id=self.org_id)
        self.assertEqual(comment["body"], "Отредактировано")
        self.assertGreater(int(comment["edited_at"] or 0), 0)

    def test_update_note_comment_wrong_org_returns_none(self):
        thread = self._create_thread()
        cid = thread["comments"][0]["id"]
        self.assertIsNone(
            self.notes_repo.update_note_comment(
                cid,
                body="Чужая правка",
                actor_user_id=self.editor_id,
                org_id="org_foreign",
            )
        )

    # --- delete_note_comment / delete_note_thread ----------------------------

    def test_delete_note_comment_soft_deletes_and_bumps_thread(self):
        thread = self._create_thread()
        cid = thread["comments"][0]["id"]
        result = self.notes_repo.delete_note_comment(
            cid, actor_user_id=self.editor_id, org_id=self.org_id
        )
        self.assertIsNotNone(result)
        self.assertEqual(result["comment_id"], cid)
        self.assertGreater(int(result["deleted_at"] or 0), 0)
        self.assertIsNone(self.notes_repo.get_note_comment(cid, org_id=self.org_id))
        # повторное удаление — не находит (soft-delete семантика)
        self.assertIsNone(
            self.notes_repo.delete_note_comment(
                cid, actor_user_id=self.editor_id, org_id=self.org_id
            )
        )

    def test_delete_note_thread_cascades_soft_delete_to_comments(self):
        thread = self._create_thread()
        tid = thread["id"]
        cid = thread["comments"][0]["id"]
        result = self.notes_repo.delete_note_thread(
            tid, actor_user_id=self.editor_id, org_id=self.org_id
        )
        self.assertIsNotNone(result)
        self.assertEqual(result["thread_id"], tid)
        self.assertIsNone(self.notes_repo.get_note_thread(tid, org_id=self.org_id))
        self.assertIsNone(self.notes_repo.get_note_comment(cid, org_id=self.org_id))
        # удалённый тред не принимает новые комментарии
        self.assertIsNone(
            self.notes_repo.add_note_comment(
                tid, body="Поздно", actor_user_id=self.editor_id, org_id=self.org_id
            )
        )

    def test_delete_note_thread_wrong_org_returns_none(self):
        thread = self._create_thread()
        self.assertIsNone(
            self.notes_repo.delete_note_thread(
                thread["id"], actor_user_id=self.editor_id, org_id="org_foreign"
            )
        )

    # --- acknowledge_note_mention --------------------------------------------

    def test_acknowledge_note_mention_marks_ack_and_returns_payload(self):
        thread = self._create_thread(
            mention_targets=[{"user_id": self.other_id, "label": "Другой"}]
        )
        cid = thread["comments"][0]["id"]
        mention = thread["comments"][0]["mentions"][0]
        self.assertEqual(mention["mentioned_user_id"], self.other_id)
        self.assertEqual(int(mention["acknowledged_at"] or 0), 0)

        acked = self.notes_repo.acknowledge_note_mention(
            mention["id"], actor_user_id=self.other_id, org_id=self.org_id
        )
        self.assertIsNotNone(acked)
        self.assertGreater(int(acked["acknowledged_at"] or 0), 0)

        # идемпотентность: повторный ack не ломает payload
        acked2 = self.notes_repo.acknowledge_note_mention(
            mention["id"], actor_user_id=self.other_id, org_id=self.org_id
        )
        self.assertEqual(acked2["acknowledged_at"], acked["acknowledged_at"])

    def test_acknowledge_note_mention_wrong_actor_or_org_returns_none(self):
        thread = self._create_thread(
            mention_targets=[{"user_id": self.other_id, "label": "Другой"}]
        )
        mention = thread["comments"][0]["mentions"][0]
        self.assertIsNone(
            self.notes_repo.acknowledge_note_mention(
                mention["id"], actor_user_id=self.editor_id, org_id=self.org_id
            )
        )
        self.assertIsNone(
            self.notes_repo.acknowledge_note_mention(
                mention["id"], actor_user_id=self.other_id, org_id="org_foreign"
            )
        )

    # --- acknowledge_note_thread_attention ------------------------------------

    def test_acknowledge_note_thread_attention_toggles_acknowledgement(self):
        thread = self._create_thread(requires_attention=True)
        tid = thread["id"]
        acked = self.notes_repo.acknowledge_note_thread_attention(
            tid, actor_user_id=self.editor_id, org_id=self.org_id
        )
        self.assertIsNotNone(acked)
        self.assertGreater(int(acked["attention_acknowledged_at"] or 0), 0)

        # без requires_attention ack-запись не создаётся, но thread возвращается
        plain = self._create_thread(body="Обычный тред")
        result = self.notes_repo.acknowledge_note_thread_attention(
            plain["id"], actor_user_id=self.editor_id, org_id=self.org_id
        )
        self.assertIsNotNone(result)
        self.assertEqual(int(result["attention_acknowledged_at"] or 0), 0)

    def test_acknowledge_note_thread_attention_wrong_org_returns_none(self):
        thread = self._create_thread(requires_attention=True)
        self.assertIsNone(
            self.notes_repo.acknowledge_note_thread_attention(
                thread["id"], actor_user_id=self.editor_id, org_id="org_foreign"
            )
        )


if __name__ == "__main__":
    unittest.main()
