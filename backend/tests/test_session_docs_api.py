"""Session docs: attach/list/get/detach + авторизация + лимиты.

Контур feature/session-doc-attachments (см. .planning/contours/.../TESTS.md).
LLM не используется; RAG-индексация идёт в локальный sqlite.
"""
from __future__ import annotations

import io
import os
import sqlite3
import sys
import uuid
import zipfile
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
    return create_user(f"docs_{uuid.uuid4().hex[:8]}@local", "password", is_admin=False)


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
        title="docs test session",
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


def _attach(client, auth, session_id, filename, data, content_type="text/plain"):
    return client.post(
        f"/api/sessions/{session_id}/docs",
        headers=auth,
        files={"file": (filename, io.BytesIO(data), content_type)},
    )


def _make_docx_bytes(paragraphs):
    body = "".join(
        "<w:p>" + "".join(f"<w:r><w:t>{p}</w:t></w:r>") + "</w:p>" for p in paragraphs
    )
    xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{body}</w:body></w:document>"
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("word/document.xml", xml)
    return buf.getvalue()


class TestAttach:
    def test_attach_md_ok(self, client, auth, session_id):
        r = _attach(client, auth, session_id, "техкарта.md", "## Техкарта\n\nПомыть овощи водой проточной.".encode("utf-8"))
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["extractionQuality"] == "full"
        assert body["ext"] == "md"
        assert body["filename"] == "техкарта.md"
        assert body["uri"] == f"session://{session_id}/docs/{body['docId']}"
        assert body["rag"]["docId"] == f"session_doc:{body['docId']}"
        assert body["rag"]["chunksCreated"] > 0

        listing = client.get(f"/api/sessions/{session_id}/docs", headers=auth)
        assert listing.status_code == 200
        docs = listing.json()["docs"]
        assert [d["docId"] for d in docs] == [body["docId"]]

        got = client.get(f"/api/sessions/{session_id}/docs/{body['docId']}", headers=auth)
        assert got.status_code == 200
        assert "Помыть овощи водой проточной." in got.json()["contentText"]

    def test_attach_txt_utf8_bom(self, client, auth, session_id):
        r = _attach(client, auth, session_id, "card.txt", b"\xef\xbb\xbf\xd0\x9f\xd0\xb5\xd1\x80\xd0\xb2\xd0\xb0\xd1\x8f \xd1\x81\xd1\x82\xd1\x80\xd0\xbe\xd0\xba\xd0\xb0")
        assert r.status_code == 201, r.text
        got = client.get(f"/api/sessions/{session_id}/docs/{r.json()['docId']}", headers=auth)
        text = got.json()["contentText"]
        assert "\ufeff" not in text
        assert text.startswith("Первая строка")

    def test_attach_docx_stdlib(self, client, auth, session_id):
        data = _make_docx_bytes(["Параграф один техкарты", "Параграф два техкарты"])
        r = _attach(client, auth, session_id, "card.docx", data)
        assert r.status_code == 201, r.text
        assert r.json()["extractionQuality"] == "full"
        got = client.get(f"/api/sessions/{session_id}/docs/{r.json()['docId']}", headers=auth)
        text = got.json()["contentText"]
        assert "Параграф один техкарты" in text
        assert "Параграф два техкарты" in text

    def test_attach_docx_zip_bomb_guard(self, client, auth, session_id):
        """zip-bomb guard: член архива с разжатым размером > лимита → 422, без чтения в память."""
        data = _make_docx_bytes(["безопасный параграф"])
        fake_info = mock.Mock(file_size=21 * 1024 * 1024)  # > _DOCX_MAX_MEMBER_BYTES
        with mock.patch("app.services.session_docs_service.zipfile.ZipFile") as zf_mock:
            zf_mock.return_value.__enter__.return_value.getinfo.return_value = fake_info
            r = _attach(client, auth, session_id, "bomb.docx", data)
        assert r.status_code == 422, r.text
        assert r.json()["detail"]["error"] == "doc_unparseable"

    def test_attach_doc_external_converter(self, client, auth, session_id):
        data = b"\xd0\xcf\x11\xe0 binary ole garbage" + b"\x00" * 64
        converted = "Текст технологической карты извлечённый конвертером antiword. " * 3
        with mock.patch("app.services.session_docs_service.shutil.which", return_value="/usr/bin/antiword"), \
             mock.patch("app.services.session_docs_service.subprocess.run") as run_mock:
            run_mock.return_value = mock.Mock(stdout=converted.encode("utf-8"), returncode=0)
            r = _attach(client, auth, session_id, "card.doc", data)
        assert r.status_code == 201, r.text
        assert r.json()["extractionQuality"] == "full"
        got = client.get(f"/api/sessions/{session_id}/docs/{r.json()['docId']}", headers=auth)
        assert "antiword" in got.json()["contentText"]

    def test_attach_doc_heuristic_fallback(self, client, auth, session_id):
        # Без конвертера: текстовые run'ы из бинарника извлекаются эвристикой.
        data = b"\xd0\xcf\x11\xe0" + b"\x00\x01\x02" * 20 + "Мойка сырья проточной водой длительность десять минут".encode("utf-8") + b"\x00\xff" * 16
        with mock.patch("app.services.session_docs_service.shutil.which", return_value=None):
            r = _attach(client, auth, session_id, "card.doc", data)
        assert r.status_code == 201, r.text
        assert r.json()["extractionQuality"] == "heuristic"

        # < 50 символов извлечено -> 422 doc_unparseable.
        tiny = b"\xd0\xcf\x11\xe0" + b"\x00" * 64
        with mock.patch("app.services.session_docs_service.shutil.which", return_value=None):
            r2 = _attach(client, auth, session_id, "tiny.doc", tiny)
        assert r2.status_code == 422, r2.text
        assert r2.json()["detail"]["error"] == "doc_unparseable"

    def test_attach_extension_not_allowed(self, client, auth, session_id):
        for name in ("spec.pdf", "table.xlsx", "noext"):
            r = _attach(client, auth, session_id, name, b"data")
            assert r.status_code == 422, (name, r.text)
            assert r.json()["detail"]["error"] == "doc_extension_not_allowed"

    def test_attach_too_large(self, client, auth, session_id):
        from app.services.session_docs_service import SESSION_DOC_MAX_BYTES

        r = _attach(client, auth, session_id, "big.txt", b"x" * (SESSION_DOC_MAX_BYTES + 1))
        assert r.status_code == 413, r.text
        assert r.json()["detail"]["error"] == "doc_too_large"

    def test_attach_empty_text(self, client, auth, session_id):
        r = _attach(client, auth, session_id, "empty.md", b"   \n\n  ")
        assert r.status_code == 422, r.text
        assert r.json()["detail"]["error"] == "doc_empty"

    def test_attach_limit_reached(self, client, auth, session_id):
        from app.services import session_docs_service as svc

        with mock.patch.object(svc, "SESSION_DOC_MAX_COUNT", 2):
            for i in range(2):
                r = _attach(client, auth, session_id, f"c{i}.md", f"содержимое {i}".encode("utf-8"))
                assert r.status_code == 201, r.text
            r = _attach(client, auth, session_id, "c3.md", "содержимое 3".encode("utf-8"))
        assert r.status_code == 422, r.text
        assert r.json()["detail"]["error"] == "doc_limit_reached"

    def test_attach_quota_exceeded(self, client, auth, session_id):
        from app.services import session_docs_service as svc

        data = b"q" * 1000
        with mock.patch.object(svc, "SESSION_DOC_MAX_TOTAL_BYTES", 2500):
            for i in range(2):
                r = _attach(client, auth, session_id, f"q{i}.txt", data)
                assert r.status_code == 201, r.text
            r = _attach(client, auth, session_id, "q3.txt", data)
        assert r.status_code == 422, r.text
        assert r.json()["detail"]["error"] == "doc_quota_exceeded"


