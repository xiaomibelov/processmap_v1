import json
import math
import re
from collections import Counter
from typing import Any

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


def _decode_vector(data: Any) -> list:
    """vector_data (array('f') bytes) -> [float]. Битые/пустые данные -> []."""
    if not data:
        return []
    try:
        from array import array
        arr = array("f")
        arr.frombytes(bytes(data))
        return list(arr)
    except Exception:
        return []


def cosine_similarity(a: list, b: list) -> float:
    """Косинусная близость на чистом Python (без numpy)."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        fx = float(x)
        fy = float(y)
        dot += fx * fy
        na += fx * fx
        nb += fy * fy
    if na <= 0.0 or nb <= 0.0:
        return 0.0
    return dot / (math.sqrt(na) * math.sqrt(nb))


def rank_by_vector(
    candidates: list,
    embeddings_by_chunk: dict,
    query_vec: list,
) -> list:
    """Векторная полка: [(chunk_id, cos_sim)] по убыванию.

    candidates — chunk_ids кандидатного множества; embeddings_by_chunk —
    {chunk_id: (vector_bytes, dimensions)}. Чанки без эмбеддинга в полку не попадают.
    """
    if not query_vec:
        return []
    ranked = []
    for chunk_id in candidates or []:
        entry = (embeddings_by_chunk or {}).get(chunk_id)
        if not entry:
            continue
        vec = _decode_vector(entry[0])
        if not vec or len(vec) != len(query_vec):
            continue
        sim = cosine_similarity(query_vec, vec)
        if sim > 0.0:
            ranked.append((chunk_id, sim))
    ranked.sort(key=lambda x: x[1], reverse=True)
    return ranked


def fuse_rrf(
    bm25_ranked: list,
    vec_ranked: list,
    w_bm25: float,
    w_vec: float,
    k: int = 60,
) -> list:
    """RRF-fusion двух полок -> [chunk_id] в порядке убывания fused-ранга.

    Полки: [(chunk_id, score), ...] (порядок значим, score — нет).
    RRF определяет ТОЛЬКО порядок; отсутствующие в полке кандидаты не получают
    вклад этой ноги. Чанки вне обеих полок в результат не попадают.
    """
    fused: dict = {}
    for rank, item in enumerate(bm25_ranked or [], start=1):
        chunk_id = item[0]
        fused[chunk_id] = fused.get(chunk_id, 0.0) + float(w_bm25) / (k + rank)
    for rank, item in enumerate(vec_ranked or [], start=1):
        chunk_id = item[0]
        fused[chunk_id] = fused.get(chunk_id, 0.0) + float(w_vec) / (k + rank)
    return [chunk_id for chunk_id, _score in sorted(fused.items(), key=lambda x: x[1], reverse=True)]
