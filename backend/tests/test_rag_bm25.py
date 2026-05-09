import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.rag.search import BM25Index

ORG_A = "org_alpha"
ORG_B = "org_beta"

DOCS_A = [
    {"chunk_id": "a1", "org_id": ORG_A, "chunk_text": "нарезка куриная грудка нож подготовка", "metadata_json": "{}"},
    {"chunk_id": "a2", "org_id": ORG_A, "chunk_text": "перетаривание рис контейнер разогрев", "metadata_json": "{}"},
    {"chunk_id": "a3", "org_id": ORG_A, "chunk_text": "вскрытие упаковка рыбы надрез ножом", "metadata_json": "{}"},
]
DOCS_B = [
    {"chunk_id": "b1", "org_id": ORG_B, "chunk_text": "нарезка морковь овощи кухня", "metadata_json": "{}"},
    {"chunk_id": "b2", "org_id": ORG_B, "chunk_text": "упаковка готовое блюдо контейнер", "metadata_json": "{}"},
]


class BM25IndexTests(unittest.TestCase):
    def _build_index(self) -> BM25Index:
        idx = BM25Index()
        idx.add_documents(DOCS_A + DOCS_B)
        return idx

    def test_search_returns_results(self):
        idx = self._build_index()
        results = idx.search("нарезка куриная", org_id=ORG_A)
        self.assertGreater(len(results), 0)

    def test_org_isolation_a_never_sees_b(self):
        idx = self._build_index()
        results = idx.search("нарезка контейнер упаковка", org_id=ORG_A)
        for r in results:
            self.assertEqual(r["org_id"], ORG_A, f"Org B doc leaked into org A results: {r['chunk_id']}")

    def test_org_isolation_b_never_sees_a(self):
        idx = self._build_index()
        results = idx.search("нарезка рис рыбы", org_id=ORG_B)
        for r in results:
            self.assertEqual(r["org_id"], ORG_B, f"Org A doc leaked into org B results: {r['chunk_id']}")

    def test_exact_match_scores_highest(self):
        idx = self._build_index()
        results = idx.search("куриная грудка нарезка", org_id=ORG_A, top_k=3)
        self.assertGreater(len(results), 0)
        self.assertEqual(results[0]["chunk_id"], "a1", "Exact-match doc should rank first")

    def test_top_k_respected(self):
        idx = self._build_index()
        results = idx.search("нарезка", org_id=ORG_A, top_k=1)
        self.assertLessEqual(len(results), 1)

    def test_results_sorted_by_score_desc(self):
        idx = self._build_index()
        results = idx.search("нарезка", org_id=ORG_A, top_k=3)
        scores = [r["score"] for r in results]
        self.assertEqual(scores, sorted(scores, reverse=True))

    def test_no_results_for_unknown_query(self):
        idx = self._build_index()
        results = idx.search("zxqwerty_unknown_token_xyz", org_id=ORG_A)
        self.assertEqual(results, [])

    def test_empty_index_returns_nothing(self):
        idx = BM25Index()
        results = idx.search("anything", org_id=ORG_A)
        self.assertEqual(results, [])

    def test_min_score_filter(self):
        idx = self._build_index()
        results_low = idx.search("нарезка", org_id=ORG_A, min_score=0.0)
        results_high = idx.search("нарезка", org_id=ORG_A, min_score=999.0)
        self.assertGreater(len(results_low), 0)
        self.assertEqual(results_high, [])

    def test_result_fields_present(self):
        idx = self._build_index()
        results = idx.search("рис", org_id=ORG_A)
        for r in results:
            self.assertIn("chunk_id", r)
            self.assertIn("score", r)
            self.assertIn("chunk_text", r)
            self.assertIn("metadata", r)
            self.assertIn("org_id", r)


if __name__ == "__main__":
    unittest.main()