class TestListGetDetach:
    def test_list_empty_and_order(self, client, auth, session_id):
        r = client.get(f"/api/sessions/{session_id}/docs", headers=auth)
        assert r.status_code == 200
        assert r.json() == {"docs": []}

        first = _attach(client, auth, session_id, "a.md", "первый".encode("utf-8")).json()["docId"]
        second = _attach(client, auth, session_id, "b.md", "второй".encode("utf-8")).json()["docId"]
        listing = client.get(f"/api/sessions/{session_id}/docs", headers=auth).json()["docs"]
        assert [d["docId"] for d in listing] == [first, second]
        for d in listing:
            assert set(d.keys()) >= {"docId", "uri", "filename", "ext", "sizeBytes", "extractionQuality", "createdAt"}

    def test_get_404_for_foreign_doc(self, client, auth, user, org_id, session_id):
        other = session_repo.create(
            title="docs other session",
            user_id=user["id"],
            is_admin=False,
            org_id=org_id,
        )
        doc_id = _attach(client, auth, session_id, "a.md", "текст".encode("utf-8")).json()["docId"]
        r = client.get(f"/api/sessions/{other}/docs/{doc_id}", headers=auth)
        assert r.status_code == 404, r.text
        assert r.json()["detail"]["error"] == "doc_not_found"

    def test_detach_removes_and_idempotent_404(self, client, auth, session_id):
        doc_id = _attach(client, auth, session_id, "a.md", "текст на удаление".encode("utf-8")).json()["docId"]
        r = client.delete(f"/api/sessions/{session_id}/docs/{doc_id}", headers=auth)
        assert r.status_code == 204, r.text
        assert client.get(f"/api/sessions/{session_id}/docs/{doc_id}", headers=auth).status_code == 404
        assert client.get(f"/api/sessions/{session_id}/docs", headers=auth).json()["docs"] == []
        r2 = client.delete(f"/api/sessions/{session_id}/docs/{doc_id}", headers=auth)
        assert r2.status_code == 404, r2.text
        assert r2.json()["detail"]["error"] == "doc_not_found"

    def test_get_returns_full_text(self, client, auth, session_id):
        long_text = "Строка техкарты с параметрами.\n" * 500
        doc_id = _attach(client, auth, session_id, "full.md", long_text.encode("utf-8")).json()["docId"]
        got = client.get(f"/api/sessions/{session_id}/docs/{doc_id}", headers=auth)
        assert got.status_code == 200
        # Нормализация trim'ит текст — отдаётся полный нормализованный текст.
        assert got.json()["contentText"] == long_text.strip()


