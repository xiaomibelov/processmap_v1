"""Регрессионный тест fix/rag-fullcorpus-window-v1.

Доказывает исправление СТОП-находки STAGE_HYBRID_STATUS.md (2026-09-07):
полнокорпусный (unfiltered) rag_search больше не теряет малые org-wide
референс-корпуса из-за окна `ORDER BY created_at ASC LIMIT 2000`.

(i)  org с >2000 СТАРЫХ bpmn_xml-чанков: unfiltered запрос к glossary обязан
     давать hit в обоих режимах — BM25 (hybrid off) и hybrid (hybrid on,
     sidecar застаблен).
(ii) окно для больших корпусов сохранено: bpmn_xml по-прежнему ограничен
     _MAX_CHUNKS_LOAD — защита от «грузим весь корпус в память».

Паттерн сетапа — как в test_rag_hybrid_api.py (sqlite-tempdir, reload storage).
"""
import importlib
import os
import sqlite3
import sys
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

BPMN_CHUNKS = 2100  # > _MAX_CHUNKS_LOAD=2000, все старше словаря
OLD_TS = 1700000000  # bpmn_xml «старые», glossary индексируется «сейчас»


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class RagFullcorpusWindowTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._saved_env = {
            k: os.environ.get(k)
            for k in ("PROCESS_DB_PATH", "PROCESS_STORAGE_DIR", "FPC_DB_BACKEND", "DATABASE_URL")
        }
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp.name) / "rag_window.sqlite3")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-secret")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")

        import app.storage as storage
        importlib.reload(storage)
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""
        storage._ensure_schema()

        from app.auth import create_user
        from app.storage import get_default_org_id

        self.org_id = get_default_org_id()
        self.user = create_user("rag-window@local", "rag-window", is_admin=False)
        with sqlite3.connect(os.environ["PROCESS_DB_PATH"]) as con:
            con.execute(
                "INSERT OR REPLACE INTO org_memberships (org_id, user_id, role, created_at) VALUES (?,?,?,strftime('%s','now'))",
                [self.org_id, str(self.user.get("id")), "org_admin"],
            )
            con.commit()

        from app.routers.rag import rag_search

        self.rag_search = rag_search

        # Малый org-wide референс-корпус: glossary, «свежий» created_at.
        from app.rag.indexer import index_document

        res = index_document(
            org_id=self.org_id,
            source_type="glossary",
            source_id="glossary",
            content={"equipment": [{
                "title": "Шокер",
                "canon": "blast_chiller_1",
                "aliases": ["шокфростер", "аппарат шоковой заморозки"],
            }]},
        )
        self.assertTrue(res["chunks_created"] > 0, res)

        # Большой монотонно растущий корпус: >2000 bpmn_xml-чанков, СТАРЫЕ ts.
        self._seed_old_bpmn_chunks(BPMN_CHUNKS)

        # sidecar-стаб для hybrid-режима
        import app.rag.embeddings as emb_mod

        self._orig_get_query_embedding = emb_mod.get_query_embedding
        emb_mod.get_query_embedding = lambda text: ([0.1] * 8, "local-e5-small", 8)
        with emb_mod._state_lock:
            emb_mod._failures = 0
            emb_mod._cooldown_until = 0.0

    def tearDown(self):
        import app.rag.embeddings as emb_mod

        emb_mod.get_query_embedding = self._orig_get_query_embedding
        self.tmp.cleanup()
        for key, val in self._saved_env.items():
            if val is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = val
        import app.storage as storage

        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""

    # ── helpers ─────────────────────────────────────────────────────────────

    def _seed_old_bpmn_chunks(self, n: int):
        import uuid
        with sqlite3.connect(os.environ["PROCESS_DB_PATH"]) as con:
            doc_id = str(uuid.uuid4())
            now = int(time.time())
            con.execute(
                "INSERT INTO rag_documents (doc_id, org_id, source_type, source_id, source_version, content_hash, content_text, metadata_json, created_at, updated_at, is_active)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,1)",
                [doc_id, self.org_id, "bpmn_xml", "sess_bulk", 1, "h", "bulk", "{}", OLD_TS, now],
            )
            con.executemany(
                "INSERT INTO rag_chunks (chunk_id, doc_id, org_id, chunk_index, chunk_text, token_count, metadata_json, created_at)"
                " VALUES (?,?,?,?,?,?,?,?)",
                [
                    (
                        str(uuid.uuid4()), doc_id, self.org_id, i,
                        f"<bpmn:task id='t{i}' name='Операция {i}'/> bpmn xml схема процесса",
                        20, '{"source_type":"bpmn_xml","source_id":"sess_bulk"}', OLD_TS + i,
                    )
                    for i in range(n)
                ],
            )
            con.commit()

    def _set_hybrid(self, enabled: int):
        with sqlite3.connect(os.environ["PROCESS_DB_PATH"]) as con:
            con.execute(
                """
                INSERT INTO rag_settings (org_id, enabled, hybrid_enabled, bm25_weight, vector_weight, embedding_model_id)
                VALUES (?, 1, ?, 0.5, 0.5, 'local-e5-small')
                ON CONFLICT(org_id) DO UPDATE SET hybrid_enabled=?
                """,
                [self.org_id, enabled, enabled],
            )
            con.commit()

    def _search(self, q: str):
        return self.rag_search(
            request=_DummyRequest(self.user, active_org_id=self.org_id),
            q=q, top_k=5, source_type=None, session_id=None, min_score=0.0,
        )

    # ── тесты ───────────────────────────────────────────────────────────────

    def test_unfiltered_glossary_hit_bm25_with_2100_older_bpmn_chunks(self):
        """(i) BM25: glossary виден в unfiltered-поиске, хотя он «новее» окна."""
        self._set_hybrid(0)
        resp = self._search("шокер")
        self.assertTrue(resp.get("ok"), resp)
        types = {r.get("source_type") for r in resp.get("results", [])}
        self.assertIn("glossary", types, resp)

    def test_unfiltered_glossary_hit_hybrid_with_2100_older_bpmn_chunks(self):
        """(i) hybrid: тот же hit при hybrid_enabled=1 (sidecar застаблен)."""
        self._set_hybrid(1)
        resp = self._search("шокер")
        self.assertTrue(resp.get("ok"), resp)
        types = {r.get("source_type") for r in resp.get("results", [])}
        self.assertIn("glossary", types, resp)

    def test_window_cap_still_applies_to_big_corpus(self):
        """(ii) окно для больших корпусов сохранено: bpmn_xml ≤ 2000 в загрузке."""
        from app.rag.storage_rag import list_rag_chunks

        chunks = list_rag_chunks(self.org_id, limit=2000)
        bpmn = [c for c in chunks
                if "bpmn_xml" in (c.get("metadata_json") or "")]
        glossary = [c for c in chunks
                    if '"glossary"' in (c.get("metadata_json") or "")]
        self.assertLessEqual(len(bpmn), 2000, "окно большого корпуса превышено")
        self.assertGreater(len(glossary), 0, "малый референс-корпус потерян")
        total_bpmn = sqlite3.connect(os.environ["PROCESS_DB_PATH"]).execute(
            "SELECT COUNT(*) FROM rag_chunks"
        ).fetchone()[0]
        self.assertGreater(total_bpmn, 2000, "тест не воспроизводит >2000 чанков")


if __name__ == "__main__":
    unittest.main()
