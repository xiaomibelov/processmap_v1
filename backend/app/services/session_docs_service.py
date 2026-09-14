"""Сервис документов сессии (feature/session-doc-attachments).

Реестр документов сессии: attach (нормализация .md/.txt/.text/.doc/.docx),
list/get, detach (soft delete + полная зачистка RAG-чанков). Хранение —
side-table session_documents (DDL в _ensure_schema), RAG — существующие
rag_documents/rag_chunks с source_type="session_doc".

Лимиты (API.md): 2 МБ на файл, 20 документов на сессию, 20 МБ суммарно.
"""
from __future__ import annotations

import hashlib
import io
import logging
import re
import shutil
import subprocess
import tempfile
import time
import uuid
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

from ..rag.indexer import index_document
from ..rag.metadata import build_chunk_metadata
from ..rag.storage_rag import delete_rag_chunks_for_doc, get_rag_document_by_source, soft_delete_rag_document
from ..repositories import session_repo
from ..storage import _connect

logger = logging.getLogger(__name__)

SESSION_DOC_MAX_BYTES = 2 * 1024 * 1024  # 2 МБ на файл
SESSION_DOC_MAX_COUNT = 20  # неудалённых документов на сессию
SESSION_DOC_MAX_TOTAL_BYTES = 20 * 1024 * 1024  # 20 МБ суммарно на сессию
SESSION_DOC_REVIEW_MAX_TEXT = 20000  # максимум символов проверяемого текста ревью

SESSION_DOC_ALLOWED_EXTENSIONS = (".md", ".txt", ".text", ".doc", ".docx")
SESSION_DOC_SOURCE_TYPE = "session_doc"
# Минимум извлечённого текста для .doc (конвертер/эвристика) — иначе 422.
_DOC_MIN_EXTRACTED_CHARS = 50

_W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

# Конвертеры для legacy .doc (проверка через shutil.which при attach).
_DOC_CONVERTERS = ("antiword", "catdoc", "soffice")


def _text(v: Any) -> str:
    return str(v or "").strip()


def session_doc_uri(session_id: str, doc_id: str) -> str:
    return f"session://{session_id}/docs/{doc_id}"


def _now_ts() -> int:
    return int(time.time())


def _iso(ts: int) -> str:
    return datetime.fromtimestamp(int(ts or 0), tz=timezone.utc).isoformat()


# ── Авторизация доступа к сессии (404/403-контракт API.md) ──────────────────

