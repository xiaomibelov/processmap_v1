from __future__ import annotations

import logging
from typing import Any, Dict

from .celery_app import app
from .rag.indexer import index_document
from .rag.storage_rag import upsert_rag_source_status
from .storage import get_storage

logger = logging.getLogger(__name__)


def _do_index_session_bpmn_xml(session_id: str, org_id: str) -> Dict[str, Any]:
    """Core indexing logic shared by single-session and batch tasks."""
    sid = str(session_id or "").strip()
    oid = str(org_id or "").strip() or "org_default"
    storage = get_storage()
    session = storage.load(sid, org_id=oid, is_admin=True)
    if session is None:
        return {"status": "failed", "reason": "session_not_found", "session_id": sid}

    bpmn_xml = str(getattr(session, "bpmn_xml", "") or "").strip()
    if not bpmn_xml:
        return {"status": "skipped", "reason": "no_xml", "session_id": sid}

    from .ai.process_projection import build_process_projection, projection_digest

    projection = build_process_projection(session)
    digest = projection_digest(projection)
    session_title = str(getattr(session, "title", "") or "").strip()
    dsv = int(getattr(session, "diagram_state_version", 0) or 0)

    metadata = {
        "source_type": "bpmn_xml",
        "source_id": sid,
        "session_id": sid,
        "session_title": session_title,
        "projection_digest": digest,
        "diagram_state_version": dsv,
    }

    result = index_document(
        org_id=oid,
        source_type="bpmn_xml",
        source_id=sid,
        content=bpmn_xml,
        metadata=metadata,
        source_version=dsv or None,
    )

    upsert_rag_source_status(
        org_id=oid,
        source_type="bpmn_xml",
        display_name=sid,
    )

    return {
        "status": "indexed" if result.get("was_updated") else "unchanged",
        "session_id": sid,
        "doc_id": result.get("doc_id"),
        "chunks_created": result.get("chunks_created", 0),
        "was_updated": result.get("was_updated", False),
        "projection_digest": digest,
        "diagram_state_version": dsv,
    }


# Канонические имена: не зависят от import-контекста (app.* vs backend.app.*).
@app.task(bind=True, max_retries=1, default_retry_delay=10, name="processmap.rag.index_session_bpmn_xml")
def index_session_bpmn_xml(self, session_id: str, org_id: str) -> Dict[str, Any]:
    """Переиндексировать bpmn_xml сессии в RAG.

    Самодостаточный модуль — не импортирует backend.app.tasks (audit Blocker #5).
    Ошибки логируются, не падаем, чтобы не ломать сохранение сессии.
    """
    sid = str(session_id or "").strip()
    oid = str(org_id or "").strip() or "org_default"
    if not sid:
        return {"status": "failed", "reason": "empty_session_id"}

    try:
        result = _do_index_session_bpmn_xml(sid, oid)
        if result.get("status") in ("indexed", "unchanged"):
            storage = get_storage()
            storage.set_rag_readiness(
                sid,
                "indexed",
                org_id=oid,
                indexed_dsv=result.get("diagram_state_version"),
            )
        return result
    except Exception as exc:
        logger.exception("index_session_bpmn_xml failed for %s/%s", oid, sid)
        try:
            self.retry(exc=exc)
        except Exception:
            pass
        # Retry исчерпан: фиксируем наблюдаемый провал индексации, чтобы
        # readiness не зависал в прежнем состоянии. Не должен подниматься.
        try:
            get_storage().set_rag_readiness(sid, "error", org_id=oid)
        except Exception:
            logger.warning("index_session_bpmn_xml: failed to mark readiness error for %s/%s", oid, sid)
        return {"status": "failed", "reason": str(exc), "session_id": sid}


