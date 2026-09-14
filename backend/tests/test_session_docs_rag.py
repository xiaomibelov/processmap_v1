"""RAG-индексация документов сессии и scoped search.

Контур feature/session-doc-attachments (см. .planning/contours/.../TESTS.md).
"""
from __future__ import annotations

import io
import json
import os
import sys
import uuid
from unittest import mock

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.auth import create_access_token, create_user
from app.main import app
from app.repositories import session_repo
from app.storage import _connect, get_default_org_id

pytestmark = pytest.mark.filterwarnings("ignore::DeprecationWarning")


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture()
def user():
    return create_user(f"docsrag_{uuid.uuid4().hex[:8]}@local", "password", is_admin=False)


@pytest.fixture()
def token(user):
    return create_access_token(user["id"])


@pytest.fixture()
def auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def org_id():
    return get_default_org_id()


@pytest.fixture()
def session_id(user, org_id):
    _insert_membership(org_id, user["id"])
    return session_repo.create(
        title="docs rag session",
        user_id=user["id"],
        is_admin=False,
        org_id=org_id,
    )


def _insert_membership(org_id: str, user_id: str, role: str = "org_admin"):
    with _connect() as con:
        con.execute(
            "INSERT OR IGNORE INTO org_memberships (org_id, user_id, role, created_at) VALUES (?, ?, ?, strftime('%s','now'))",
            [org_id, user_id, role],
        )
        con.execute(
            "UPDATE org_memberships SET role=? WHERE org_id=? AND user_id=?",
            [role, org_id, user_id],
        )
        con.commit()


def _attach(client, auth, session_id, filename, data):
    return client.post(
        f"/api/sessions/{session_id}/docs",
        headers=auth,
        files={"file": (filename, io.BytesIO(data), "text/plain")},
    )


def _search(client, auth, q, **params):
    return client.get("/api/rag/search", headers=auth, params={"q": q, **params})


def _set_rag_indexing(org_id: str, enabled: bool):
    with _connect() as con:
        con.execute(
            """
            INSERT INTO rag_settings (org_id, enabled, indexing_enabled, updated_at)
            VALUES (?, 1, ?, strftime('%s','now'))
            ON CONFLICT(org_id) DO UPDATE SET indexing_enabled = excluded.indexing_enabled
            """,
            [org_id, 0 if not enabled else 1],
        )
        con.commit()


