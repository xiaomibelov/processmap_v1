import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def _load_script_module():
    import importlib.util

    script_path = Path(__file__).resolve().parents[1] / "scripts" / "sanitize_drawio_persisted_state.py"
    spec = importlib.util.spec_from_file_location("sanitize_drawio_persisted_state", script_path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class DrawioPersistedStateSanitizeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp.name) / "sanitize.sqlite3"
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)
        os.environ["PROCESS_DB_PATH"] = str(self.db_path)
        os.environ["PROCESS_STORAGE_DIR"] = str(Path(self.tmp.name) / "store")

        from app.db.config import get_db_runtime_config
        from app import storage

        get_db_runtime_config.cache_clear()
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""
        storage._PG_POOL = None
        storage._ensure_schema()

        self.storage = storage
        self.mod = _load_script_module()

    def tearDown(self):
        self.tmp.cleanup()

    def _insert_session(self, session_id: str, bpmn_meta: dict):
        with self.storage._connect() as con:
            con.execute(
                "INSERT INTO sessions (id, title, bpmn_meta_json, version, owner_user_id, org_id, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    session_id,
                    "sanitize test",
                    json.dumps(bpmn_meta, ensure_ascii=False),
                    1,
                    "",
                    "org_default",
                    1,
                    1,
                ],
            )
            con.commit()

    def _load_drawio_elements(self, session_id: str):
        with self.storage._connect() as con:
            row = con.execute("SELECT bpmn_meta_json FROM sessions WHERE id = ? LIMIT 1", [session_id]).fetchone()
        self.assertIsNotNone(row)
        meta = self.storage._json_loads(row["bpmn_meta_json"], {})
        drawio = dict(meta.get("drawio") or {})
        return list(drawio.get("drawio_elements_v1") or [])

    def test_sanitize_drawio_meta_drops_invalid_rows(self):
        drawio = {
            "enabled": True,
            "svg_cache": (
                "<svg><g id='shape_ok'/><g id='shape_ok_2'/>"
                "<defs id='mxclip-1'></defs><g id='mxclip-1'/></svg>"
            ),
            "drawio_elements_v1": [
                {"id": "shape_ok", "deleted": False},
                {"id": "shape_ok", "deleted": False},
                {"id": "mxclip-1", "deleted": False},
                {"id": "ghost_missing", "deleted": False},
                {"id": "Activity_0238wyw", "deleted": False},
                {"id": "ghost_deleted", "deleted": True},
                {"id": "", "deleted": False},
            ],
        }
        sanitized, stats = self.mod.sanitize_drawio_meta(drawio)
        kept_ids = [str((row or {}).get("id") or "") for row in sanitized.get("drawio_elements_v1") or []]
        self.assertEqual(kept_ids, ["shape_ok"])
        self.assertTrue(stats["changed"])
        self.assertEqual(int(stats["dropped_duplicate_id_rows"]), 0)
        self.assertEqual(int(stats["dropped_technical_ids"]), 1)
        self.assertEqual(int(stats["dropped_unmanaged_ids"]), 2)
        self.assertEqual(int(stats["dropped_invalid_legacy_masquerade_ids"]), 1)
        self.assertEqual(int(stats["dropped_stale_ghost_ids"]), 1)
        self.assertEqual(int(stats["dropped_empty_id_rows"]), 0)

    def test_sanitize_sessions_apply_updates_persisted_meta(self):
        session_id = "sid_sanitize_01"
        bpmn_meta = {
            "version": 1,
            "drawio": {
                "enabled": True,
                "svg_cache": "<svg><g id='shape_keep'/></svg>",
                "drawio_elements_v1": [
                    {"id": "shape_keep", "deleted": False},
                    {"id": "ghost_missing", "deleted": False},
                    {"id": "mxclip-1", "deleted": False},
                    {"id": "Collaboration_06ftemy", "deleted": False},
                ],
            },
        }
        self._insert_session(session_id, bpmn_meta)

        dry_summary = self.mod.sanitize_sessions(
            apply_changes=False,
            session_ids=[session_id],
        )
        self.assertEqual(int(dry_summary["total_sessions_scanned"]), 1)
        self.assertEqual(int(dry_summary["sessions_changed"]), 1)
        self.assertEqual(int(dry_summary["rows_before_total"]), 4)
        self.assertEqual(int(dry_summary["rows_after_total"]), 1)

        apply_summary = self.mod.sanitize_sessions(
            apply_changes=True,
            session_ids=[session_id],
        )
        self.assertEqual(int(apply_summary["sessions_changed"]), 1)

        kept_rows = self._load_drawio_elements(session_id)
        self.assertEqual([str((row or {}).get("id") or "") for row in kept_rows], ["shape_keep"])


if __name__ == "__main__":
    unittest.main()
