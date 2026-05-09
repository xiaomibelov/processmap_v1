import json
import math
import re
from collections import Counter

_STOPWORDS = {
    "и", "в", "на", "с", "по", "для", "из", "от", "до", "при", "за", "к", "о",
    "не", "но", "а", "или", "что", "это", "как", "так", "все", "он", "она", "они",
    "the", "a", "an", "of", "in", "on", "at", "to", "for", "is", "are", "was",
    "were", "be", "been", "by", "with", "and", "or", "not", "this", "that", "it",
}


def _tokenize(text: str) -> list[str]:
    tokens = re.split(r"[^\w]+", text.lower(), flags=re.UNICODE)
    return [t for t in tokens if t and t not in _STOPWORDS and len(t) > 1]


class BM25Index:
    def __init__(self, k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self._docs: list[dict] = []
        self._tokenized: list[list[str]] = []
        self._df: Counter = Counter()
        self._avgdl: float = 0.0

    def add_documents(self, docs: list[dict]) -> None:
        for doc in docs:
            tokens = _tokenize(doc.get("chunk_text", ""))
            self._tokenized.append(tokens)
            self._docs.append(doc)
            for term in set(tokens):
                self._df[term] += 1
        total_len = sum(len(t) for t in self._tokenized)
        n = len(self._tokenized)
        self._avgdl = total_len / n if n > 0 else 1.0

    def _score(self, query_tokens: list[str], doc_tokens: list[str]) -> float:
        n = len(self._tokenized)
        tf_map = Counter(doc_tokens)
        dl = len(doc_tokens)
        score = 0.0
        for term in query_tokens:
            df = self._df.get(term, 0)
            if df == 0:
                continue
            idf = math.log((n - df + 0.5) / (df + 0.5) + 1)
            tf = tf_map.get(term, 0)
            numerator = tf * (self.k1 + 1)
            denominator = tf + self.k1 * (1 - self.b + self.b * dl / self._avgdl)
            score += idf * (numerator / denominator if denominator else 0)
        return score

    def search(
        self,
        query: str,
        org_id: str,
        top_k: int = 5,
        min_score: float = 0.0,
    ) -> list[dict]:
        query_tokens = _tokenize(query)
        if not query_tokens:
            return []

        results = []
        for i, doc in enumerate(self._docs):
            if doc.get("org_id") != org_id:
                continue
            score = self._score(query_tokens, self._tokenized[i])
            if score > min_score:
                meta = doc.get("metadata_json", "{}")
                if isinstance(meta, str):
                    try:
                        meta = json.loads(meta)
                    except Exception:
                        meta = {}
                results.append({
                    "chunk_id": doc.get("chunk_id", ""),
                    "score": score,
                    "chunk_text": doc.get("chunk_text", ""),
                    "metadata": meta,
                    "org_id": doc.get("org_id", ""),
                })

        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_k]