@app.task(bind=True, max_retries=1, default_retry_delay=60, name="processmap.rag.index_queued_sessions_bpmn_xml")
def index_queued_sessions_bpmn_xml(self) -> Dict[str, Any]:
    """Ночной batch-джоб: индексировать все сессии со статусом queued."""
    try:
        storage = get_storage()
        sessions = storage.list_sessions_by_rag_status("queued")
        logger.info("index_queued_sessions_bpmn_xml: found %d queued sessions", len(sessions))
        results = []
        for sess in sessions:
            sid = str(sess.get("id") or "").strip()
            oid = str(sess.get("org_id") or "").strip() or "org_default"
            if not sid:
                continue
            try:
                result = _do_index_session_bpmn_xml(sid, oid)
                if result.get("status") in ("indexed", "unchanged"):
                    storage.set_rag_readiness(
                        sid,
                        "indexed",
                        org_id=oid,
                        indexed_dsv=result.get("diagram_state_version"),
                    )
                results.append({"session_id": sid, **result})
            except Exception as exc:
                logger.exception("index_queued_sessions_bpmn_xml failed for %s/%s", oid, sid)
                try:
                    storage.set_rag_readiness(sid, "error", org_id=oid)
                except Exception:
                    logger.warning("index_queued_sessions_bpmn_xml: failed to mark readiness error for %s/%s", oid, sid)
                results.append({"session_id": sid, "status": "failed", "reason": str(exc)})
        return {"status": "ok", "processed": len(results), "results": results}
    except Exception as exc:
        logger.exception("index_queued_sessions_bpmn_xml failed")
        try:
            self.retry(exc=exc)
        except Exception:
            pass
        return {"status": "failed", "reason": str(exc)}


EXPECTED_EMBEDDING_MODEL_ID = "local-e5-small"


@app.task(bind=True, max_retries=1, default_retry_delay=10, ignore_result=True, name="processmap.rag.embed_chunks")
def embed_chunks(self, chunk_ids: list, org_id: str) -> Dict[str, Any]:
    """Эмбеддить чанки через sidecar и сохранить в rag_embeddings (hybrid search).

    Не в request-path: вызывается из indexer после insert_rag_chunks.
    Sidecar недоступен -> soft retry; несовпадение model_id -> permanent fail.
    """
    ids = [str(c) for c in (chunk_ids or []) if str(c or "").strip()]
    oid = str(org_id or "").strip() or "org_default"
    if not ids:
        return {"status": "skipped", "reason": "empty_chunk_ids"}

    try:
        from .rag.embeddings import encode_vector, get_embeddings_for_texts
        from .rag.storage_rag import get_rag_chunk_texts, upsert_rag_embeddings

        texts_by_id = get_rag_chunk_texts(oid, ids)
        if not texts_by_id:
            return {"status": "skipped", "reason": "no_chunks", "org_id": oid}
        ordered_ids = list(texts_by_id.keys())
        result = get_embeddings_for_texts([texts_by_id[cid] for cid in ordered_ids])
        if not result:
            raise RuntimeError("embedder unavailable")
        embeddings, model_id, dimensions = result
        if model_id != EXPECTED_EMBEDDING_MODEL_ID:
            logger.error(
                "embed_chunks: unexpected model_id %r (expected %r), org=%s chunks=%d",
                model_id, EXPECTED_EMBEDDING_MODEL_ID, oid, len(ordered_ids),
            )
            return {"status": "failed", "reason": "unexpected_model_id", "model_id": model_id}
        rows = []
        for cid, vec in zip(ordered_ids, embeddings):
            dims = int(dimensions or 0) or len(vec or [])
            rows.append({
                "chunk_id": cid,
                "org_id": oid,
                "model_id": model_id,
                "vector": encode_vector(vec),
                "dimensions": dims,
            })
        written = upsert_rag_embeddings(rows)
        return {"status": "ok", "org_id": oid, "embedded": written, "model_id": model_id}
    except Exception as exc:
        logger.exception("embed_chunks failed for %s (%d chunks)", oid, len(ids))
        try:
            self.retry(exc=exc)
        except Exception:
            pass
        return {"status": "failed", "reason": str(exc), "org_id": oid}
