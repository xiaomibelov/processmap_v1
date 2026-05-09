import json
import sqlite3
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.storage import _connect, _now_ts  # noqa: E402


def _row_to_dict(row) -> dict:
    if row is None:
        return None
    if hasattr(row, "keys"):
        return dict(row)
    return dict(row)


def upsert_rag_document(
    org_id: str,
    source_type: str,
    source_id: str,
    content_hash: str,
    content_text: str,
    metadata_json: str = "{}",
    source_version: int | None = None,
) -> str:
    import uuid
    now = _now_ts()
    with _connect() as con:
        existing = con.execute(
            "SELECT doc_id FROM rag_documents WHERE org_id=? AND source_type=? AND source_id=? AND is_active=1 LIMIT 1",
            [org_id, source_type, source_id],
        ).fetchone()
        if existing:
            doc_id = existing[0] if not hasattr(existing, "keys") else existing["doc_id"]
            con.execute(
                "UPDATE rag_documents SET content_hash=?, content_text=?, metadata_json=?, updated_at=?, source_version=? WHERE doc_id=?",
                [content_hash, content_text, metadata_json, now, source_version, doc_id],
            )
        else:
            doc_id = str(uuid.uuid4())
            con.execute(
                "INSERT INTO rag_documents (doc_id, org_id, source_type, source_id, source_version, content_hash, content_text, metadata_json, created_at, updated_at, is_active) VALUES (?,?,?,?,?,?,?,?,?,?,1)",
                [doc_id, org_id, source_type, source_id, source_version, content_hash, content_text, metadata_json, now, now],
            )
        con.commit()
    return doc_id


def insert_rag_chunks(doc_id: str, org_id: str, chunks: list[dict]) -> int:
    import uuid
    now = _now_ts()
    with _connect() as con:
        for chunk in chunks:
            chunk_id = str(uuid.uuid4())
            con.execute(
                "INSERT INTO rag_chunks (chunk_id, doc_id, org_id, chunk_index, chunk_text, token_count, metadata_json, created_at) VALUES (?,?,?,?,?,?,?,?)",
                [
                    chunk_id,
                    doc_id,
                    org_id,
                    chunk["chunk_index"],
                    chunk["chunk_text"],
                    chunk.get("token_count"),
                    chunk.get("metadata_json", "{}"),
                    now,
                ],
            )
        con.commit()
    return len(chunks)


def delete_rag_chunks_for_doc(org_id: str, doc_id: str) -> int:
    with _connect() as con:
        cur = con.execute(
            "DELETE FROM rag_chunks WHERE doc_id=? AND org_id=?",
            [doc_id, org_id],
        )
        con.commit()
        return cur.rowcount


def get_rag_document_by_source(org_id: str, source_type: str, source_id: str) -> dict | None:
    with _connect() as con:
        row = con.execute(
            "SELECT * FROM rag_documents WHERE org_id=? AND source_type=? AND source_id=? AND is_active=1 LIMIT 1",
            [org_id, source_type, source_id],
        ).fetchone()
    if row is None:
        return None
    return dict(row) if hasattr(row, "keys") else {
        "doc_id": row[0], "org_id": row[1], "source_type": row[2], "source_id": row[3],
        "source_version": row[4], "content_hash": row[5], "content_text": row[6],
        "metadata_json": row[7], "created_at": row[8], "updated_at": row[9], "is_active": row[10],
    }


def soft_delete_rag_document(org_id: str, doc_id: str) -> bool:
    with _connect() as con:
        cur = con.execute(
            "UPDATE rag_documents SET is_active=0 WHERE doc_id=? AND org_id=?",
            [doc_id, org_id],
        )
        con.commit()
        return cur.rowcount > 0


def list_rag_chunks(org_id: str, doc_id: str | None = None, limit: int = 100) -> list[dict]:
    with _connect() as con:
        if doc_id:
            rows = con.execute(
                "SELECT * FROM rag_chunks WHERE org_id=? AND doc_id=? ORDER BY chunk_index LIMIT ?",
                [org_id, doc_id, limit],
            ).fetchall()
        else:
            rows = con.execute(
                "SELECT * FROM rag_chunks WHERE org_id=? ORDER BY created_at LIMIT ?",
                [org_id, limit],
            ).fetchall()
    if not rows:
        return []
    if hasattr(rows[0], "keys"):
        return [dict(r) for r in rows]
    return [
        {"chunk_id": r[0], "doc_id": r[1], "org_id": r[2], "chunk_index": r[3],
         "chunk_text": r[4], "token_count": r[5], "metadata_json": r[6], "created_at": r[7]}
        for r in rows
    ]


def upsert_rag_source_status(
    org_id: str,
    source_type: str,
    display_name: str,
    last_indexed_at: int | None = None,
    index_error: str | None = None,
) -> None:
    import uuid
    now = _now_ts()
    with _connect() as con:
        existing = con.execute(
            "SELECT source_id FROM rag_sources WHERE org_id=? AND source_type=? LIMIT 1",
            [org_id, source_type],
        ).fetchone()
        if existing:
            sid = existing[0] if not hasattr(existing, "keys") else existing["source_id"]
            con.execute(
                "UPDATE rag_sources SET display_name=?, last_indexed_at=?, index_error=? WHERE source_id=?",
                [display_name, last_indexed_at or now, index_error, sid],
            )
        else:
            con.execute(
                "INSERT INTO rag_sources (source_id, org_id, source_type, display_name, is_enabled, last_indexed_at, index_error, config_json) VALUES (?,?,?,?,1,?,?,'{}')",
                [str(uuid.uuid4()), org_id, source_type, display_name, last_indexed_at or now, index_error],
            )
        con.commit()
