from __future__ import annotations

import hashlib
import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from ..ai.process_projection import build_process_projection, projection_digest
from ..legacy.request_context import request_active_org_id, require_authenticated_user
from ..glossary import load_glossary
from ..rag.indexer import delete_document, index_document
from ..rag.search import BM25Index, fuse_rrf, rank_by_vector
from ..rag.storage_rag import get_rag_embeddings, list_rag_chunks, upsert_rag_source_status
from ..services.org_workspace import require_org_member_for_enterprise
from ..startup.static_mounts import GLOSSARY_SEED
from ..storage import _connect, get_storage, get_rag_settings
from .admin import _admin_context

router = APIRouter(tags=["rag"])

logger = logging.getLogger(__name__)

_ALLOWED_SOURCE_TYPES = {"bpmn_xml", "product_action", "property_dictionary", "operation_catalog", "glossary"}
_MAX_TOP_K = 50
_MAX_CHUNKS_LOAD = 2000


def _text(v: Any) -> str:
    return str(v or "").strip()


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
    from ..rag.embeddings import get_query_embedding

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

    # Префетч query-эмбеддинга до BM25-полки: overlap вместо sum латентностей
    # (fix/rag-embedder-onnx-latency-v1). Только при включённом hybrid; любой
    # сбой future обрабатывается в _hybrid_fused_results как деградация.
    query_embed_future = None
    if settings.get("hybrid_enabled"):
        try:
            from ..rag.embeddings import prefetch_query_embedding

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
    source_type: str = Field(..., description="'bpmn_xml', 'product_action', 'property_dictionary', 'operation_catalog', or 'glossary'")
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

    metadata = {
        "source_type": source_type,
        "source_id": session_id,
        "session_id": session_id,
        "session_title": _text(getattr(session, "title", "")),
    }
    source_version = None

    if source_type == "bpmn_xml":
        content = _text(getattr(session, "bpmn_xml", ""))
        source_version = int(getattr(session, "bpmn_xml_version", 0) or 0) or None
        metadata["projection_digest"] = projection_digest(build_process_projection(session))
    elif source_type == "product_action":
        interview = _as_dict(getattr(session, "interview", {}))
        analysis = _as_dict(interview.get("analysis"))
        content = _as_list(analysis.get("product_actions"))
    elif source_type == "property_dictionary":
        content = _load_process_property_metadata_rows(org_id) + _load_org_property_dictionary_rows(org_id)
        metadata["source_id"] = "property_dictionary"
    elif source_type == "operation_catalog":
        content = _load_operation_catalog_rows()
        metadata["source_id"] = "operation_catalog"
    elif source_type == "glossary":
        content = load_glossary(GLOSSARY_SEED)
        source_version = content.get("version")
        metadata["source_id"] = "glossary"
    else:
        content = ""

    source_id = metadata["source_id"]

    if inp.force:
        from ..rag.storage_rag import get_rag_document_by_source
        existing = get_rag_document_by_source(org_id, source_type, source_id)
        if existing:
            delete_document(org_id, existing["doc_id"])

    result = index_document(
        org_id=org_id,
        source_type=source_type,
        source_id=source_id,
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


class RagIndexAllIn(BaseModel):
    org_id: Optional[str] = Field(default=None, description="Target org (defaults to request active org)")
    force: bool = Field(default=False, description="Reindex even if content hash matches")


class RagIndexDictionariesIn(BaseModel):
    force: bool = Field(default=False, description="Reindex even if content hash matches")


def _json_loads(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return value
    return value


@router.post("/api/rag/index-all")
def rag_index_all(inp: RagIndexAllIn, request: Request) -> Dict[str, Any]:
    """Admin/org-admin bulk reindex of bpmn_xml for all sessions in an org."""
    _uid, _is_admin, default_org_id, _role, _scope, err = _admin_context(request)
    if err is not None:
        return err

    target_org_id = _text(inp.org_id) or _text(default_org_id) or "org_default"

    rows = []
    with _connect() as con:
        rows = con.execute(
            """
            SELECT id, title, bpmn_xml, bpmn_xml_version
              FROM sessions
             WHERE org_id = ?
               AND bpmn_xml IS NOT NULL
               AND trim(bpmn_xml) != ''
               AND (deleted_at = 0 OR deleted_at IS NULL)
            """,
            [target_org_id],
        ).fetchall()

    total = 0
    indexed = 0
    unchanged = 0
    failed = 0
    chunks_created = 0
    results: List[Dict[str, Any]] = []

    for row in rows:
        sid = _text(row["id"])
        title = _text(row["title"])
        xml = _text(row["bpmn_xml"])
        total += 1
        if not sid or not xml:
            continue

        projection = build_process_projection(
            type("Session", (), {"nodes": [], "edges": [], "bpmn_xml": xml, "id": sid, "version": 0})()
        )
        digest = projection_digest(projection)
        metadata = {
            "source_type": "bpmn_xml",
            "source_id": sid,
            "session_id": sid,
            "session_title": title,
            "projection_digest": digest,
        }

        if inp.force:
            from ..rag.storage_rag import get_rag_document_by_source
            existing = get_rag_document_by_source(target_org_id, "bpmn_xml", sid)
            if existing:
                delete_document(target_org_id, existing["doc_id"])

        try:
            result = index_document(
                org_id=target_org_id,
                source_type="bpmn_xml",
                source_id=sid,
                content=xml,
                metadata=metadata,
                source_version=int(row["bpmn_xml_version"] or 0) or None,
            )
            upsert_rag_source_status(target_org_id, "bpmn_xml", sid)
            created = int(result.get("chunks_created") or 0)
            was_updated = bool(result.get("was_updated"))
            chunks_created += created
            if was_updated:
                indexed += 1
                status = "indexed"
            else:
                unchanged += 1
                status = "unchanged"
            results.append({"session_id": sid, "status": status, "doc_id": result.get("doc_id"), "chunks_created": created})
        except Exception as exc:
            failed += 1
            results.append({"session_id": sid, "status": "failed", "error": _text(exc) or "index_failed"})

    return {
        "ok": True,
        "org_id": target_org_id,
        "total": total,
        "indexed": indexed,
        "unchanged": unchanged,
        "failed": failed,
        "chunks_created": chunks_created,
        "results": results,
    }


def _load_process_property_metadata_rows(org_id: str) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    with _connect() as con:
        fetched = con.execute(
            "SELECT id, display_name, property_type, applicable_to, default_value, value_range, validation_rules, source, editable, visible_in, category, inheritance, version FROM process_property_metadata WHERE org_id IS NULL OR org_id = ? ORDER BY id",
            [org_id],
        ).fetchall()
    for row in fetched:
        rows.append({
            "id": _text(row["id"]),
            "display_name": _text(row["display_name"]),
            "property_type": _text(row["property_type"]),
            "applicable_to": _json_loads(row["applicable_to"]),
            "default_value": row["default_value"],
            "value_range": _json_loads(row["value_range"]),
            "validation_rules": _json_loads(row["validation_rules"]),
            "source": _text(row["source"]),
            "editable": bool(row["editable"]),
            "visible_in": _json_loads(row["visible_in"]),
            "category": _text(row["category"]),
            "inheritance": _text(row["inheritance"]),
            "version": int(row["version"] or 1),
        })
    return rows


def _load_operation_catalog_rows() -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    with _connect() as con:
        fetched = con.execute(
            "SELECT id, code, name, name_ru, parameter_schema, allowed_outputs, execution_contract, resource_requirements, category FROM operation_catalog ORDER BY code",
        ).fetchall()
    for row in fetched:
        rows.append({
            "id": _text(row["id"]),
            "code": _text(row["code"]),
            "name": _text(row["name"]),
            "name_ru": _text(row["name_ru"]),
            "parameter_schema": _json_loads(row["parameter_schema"]),
            "allowed_outputs": _json_loads(row["allowed_outputs"]),
            "execution_contract": _json_loads(row["execution_contract"]),
            "resource_requirements": _json_loads(row["resource_requirements"]),
            "category": _text(row["category"]),
        })
    return rows


def _load_org_property_dictionary_rows(org_id: str) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    with _connect() as con:
        fetched = con.execute(
            """
            SELECT d.operation_key, d.property_key, d.property_label, d.input_mode, d.allow_custom_value, d.required, v.option_value
              FROM org_property_dictionary_defs d
              LEFT JOIN org_property_dictionary_values v
                ON d.org_id = v.org_id
               AND d.operation_key = v.operation_key
               AND d.property_key = v.property_key
               AND v.is_active = 1
             WHERE d.org_id = ? AND d.is_active = 1
             ORDER BY d.operation_key, d.property_key, v.sort_order
            """,
            [org_id],
        ).fetchall()
    by_property: Dict[str, Dict[str, Any]] = {}
    for row in fetched:
        key = f"{_text(row['operation_key'])}#{_text(row['property_key'])}"
        if key not in by_property:
            by_property[key] = {
                "operation_key": _text(row["operation_key"]),
                "property_key": _text(row["property_key"]),
                "property_label": _text(row["property_label"]),
                "input_mode": _text(row["input_mode"]),
                "allow_custom_value": bool(row["allow_custom_value"]),
                "required": bool(row["required"]),
                "options": [],
            }
        option_value = _text(row["option_value"])
        if option_value and option_value not in by_property[key]["options"]:
            by_property[key]["options"].append(option_value)
    return list(by_property.values())


@router.post("/api/rag/index-dictionaries")
def rag_index_dictionaries(inp: RagIndexDictionariesIn, request: Request) -> Dict[str, Any]:
    """Admin/org-admin bulk index of org-level dictionaries: property_dictionary, operation_catalog, glossary."""
    _uid, _is_admin, default_org_id, _role, _scope, err = _admin_context(request)
    if err is not None:
        return err

    org_id = _text(default_org_id) or request_active_org_id(request) or "org_default"

    results: Dict[str, Any] = {}

    # property_dictionary: system + org-level
    property_rows = _load_process_property_metadata_rows(org_id)
    property_rows.extend(_load_org_property_dictionary_rows(org_id))
    if inp.force:
        from ..rag.storage_rag import get_rag_document_by_source
        for source_id in ("system", "org"):
            existing = get_rag_document_by_source(org_id, "property_dictionary", source_id)
            if existing:
                delete_document(org_id, existing["doc_id"])
    # Index system and org rows in one doc per source bucket to keep source_id stable.
    system_rows = [r for r in property_rows if not r.get("operation_key")]
    org_rows = [r for r in property_rows if r.get("operation_key")]
    system_result = index_document(
        org_id=org_id,
        source_type="property_dictionary",
        source_id="system",
        content=system_rows,
        metadata={"source_type": "property_dictionary", "source_id": "system"},
        source_version=None,
    )
    org_result = index_document(
        org_id=org_id,
        source_type="property_dictionary",
        source_id="org",
        content=org_rows,
        metadata={"source_type": "property_dictionary", "source_id": "org"},
        source_version=None,
    )
    results["property_dictionary"] = {
        "system": {"doc_id": system_result["doc_id"], "chunks_created": system_result["chunks_created"], "was_updated": system_result["was_updated"]},
        "org": {"doc_id": org_result["doc_id"], "chunks_created": org_result["chunks_created"], "was_updated": org_result["was_updated"]},
    }

    # operation_catalog
    if inp.force:
        from ..rag.storage_rag import get_rag_document_by_source
        existing = get_rag_document_by_source(org_id, "operation_catalog", "operation_catalog")
        if existing:
            delete_document(org_id, existing["doc_id"])
    operations = _load_operation_catalog_rows()
    operation_result = index_document(
        org_id=org_id,
        source_type="operation_catalog",
        source_id="operation_catalog",
        content=operations,
        metadata={"source_type": "operation_catalog", "source_id": "operation_catalog"},
        source_version=None,
    )
    results["operation_catalog"] = {
        "doc_id": operation_result["doc_id"],
        "chunks_created": operation_result["chunks_created"],
        "was_updated": operation_result["was_updated"],
    }

    # glossary
    if inp.force:
        from ..rag.storage_rag import get_rag_document_by_source
        existing = get_rag_document_by_source(org_id, "glossary", "glossary")
        if existing:
            delete_document(org_id, existing["doc_id"])
    glossary = load_glossary(GLOSSARY_SEED)
    glossary_result = index_document(
        org_id=org_id,
        source_type="glossary",
        source_id="glossary",
        content=glossary,
        metadata={"source_type": "glossary", "source_id": "glossary"},
        source_version=glossary.get("version"),
    )
    results["glossary"] = {
        "doc_id": glossary_result["doc_id"],
        "chunks_created": glossary_result["chunks_created"],
        "was_updated": glossary_result["was_updated"],
    }

    return {
        "ok": True,
        "org_id": org_id,
        "results": results,
    }