class TestDocIndexing:
    def test_attach_indexes_chunks(self, client, auth, session_id, org_id):
        doc_id = _attach(
            client, auth, session_id, "card.md",
            "Пастеризация молока при семидесяти градусах двадцать минут.".encode("utf-8"),
        ).json()["docId"]

        with _connect() as con:
            rows = con.execute(
                """
                SELECT c.metadata_json
                  FROM rag_chunks c
                  JOIN rag_documents d ON d.doc_id = c.doc_id
                 WHERE c.org_id = ? AND d.source_type = 'session_doc'
                """,
                [org_id],
            ).fetchall()
        assert rows, "session_doc chunks expected"
        metas = [json.loads(r["metadata_json"] if hasattr(r, "keys") else r[0]) for r in rows]
        for meta in metas:
            assert meta["session_id"] == session_id
            assert meta["uri"] == f"session://{session_id}/docs/{doc_id}"
            assert meta["source_id"] == doc_id
            assert meta["filename"] == "card.md"

    def test_scoped_search_finds_doc(self, client, auth, session_id):
        _attach(
            client, auth, session_id, "card.md",
            "УникальноеСловоПастеризация: нагрев до 72 градусов.".encode("utf-8"),
        )
        r = _search(client, auth, "УникальноеСловоПастеризация", session_id=session_id, source_type="session_doc", min_score=0)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["total"] > 0
        assert all(item["source_type"] == "session_doc" for item in body["results"])

    def test_scoped_search_isolation(self, client, auth, user, org_id, session_id):
        _attach(
            client, auth, session_id, "card.md",
            "ИзоляцияДокументаСессииА слово для поиска.".encode("utf-8"),
        )
        # Сессия B (та же org, тот же пользователь) не видит документ сессии A.
        session_b = session_repo.create(
            title="docs rag session b",
            user_id=user["id"],
            is_admin=False,
            org_id=org_id,
        )
        r = _search(client, auth, "ИзоляцияДокументаСессииА", session_id=session_b, source_type="session_doc", min_score=0)
        assert r.json()["total"] == 0

        # Пользователь из другой org не находит чужие чанки даже без session-фильтра.
        org_b = f"org_docsrag_b_{uuid.uuid4().hex[:8]}"
        with _connect() as con:
            con.execute(
                "INSERT OR IGNORE INTO orgs (id, name, created_at) VALUES (?, ?, strftime('%s','now'))",
                [org_b, "DocsRag Org B"],
            )
            con.commit()
        user_b = create_user(f"docsrag_b_{uuid.uuid4().hex[:8]}@local", "password", is_admin=False)
        _insert_membership(org_b, user_b["id"])
        token_b = create_access_token(user_b["id"])
        r = _search(
            client,
            {"Authorization": f"Bearer {token_b}", "x-org-id": org_b},
            "ИзоляцияДокументаСессииА",
            source_type="session_doc",
            min_score=0,
        )
        assert r.json()["total"] == 0

    def test_search_filter_backcompat(self, client, auth, session_id, org_id):
        # Старые чанки без metadata.session_id матчатся по metadata.source_id.
        from app.rag.storage_rag import insert_rag_chunks, upsert_rag_document

        doc_id = upsert_rag_document(
            org_id=org_id,
            source_type="bpmn_xml",
            source_id=session_id,
            content_hash="raw",
            content_text="raw",
            metadata_json=json.dumps({"source_type": "bpmn_xml", "source_id": session_id}),
        )
        insert_rag_chunks(doc_id, org_id, [
            {
                "chunk_index": 0,
                "chunk_text": "БэккомпатСловоНарезка старого чанка без session_id",
                "metadata_json": json.dumps({"source_type": "bpmn_xml", "source_id": session_id}),
            }
        ])
        r = _search(client, auth, "БэккомпатСловоНарезка", session_id=session_id, min_score=0)
        assert r.status_code == 200
        assert r.json()["total"] > 0
        assert any(item["source_id"] == session_id for item in r.json()["results"])

    def test_detach_removes_from_index(self, client, auth, session_id, org_id):
        doc_id = _attach(
            client, auth, session_id, "card.md",
            "УдаляемыйДокументСлово из индекса.".encode("utf-8"),
        ).json()["docId"]
        assert _search(client, auth, "УдаляемыйДокументСлово", session_id=session_id, source_type="session_doc", min_score=0).json()["total"] > 0

        r = client.delete(f"/api/sessions/{session_id}/docs/{doc_id}", headers=auth)
        assert r.status_code == 204

        search = _search(client, auth, "УдаляемыйДокументСлово", session_id=session_id, source_type="session_doc", min_score=0)
        assert search.json()["total"] == 0
        with _connect() as con:
            chunks = con.execute(
                """
                SELECT COUNT(*) FROM rag_chunks c
                  JOIN rag_documents d ON d.doc_id = c.doc_id
                 WHERE c.org_id = ? AND d.source_type = 'session_doc' AND d.source_id = ?
                """,
                [org_id, doc_id],
            ).fetchone()
        count = chunks[0] if not hasattr(chunks, "keys") else chunks["COUNT(*)"]
        assert count == 0

    def test_indexing_disabled_still_attaches(self, client, auth, session_id, org_id):
        _set_rag_indexing(org_id, enabled=False)
        try:
            r = _attach(client, auth, session_id, "card.md", "Текст при выключенной индексации.".encode("utf-8"))
        finally:
            _set_rag_indexing(org_id, enabled=True)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["rag"]["chunksCreated"] == 0
        got = client.get(f"/api/sessions/{session_id}/docs/{body['docId']}", headers=auth)
        assert got.status_code == 200
        assert "выключенной индексации" in got.json()["contentText"]
