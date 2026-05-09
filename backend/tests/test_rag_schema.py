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


class RagSchemaTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmp.name) / "rag_schema.sqlite3")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        os.environ["PROCESS_DB_PATH"] = self.db_path
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name

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

    def _run_schema(self):
        import app.storage as storage
        importlib.reload(storage)
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""
        storage._ensure_schema()
        return storage

    def _get_tables_indexes(self):
        con = sqlite3.connect(self.db_path)
        tables = {
            row[0]
            for row in con.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        indexes = {
            row[0]
            for row in con.execute(
                "SELECT name FROM sqlite_master WHERE type='index'"
            ).fetchall()
        }
        con.close()
        return tables, indexes

    def test_all_rag_tables_created(self):
        self._run_schema()
        tables, _ = self._get_tables_indexes()
        for table in (
            "rag_documents",
            "rag_chunks",
            "rag_embeddings",
            "rag_sources",
            "rag_feedback",
            "rag_eval_cases",
        ):
            self.assertIn(table, tables, f"Missing table: {table}")

    def test_all_rag_indexes_created(self):
        self._run_schema()
        _, indexes = self._get_tables_indexes()
        for idx in (
            "idx_rag_docs_org_source",
            "idx_rag_docs_hash",
            "idx_rag_docs_active",
            "idx_rag_chunks_doc",
            "idx_rag_chunks_org",
            "idx_rag_embed_chunk",
            "idx_rag_embed_org_model",
            "idx_rag_sources_org",
        ):
            self.assertIn(idx, indexes, f"Missing index: {idx}")

    def test_rag_documents_columns(self):
        self._run_schema()
        con = sqlite3.connect(self.db_path)
        cols = {row[1] for row in con.execute("PRAGMA table_info(rag_documents)").fetchall()}
        con.close()
        for col in (
            "doc_id", "org_id", "source_type", "source_id", "source_version",
            "content_hash", "content_text", "metadata_json", "created_at", "updated_at", "is_active",
        ):
            self.assertIn(col, cols, f"Missing column rag_documents.{col}")

    def test_rag_chunks_columns(self):
        self._run_schema()
        con = sqlite3.connect(self.db_path)
        cols = {row[1] for row in con.execute("PRAGMA table_info(rag_chunks)").fetchall()}
        con.close()
        for col in ("chunk_id", "doc_id", "org_id", "chunk_index", "chunk_text", "token_count", "metadata_json", "created_at"):
            self.assertIn(col, cols, f"Missing column rag_chunks.{col}")

    def test_idempotent_double_call(self):
        import app.storage as storage
        importlib.reload(storage)
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""
        storage._ensure_schema()
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""
        storage._ensure_schema()
        tables, indexes = self._get_tables_indexes()
        self.assertIn("rag_documents", tables)
        self.assertIn("idx_rag_docs_hash", indexes)


if __name__ == "__main__":
    unittest.main()
