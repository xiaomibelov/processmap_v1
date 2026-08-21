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

ORG_A = "org_alpha"
ORG_B = "org_beta"


class RagOrgIsolationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmp.name) / "isolation.sqlite3")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        os.environ["PROCESS_DB_PATH"] = self.db_path
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name

        import app.storage as storage
        importlib.reload(storage)
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""
        storage._ensure_schema()

    def tearDown(self):
        if self.old_db_path is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = self.old_db_path
        if self.old_storage_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_storage_dir
        self.tmp.cleanup()

    def _index_docs(self):
        from app.rag.indexer import index_document

        results = []
        results.append(index_document(
            org_id=ORG_A,
            source_type="bpmn_xml",
            source_id="sess_a1",
            content="<bpmn:userTask id='t1' name='Нарезка куриная грудка'/>",
            metadata={"session": "sess_a1"},
        ))
        results.append(index_document(
            org_id=ORG_A,
            source_type="product_action",
            source_id="sess_a2",
            content=[{"action_type": "перетаривание", "product_name": "рис", "step_id": "s1"}],
            metadata={"session": "sess_a2"},
        ))
        results.append(index_document(
            org_id=ORG_A,
            source_type="bpmn_xml",
            source_id="sess_a3",
            content="<bpmn:serviceTask id='t2' name='Вскрытие упаковки рыбы'/>",
            metadata={"session": "sess_a3"},
        ))
        results.append(index_document(
            org_id=ORG_B,
            source_type="bpmn_xml",
            source_id="sess_b1",
            content="<bpmn:userTask id='t3' name='Нарезка моркови'/>",
            metadata={"session": "sess_b1"},
        ))
        results.append(index_document(
            org_id=ORG_B,
            source_type="product_action",
            source_id="sess_b2",
            content=[{"action_type": "упаковка", "product_name": "готовое блюдо", "step_id": "s2"}],
            metadata={"session": "sess_b2"},
        ))
        return results

    def test_all_docs_indexed(self):
        results = self._index_docs()
        self.assertEqual(len(results), 5)
        for r in results:
            self.assertTrue(r["was_updated"])
            self.assertGreater(r["chunks_created"], 0)

    def test_rag_documents_org_isolation_at_db_level(self):
        self._index_docs()
        con = sqlite3.connect(self.db_path)
        rows_a = con.execute(
            "SELECT doc_id FROM rag_documents WHERE org_id=? AND is_active=1", [ORG_A]
        ).fetchall()
        rows_b = con.execute(
            "SELECT doc_id FROM rag_documents WHERE org_id=? AND is_active=1", [ORG_B]
        ).fetchall()
        con.close()
        self.assertEqual(len(rows_a), 3)
        self.assertEqual(len(rows_b), 2)

        ids_a = {r[0] for r in rows_a}
        ids_b = {r[0] for r in rows_b}
        self.assertEqual(ids_a & ids_b, set(), "doc_ids should not overlap between orgs")

    def test_rag_chunks_org_isolation_at_db_level(self):
        self._index_docs()
        con = sqlite3.connect(self.db_path)
        chunks_a = con.execute(
            "SELECT chunk_id FROM rag_chunks WHERE org_id=?", [ORG_A]
        ).fetchall()
        chunks_b = con.execute(
            "SELECT chunk_id FROM rag_chunks WHERE org_id=?", [ORG_B]
        ).fetchall()
        con.close()
        self.assertGreater(len(chunks_a), 0)
        self.assertGreater(len(chunks_b), 0)
        ids_a = {r[0] for r in chunks_a}
        ids_b = {r[0] for r in chunks_b}
        self.assertEqual(ids_a & ids_b, set(), "chunk_ids should not overlap between orgs")

    def test_bm25_search_org_isolation(self):
        self._index_docs()
        from app.rag.search import BM25Index
        from app.rag.storage_rag import list_rag_chunks

        chunks_a = list_rag_chunks(ORG_A)
        chunks_b = list_rag_chunks(ORG_B)
        all_chunks = chunks_a + chunks_b

        idx = BM25Index()
        idx.add_documents(all_chunks)

        results_a = idx.search("нарезка упаковка рис", org_id=ORG_A, top_k=10)
        for r in results_a:
            self.assertEqual(r["org_id"], ORG_A, f"Org B chunk leaked into org A results: {r['chunk_id']}")

        results_b = idx.search("нарезка упаковка рис", org_id=ORG_B, top_k=10)
        for r in results_b:
            self.assertEqual(r["org_id"], ORG_B, f"Org A chunk leaked into org B results: {r['chunk_id']}")

    def test_content_hash_dedup_skips_reindex(self):
        from app.rag.indexer import index_document

        r1 = index_document(
            org_id=ORG_A,
            source_type="bpmn_xml",
            source_id="sess_dedup",
            content="<bpmn:userTask id='t_dedup' name='Same content'/>",
        )
        r2 = index_document(
            org_id=ORG_A,
            source_type="bpmn_xml",
            source_id="sess_dedup",
            content="<bpmn:userTask id='t_dedup' name='Same content'/>",
        )
        self.assertTrue(r1["was_updated"])
        self.assertFalse(r2["was_updated"])
        self.assertEqual(r1["doc_id"], r2["doc_id"])

    def test_content_hash_change_reindexes(self):
        from app.rag.indexer import index_document

        r1 = index_document(
            org_id=ORG_A,
            source_type="bpmn_xml",
            source_id="sess_reindex",
            content="<bpmn:userTask id='t1' name='Version one'/>",
        )
        r2 = index_document(
            org_id=ORG_A,
            source_type="bpmn_xml",
            source_id="sess_reindex",
            content="<bpmn:userTask id='t1' name='Version two changed'/>",
        )
        self.assertTrue(r1["was_updated"])
        self.assertTrue(r2["was_updated"])
        self.assertEqual(r1["doc_id"], r2["doc_id"])

        con = sqlite3.connect(self.db_path)
        chunk_count = con.execute(
            "SELECT COUNT(*) FROM rag_chunks WHERE doc_id=? AND org_id=?",
            [r1["doc_id"], ORG_A],
        ).fetchone()[0]
        con.close()
        self.assertEqual(chunk_count, r2["chunks_created"])

    def test_soft_delete_hides_document(self):
        from app.rag.indexer import delete_document, index_document

        r = index_document(
            org_id=ORG_A,
            source_type="bpmn_xml",
            source_id="sess_delete",
            content="<bpmn:userTask id='td' name='To be deleted'/>",
        )
        deleted = delete_document(ORG_A, r["doc_id"])
        self.assertTrue(deleted)

        con = sqlite3.connect(self.db_path)
        row = con.execute(
            "SELECT is_active FROM rag_documents WHERE doc_id=?", [r["doc_id"]]
        ).fetchone()
        con.close()
        self.assertEqual(row[0], 0)


if __name__ == "__main__":
    unittest.main()
