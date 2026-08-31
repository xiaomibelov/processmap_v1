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

    metadata = {
        "source_type": "bpmn_xml",
        "source_id": sid,
        "session_id": sid,
        "session_title": session_title,
        "projection_digest": digest,
    }

    result = index_document(
        org_id=oid,
        source_type="bpmn_xml",
        source_id=sid,
        content=bpmn_xml,
        metadata=metadata,
        source_version=int(getattr(session, "bpmn_xml_version", 0) or 0) or None,
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
            storage.set_rag_readiness(sid, "indexed", org_id=oid)
        return result
    except Exception as exc:
        logger.exception("index_session_bpmn_xml failed for %s/%s", oid, sid)
        try:
            self.retry(exc=exc)
        except Exception:
            pass
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
                    storage.set_rag_readiness(sid, "indexed", org_id=oid)
                results.append({"session_id": sid, **result})
            except Exception as exc:
                logger.exception("index_queued_sessions_bpmn_xml failed for %s/%s", oid, sid)
                results.append({"session_id": sid, "status": "failed", "reason": str(exc)})
        return {"status": "ok", "processed": len(results), "results": results}
    except Exception as exc:
        logger.exception("index_queued_sessions_bpmn_xml failed")
        try:
            self.retry(exc=exc)
        except Exception:
            pass
        return {"status": "failed", "reason": str(exc)}
