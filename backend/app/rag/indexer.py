import hashlib
import json
import logging
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.rag.chunker import (
    chunk_bpmn_xml,
    chunk_glossary,
    chunk_operation_catalog,
    chunk_product_actions,
    chunk_property_dictionary,
    chunk_text,
)
from app.rag.storage_rag import (
    delete_rag_chunks_for_doc,
    get_rag_document_by_source,
    insert_rag_chunks,
    soft_delete_rag_document,
    upsert_rag_document,
    upsert_rag_source_status,
)


def _content_hash(content) -> str:
    if isinstance(content, list):
        normalized = json.dumps(content, sort_keys=True, ensure_ascii=False)
    else:
        normalized = str(content)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def index_document(
    org_id: str,
    source_type: str,
    source_id: str,
    content,
    metadata: dict | None = None,
    source_version: int | None = None,
) -> dict:
    metadata = metadata or {}
    new_hash = _content_hash(content)

    existing = get_rag_document_by_source(org_id, source_type, source_id)
    if existing and existing["content_hash"] == new_hash:
        return {
            "doc_id": existing["doc_id"],
            "chunks_created": 0,
            "was_updated": False,
        }

    if source_type == "bpmn_xml":
        chunks = chunk_bpmn_xml(str(content), metadata)
    elif source_type == "product_action":
        chunks = chunk_product_actions(content if isinstance(content, list) else [], metadata)
    elif source_type == "property_dictionary":
        chunks = chunk_property_dictionary(content if isinstance(content, list) else [], metadata)
    elif source_type == "operation_catalog":
        chunks = chunk_operation_catalog(content if isinstance(content, list) else [], metadata)
    elif source_type == "glossary":
        chunks = chunk_glossary(content if isinstance(content, dict) else {}, metadata)
    else:
        chunks = chunk_text(str(content), metadata)

    if isinstance(content, list):
        content_text = json.dumps(content, ensure_ascii=False)
    else:
        content_text = str(content)

    metadata_json = json.dumps(metadata, ensure_ascii=False)

    if existing:
        delete_rag_chunks_for_doc(org_id, existing["doc_id"])

    doc_id = upsert_rag_document(
        org_id=org_id,
        source_type=source_type,
        source_id=source_id,
        content_hash=new_hash,
        content_text=content_text,
        metadata_json=metadata_json,
        source_version=source_version,
    )

    chunks_created = insert_rag_chunks(doc_id, org_id, chunks)
    _maybe_enqueue_embed(chunk_ids=chunks_created, org_id=org_id)

    upsert_rag_source_status(
        org_id=org_id,
        source_type=source_type,
        display_name=source_id,
    )

    return {
        "doc_id": doc_id,
        "chunks_created": len(chunks_created),
        "was_updated": True,
    }


def _maybe_enqueue_embed(chunk_ids: list, org_id: str) -> None:
    """Узкая точка интеграции: async-эмбеддинг свежих чанков (hybrid search).

    Вызывается только после создания чанков (hash-unchanged early return выше —
    естественный skip). Любой сбой публикации логируется и не ломает индексацию.
    """
    if not chunk_ids:
        return
    try:
        from app.rag_tasks import embed_chunks

        embed_chunks.delay(list(chunk_ids), org_id)
    except Exception as exc:
        logger.warning("embed enqueue failed for org=%s chunks=%d: %s", org_id, len(chunk_ids), exc)


def delete_document(org_id: str, doc_id: str) -> bool:
    return soft_delete_rag_document(org_id, doc_id)
