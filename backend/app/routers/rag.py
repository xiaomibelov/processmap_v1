from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from ..legacy.request_context import request_active_org_id, require_authenticated_user
from ..rag.indexer import delete_document, index_document
from ..rag.search import BM25Index
from ..rag.storage_rag import list_rag_chunks
from ..services.org_workspace import require_org_member_for_enterprise
from ..storage import get_storage

router = APIRouter(tags=["rag"])

_ALLOWED_SOURCE_TYPES = {"bpmn_xml", "product_action"}
_MAX_TOP_K = 50
_MAX_CHUNKS_LOAD = 2000


def _text(v: Any) -> str:
    return str(v or "").strip()


def _as_dict(v: Any) -> Dict[str, Any]:
    return v if isinstance(v, dict) else {}


def _as_list(v: Any) -> List[Any]:
    return v if isinstance(v, list) else []


@router.get("/api/rag/search")
def rag_search(
    request: Request,
    q: str = Query(..., min_length=1, description="Search query"),
    top_k: int = Query(default=10, ge=1, le=_MAX_TOP_K),
    source_type: Optional[str] = Query(default=None),
    session_id: Optional[str] = Query(default=None),
    min_score: float = Query(default=0.0, ge=0.0),
) -> Dict[str, Any]:
    require_authenticated_user(request)
    org_id = request_active_org_id(request)
    require_org_member_for_enterprise(request, org_id)

    chunks = list_rag_chunks(org_id, limit=_MAX_CHUNKS_LOAD)

    idx = BM25Index()
    idx.add_documents(chunks)
    raw_results = idx.search(q, org_id=org_id, top_k=_MAX_TOP_K, min_score=min_score)

    results = []
    for r in raw_results:
        meta = _as_dict(r.get("metadata"))
        if source_type and _text(meta.get("source_type")) != _text(source_type):
            continue
        if session_id and _text(meta.get("source_id")) != _text(session_id):
            continue
        results.append({
            "chunk_id": r["chunk_id"],
            "score": r["score"],
            "chunk_text": r["chunk_text"],
            "source_type": _text(meta.get("source_type")),
            "source_id": _text(meta.get("source_id")),
            "metadata": meta,
        })
        if len(results) >= top_k:
            break

    return {
        "ok": True,
        "query": q,
        "org_id": org_id,
        "total": len(results),
        "results": results,
    }


class RagIndexIn(BaseModel):
    source_type: str = Field(..., description="'bpmn_xml' or 'product_action'")
    session_id: Optional[str] = Field(default=None)
    force: bool = Field(default=False)


@router.post("/api/rag/index")
def rag_index(inp: RagIndexIn, request: Request) -> Dict[str, Any]:
    require_authenticated_user(request)
    org_id = request_active_org_id(request)
    require_org_member_for_enterprise(request, org_id)

    source_type = _text(inp.source_type)
    if source_type not in _ALLOWED_SOURCE_TYPES:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_source_type",
                "allowed": sorted(_ALLOWED_SOURCE_TYPES),
                "received": source_type,
            },
        )

    session_id = _text(inp.session_id)
    if not session_id:
        raise HTTPException(status_code=422, detail="session_id required")

    session = get_storage().load(session_id, org_id=org_id, is_admin=True)
    if session is None:
        raise HTTPException(status_code=404, detail="not_found")

    if source_type == "bpmn_xml":
        content = _text(getattr(session, "bpmn_xml", ""))
        source_version = int(getattr(session, "bpmn_xml_version", 0) or 0) or None
    else:
        interview = _as_dict(getattr(session, "interview", {}))
        analysis = _as_dict(interview.get("analysis"))
        content = _as_list(analysis.get("product_actions"))
        source_version = None

    metadata = {
        "source_type": source_type,
        "source_id": session_id,
        "session_id": session_id,
        "session_title": _text(getattr(session, "title", "")),
    }

    if inp.force:
        from ..rag.storage_rag import get_rag_document_by_source
        existing = get_rag_document_by_source(org_id, source_type, session_id)
        if existing:
            delete_document(org_id, existing["doc_id"])

    result = index_document(
        org_id=org_id,
        source_type=source_type,
        source_id=session_id,
        content=content,
        metadata=metadata,
        source_version=source_version,
    )

    return {
        "ok": True,
        "org_id": org_id,
        "source_type": source_type,
        "session_id": session_id,
        "doc_id": result["doc_id"],
        "chunks_created": result["chunks_created"],
        "was_updated": result["was_updated"],
    }
