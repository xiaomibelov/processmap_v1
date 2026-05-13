from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from ..legacy.request_context import request_active_org_id, require_authenticated_user
from ..rag.indexer import delete_document, index_document
from ..rag.search import BM25Index
from ..rag.storage_rag import list_rag_chunks
from ..services.org_workspace import require_org_member_for_enterprise
from ..storage import get_storage, get_rag_settings

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
    top_k: Optional[int] = Query(default=None, ge=1, le=_MAX_TOP_K),
    source_type: Optional[str] = Query(default=None),
    session_id: Optional[str] = Query(default=None),
    min_score: Optional[float] = Query(default=None, ge=0.0),
) -> Dict[str, Any]:
    require_authenticated_user(request)
    org_id = request_active_org_id(request)
    require_org_member_for_enterprise(request, org_id)

    settings = get_rag_settings(org_id)

    if not settings["enabled"]:
        return {"ok": False, "error": "rag_disabled", "results": []}

    raw_top_k = top_k if isinstance(top_k, int) else None
    effective_top_k = raw_top_k if raw_top_k is not None else int(settings["default_top_k"])
    effective_top_k = max(1, min(effective_top_k, int(settings["max_top_k"])))

    raw_min_score = min_score if isinstance(min_score, (int, float)) else None
    effective_min_score = float(raw_min_score) if raw_min_score is not None else float(settings["default_min_score"] or 0.0)

    chunks = list_rag_chunks(org_id, limit=_MAX_CHUNKS_LOAD)

    idx = BM25Index()
    idx.add_documents(chunks)
    raw_results = idx.search(q, org_id=org_id, top_k=_MAX_TOP_K, min_score=effective_min_score)

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
        if len(results) >= effective_top_k:
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


class ProductActionsRagIndexIn(BaseModel):
    session_id: str = Field(..., description="Session containing accepted product actions")
    action_ids: List[str] = Field(default_factory=list, description="Optional accepted product action ids to index")
    force: bool = Field(default=False)


def _stable_json_hash(value: Any) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _product_action_id(action: Any) -> str:
    return _text(_as_dict(action).get("id"))


def _load_session_product_actions(session: Any) -> List[Dict[str, Any]]:
    interview = _as_dict(getattr(session, "interview", {}))
    analysis = _as_dict(interview.get("analysis"))
    return [_as_dict(row) for row in _as_list(analysis.get("product_actions")) if _as_dict(row)]


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


@router.post("/api/rag/product-actions/index")
def rag_index_product_actions(inp: ProductActionsRagIndexIn, request: Request) -> Dict[str, Any]:
    require_authenticated_user(request)
    org_id = request_active_org_id(request)
    require_org_member_for_enterprise(request, org_id)

    session_id = _text(inp.session_id)
    if not session_id:
        raise HTTPException(status_code=422, detail="session_id required")

    session = get_storage().load(session_id, org_id=org_id, is_admin=True)
    if session is None:
        raise HTTPException(status_code=404, detail="not_found")

    actions = _load_session_product_actions(session)
    actions_by_id = {_product_action_id(row): row for row in actions if _product_action_id(row)}
    requested_ids = [_text(action_id) for action_id in _as_list(inp.action_ids) if _text(action_id)]
    target_ids = requested_ids or list(actions_by_id.keys())

    results: List[Dict[str, Any]] = []
    indexed = 0
    unchanged = 0
    skipped = 0
    failed = 0
    chunks_created = 0

    for action_id in target_ids:
        action = actions_by_id.get(action_id)
        if not action:
            skipped += 1
            results.append({"action_id": action_id, "status": "skipped", "reason": "not_found"})
            continue

        action_hash = _stable_json_hash(action)
        rag_source_id = f"{session_id}:{action_id}"
        metadata = {
            "source_type": "product_action",
            "source_id": session_id,
            "session_id": session_id,
            "session_title": _text(getattr(session, "title", "")),
            "action_id": action_id,
            "action_content_hash": action_hash,
        }

        if inp.force:
            from ..rag.storage_rag import get_rag_document_by_source
            existing = get_rag_document_by_source(org_id, "product_action", rag_source_id)
            if existing:
                delete_document(org_id, existing["doc_id"])

        try:
            result = index_document(
                org_id=org_id,
                source_type="product_action",
                source_id=rag_source_id,
                content=[action],
                metadata=metadata,
                source_version=None,
            )
        except Exception as exc:
            failed += 1
            results.append({"action_id": action_id, "status": "failed", "error": _text(exc) or "index_failed"})
            continue

        created = int(result.get("chunks_created") or 0)
        was_updated = bool(result.get("was_updated"))
        chunks_created += created
        if was_updated:
            indexed += 1
            status = "indexed"
        else:
            unchanged += 1
            status = "unchanged"
        results.append({
            "action_id": action_id,
            "status": status,
            "doc_id": _text(result.get("doc_id")),
            "chunks_created": created,
            "was_updated": was_updated,
            "content_hash": action_hash,
        })

    return {
        "ok": True,
        "org_id": org_id,
        "source_type": "product_action",
        "session_id": session_id,
        "requested": len(target_ids),
        "indexed": indexed,
        "unchanged": unchanged,
        "skipped": skipped,
        "failed": failed,
        "chunks_created": chunks_created,
        "results": results,
    }