class TestAuth:
    def _session_in_other_org(self):
        org_b = f"org_docs_b_{uuid.uuid4().hex[:8]}"
        with _connect() as con:
            con.execute(
                "INSERT OR IGNORE INTO orgs (id, name, created_at) VALUES (?, ?, strftime('%s','now'))",
                [org_b, "Docs Org B"],
            )
            con.commit()
        user_b = create_user(f"docs_b_{uuid.uuid4().hex[:8]}@local", "password", is_admin=False)
        _insert_membership(org_b, user_b["id"])
        sid_b = session_repo.create(
            title="docs session org b",
            user_id=user_b["id"],
            is_admin=False,
            org_id=org_b,
        )
        return user_b, org_b, sid_b

    def test_auth_session_forbidden_403(self, client, auth, user, org_id):
        _user_b, _org_b, sid_b = self._session_in_other_org()
        r = client.get(f"/api/sessions/{sid_b}/docs", headers=auth)
        assert r.status_code == 403, r.text
        assert r.json()["detail"]["error"] == "session_forbidden"

        for method in ("get", "post", "delete"):
            caller = getattr(client, method)
            if method == "post":
                r = caller(
                    f"/api/sessions/{sid_b}/docs",
                    headers=auth,
                    files={"file": ("a.md", io.BytesIO(b"x"), "text/plain")},
                )
            elif method == "delete":
                r = caller(f"/api/sessions/{sid_b}/docs/{uuid.uuid4()}", headers=auth)
            else:
                r = caller(f"/api/sessions/{sid_b}/docs", headers=auth)
            assert r.status_code == 403, (method, r.text)

    def test_session_not_found_404(self, client, auth):
        r = client.get("/api/sessions/sess_does_not_exist_xyz/docs", headers=auth)
        assert r.status_code == 404, r.text
        assert r.json()["detail"]["error"] == "session_not_found"

    def test_unauthorized_401(self, client, session_id):
        r = client.get(f"/api/sessions/{session_id}/docs")
        assert r.status_code == 401
