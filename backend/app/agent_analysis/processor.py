"""Agent-analysis worker: reads a DB snapshot, calls precheck + RAG + LLM,
persists the result to bpmn_meta.agent_analysis_v1.

Hard contract (architecture/autopass-agent-migration-v1 §5.1):
- never touches bpmn_xml / the live canvas;
- writes only bpmn_meta.agent_analysis_v1 under a session lock with CAS;
- identical schema re-runs are skipped (debounce at worker level).
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from ..ai.gateway import complete
from ..redis_lock import acquire_session_lock
from ..storage import get_storage

logger = logging.getLogger(__name__)

SCHEMA_VERSION = "agent_analysis_v1.1"
_RAG_TOP_K = 5
_RAG_MAX_CHUNKS = 2000
_RAG_SNIPPET_CHARS = 300
_LOCK_RETRY_BACKOFF_SEC = [0.25, 0.6, 1.2, 2.0, 3.0]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _schema_hash(sess: Any) -> str:
    xml = str(getattr(sess, "bpmn_xml", "") or "")
    nodes = getattr(sess, "nodes", None) or []
    edges = getattr(sess, "edges", None) or []
    digest = hashlib.sha256()
    digest.update(xml.encode("utf-8", "ignore"))
    digest.update(b"\x00")
    digest.update(str(len(nodes)).encode())
    digest.update(b"\x00")
    digest.update(str(len(edges)).encode())
    return digest.hexdigest()[:16]


def _is_fresh(artifact: Any, schema_hash: str) -> bool:
    if not isinstance(artifact, dict):
        return False
    if str(artifact.get("schema_version") or "") != SCHEMA_VERSION:
        return False
    if str(artifact.get("status") or "") != "done":
        return False
    return str(artifact.get("schema_hash") or "") == schema_hash


def _rag_query(sess: Any) -> str:
    parts: List[str] = [str(getattr(sess, "title", "") or "")]
    for role in (getattr(sess, "roles", None) or [])[:10]:
        parts.append(str(role))
    for node in (getattr(sess, "nodes", None) or [])[:10]:
        if isinstance(node, dict):
            parts.append(str(node.get("title") or node.get("name") or ""))
    return " ".join(p for p in parts if p).strip()[:500]


def _rag_search(sess: Any, org_id: str) -> Dict[str, Any]:
    """Org-scoped BM25 search over indexed sessions/knowledge.

    Read-only; any failure degrades to hits=0 with an error marker so the
    analysis still completes (plan: graceful degradation, rag.hits=0).
    """
    try:
        from ..rag.search import BM25Index
        from ..rag.storage_rag import list_rag_chunks

        query = _rag_query(sess)
        if not query:
            return {"hits": 0, "items": []}
        chunks = list_rag_chunks(str(org_id or ""), limit=_RAG_MAX_CHUNKS)
        if not chunks:
            return {"hits": 0, "items": []}
        idx = BM25Index()
        idx.add_documents(chunks)
        results = idx.search(query, org_id=str(org_id or ""), top_k=_RAG_TOP_K, min_score=0.0)
        items = []
        for row in results or []:
            doc = row if isinstance(row, dict) else {}
            text = str(doc.get("text") or "")[:_RAG_SNIPPET_CHARS]
            items.append(
                {
                    "doc_id": str(doc.get("doc_id") or ""),
                    "chunk_index": int(doc.get("chunk_index") or 0),
                    "score": round(float(doc.get("score") or 0.0), 4),
                    "text": text,
                }
            )
        return {"hits": len(items), "items": items}
    except Exception as exc:
        logger.warning("agent_analysis: rag search failed: %s", exc)
        return {"hits": 0, "items": [], "error": str(exc)}


def _persist_agent_analysis_result(
    *,
    session_id: str,
    org_id: str,
    user_id: str,
    artifact: Dict[str, Any],
) -> None:
    from .. import _legacy_main as _lm

    st = get_storage()
    lock = acquire_session_lock(session_id, ttl_ms=15000)
    if not lock.acquired:
        raise RuntimeError("LOCK_BUSY")
    try:
        sess = st.load(session_id, org_id=(org_id or None), is_admin=True)
        if sess is None:
            raise RuntimeError("SESSION_NOT_FOUND")
        current_meta = _lm._normalize_bpmn_meta(getattr(sess, "bpmn_meta", {}))
        current_meta["agent_analysis_v1"] = artifact
        sess.bpmn_meta = _lm._normalize_bpmn_meta(current_meta)
        sess.version = int(getattr(sess, "version", 0) or 0) + 1
        st.save(
            sess,
            user_id=user_id or str(getattr(sess, "updated_by", "") or ""),
            is_admin=True,
            org_id=(org_id or None),
        )
        _lm._invalidate_session_caches(
            sess,
            session_id=session_id,
            org_id=org_id or getattr(sess, "org_id", "") or _lm.get_default_org_id(),
        )
    finally:
        lock.release()


def _persist_with_retry(
    *,
    session_id: str,
    org_id: str,
    user_id: str,
    artifact: Dict[str, Any],
) -> None:
    last_lock_exc: Optional[Exception] = None
    for idx in range(len(_LOCK_RETRY_BACKOFF_SEC) + 1):
        try:
            _persist_agent_analysis_result(
                session_id=session_id, org_id=org_id, user_id=user_id, artifact=artifact
            )
            return
        except RuntimeError as exc:
            if str(exc) != "LOCK_BUSY":
                raise
            last_lock_exc = exc
            if idx >= len(_LOCK_RETRY_BACKOFF_SEC):
                break
            time.sleep(_LOCK_RETRY_BACKOFF_SEC[idx])
    if last_lock_exc is not None:
        raise last_lock_exc


def run_agent_analysis(session_id: str, org_id: str, *, user_id: str = "") -> Dict[str, Any]:
    """Run one background analysis pass and persist its artifact.

    Returns the artifact (status done/failed) or {"status": "skipped", ...}
    when the schema has not changed since the last successful run.
    """
    from ..auto_pass_engine import compute_auto_pass_precheck

    sid = str(session_id or "").strip()
    oid = str(org_id or "").strip()
    st = get_storage()
    sess = st.load(sid, org_id=(oid or None), is_admin=True)
    if sess is None:
        raise RuntimeError("SESSION_NOT_FOUND")

    schema_hash = _schema_hash(sess)
    existing = _lm_meta_get(sess, "agent_analysis_v1")
    if _is_fresh(existing, schema_hash):
        return {"status": "skipped", "session_id": sid, "schema_hash": schema_hash}

    run_id = f"ana_{uuid.uuid4().hex[:20]}"
    precheck = compute_auto_pass_precheck(sess)
    try:
        rag = _rag_search(sess, oid)
    except Exception as exc:
        logger.warning("agent_analysis: rag search degraded: %s", exc)
        rag = {"hits": 0, "items": [], "error": str(exc)}
    payload = {
        "session_id": sid,
        "title": str(getattr(sess, "title", "") or ""),
        "roles": [str(r) for r in (getattr(sess, "roles", None) or [])],
        "precheck": precheck,
        "rag_hits": rag.get("hits", 0),
        "schema_hash": schema_hash,
    }
    result = complete(
        "agent_analysis",
        payload,
        user_id=str(user_id or ""),
        project_id=str(getattr(sess, "project_id", "") or ""),
        session_id=sid,
        org_id=oid or "org_default",
        json_mode=True,
    )
    result = result if isinstance(result, dict) else {}

    if result.get("ok"):
        analysis = result.get("json")
        if not isinstance(analysis, dict):
            analysis = {"raw": str(result.get("text") or "")}
        artifact: Dict[str, Any] = {
            "schema_version": SCHEMA_VERSION,
            "run_id": run_id,
            "status": "done",
            "generated_at": _now_iso(),
            "schema_hash": schema_hash,
            "model": str(result.get("model") or ""),
            "precheck": precheck if isinstance(precheck, dict) else {},
            "rag": rag,
            "analysis": analysis,
        }
    else:
        artifact = {
            "schema_version": SCHEMA_VERSION,
            "run_id": run_id,
            "status": "failed",
            "generated_at": _now_iso(),
            "schema_hash": schema_hash,
            "model": str(result.get("model") or ""),
            "precheck": precheck if isinstance(precheck, dict) else {},
            "rag": rag,
            "error": str(result.get("error") or result.get("status") or "llm_error"),
        }

    _persist_with_retry(session_id=sid, org_id=oid, user_id=str(user_id or ""), artifact=artifact)
    return artifact


def _lm_meta_get(sess: Any, key: str) -> Any:
    meta = getattr(sess, "bpmn_meta", None)
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            meta = {}
    if not isinstance(meta, dict):
        return None
    return meta.get(key)
