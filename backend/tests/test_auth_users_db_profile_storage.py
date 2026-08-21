import json
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path


class AuthUsersDbProfileStorageTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmp.name) / "processmap.sqlite3")
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_backend = os.environ.get("FPC_DB_BACKEND")
        self.old_database_url = os.environ.get("DATABASE_URL")

        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["PROCESS_DB_PATH"] = self.db_path
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)

        from app import storage

        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""

    def tearDown(self):
        if self.old_storage_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_storage_dir
        if self.old_db_path is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = self.old_db_path
        if self.old_backend is None:
            os.environ.pop("FPC_DB_BACKEND", None)
        else:
            os.environ["FPC_DB_BACKEND"] = self.old_backend
        if self.old_database_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = self.old_database_url
        from app import storage

        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""
        self.tmp.cleanup()

    def _db_user(self, user_id):
        with sqlite3.connect(self.db_path) as con:
            con.row_factory = sqlite3.Row
            return con.execute("SELECT * FROM users WHERE id = ?", [user_id]).fetchone()

    def test_legacy_auth_json_backfills_db_users_with_same_ids_and_hashes(self):
        from app.auth import authenticate_user, hash_password, list_users

        password_hash = hash_password("legacy-pass")
        legacy_user = {
            "id": "legacy_user_1",
            "email": "legacy@local",
            "password_hash": password_hash,
            "is_active": True,
            "is_admin": True,
            "created_at": 123,
            "activation_pending": False,
            "full_name": "Legacy User",
            "job_title": "Owner",
        }
        Path(self.tmp.name, "_auth_users.json").write_text(json.dumps([legacy_user]), encoding="utf-8")

        rows = list_users()
        self.assertEqual([row.get("id") for row in rows], ["legacy_user_1"])
        self.assertEqual(authenticate_user("legacy@local", "legacy-pass").get("id"), "legacy_user_1")

        db_row = self._db_user("legacy_user_1")
        self.assertIsNotNone(db_row)
        self.assertEqual(db_row["email"], "legacy@local")
        self.assertEqual(db_row["password_hash"], password_hash)
        self.assertEqual(db_row["full_name"], "Legacy User")
        self.assertEqual(db_row["job_title"], "Owner")

    def test_create_and_update_user_persist_profile_fields_in_db(self):
        from app.auth import authenticate_user, create_user, update_user

        created = create_user(
            "profile@local",
            "strongpass1",
            full_name="Initial Name",
            job_title="Operator",
        )
        user_id = str(created.get("id") or "")
        self.assertTrue(user_id)
        self.assertFalse(Path(self.tmp.name, "_auth_users.json").exists())

        updated = update_user(
            user_id,
            password="strongpass2",
            full_name="Updated Name",
            job_title="Technologist",
        )
        self.assertEqual(updated.get("full_name"), "Updated Name")
        self.assertEqual(updated.get("job_title"), "Technologist")
        self.assertEqual(authenticate_user("profile@local", "strongpass2").get("id"), user_id)

        db_row = self._db_user(user_id)
        self.assertEqual(db_row["full_name"], "Updated Name")
        self.assertEqual(db_row["job_title"], "Technologist")


if __name__ == "__main__":
    unittest.main()