def require_session_access(
    session_id: str,
    *,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> Any:
    """404 session_not_found (сессии нет), 403 session_forbidden (чужая сессия).

    Существование проверяется admin-запросом без org-фильтра (raw SQL), затем
    делается org-scoped load (прецедент agent_chat.py): сессия есть, но не из
    орг/нет прав → 403.
    """
    sid = _text(session_id)
    if not sid:
        raise HTTPException(status_code=404, detail={"error": "session_not_found", "session_id": sid})
    with _connect() as con:
        row = con.execute(
            "SELECT id FROM sessions WHERE id = ? AND (deleted_at = 0 OR deleted_at IS NULL) LIMIT 1",
            [sid],
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={"error": "session_not_found", "session_id": sid})
    sess = session_repo.load(sid, user_id=user_id, org_id=org_id, is_admin=is_admin)
    if sess is None:
        raise HTTPException(status_code=403, detail={"error": "session_forbidden", "session_id": sid})
    return sess


# ── CRUD side-table session_documents ────────────────────────────────────────

def _row_to_doc(row: Any) -> Dict[str, Any]:
    keys = row.keys() if hasattr(row, "keys") else None
    get = (lambda k: row[k]) if keys else (lambda k: row[_COLS.index(k)])
    return {
        "doc_id": get("doc_id"),
        "org_id": get("org_id"),
        "session_id": get("session_id"),
        "filename": get("filename"),
        "ext": get("ext"),
        "size_bytes": int(get("size_bytes") or 0),
        "content_text": get("content_text") or "",
        "content_hash": get("content_hash") or "",
        "extraction_quality": get("extraction_quality") or "full",
        "created_by": get("created_by") or "",
        "created_at": int(get("created_at") or 0),
        "updated_at": int(get("updated_at") or 0),
        "deleted_at": get("deleted_at"),
    }


_COLS = [
    "doc_id", "org_id", "session_id", "filename", "ext", "size_bytes",
    "content_text", "content_hash", "extraction_quality", "created_by",
    "created_at", "updated_at", "deleted_at",
]


def insert_session_document(
    *,
    org_id: str,
    session_id: str,
    filename: str,
    ext: str,
    size_bytes: int,
    content_text: str,
    content_hash: str,
    extraction_quality: str = "full",
    created_by: str = "",
) -> Dict[str, Any]:
    doc_id = str(uuid.uuid4())
    now = _now_ts()
    with _connect() as con:
        con.execute(
            """
            INSERT INTO session_documents
                (doc_id, org_id, session_id, filename, ext, size_bytes, content_text, content_hash, extraction_quality, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [doc_id, org_id, session_id, filename, ext, int(size_bytes), content_text, content_hash, extraction_quality, created_by, now, now],
        )
        con.commit()
    return get_session_document(org_id, session_id, doc_id)  # type: ignore[return-value]


def get_session_document(org_id: str, session_id: str, doc_id: str) -> Optional[Dict[str, Any]]:
    with _connect() as con:
        row = con.execute(
            """
            SELECT * FROM session_documents
             WHERE org_id = ? AND session_id = ? AND doc_id = ? AND deleted_at IS NULL
             LIMIT 1
            """,
            [org_id, session_id, doc_id],
        ).fetchone()
    return _row_to_doc(row) if row else None


def list_session_documents(org_id: str, session_id: str) -> List[Dict[str, Any]]:
    with _connect() as con:
        rows = con.execute(
            """
            SELECT * FROM session_documents
             WHERE org_id = ? AND session_id = ? AND deleted_at IS NULL
             ORDER BY created_at ASC
            """,
            [org_id, session_id],
        ).fetchall()
    return [_row_to_doc(r) for r in rows]


def soft_delete_session_document(org_id: str, session_id: str, doc_id: str) -> bool:
    now = _now_ts()
    with _connect() as con:
        cur = con.execute(
            """
            UPDATE session_documents SET deleted_at = ?, updated_at = ?
             WHERE org_id = ? AND session_id = ? AND doc_id = ? AND deleted_at IS NULL
            """,
            [now, now, org_id, session_id, doc_id],
        )
        con.commit()
        return cur.rowcount > 0


def count_active_documents(org_id: str, session_id: str) -> int:
    with _connect() as con:
        row = con.execute(
            "SELECT COUNT(*) FROM session_documents WHERE org_id = ? AND session_id = ? AND deleted_at IS NULL",
            [org_id, session_id],
        ).fetchone()
    return int(row[0] if not hasattr(row, "keys") else list(row)[0] or 0)


def total_active_size_bytes(org_id: str, session_id: str) -> int:
    with _connect() as con:
        row = con.execute(
            "SELECT COALESCE(SUM(size_bytes), 0) FROM session_documents WHERE org_id = ? AND session_id = ? AND deleted_at IS NULL",
            [org_id, session_id],
        ).fetchone()
    return int(row[0] if not hasattr(row, "keys") else list(row)[0] or 0)


# ── Нормализация форматов ────────────────────────────────────────────────────

_DOCX_MAX_MEMBER_BYTES = SESSION_DOC_MAX_BYTES * 10  # защита от zip-bomb: 2MB сжато → не более 20MB разжато


def _docx_to_text(data: bytes) -> str:
    """Извлечение текста из .docx через stdlib zipfile + XML (без зависимостей)."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            info = zf.getinfo("word/document.xml")
            if int(getattr(info, "file_size", 0) or 0) > _DOCX_MAX_MEMBER_BYTES:
                raise ValueError(
                    f"docx: word/document.xml слишком большой ({info.file_size} байт)"
                )
            xml_bytes = zf.read("word/document.xml")
    except (zipfile.BadZipFile, KeyError) as exc:
        raise ValueError(f"docx: нет word/document.xml ({exc})")
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as exc:
        raise ValueError(f"docx: битый XML ({exc})")
    paragraphs = []
    for p in root.iter(f"{_W_NS}p"):
        parts = [t.text or "" for t in p.iter(f"{_W_NS}t")]
        line = "".join(parts).strip()
        if line:
            paragraphs.append(line)
    return "\n".join(paragraphs).strip()


def _run_doc_converter(converter: str, data: bytes) -> str:
    """Извлечение текста из legacy .doc внешним конвертером окружения."""
    with tempfile.TemporaryDirectory(prefix="pm_doc_") as tmp:
        src = f"{tmp}/doc_{uuid.uuid4().hex[:8]}.doc"
        with open(src, "wb") as fh:
            fh.write(data)
        if converter == "soffice":
            proc = subprocess.run(
                [converter, "--headless", "--convert-to", "txt:Text", "--outdir", tmp, src],
                capture_output=True,
                timeout=60,
            )
            if proc.returncode != 0:
                return ""
            txt_path = src.rsplit(".", 1)[0] + ".txt"
            try:
                with open(txt_path, "rb") as fh:
                    return fh.read().decode("utf-8", errors="replace").strip()
            except OSError:
                return ""
        proc = subprocess.run(
            [converter, src],
            capture_output=True,
            timeout=60,
        )
        return (proc.stdout or b"").decode("utf-8", errors="replace").strip()


def _doc_heuristic_text(data: bytes) -> str:
    """Best-effort эвристика: текстовые run'ы из бинарного .doc без конвертера."""
    decoded = data.decode("utf-8", errors="ignore")
    runs = re.findall(r"[\w\s\-.,:;()«»\"'№%]{6,}", decoded, flags=re.UNICODE)
    return " ".join(r.strip() for r in runs if r.strip())


def _doc_to_text(data: bytes) -> Tuple[str, str]:
    """.doc: конвертер окружения (full) → эвристика (heuristic)."""
    for converter in _DOC_CONVERTERS:
        if shutil.which(converter):
            try:
                text = _run_doc_converter(converter, data)
            except Exception as exc:  # сбой конвертера — пробуем следующий/эвристику
                logger.warning("session_docs: converter %s failed: %s", converter, exc)
                text = ""
            if len(text.strip()) >= _DOC_MIN_EXTRACTED_CHARS:
                return text, "full"
    return _doc_heuristic_text(data), "heuristic"


def normalize_document(ext: str, data: bytes) -> Tuple[str, str]:
    """Нормализация файла в plain text. Возвращает (text, extraction_quality)."""
    if ext in (".md", ".txt", ".text"):
        try:
            return data.decode("utf-8-sig").strip(), "full"
        except UnicodeDecodeError:
            return data.decode("utf-8", errors="replace").strip(), "full"
    if ext == ".docx":
        return _docx_to_text(data), "full"
    if ext == ".doc":
        return _doc_to_text(data)
    raise ValueError(f"unsupported ext: {ext}")


# ── Attach / detach ──────────────────────────────────────────────────────────

def attach_document(
    *,
    org_id: str,
    session_id: str,
    sess: Any,
    filename: str,
    data: bytes,
    user_id: str = "",
) -> Dict[str, Any]:
    """Attach документа: валидация → нормализация → запись → RAG-индексация."""
    filename = _text(filename)
    if not filename:
        raise HTTPException(status_code=400, detail={"error": "doc_filename_required"})
    ext = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""
    if ext not in SESSION_DOC_ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "doc_extension_not_allowed",
                "filename": filename,
                "allowed": list(SESSION_DOC_ALLOWED_EXTENSIONS),
            },
        )
    if len(data) > SESSION_DOC_MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail={"error": "doc_too_large", "max_bytes": SESSION_DOC_MAX_BYTES, "received": len(data)},
        )
    if count_active_documents(org_id, session_id) >= SESSION_DOC_MAX_COUNT:
        raise HTTPException(
            status_code=422,
            detail={"error": "doc_limit_reached", "max": SESSION_DOC_MAX_COUNT},
        )
    if total_active_size_bytes(org_id, session_id) + len(data) > SESSION_DOC_MAX_TOTAL_BYTES:
        raise HTTPException(
            status_code=422,
            detail={"error": "doc_quota_exceeded", "max_total_bytes": SESSION_DOC_MAX_TOTAL_BYTES},
        )

    try:
        text, quality = normalize_document(ext, data)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "doc_unparseable",
                "message": f"Не удалось извлечь текст из файла ({exc}). "
                           "Сохраните документ как .docx или .txt и загрузите снова.",
            },
        )
    if not text:
        code = "doc_unparseable" if ext == ".doc" else "doc_empty"
        detail: Dict[str, Any] = {"error": code}
        if code == "doc_unparseable":
            detail["message"] = "Извлечено менее 50 символов текста. Сохраните документ как .docx или .txt и загрузите снова."
        raise HTTPException(status_code=422, detail=detail)
    if ext == ".doc" and quality == "heuristic" and len(text) < _DOC_MIN_EXTRACTED_CHARS:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "doc_unparseable",
                "message": "Извлечено менее 50 символов текста. Сохраните документ как .docx или .txt и загрузите снова.",
            },
        )

    content_hash = hashlib.sha256(data).hexdigest()
    doc = insert_session_document(
        org_id=org_id,
        session_id=session_id,
        filename=filename,
        ext=ext.lstrip("."),
        size_bytes=len(data),
        content_text=text,
        content_hash=content_hash,
        extraction_quality=quality,
        created_by=user_id,
    )

    # RAG: существующий пайплайн rag_documents/rag_chunks, source_type=session_doc.
    # Каноническая привязка к сессии — metadata.session_id (build_chunk_metadata);
    # детерминированный rag source_id = doc_id (rag-doc-id в ответе — session_doc:{doc_id}).
    rag_doc_id = f"{SESSION_DOC_SOURCE_TYPE}:{doc['doc_id']}"
    metadata = build_chunk_metadata(
        source_type=SESSION_DOC_SOURCE_TYPE,
        source_id=doc["doc_id"],
        session=sess,
        extra={"filename": filename, "uri": session_doc_uri(session_id, doc["doc_id"])},
    )
    indexed = index_document(
        org_id=org_id,
        source_type=SESSION_DOC_SOURCE_TYPE,
        source_id=doc["doc_id"],
        content=text,
        metadata=metadata,
        source_version=1,
    )
    chunks_created = int(indexed.get("chunks_created") or 0)

    return {
        "docId": doc["doc_id"],
        "uri": session_doc_uri(session_id, doc["doc_id"]),
        "filename": filename,
        "ext": doc["ext"],
        "sizeBytes": doc["size_bytes"],
        "extractionQuality": quality,
        "rag": {"docId": rag_doc_id, "chunksCreated": chunks_created},
    }


