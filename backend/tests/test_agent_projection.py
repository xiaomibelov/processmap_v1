"""AGENT-SVC Phase 1: contract tests for GET /api/sessions/{id}/agent/projection.

Паттерн test_agent_chat_contract.py: TestClient + изолированная SQLite из conftest.
Projection/digest/rev — без LLM-вызовов; org-scoped load сессии как у LLM3
(404 для сессии чужой org).
"""
from __future__ import annotations

import os
import sys
import uuid

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.auth import create_access_token, create_user
from app.main import app
from app.models import Edge, Node
from app.repositories import session_repo
from app.storage import create_org_record, get_default_org_id, get_storage, upsert_org_membership


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def member_user():
    email = f"agent_proj_{uuid.uuid4().hex[:8]}@local"
    user = create_user(email, "password")
    upsert_org_membership(get_default_org_id(), str(user["id"]), "editor")
    yield user


@pytest.fixture
def member_token(member_user):
    return create_access_token(member_user["id"])


@pytest.fixture
def session_id(member_user):
    sid = session_repo.create(
        title="agent projection test",
        user_id=member_user["id"],
        org_id=get_default_org_id(),
    )
    st = get_storage()
    sess = st.load(sid, is_admin=True)
    sess.nodes = [
        Node(id="step_1", title="Step 1", parameters={}, equipment=[], disposition={}),
        Node(id="step_2", title="Step 2", parameters={}, equipment=[], disposition={}),
    ]
    sess.edges = [Edge(from_id="step_1", to_id="step_2")]
    st.save(sess, is_admin=True)
    return sid


def _auth(token: str):
    return {"Authorization": f"Bearer {token}"}


def test_projection_contract_org_member(client, member_token, session_id):
    r = client.get(
        f"/api/sessions/{session_id}/agent/projection",
        headers=_auth(member_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    projection = body["projection"]
    assert isinstance(projection, dict)
    assert projection["meta"]["session_id"] == session_id
    assert [s["id"] for s in projection["steps"]] == ["step_1", "step_2"]
    assert projection["edges"] == [{"from": "step_1", "to": "step_2"}]
    digest = body["projection_digest"]
    assert isinstance(digest, str) and len(digest) == 32
    assert isinstance(body["rev"], int)


def test_projection_foreign_org_session_404(client, member_token):
    owner = create_user(f"agent_proj_other_{uuid.uuid4().hex[:8]}@local", "password")
    org_id = f"org_other_{uuid.uuid4().hex[:6]}"
    create_org_record("Other Org", created_by=str(owner["id"]), org_id=org_id)
    sid = session_repo.create(title="foreign org session", user_id=owner["id"], org_id=org_id)
    r = client.get(f"/api/sessions/{sid}/agent/projection", headers=_auth(member_token))
    assert r.status_code == 404, r.text


def test_projection_requires_authentication(client, session_id):
    r = client.get(f"/api/sessions/{session_id}/agent/projection")
    assert r.status_code == 401, r.text
