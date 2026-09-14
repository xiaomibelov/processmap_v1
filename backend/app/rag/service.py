"""Ядро scoped-поиска по RAG-чанкам (feature/session-doc-attachments).

Единая реализация поиска (правило «без дублирующего копипаста»):
роутер /api/rag/search и ревьюер техкарты (app.agent.review) вызывают
search_rag_chunks. Роутер держит auth/settings/error-shape, гибридная
BM25+vector нога живёт здесь.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from ..storage import get_rag_settings
from .search import BM25Index, fuse_rrf, rank_by_vector
from .storage_rag import get_rag_embeddings, list_rag_chunks

logger = logging.getLogger(__name__)

_MAX_TOP_K = 50
_MAX_CHUNKS_LOAD = 2000


def _text(v: Any) -> str:
    return str(v or "").strip()


def _as_dict(v: Any) -> Dict[str, Any]:
    return v if isinstance(v, dict) else {}


def _hybrid_fused_results(
    q: str,
    org_id: str,
    settings: Dict[str, Any],
    chunks: List[Dict[str, Any]],
    idx: BM25Index,
    query_embed_future: Any = None,
) -> Optional[List[Dict[str, Any]]]:
    """Hybrid-нога: BM25-полка + vector-полка -> RRF-fusion -> score в шкале BM25.

    Возвращает None при любой деградации (sidecar недоступен / нет эмбеддингов):
    вызывающий код сохраняет сегодняшнее BM25-only поведение без изменений.

    query_embed_future: результат prefetch_query_embedding(q), запущенного до
    BM25-полки (overlap: общая latency ~ max(BM25, embed) вместо sum). Future,
    вернувший None/ошибку, — обычная деградация в keyword-only.
    """
    from .embeddings import get_query_embedding

    if query_embed_future is not None:
        try:
            query_embedding = query_embed_future.result(timeout=30)
        except Exception as exc:
            logger.warning("rag hybrid query-embedding future failed: %s", exc)
            return None
    else:
        query_embedding = get_query_embedding(q)
    if not query_embedding:
        return None
    query_vec, _model_id, _dims = query_embedding
    if not query_vec:
        return None

    model_id = _text(settings.get("embedding_model_id")) or "local-e5-small"
    chunk_ids = [str(c.get("chunk_id") or "") for c in chunks if c.get("chunk_id")]
    if not chunk_ids:
        return None
    embeddings_by_chunk = get_rag_embeddings(org_id, model_id, chunk_ids)
    if not embeddings_by_chunk:
        return None

    # BM25-полка по всему кандидатному множеству (без min_score — фильтр после fusion).
    bm25_ranked = idx.search(q, org_id=org_id, top_k=max(1, len(chunk_ids)), min_score=0.0)
    vec_ranked = rank_by_vector(chunk_ids, embeddings_by_chunk, query_vec)
    if not vec_ranked:
        return None

    w_bm25 = float(settings.get("bm25_weight") if isinstance(settings.get("bm25_weight"), (int, float)) else 0.5)
    w_vec = float(settings.get("vector_weight") if isinstance(settings.get("vector_weight"), (int, float)) else 0.5)
    fused_order = fuse_rrf(
        [(r["chunk_id"], r["score"]) for r in bm25_ranked],
        vec_ranked,
        w_bm25,
        w_vec,
    )

    bm25_score_by_id = {r["chunk_id"]: float(r["score"]) for r in bm25_ranked}
    cos_by_id = {chunk_id: float(sim) for chunk_id, sim in vec_ranked}
    # Шкала для векторной ноги: max BM25 по кандидатам; при пустой/нулевой полке — 1.0.
    bm25_scores = list(bm25_score_by_id.values())
    bm25_scale = max(bm25_scores) if bm25_scores else 0.0
    if bm25_scale <= 0.0:
        bm25_scale = 1.0

    chunk_by_id = {str(c.get("chunk_id") or ""): c for c in chunks if c.get("chunk_id")}
    results = []
    for chunk_id in fused_order:
        chunk = chunk_by_id.get(chunk_id)
        if chunk is None:
            continue
        bm25_score = bm25_score_by_id.get(chunk_id, 0.0)
        cos_sim = cos_by_id.get(chunk_id, 0.0)
        # RRF задаёт только порядок; score — в BM25-шкале для совместимости с min_score.
        score = max(bm25_score, cos_sim * bm25_scale)
        meta = chunk.get("metadata_json", "{}")
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except Exception:
                meta = {}
        results.append({
            "chunk_id": chunk_id,
            "score": score,
            "chunk_text": chunk.get("chunk_text", ""),
            "metadata": meta,
            "org_id": org_id,
        })
    return results


def search_rag_chunks(
    org_id: str,
    q: str,
    *,
    source_type: str | None = None,
    session_id: str | None = None,
    process_layer: str | None = None,
    top_k: int | None = None,
    min_score: float | None = None,
    settings: Dict[str, Any] | None = None,
) -> List[Dict[str, Any]]:
    """BM25(+hybrid)-поиск по чанкам орга с опциональными скоуп-фильтрами.

    Возвращает список результатов (chunk_id/score/chunk_text/source_type/
    source_id/metadata), отсортированный по релевантности, обрезанный top_k.
    Session-фильтр матчит metadata.source_id == session_id (back-compat для
    bpmn_xml) ИЛИ metadata.session_id == session_id (каноника для session_doc).
    """
    settings = settings if settings is not None else get_rag_settings(org_id)

    raw_top_k = top_k if isinstance(top_k, int) else None
    effective_top_k = raw_top_k if raw_top_k is not None else int(settings["default_top_k"])
    effective_top_k = max(1, min(effective_top_k, int(settings["max_top_k"])))

    raw_min_score = min_score if isinstance(min_score, (int, float)) else None
    effective_min_score = float(raw_min_score) if raw_min_score is not None else float(settings["default_min_score"] or 0.0)

    # Префетч query-эмбеддинга до BM25-полки: overlap вместо sum латентностей
    # (fix/rag-embedder-onnx-latency-v1). Только при включённом hybrid; любой
    # сбой future обрабатывается в _hybrid_fused_results как деградация.
    query_embed_future = None
    if settings.get("hybrid_enabled"):
        try:
            from .embeddings import prefetch_query_embedding

            query_embed_future = prefetch_query_embedding(q)
        except Exception as exc:
            logger.warning("rag hybrid prefetch start failed: %s", exc)
            query_embed_future = None

    chunks = list_rag_chunks(
        org_id,
        source_type=source_type or None,
        limit=None if source_type else _MAX_CHUNKS_LOAD,
    )

    idx = BM25Index()
    idx.add_documents(chunks)
    raw_results = idx.search(q, org_id=org_id, top_k=_MAX_TOP_K, min_score=effective_min_score)

    if settings.get("hybrid_enabled"):
        try:
            fused = _hybrid_fused_results(q, org_id, settings, chunks, idx, query_embed_future=query_embed_future)
        except Exception as exc:
            logger.warning("rag hybrid search degraded to keyword-only: %s", exc)
            fused = None
        if fused:
            # Тот же предикат, что в BM25Index.search: score > min_score (после fusion).
            raw_results = [r for r in fused if r["score"] > effective_min_score]

    source_type = _text(source_type) or None
    session_id = _text(session_id) or None
    process_layer = _text(process_layer) or None

    results = []
    for r in raw_results:
        meta = _as_dict(r.get("metadata"))
        if source_type and _text(meta.get("source_type")) != source_type:
            continue
        if session_id:
            # Каноника session_doc — metadata.session_id; source_id-матч остаётся
            # для back-compat (старые bpmn_xml-чанки без ключа session_id).
            if _text(meta.get("source_id")) != session_id and _text(meta.get("session_id")) != session_id:
                continue
        if process_layer and _text(meta.get("process_layer")) != process_layer:
            continue
        results.append({
            "chunk_id": r["chunk_id"],
            "score": r["score"],
            "chunk_text": r["chunk_text"],
            "source_type": _text(meta.get("source_type")),
            "source_id": _text(meta.get("source_id")),
            "metadata": meta,
        })
        if len(results) >= effective_top_k:
            break

    return results
