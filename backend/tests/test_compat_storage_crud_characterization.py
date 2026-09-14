"""Characterization tests for compat session-storage CRUD touched by
refactor/storage-base-repository-v1 step 5b: create/save/load/list/delete/rename
plus the migrated version-listing helpers they delegate to.

Bootstrap mirrors test_notes_repo_characterization.py: tmpdir-backed storage
via env vars, seeded default org, user and project.
"""
from __future__ import annotations

import os
import tempfile
import unittest


class CompatStorageCrudCharacterizationTest(unittest.TestCase):
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
        from app.storage import get_default_org_id, get_project_storage, get_storage

        import app.storage as storage

        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""

        self.create_user = create_user
        _ = get_storage()
        self.org_id = get_default_org_id()
        self.owner = create_user(
            "compat_crud_owner@local",
            "editor",
            is_admin=False,
            full_name="Владелец",
            job_title="Технолог",
        )
        self.owner_id = str(self.owner.get("id") or "")
        ps = get_project_storage()
        self.project_id = ps.create(
            "Compat CRUD Project",
            {},
            user_id=self.owner_id,
            org_id=self.org_id,
        )
        self.storage = get_storage()

    def tearDown(self):
        for tmp in (self.tmp_sessions, self.tmp_projects):
            tmp.cleanup()
        self._restore_env("PROCESS_STORAGE_DIR", self.old_sessions_dir)
        self._restore_env("PROJECT_STORAGE_DIR", self.old_projects_dir)
        self._restore_env("PROCESS_DB_PATH", self.old_db_path)

        import app.storage as storage

        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""

    @staticmethod
    def _restore_env(key: str, value):
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value

    def _create_session(self, title: str) -> str:
        return self.storage.create(
            title,
            roles=["Технолог"],
            project_id=self.project_id,
            user_id=self.owner_id,
            org_id=self.org_id,
        )

    def test_create_load_save_list_delete_rename_roundtrip(self):
        sid = self._create_session("Сессия А")
        self.assertTrue(sid)

        sess = self.storage.load(sid, user_id=self.owner_id, org_id=self.org_id)
        self.assertIsNotNone(sess)
        self.assertEqual(sess.id, sid)
        self.assertEqual(sess.title, "Сессия А")
        self.assertEqual(sess.project_id, self.project_id)

        # list sees the session for the owner scope
        listing = self.storage.list(
            limit=50, project_id=self.project_id,
            user_id=self.owner_id, org_id=self.org_id,
        )
        self.assertEqual([row["id"] for row in listing], [sid])

        # save updates payload; load returns it back
        sess.interview = {"analysis": {"product_actions": [{"name": "a"}]}}
        sess.mermaid_simple = "graph TD; A-->B;"
        self.storage.save(sess, user_id=self.owner_id, org_id=self.org_id)
        reloaded = self.storage.load(sid, user_id=self.owner_id, org_id=self.org_id)
        self.assertEqual(reloaded.interview.get("analysis", {}).get("product_actions"), [{"name": "a"}])
        self.assertEqual(reloaded.mermaid_simple, "graph TD; A-->B;")

        # rename returns the reloaded session with the new title
        renamed = self.storage.rename(sid, "Сессия А2", user_id=self.owner_id, org_id=self.org_id)
        self.assertIsNotNone(renamed)
        self.assertEqual(renamed.title, "Сессия А2")
        self.assertEqual(
            self.storage.load(sid, user_id=self.owner_id, org_id=self.org_id).title,
            "Сессия А2",
        )

        # delete removes the row from the owner scope
        self.assertTrue(self.storage.delete(sid, user_id=self.owner_id, org_id=self.org_id))
        self.assertIsNone(self.storage.load(sid, user_id=self.owner_id, org_id=self.org_id))
        self.assertFalse(self.storage.delete(sid, user_id=self.owner_id, org_id=self.org_id))

    def test_bpmn_version_listing_helpers_after_save(self):
        sid = self._create_session("Сессия В")
        from app.domains.storage.compat import repository as _repo

        with _repo._connect() as con:
            con.execute(
                "INSERT INTO bpmn_versions (id, session_id, org_id, version_number, diagram_state_version, "
                "bpmn_xml, session_payload_hash, session_version, session_updated_at, source_action, "
                "import_note, created_at, created_by) VALUES (?, ?, ?, 1, 0, ?, 'hash-1', 0, 0, 'publish_manual_save', '', 0, ?)",
                [f"{sid}-v1", sid, self.org_id, "<definitions id='d1'/>", self.owner_id],
            )

        versions = self.storage.list_bpmn_versions(
            sid, org_id=self.org_id, include_xml=True, include_technical=True
        )
        self.assertGreaterEqual(len(versions), 1)
        self.assertEqual(versions[0]["session_id"], sid)
        self.assertIn("bpmn_xml", versions[0])

        latest = self.storage.latest_user_facing_bpmn_version(sid, org_id=self.org_id)
        self.assertIsNotNone(latest)
        self.assertEqual(latest["session_id"], sid)

        self.assertGreaterEqual(
            self.storage.count_bpmn_versions(sid, org_id=self.org_id), 1
        )

    def test_session_state_versions_and_rag_status_listing(self):
        sid = self._create_session("Сессия С")
        state_versions = self.storage.list_session_state_versions(sid, org_id=self.org_id)
        self.assertIsInstance(state_versions, list)

        queued = self.storage.list_sessions_by_rag_status("not_ready", org_id=self.org_id)
        self.assertTrue(any(row["id"] == sid for row in queued))

        readiness = self.storage.get_rag_readiness(sid, org_id=self.org_id)
        self.assertIsNotNone(readiness)
        self.assertEqual(readiness["session_id"], sid)


if __name__ == "__main__":
    unittest.main()
