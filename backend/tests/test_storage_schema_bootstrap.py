import importlib
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class StorageSchemaBootstrapTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmp.name) / "bootstrap.sqlite3")
        self.old_process_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        os.environ["PROCESS_DB_PATH"] = self.db_path
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name

        con = sqlite3.connect(self.db_path)
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS bpmn_versions (
              id TEXT PRIMARY KEY,
              session_id TEXT NOT NULL,
              org_id TEXT NOT NULL DEFAULT 'org_default',
              version_number INTEGER NOT NULL,
              bpmn_xml TEXT NOT NULL DEFAULT '',
              source_action TEXT NOT NULL DEFAULT '',
              import_note TEXT NOT NULL DEFAULT '',
              created_at INTEGER NOT NULL DEFAULT 0,
              created_by TEXT NOT NULL DEFAULT ''
            )
            """
        )
        con.commit()
        con.close()

    def tearDown(self):
        if self.old_process_db_path is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = self.old_process_db_path
        if self.old_storage_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_storage_dir
        self.tmp.cleanup()

    def test_bootstrap_upgrades_legacy_bpmn_versions_before_diagram_state_index(self):
        import app.storage as storage

        importlib.reload(storage)
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""
        storage._ensure_schema()

        con = sqlite3.connect(self.db_path)
        cols = {
            row[1]
            for row in con.execute("PRAGMA table_info(bpmn_versions)").fetchall()
        }
        indexes = {
            row[1]
            for row in con.execute("PRAGMA index_list('bpmn_versions')").fetchall()
        }
        tables = {
            row[0]
            for row in con.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('bpmn_versions','session_state_versions')"
            ).fetchall()
        }
        con.close()

        self.assertIn("diagram_state_version", cols)
        self.assertIn("idx_bpmn_versions_session_diagram_state", indexes)
        self.assertIn("bpmn_versions", tables)
        self.assertIn("session_state_versions", tables)


if __name__ == "__main__":
    unittest.main()

