import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import app.routers.rag as rag_router_module
from app.rag.embeddings import encode_vector
from app.rag.search import BM25Index, _decode_vector, fuse_rrf, rank_by_vector

ORG = "org_alpha"

DOCS = [
    {"chunk_id": "a", "org_id": ORG, "chunk_text": "нарезка куриная грудка нож подготовка", "metadata_json": "{}"},
    {"chunk_id": "b", "org_id": ORG, "chunk_text": "перетаривание рис контейнер разогрев", "metadata_json": "{}"},
    {"chunk_id": "c", "org_id": ORG, "chunk_text": "вскрытие упаковка рыбы надрез ножом", "metadata_json": "{}"},
]

# 8-мерные детерминированные «псевдо-эмбеддинги»: a близок к запросу, b/c — далеко.
QUERY_VEC = [1.0, 0.9, 0.8, 0.7, 0.1, 0.1, 0.1, 0.1]
FAR_VEC = [0.1, 0.1, 0.1, 0.1, 0.7, 0.8, 0.9, 1.0]
EMBEDDINGS = {
    "a": (encode_vector([0.95, 0.85, 0.75, 0.65, 0.1, 0.1, 0.1, 0.1]), 8),
    "b": (encode_vector(FAR_VEC), 8),
    "c": (encode_vector(FAR_VEC), 8),
}


def _bm25_shelf(q: str) -> list:
    idx = BM25Index()
    idx.add_documents(DOCS)
    return idx.search(q, org_id=ORG, top_k=len(DOCS), min_score=0.0)


class FuseRrfTests(unittest.TestCase):
    def test_doc_in_both_shelves_beats_top_of_single_shelf(self):
        bm25 = [("a", 5.0), ("b", 4.0), ("c", 3.0)]
        vec = [("b", 0.99), ("c", 0.9)]  # "a" в векторной полке отсутствует
        fused = fuse_rrf(bm25, vec, 0.5, 0.5)
        self.assertEqual(fused[0], "b", "Документ в обеих полках должен быть первым")

    def test_k60_sanity_identical_shelves_keep_order(self):
        bm25 = [("a", 3.0), ("b", 2.0), ("c", 1.0)]
        vec = [("a", 0.9), ("b", 0.8), ("c", 0.7)]
        fused = fuse_rrf(bm25, vec, 0.5, 0.5, k=60)
        self.assertEqual(fused, ["a", "b", "c"])

    def test_zero_weight_leg_contributes_nothing(self):
        bm25 = [("a", 5.0), ("b", 4.0), ("c", 3.0)]
        vec = [("c", 0.99), ("b", 0.9)]
        self.assertEqual(fuse_rrf(bm25, vec, 1.0, 0.0), ["a", "b", "c"])
        self.assertEqual(fuse_rrf(bm25, vec, 0.0, 1.0), ["c", "b", "a"])

    def test_vector_dominant_weight_reorders_toward_vector_leg(self):
        bm25 = [("a", 5.0), ("b", 4.0)]
        vec = [("b", 0.99), ("a", 0.5)]
        fused = fuse_rrf(bm25, vec, 0.1, 0.9)
        self.assertEqual(fused[0], "b")

    def test_missing_vector_leg_keeps_bm25_order(self):
        bm25 = [("a", 5.0), ("b", 4.0), ("c", 3.0)]
        self.assertEqual(fuse_rrf(bm25, [], 0.5, 0.5), ["a", "b", "c"])

    def test_empty_legs_return_empty(self):
        self.assertEqual(fuse_rrf([], [], 0.5, 0.5), [])

    def test_ties_do_not_crash(self):
        bm25 = [("a", 1.0), ("b", 1.0)]
        vec = [("a", 0.5), ("b", 0.5)]
        fused = fuse_rrf(bm25, vec, 0.5, 0.5)
        self.assertEqual(set(fused), {"a", "b"})


