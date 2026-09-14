"""Контрактные тесты GET /api/sessions/{session_id}/agent-analysis/artifact.

Чтение сохранённого артефакта bpmn_meta.agent_analysis_v1 владельцем сессии.
Гейт фичи НЕ применяется (чтение собственного артефакта безопасно; флаг
остаётся только на POST enqueue).
"""
from __future__ import annotations

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
from app.storage import (
    create_org_record,
    get_default_org_id,
    get_storage,
    upsert_org_membership,
)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def owner():
    email = f"aa_artifact_{uuid.uuid4().hex[:8]}@local"
    yield create_user(email, "password", is_admin=True)


@pytest.fixture
def owner_token(owner):
    return create_access_token(owner["id"])


@pytest.fixture
def session_id(owner):
    return session_repo.create(
        title="agent-analysis-artifact",
        user_id=owner["id"],
        is_admin=True,
        org_id=get_default_org_id(),
    )


def _auth(token: str):
    return {"Authorization": f"Bearer {token}"}


def _seed_artifact(sid: str, owner_id: str, artifact: dict) -> None:
    st = get_storage()
    sess = st.load(sid, is_admin=True)
    meta = dict(getattr(sess, "bpmn_meta", {}) or {})
    meta["agent_analysis_v1"] = artifact
    sess.bpmn_meta = meta
    st.save(sess, user_id=owner_id, is_admin=True)


_ARTIFACT = {
    "schema_version": "agent_analysis_v1.1",
    "run_id": "ana_testrun",
    "status": "done",
    "generated_at": "2026-09-14T00:00:00+00:00",
    "schema_hash": "deadbeefcafe0001",
    "model": "deepseek-chat",
    "precheck": {},
    "rag": {"hits": 0, "items": []},
    "analysis": {"summary": "ок", "risks": [], "recommendations": []},
}


def test_artifact_200_when_present(client, owner, owner_token, session_id):
    _seed_artifact(session_id, owner["id"], dict(_ARTIFACT))
    resp = client.get(
        f"/api/sessions/{session_id}/agent-analysis/artifact",
        headers=_auth(owner_token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["artifact"] == _ARTIFACT
    assert body["schema_version"] == "agent_analysis_v1.1"
    assert "version" in body
    assert body["updated_at"] == _ARTIFACT["generated_at"]


def test_artifact_404_when_absent(client, owner_token, session_id):
    resp = client.get(
        f"/api/sessions/{session_id}/agent-analysis/artifact",
        headers=_auth(owner_token),
    )
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "agent_analysis_not_found"


def test_artifact_404_for_unknown_session(client, owner_token):
    resp = client.get(
        "/api/sessions/sid_missing/agent-analysis/artifact",
        headers=_auth(owner_token),
    )
    assert resp.status_code == 404


def test_artifact_401_without_token(client, session_id):
    resp = client.get(f"/api/sessions/{session_id}/agent-analysis/artifact")
    assert resp.status_code == 401


def test_artifact_works_with_feature_flag_disabled(client, owner, owner_token, session_id):
    # GET не должен консультироваться с флагом фичи вообще (флаг — гейт enqueue).
    _seed_artifact(session_id, owner["id"], dict(_ARTIFACT))
    with mock.patch(
        "app.agent_analysis.router._feature_enabled",
        side_effect=AssertionError("GET обратился к feature flag"),
    ):
        resp = client.get(
            f"/api/sessions/{session_id}/agent-analysis/artifact",
            headers=_auth(owner_token),
        )
    assert resp.status_code == 200


def test_artifact_foreign_session_parity_with_status_endpoint(client, owner_token):
    # Орг-скоупинг наследуется от _legacy_load_session_scoped (паритет с
    # существующим GET status): чужая сессия обрабатывается обоими эндпоинтами
    # идентично.
    foreign = create_user(f"aa_foreign_{uuid.uuid4().hex[:8]}@local", "password", is_admin=True)
    org_id = f"org_aa_{uuid.uuid4().hex[:8]}"
    create_org_record("AA Foreign Org", created_by=str(foreign["id"]), org_id=org_id)
    upsert_org_membership(org_id, str(foreign["id"]), "owner")
    sid = session_repo.create(
        title="foreign-session",
        user_id=foreign["id"],
        is_admin=True,
        org_id=org_id,
    )
    _seed_artifact_org(sid, foreign["id"], org_id, dict(_ARTIFACT))
    artifact_resp = client.get(
        f"/api/sessions/{sid}/agent-analysis/artifact",
        headers=_auth(owner_token),
    )
    status_resp = client.get(
        f"/api/sessions/{sid}/agent-analysis?job_id=jid_x",
        headers=_auth(owner_token),
    )
    assert artifact_resp.status_code == status_resp.status_code


def _seed_artifact_org(sid: str, user_id: str, org_id: str, artifact: dict) -> None:
    st = get_storage()
    sess = st.load(sid, org_id=org_id, is_admin=True)
    meta = dict(getattr(sess, "bpmn_meta", {}) or {})
    meta["agent_analysis_v1"] = artifact
    sess.bpmn_meta = meta
    st.save(sess, user_id=user_id, is_admin=True, org_id=org_id)
