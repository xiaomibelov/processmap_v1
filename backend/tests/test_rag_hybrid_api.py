"""Integration-тесты hybrid retrieval (sqlite-tempdir, stub sidecar).

Паттерн — как в test_rag_api.py: изолированная sqlite-БД на тест,
importlib.reload(app.storage), _DummyRequest. Sidecar (rag-embeddings) не нужен:
app.rag.embeddings.get_query_embedding застаблен детерминированными векторами.
"""
import asyncio
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


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


# Перефраз без лексического пересечения с glossary-чанком blast_chiller:
# BM25-нога пустая/слабая, результат достаётся векторной ногой.
PERIPHRASE_QUERY = "аппарат для быстрой заморозки продуктов"
KEYWORD_QUERY = "шокер"

DIM = 8
QUERY_VEC = [1.0, 0.9, 0.8, 0.7, 0.1, 0.1, 0.1, 0.1]
NEAR_VEC = [0.95, 0.85, 0.75, 0.65, 0.1, 0.1, 0.1, 0.1]
FAR_VEC = [0.1, 0.1, 0.1, 0.1, 0.7, 0.8, 0.9, 1.0]


class RagHybridApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._saved_env = {
            k: os.environ.get(k)
            for k in ("PROCESS_DB_PATH", "PROCESS_STORAGE_DIR", "FPC_DB_BACKEND", "DATABASE_URL")
        }
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp.name) / "rag_hybrid.sqlite3")
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
        from app.storage import _ensure_schema

        _ensure_schema()

        from app.auth import create_user
        from app.storage import get_default_org_id

        self.org_id = get_default_org_id()
        self.user = create_user("rag-hybrid@local", "rag-hybrid", is_admin=False)
        self.user_id = str(self.user.get("id") or "")
        self._insert_membership(self.org_id, self.user_id, "org_admin")
        self.admin_user = create_user("rag-hybrid-admin@local", "rag-hybrid-admin", is_admin=True)
        self.admin_id = str(self.admin_user.get("id") or "")

        self._ensure_operation_catalog_table()
        self._seed_operation_catalog()

        from app.routers.rag import RagIndexDictionariesIn, rag_index_dictionaries, rag_search

        self.rag_search = rag_search
        self.rag_index_dictionaries = rag_index_dictionaries
        self.RagIndexDictionariesIn = RagIndexDictionariesIn

        from app.routers.admin import admin_rag_get_settings, admin_rag_patch_settings

        self.admin_get_settings = admin_rag_get_settings
        self.admin_patch_settings = admin_rag_patch_settings

        # Индексируем org-словари (glossary/property_dictionary/operation_catalog).
        inp = self.RagIndexDictionariesIn(force=False)
        result = self.rag_index_dictionaries(inp, self._req())
        self.assertTrue(result.get("ok"), result)

        from app.rag.storage_rag import list_rag_chunks

        self.chunks = list_rag_chunks(self.org_id, limit=2000)
        self.assertGreater(len(self.chunks), 0)
        blast = [c for c in self.chunks if "blast_chiller" in (c.get("chunk_text") or "")]
        self.assertTrue(blast, "glossary-чанк blast_chiller не проиндексирован")
        self.blast_chunk_ids = {c["chunk_id"] for c in blast}

        self._sidecar_calls = 0
        self._patch_sidecar(lambda text: (QUERY_VEC, "local-e5-small", DIM))

    def tearDown(self):
        self.tmp.cleanup()
        for key, val in self._saved_env.items():
            if val is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = val

        import app.storage as storage

        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""

    # ── helpers ──────────────────────────────────────────────────────────────

    def _patch_sidecar(self, fn):
        import app.rag.embeddings as emb_mod

        original = emb_mod.get_query_embedding

        def _wrapper(text):
            self._sidecar_calls += 1
            return fn(text)

        emb_mod.get_query_embedding = _wrapper
        self.addCleanup(setattr, emb_mod, "get_query_embedding", original)
        with emb_mod._state_lock:
            emb_mod._failures = 0
            emb_mod._cooldown_until = 0.0

    def _insert_membership(self, org_id, user_id, role):
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute(
                "INSERT OR REPLACE INTO org_memberships (org_id, user_id, role, created_at) VALUES (?,?,?,strftime('%s','now'))",
                [org_id, user_id, role],
            )
            con.commit()

    def _db_path(self) -> Path:
        return Path(os.environ["PROCESS_DB_PATH"])

    def _req(self):
        return _DummyRequest(self.user, active_org_id=self.org_id)

    def _admin_req(self):
        return _DummyRequest(
            {"id": self.admin_id, "email": "rag-hybrid-admin@local", "is_admin": True},
            active_org_id=self.org_id,
        )

    def _search(self, q: str, **kwargs):
        return self.rag_search(
            request=self._req(),
            q=q,
            top_k=kwargs.get("top_k", 10),
            source_type=kwargs.get("source_type", None),
            session_id=kwargs.get("session_id", None),
            min_score=kwargs.get("min_score", 0.0),
        )

    def _set_hybrid(self, enabled: int, bm25_weight=0.5, vector_weight=0.5):
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute(
                """
                INSERT INTO rag_settings (org_id, enabled, hybrid_enabled, bm25_weight, vector_weight, embedding_model_id)
                VALUES (?, 1, ?, ?, ?, 'local-e5-small')
                ON CONFLICT(org_id) DO UPDATE SET hybrid_enabled=?, bm25_weight=?, vector_weight=?
                """,
                [self.org_id, enabled, bm25_weight, vector_weight, enabled, bm25_weight, vector_weight],
            )
            con.commit()

    def _seed_embeddings(self):
        from app.rag.embeddings import encode_vector
        from app.rag.storage_rag import upsert_rag_embeddings

        rows = []
        for chunk in self.chunks:
            near = chunk["chunk_id"] in self.blast_chunk_ids
            vec = NEAR_VEC if near else FAR_VEC
            rows.append({
                "chunk_id": chunk["chunk_id"],
                "org_id": self.org_id,
                "model_id": "local-e5-small",
                "vector": encode_vector(vec),
                "dimensions": DIM,
            })
        return upsert_rag_embeddings(rows)

    def _delete_embeddings(self):
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute("DELETE FROM rag_embeddings")
            con.commit()

    def _ensure_operation_catalog_table(self):
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS operation_catalog (
                    id TEXT PRIMARY KEY,
                    code TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    name_ru TEXT,
                    parameter_schema TEXT,
                    allowed_outputs TEXT,
                    execution_contract TEXT,
                    resource_requirements TEXT,
                    category TEXT
                )
                """
            )
            con.commit()

    def _seed_operation_catalog(self):
        op = {
            "code": "open_container",
            "name": "Open Container",
            "name_ru": "Вскрыть контейнер",
            "parameter_schema": {
                "container_id": {"type": "string", "required": True},
                "open_method": {"type": "string", "required": False, "default": "auto"},
            },
            "allowed_outputs": [{"name": "container_opened", "type": "success"}],
            "execution_contract": {"preconditions": ["container_closed"], "postconditions": ["container_open"], "checks": ["safety_check"]},
            "resource_requirements": {"equipment": ["container_opener"], "containers": ["target_container"], "time_estimate_sec": 15},
            "category": "container",
        }
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute(
                """
                INSERT OR REPLACE INTO operation_catalog
                (id, code, name, name_ru, parameter_schema, allowed_outputs, execution_contract, resource_requirements, category)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    "op_open_container", op["code"], op["name"], op["name_ru"],
                    json.dumps(op["parameter_schema"]), json.dumps(op["allowed_outputs"]),
                    json.dumps(op["execution_contract"]), json.dumps(op["resource_requirements"]), op["category"],
                ],
            )
            con.commit()

    async def _patch(self, request, body):
        class _FakeRequest:
            def __init__(self, req, b):
                self.state = req.state
                self.headers = req.headers
                self._body = b

            async def json(self):
                return self._body

        return await self.admin_patch_settings(_FakeRequest(request, body))

    def _run_patch(self, request, body):
        return asyncio.get_event_loop().run_until_complete(self._patch(request, body))

    @staticmethod
    def _simplified(out):
        return [(r["chunk_id"], round(float(r["score"]), 6)) for r in out["results"]]

    # ── fusion end-to-end ────────────────────────────────────────────────────

    def test_fusion_periphrase_surfaces_glossary_chunk_top(self):
        self._set_hybrid(1)
        self.assertGreater(self._seed_embeddings(), 0)

        out = self._search(PERIPHRASE_QUERY)
        self.assertTrue(out["ok"])
        self.assertGreaterEqual(out["total"], 1)
        top = out["results"][0]
        self.assertIn(top["chunk_id"], self.blast_chunk_ids, "glossary-чанк blast_chiller должен быть первым")
        self.assertGreater(top["score"], 0.0)
        self.assertEqual(self._sidecar_calls, 1)

        # Тот же запрос keyword-only: blast-чанк не на первом месте (BM25 мажет по перефразу).
        self._set_hybrid(0)
        keyword_out = self._search(PERIPHRASE_QUERY)
        self.assertTrue(keyword_out["ok"])
        if keyword_out["results"]:
            self.assertNotIn(keyword_out["results"][0]["chunk_id"], self.blast_chunk_ids)

    def test_fusion_keyword_query_still_works(self):
        # Прямой keyword-запрос: hybrid не ломает BM25-попадание.
        self._set_hybrid(1)
        self._seed_embeddings()

        out = self._search(KEYWORD_QUERY)
        self.assertTrue(out["ok"])
        self.assertGreaterEqual(out["total"], 1)
        found_blast = any(r["chunk_id"] in self.blast_chunk_ids for r in out["results"])
        self.assertTrue(found_blast, "прямой запрос «шокер» должен находить glossary-чанк")

    # ── degradation ──────────────────────────────────────────────────────────

    def test_degradation_sidecar_down_returns_keyword_only(self):
        self._set_hybrid(1)
        self._seed_embeddings()
        self._patch_sidecar(lambda text: None)  # sidecar недоступен

        out_on = self._search(PERIPHRASE_QUERY)
        self.assertTrue(out_on["ok"])

        self._set_hybrid(0)
        out_off = self._search(PERIPHRASE_QUERY)
        self.assertEqual(self._simplified(out_on), self._simplified(out_off))

    def test_degradation_empty_embeddings_returns_keyword_only(self):
        self._set_hybrid(1)
        self._delete_embeddings()

        out_on = self._search(PERIPHRASE_QUERY)
        self.assertTrue(out_on["ok"])

        self._set_hybrid(0)
        out_off = self._search(PERIPHRASE_QUERY)
        self.assertEqual(self._simplified(out_on), self._simplified(out_off))

    def test_regression_hybrid_off_never_calls_sidecar(self):
        self._set_hybrid(0)
        self._seed_embeddings()  # эмбеддинги есть — но не должны использоваться
        calls_before = self._sidecar_calls

        out = self._search(KEYWORD_QUERY)
        self.assertTrue(out["ok"])
        self.assertGreaterEqual(out["total"], 1)
        self.assertEqual(self._sidecar_calls, calls_before, "hybrid off: sidecar вызываться не должен")

    # ── admin settings wiring ────────────────────────────────────────────────

    def test_admin_patch_whitelists_new_fields_and_persists(self):
        result = self._run_patch(
            self._admin_req(),
            {"hybrid_enabled": 1, "bm25_weight": 0.7, "vector_weight": 0.3, "embedding_model_id": "local-e5-small"},
        )
        self.assertTrue(result.get("ok"), result)
        self.assertTrue(result.get("updated"))
        s = result["settings"]
        self.assertEqual(s["hybrid_enabled"], True)
        self.assertAlmostEqual(s["bm25_weight"], 0.7)
        self.assertAlmostEqual(s["vector_weight"], 0.3)
        self.assertEqual(s["embedding_model_id"], "local-e5-small")
        # Derived-флаги: embeddings участвуют в поиске ровно при hybrid on.
        self.assertEqual(s["embeddings_enabled"], True)
        self.assertEqual(s["vector_search_enabled"], True)

        from app.storage import get_rag_settings

        settings = get_rag_settings(self.org_id)
        self.assertEqual(settings["hybrid_enabled"], True)
        self.assertAlmostEqual(settings["bm25_weight"], 0.7)
        self.assertAlmostEqual(settings["vector_weight"], 0.3)
        self.assertEqual(settings["embedding_model_id"], "local-e5-small")

        got = self.admin_get_settings(self._admin_req())
        self.assertTrue(got.get("ok"))
        self.assertEqual(got["settings"]["hybrid_enabled"], True)
        self.assertEqual(got["settings"]["embeddings_enabled"], True)

    def test_admin_patch_still_rejects_unknown_and_invariant_fields(self):
        unknown = self._run_patch(self._admin_req(), {"unknown_field": 1})
        self.assertEqual(unknown.status_code, 400)

        invariant = self._run_patch(self._admin_req(), {"embeddings_enabled": True})
        self.assertEqual(invariant.status_code, 400)

        invariant2 = self._run_patch(self._admin_req(), {"vector_search_enabled": True})
        self.assertEqual(invariant2.status_code, 400)

    def test_admin_patch_rejects_bad_weight_and_empty_model_id(self):
        bad_weight = self._run_patch(self._admin_req(), {"bm25_weight": "abc"})
        self.assertEqual(bad_weight.status_code, 400)

        negative_weight = self._run_patch(self._admin_req(), {"vector_weight": -0.1})
        self.assertEqual(negative_weight.status_code, 400)

        empty_model = self._run_patch(self._admin_req(), {"embedding_model_id": ""})
        self.assertEqual(empty_model.status_code, 400)


if __name__ == "__main__":
    unittest.main()