def detach_document(org_id: str, session_id: str, doc_id: str) -> None:
    """Detach: soft delete строки + полное удаление RAG-чанков (поиск пуст сразу)."""
    doc = get_session_document(org_id, session_id, doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail={"error": "doc_not_found", "doc_id": doc_id})
    if not soft_delete_session_document(org_id, session_id, doc_id):
        raise HTTPException(status_code=404, detail={"error": "doc_not_found", "doc_id": doc_id})
    rag_doc = get_rag_document_by_source(org_id, SESSION_DOC_SOURCE_TYPE, doc_id)
    if rag_doc:
        delete_rag_chunks_for_doc(org_id, rag_doc["doc_id"])
        soft_delete_rag_document(org_id, rag_doc["doc_id"])


# ── Представления для API ────────────────────────────────────────────────────

def doc_to_list_item(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "docId": doc["doc_id"],
        "uri": session_doc_uri(doc["session_id"], doc["doc_id"]),
        "filename": doc["filename"],
        "ext": doc["ext"],
        "sizeBytes": doc["size_bytes"],
        "extractionQuality": doc.get("extraction_quality") or "full",
        "createdAt": _iso(doc["created_at"]),
    }


def doc_to_detail(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "docId": doc["doc_id"],
        "uri": session_doc_uri(doc["session_id"], doc["doc_id"]),
        "filename": doc["filename"],
        "ext": doc["ext"],
        "contentText": doc["content_text"],
    }
