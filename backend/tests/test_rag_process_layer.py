import importlib
import json
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

XML = (
    "<definitions><bpmn:process>"
    "<bpmn:userTask id='t1' name='Нарезка овощей'/>"
    "<bpmn:serviceTask id='t2' name='Упаковка готового блюда'/>"
    "</bpmn:process></definitions>"
)


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class RagProcessLayerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_backend = os.environ.get("FPC_DB_BACKEND")
        self.old_db_url = os.environ.get("DATABASE_URL")
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp.name) / "rag_layer.sqlite3")
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
        self.org_id = get_default_org_id()
        self.org_b = "org_rag_layer_other"

        self.user = create_user("rag-layer@local", "rag-layer", is_admin=False)
        self.user_id = str(self.user.get("id") or "")
        self._insert_membership(self.org_id, self.user_id, "org_admin")
        self._insert_membership(self.org_b, self.user_id, "org_admin")
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute(
                "INSERT OR IGNORE INTO orgs (id, name, created_at) VALUES (?, ?, strftime('%s','now'))",
                [self.org_b, "Org RAG Layer Other"],
            )
            con.commit()

        self.project_id = get_project_storage().create(
            "RAG Layer Project", {}, user_id=self.user_id, org_id=self.org_id, is_admin=True
        )
        self.sess_as_is = self._seed_session("Sess AS IS", "as_is", self.org_id)
        self.sess_to_be = self._seed_session("Sess TO BE", "to_be", self.org_id)

    def tearDown(self):
        for key, old in (
            ("PROCESS_DB_PATH", self.old_db_path),
            ("PROCESS_STORAGE_DIR", self.old_storage_dir),
            ("FPC_DB_BACKEND", self.old_backend),
            ("DATABASE_URL", self.old_db_url),
        ):
            if old is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = old
        self.tmp.cleanup()

    def _db_path(self) -> Path:
        return Path(os.environ["PROCESS_DB_PATH"])

    def _insert_membership(self, org_id: str, user_id: str, role: str):
        _ = self.get_storage()
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute(
                "INSERT OR IGNORE INTO org_memberships (org_id, user_id, role, created_at) VALUES (?, ?, ?, strftime('%s','now'))",
                [org_id, user_id, role],
            )
            con.commit()

    def _seed_session(self, title: str, process_layer: str, org_id: str) -> str:
        storage = self.get_storage()
        sid = storage.create(title, roles=["Повар"], project_id=self.project_id, org_id=org_id, is_admin=True)
        session = storage.load(sid, org_id=org_id, is_admin=True)
        session.bpmn_xml = XML
        session.bpmn_xml_version = 1
        storage.save(session, org_id=org_id, is_admin=True)
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute("UPDATE sessions SET process_layer=? WHERE id=?", [process_layer, sid])
            con.commit()
        return sid

    def _req(self, org_id: str = None):
        return _DummyRequest(self.user, active_org_id=org_id or self.org_id)

    def _index_session(self, session_id: str, org_id: str = None):
        from app.rag_tasks import _do_index_session_bpmn_xml

        return _do_index_session_bpmn_xml(session_id, org_id or self.org_id)

    def _search(self, q: str, org_id: str = None, **kwargs):
        from app.routers.rag import rag_search

        return rag_search(
            request=self._req(org_id),
            q=q,
            top_k=kwargs.get("top_k", 10),
            source_type=kwargs.get("source_type", None),
            session_id=kwargs.get("session_id", None),
            min_score=kwargs.get("min_score", 0.0),
            process_layer=kwargs.get("process_layer", None),
        )

    def _chunk_metadata(self, doc_id: str) -> list:
        con = sqlite3.connect(str(self._db_path()))
        rows = con.execute(
            "SELECT metadata_json FROM rag_chunks WHERE doc_id=?", [doc_id]
        ).fetchall()
        con.close()
        return [json.loads(r[0]) for r in rows]

    # ── RED-1: metadata-схема ────────────────────────────────────────────────

    def test_metadata_process_layer_written_for_bpmn_xml(self):
        r_as_is = self._index_session(self.sess_as_is)
        r_to_be = self._index_session(self.sess_to_be)
        self.assertTrue(r_as_is["was_updated"])
        self.assertTrue(r_to_be["was_updated"])
        self.assertGreater(r_as_is["chunks_created"], 0)
        self.assertGreater(r_to_be["chunks_created"], 0)

        metas_as_is = self._chunk_metadata(r_as_is["doc_id"])
        metas_to_be = self._chunk_metadata(r_to_be["doc_id"])
        self.assertTrue(metas_as_is)
        self.assertTrue(metas_to_be)
        for m in metas_as_is:
            self.assertEqual(m.get("process_layer"), "as_is")
            self.assertEqual(m.get("session_id"), self.sess_as_is)
            self.assertEqual(m.get("session_title"), "Sess AS IS")
            self.assertEqual(m.get("source_type"), "bpmn_xml")
        for m in metas_to_be:
            self.assertEqual(m.get("process_layer"), "to_be")
            self.assertEqual(m.get("session_id"), self.sess_to_be)
            self.assertEqual(m.get("source_type"), "bpmn_xml")

    # ── RED-2: фильтр search ─────────────────────────────────────────────────

    def test_search_filter_by_process_layer(self):
        self._index_session(self.sess_as_is)
        self._index_session(self.sess_to_be)

        filtered = self._search("нарезка", process_layer="to_be")
        self.assertTrue(filtered["ok"])
        self.assertGreater(filtered["total"], 0)
        for r in filtered["results"]:
            self.assertEqual(r["metadata"].get("process_layer"), "to_be")

        unfiltered = self._search("нарезка")
        layers = {r["metadata"].get("process_layer") for r in unfiltered["results"]}
        self.assertIn("as_is", layers)
        self.assertIn("to_be", layers)

    def test_search_rejects_invalid_process_layer(self):
        from fastapi import HTTPException

        with self.assertRaises(HTTPException) as ctx:
            self._search("нарезка", process_layer="bogus")
        self.assertEqual(ctx.exception.status_code, 422)

    # ── RED-3: enforcement indexing_enabled ──────────────────────────────────

    def test_indexing_disabled_gate_blocks_writes(self):
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute(
                "INSERT INTO rag_settings (org_id, enabled, indexing_enabled) VALUES (?, 1, 0)",
                [self.org_id],
            )
            con.commit()

        from app.rag.indexer import index_document

        r = index_document(
            org_id=self.org_id,
            source_type="bpmn_xml",
            source_id="sess_gate",
            content=XML,
            metadata={"source_type": "bpmn_xml"},
        )
        self.assertEqual(r["chunks_created"], 0)
        self.assertFalse(r["was_updated"])
        self.assertEqual(r.get("skipped"), "rag_indexing_disabled")

        con = sqlite3.connect(str(self._db_path()))
        n = con.execute("SELECT COUNT(*) FROM rag_chunks WHERE org_id=?", [self.org_id]).fetchone()[0]
        con.close()
        self.assertEqual(n, 0)

        with sqlite3.connect(str(self._db_path())) as con:
            con.execute("UPDATE rag_settings SET indexing_enabled=1 WHERE org_id=?", [self.org_id])
            con.commit()
        r2 = index_document(
            org_id=self.org_id,
            source_type="bpmn_xml",
            source_id="sess_gate",
            content=XML,
            metadata={"source_type": "bpmn_xml"},
        )
        self.assertGreater(r2["chunks_created"], 0)

    def test_disabled_gate_blocks_all_source_types(self):
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute(
                "INSERT INTO rag_settings (org_id, enabled, indexing_enabled) VALUES (?, 1, 0)",
                [self.org_id],
            )
            con.commit()

        from app.rag.indexer import index_document

        for source_type, content in (
            ("product_action", [{"action_type": "упаковка"}]),
            ("glossary", {"version": 1, "terms": [{"term": "нож", "definition": "инструмент"}]}),
        ):
            r = index_document(
                org_id=self.org_id,
                source_type=source_type,
                source_id=f"src_{source_type}",
                content=content,
                metadata={"source_type": source_type},
            )
            self.assertEqual(r["chunks_created"], 0, source_type)

    # ── RED-4: org-изоляция фильтра ──────────────────────────────────────────

    def test_search_filter_org_isolation(self):
        self._index_session(self.sess_as_is)
        self._index_session(self.sess_to_be)
        sess_b = self._seed_session("Sess B TO BE", "to_be", self.org_b)
        self._index_session(sess_b, self.org_b)

        cross = self._search("нарезка", org_id=self.org_id, process_layer="to_be")
        for r in cross["results"]:
            self.assertEqual(r["metadata"].get("session_id"), self.sess_to_be)

        own = self._search("нарезка", org_id=self.org_b, process_layer="to_be")
        self.assertGreater(own["total"], 0)
        for r in own["results"]:
            self.assertEqual(r["metadata"].get("session_id"), sess_b)

    # ── RED-5: backfill idempotent ───────────────────────────────────────────

    def _seed_legacy_doc(self, source_id: str, source_type: str, org_id: str, meta: dict) -> str:
        con = sqlite3.connect(str(self._db_path()))
        doc_id = f"doc-legacy-{source_id}"
        now = 1
        con.execute(
            "INSERT INTO rag_documents (doc_id, org_id, source_type, source_id, source_version, content_hash, content_text, metadata_json, created_at, updated_at, is_active) VALUES (?,?,?,?,?,?,?,?,?,?,1)",
            [doc_id, org_id, source_type, source_id, None, "h1", "text", json.dumps(meta, ensure_ascii=False), now, now],
        )
        con.execute(
            "INSERT INTO rag_chunks (chunk_id, doc_id, org_id, chunk_index, chunk_text, token_count, metadata_json, created_at) VALUES (?,?,?,?,?,?,?,?)",
            [f"chunk-legacy-{source_id}", doc_id, org_id, 0, "legacy chunk text", 3, json.dumps(meta, ensure_ascii=False), now],
        )
        con.commit()
        con.close()
        return doc_id

    def test_backfill_metadata_idempotent(self):
        self._seed_session("Backfill TO BE", "to_be", self.org_id)
        legacy_meta = {
            "source_type": "bpmn_xml",
            "source_id": self.sess_to_be,
            "session_id": self.sess_to_be,
        }
        doc_id = self._seed_legacy_doc(self.sess_to_be, "bpmn_xml", self.org_id, legacy_meta)
        dict_meta = {"source_type": "property_dictionary", "source_id": "system"}
        dict_doc_id = self._seed_legacy_doc("system", "property_dictionary", self.org_id, dict_meta)

        from app.rag_tasks import _do_backfill_rag_metadata

        r1 = _do_backfill_rag_metadata(self.org_id)
        self.assertGreater(r1["updated"], 0)

        metas = self._chunk_metadata(doc_id)
        self.assertTrue(metas)
        for m in metas:
            self.assertEqual(m.get("process_layer"), "to_be")
            self.assertEqual(m.get("session_title"), "Sess TO BE")
            self.assertEqual(m.get("source_type"), "bpmn_xml")

        dict_metas = self._chunk_metadata(dict_doc_id)
        self.assertEqual(dict_metas[0], dict_meta, "dictionary chunks must stay untouched")

        r2 = _do_backfill_rag_metadata(self.org_id)
        self.assertEqual(r2["updated"], 0, "second run must be a no-op")
        self.assertEqual(self._chunk_metadata(dict_doc_id)[0], dict_meta)

    def test_backfill_treats_missing_session_as_as_is(self):
        legacy_meta = {"source_type": "bpmn_xml", "source_id": "sess_gone", "session_id": "sess_gone"}
        doc_id = self._seed_legacy_doc("sess_gone", "bpmn_xml", self.org_id, legacy_meta)

        from app.rag_tasks import _do_backfill_rag_metadata

        r = _do_backfill_rag_metadata(self.org_id)
        self.assertGreater(r["updated"], 0)
        metas = self._chunk_metadata(doc_id)
        self.assertEqual(metas[0].get("process_layer"), "as_is")


if __name__ == "__main__":
    unittest.main()
