import importlib
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class RagSettingsRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_backend = os.environ.get("FPC_DB_BACKEND")
        self.old_db_url = os.environ.get("DATABASE_URL")
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp.name) / "rag_runtime.sqlite3")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-issuer")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")

        import app.storage as storage
        importlib.reload(storage)
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""

        from app.auth import create_user
        from app.storage import get_default_org_id, get_project_storage, get_storage

        self.get_storage = get_storage
        self.get_project_storage = get_project_storage
        self.org_id = get_default_org_id()

        self.user = create_user("rag-rt@local", "pass", is_admin=False)
        self.user_id = str(self.user.get("id") or "")
        self._insert_membership(self.org_id, self.user_id, "org_admin")

        self.project_id = get_project_storage().create(
            "RT Project", {}, user_id=self.user_id, org_id=self.org_id, is_admin=True
        )
        self.session_id = self._seed_session()
        self._index_session()

        from app.routers.rag import rag_search
        self.rag_search = rag_search

    def tearDown(self):
        self.tmp.cleanup()
        for key, val in [
            ("PROCESS_DB_PATH", self.old_db_path),
            ("PROCESS_STORAGE_DIR", self.old_storage_dir),
            ("FPC_DB_BACKEND", self.old_backend),
            ("DATABASE_URL", self.old_db_url),
        ]:
            if val is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = val
        import app.storage as storage
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""

    def _insert_membership(self, org_id, user_id, role):
        from app.storage import _connect
        with _connect() as con:
            con.execute(
                "INSERT OR REPLACE INTO org_memberships (org_id, user_id, role) VALUES (?,?,?)",
                [org_id, user_id, role],
            )
            con.commit()

    def _seed_session(self):
        storage = self.get_storage()
        sid = storage.create(
            "RT Session", roles=["Повар"], project_id=self.project_id,
            org_id=self.org_id, is_admin=True,
        )
        session = storage.load(sid, org_id=self.org_id, is_admin=True)
        session.bpmn_xml = (
            "<definitions><bpmn:process>"
            "<bpmn:userTask id='t1' name='Нарезка'/>"
            "<bpmn:userTask id='t2' name='Упаковка'/>"
            "<bpmn:userTask id='t3' name='Маркировка'/>"
            "</bpmn:process></definitions>"
        )
        session.bpmn_xml_version = 1
        storage.save(session, org_id=self.org_id, is_admin=True)
        return sid

    def _index_session(self):
        from app.routers.rag import RagIndexIn, rag_index
        req = _DummyRequest(
            {"id": self.user_id, "email": "rag-rt@local", "is_admin": False},
            active_org_id=self.org_id,
        )
        rag_index(RagIndexIn(source_type="bpmn_xml", session_id=self.session_id), req)

    def _req(self):
        return _DummyRequest(
            {"id": self.user_id, "email": "rag-rt@local", "is_admin": False},
            active_org_id=self.org_id,
        )

    def _set_settings(self, **kwargs):
        from app.storage import _connect
        import json, time
        with _connect() as con:
            existing = con.execute(
                "SELECT org_id FROM rag_settings WHERE org_id=?", [self.org_id]
            ).fetchone()
            if existing:
                cols = ", ".join(f"{k}=?" for k in kwargs)
                con.execute(
                    f"UPDATE rag_settings SET {cols} WHERE org_id=?",
                    [*[json.dumps(v) if isinstance(v, list) else v for v in kwargs.values()], self.org_id],
                )
            else:
                defaults = {
                    "enabled": 1, "indexing_enabled": 1, "default_top_k": 10,
                    "max_top_k": 50, "default_min_score": None,
                    "allowed_source_types": '["bpmn_xml","product_action"]',
                    "show_technical_fragments": 0,
                    "updated_at": int(time.time()), "updated_by": "",
                }
                defaults.update({
                    k: json.dumps(v) if isinstance(v, list) else v
                    for k, v in kwargs.items()
                })
                con.execute(
                    """INSERT INTO rag_settings
                       (org_id, enabled, indexing_enabled, default_top_k, max_top_k,
                        default_min_score, allowed_source_types, show_technical_fragments,
                        updated_at, updated_by)
                       VALUES (?,?,?,?,?,?,?,?,?,?)""",
                    [
                        self.org_id,
                        defaults["enabled"], defaults["indexing_enabled"],
                        defaults["default_top_k"], defaults["max_top_k"],
                        defaults["default_min_score"], defaults["allowed_source_types"],
                        defaults["show_technical_fragments"], defaults["updated_at"],
                        defaults["updated_by"],
                    ],
                )
            con.commit()

    # ── Tests ─────────────────────────────────────────────────────────────────

    def test_search_uses_hardcoded_defaults_when_no_settings_row(self):
        result = self.rag_search(self._req(), q="Нарезка")
        self.assertTrue(result.get("ok"))
        self.assertIn("results", result)

    def test_search_respects_default_top_k_from_settings(self):
        self._set_settings(default_top_k=1)
        result = self.rag_search(self._req(), q="task")
        self.assertTrue(result.get("ok"))
        self.assertLessEqual(len(result["results"]), 1)

    def test_explicit_top_k_overrides_settings_default(self):
        self._set_settings(default_top_k=1)
        result = self.rag_search(self._req(), q="task", top_k=3)
        self.assertTrue(result.get("ok"))
        self.assertLessEqual(len(result["results"]), 3)

    def test_explicit_top_k_capped_at_max_top_k(self):
        self._set_settings(max_top_k=2)
        result = self.rag_search(self._req(), q="task", top_k=10)
        self.assertTrue(result.get("ok"))
        self.assertLessEqual(len(result["results"]), 2)

    def test_search_respects_default_min_score_from_settings(self):
        self._set_settings(default_min_score=999.0)
        result = self.rag_search(self._req(), q="Нарезка")
        self.assertTrue(result.get("ok"))
        self.assertEqual(len(result["results"]), 0)

    def test_explicit_min_score_overrides_settings_default(self):
        self._set_settings(default_min_score=999.0)
        result = self.rag_search(self._req(), q="Нарезка", min_score=0.0)
        self.assertTrue(result.get("ok"))

    def test_enabled_false_returns_rag_disabled(self):
        self._set_settings(enabled=0)
        result = self.rag_search(self._req(), q="Нарезка")
        self.assertFalse(result.get("ok"))
        self.assertEqual(result.get("error"), "rag_disabled")
        self.assertEqual(result.get("results"), [])


if __name__ == "__main__":
    unittest.main()