class RankByVectorTests(unittest.TestCase):
    def test_ranks_closest_first_and_skips_missing_embeddings(self):
        ranked = rank_by_vector(["a", "b", "c", "missing"], EMBEDDINGS, QUERY_VEC)
        ids = [cid for cid, _ in ranked]
        self.assertIn("a", ids)
        self.assertNotIn("missing", ids)
        self.assertEqual(ids[0], "a")

    def test_cosines_descending_and_bounded(self):
        ranked = rank_by_vector(["a", "b"], EMBEDDINGS, QUERY_VEC)
        sims = [s for _, s in ranked]
        self.assertEqual(sims, sorted(sims, reverse=True))
        for s in sims:
            self.assertGreater(s, 0.0)
            self.assertLessEqual(s, 1.0 + 1e-6)

    def test_empty_query_or_embeddings_return_empty(self):
        self.assertEqual(rank_by_vector(["a"], EMBEDDINGS, []), [])
        self.assertEqual(rank_by_vector(["a"], {}, QUERY_VEC), [])

    def test_decode_roundtrip(self):
        original = [float(i) / 100 for i in range(384)]
        decoded = _decode_vector(encode_vector(original))
        self.assertEqual(len(decoded), 384)
        for x, y in zip(original, decoded):
            self.assertAlmostEqual(x, y, places=5)

    def test_decode_garbage_returns_empty(self):
        self.assertEqual(_decode_vector(b"\x01\x02"), [])
        self.assertEqual(_decode_vector(None), [])


class HybridScoreFormulaTests(unittest.TestCase):
    """Score-формула из routers/rag.py: max(bm25, cos*scale), scale guard.

    БД не нужна: get_rag_embeddings и get_query_embedding застаблены на уровне модулей.
    """

    def _fused(self, q: str, embeddings, query_vec=QUERY_VEC, settings=None):
        import app.rag.embeddings as emb_mod

        settings = settings or {
            "hybrid_enabled": True,
            "bm25_weight": 0.5,
            "vector_weight": 0.5,
            "embedding_model_id": "local-e5-small",
        }
        original_q = emb_mod.get_query_embedding
        original_get = rag_router_module.get_rag_embeddings
        try:
            emb_mod.get_query_embedding = lambda text: (query_vec, "local-e5-small", 8)
            rag_router_module.get_rag_embeddings = lambda org, model, ids: embeddings
            idx = BM25Index()
            idx.add_documents(DOCS)
            return rag_router_module._hybrid_fused_results(q, ORG, settings, DOCS, idx)
        finally:
            emb_mod.get_query_embedding = original_q
            rag_router_module.get_rag_embeddings = original_get

    def test_vector_only_chunk_scored_in_bm25_scale(self):
        # "zx-no-token-overlap" не даёт BM25-вклада: чанк "a" выходит только по векторной ноге.
        fused = self._fused("zxqwerty_unknown_token_xyz", EMBEDDINGS)
        self.assertIsNotNone(fused)
        by_id = {r["chunk_id"]: r["score"] for r in fused}
        bm25_shelf = _bm25_shelf("zxqwerty_unknown_token_xyz")
        self.assertEqual(bm25_shelf, [])
        scale = 1.0  # guard: BM25-полка пуста -> scale=1.0
        expected_cos = rank_by_vector(["a"], EMBEDDINGS, QUERY_VEC)[0][1]
        self.assertAlmostEqual(by_id["a"], expected_cos * scale, places=5)

    def test_score_is_max_of_bm25_and_scaled_cos(self):
        q = "нарезка грудка"  # чанк "a" имеет BM25-вклад
        fused = self._fused(q, EMBEDDINGS)
        self.assertIsNotNone(fused)
        by_id = {r["chunk_id"]: r["score"] for r in fused}
        bm25_shelf = {r["chunk_id"]: r["score"] for r in _bm25_shelf(q)}
        scale = max(bm25_shelf.values())
        cos_a = rank_by_vector(["a"], EMBEDDINGS, QUERY_VEC)[0][1]
        self.assertAlmostEqual(by_id["a"], max(bm25_shelf["a"], cos_a * scale), places=5)
        self.assertGreater(by_id["a"], by_id.get("b", 0.0))

    def test_scale_uses_max_bm25_score_of_candidate_set(self):
        q = "нарезка грудка"
        fused = self._fused(q, EMBEDDINGS)
        by_id = {r["chunk_id"]: r["score"] for r in fused}
        bm25_shelf = {r["chunk_id"]: r["score"] for r in _bm25_shelf(q)}
        scale = max(bm25_shelf.values())
        cos_b = rank_by_vector(["b"], EMBEDDINGS, QUERY_VEC)[0][1]
        # b не имеет BM25-вклада для этого запроса? если имеет — max() всё равно согласован.
        self.assertAlmostEqual(by_id["b"], max(bm25_shelf.get("b", 0.0), cos_b * scale), places=5)


if __name__ == "__main__":
    unittest.main()
