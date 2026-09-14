"""Единая реализация RAG-поиска: роутер /api/rag/search и app.rag.service.search_rag_chunks.

Контур feature/session-doc-attachments (см. .planning/contours/.../TESTS.md).
"""
from __future__ import annotations

import json
import os
import sys
import uuid

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.auth import create_access_token, create_user
from app.main import app
from app.rag.storage_rag import insert_rag_chunks, upsert_rag_document
from app.storage import _connect, get_default_org_id

pytestmark = pytest.mark.filterwarnings("ignore::DeprecationWarning")


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture()
def user():
    return create_user(f"ragsvc_{uuid.uuid4().hex[:8]}@local", "password", is_admin=False)


@pytest.fixture()
def token(user):
    return create_access_token(user["id"])


@pytest.fixture()
def auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def org_id(user):
    oid = get_default_org_id()
    with _connect() as con:
        con.execute(
            "INSERT OR IGNORE INTO org_memberships (org_id, user_id, role, created_at) VALUES (?, ?, ?, strftime('%s','now'))",
            [oid, user["id"], "org_admin"],
        )
        con.commit()
    return oid


def _seed_corpus(org_id: str, source_id: str):
    words = ["пастеризация", "бланширование", "упаковка", "маринование", "охлаждение"]
    doc_id = upsert_rag_document(
        org_id=org_id,
        source_type="bpmn_xml",
        source_id=source_id,
        content_hash="raw",
        content_text="raw",
        metadata_json=json.dumps({"source_type": "bpmn_xml", "source_id": source_id}),
    )
    chunks = [
        {
            "chunk_index": i,
            "chunk_text": f"Операция: {w} продуктов в цехе (шаг {i})",
            "metadata_json": json.dumps({"source_type": "bpmn_xml", "source_id": source_id}),
        }
        for i, w in enumerate(words)
    ]
    insert_rag_chunks(doc_id, org_id, chunks)


def test_router_and_service_same_results(client, auth, org_id):
    source_id = f"svc_session_{uuid.uuid4().hex[:8]}"
    _seed_corpus(org_id, source_id)

    q = "пастеризация упаковка"
    router_resp = client.get(
        "/api/rag/search",
        headers=auth,
        params={"q": q, "top_k": 10, "min_score": 0},
    )
    assert router_resp.status_code == 200, router_resp.text
    router_results = router_resp.json()["results"]

    from app.rag.service import search_rag_chunks

    service_results = search_rag_chunks(org_id, q, top_k=10, min_score=0.0)

    assert [(r["chunk_id"], r["score"]) for r in router_results] == [
        (r["chunk_id"], r["score"]) for r in service_results
    ]
    assert [(r["chunk_text"], r["source_id"]) for r in router_results] == [
        (r["chunk_text"], r["source_id"]) for r in service_results
    ]

    # Скоуп-фильтр идёт через ту же функцию: session_id-вариант согласован.
    router_scoped = client.get(
        "/api/rag/search",
        headers=auth,
        params={"q": q, "top_k": 10, "min_score": 0, "session_id": source_id},
    ).json()["results"]
    service_scoped = search_rag_chunks(org_id, q, session_id=source_id, top_k=10, min_score=0.0)
    assert [r["chunk_id"] for r in router_scoped] == [r["chunk_id"] for r in service_scoped]
