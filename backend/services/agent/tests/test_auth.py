"""AGENT-SVC: auth gate публичных endpoints (org member, как у LLM3).

401 — без JWT / кривой JWT / пользователь не найден; 404 — чужая org,
несуществующая или удалённая сессия (как session_repo.load → not found в
монолите, существование чужой сессии не раскрываем); 200 — org member / admin.
History не трогает LLM и монолит — чистый auth-контур.
"""
from __future__ import annotations

import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import app


@pytest.fixture
def client():
    return TestClient(app)


def _auth(token: str):
    return {"Authorization": f"Bearer {token}"}


def test_history_401_without_jwt(client, session_id):
    assert client.get(f"/sessions/{session_id}/agent/history").status_code == 401


def test_history_401_invalid_jwt(client, session_id):
    assert client.get(f"/sessions/{session_id}/agent/history", headers=_auth("garbage")).status_code == 401


def test_history_401_user_not_found(client, seed, session_id):
    token = seed.make_token("user_missing_" + "0" * 8)
    assert client.get(f"/sessions/{session_id}/agent/history", headers=_auth(token)).status_code == 401


def test_history_404_foreign_org(client, seed):
    owner = seed.make_user(is_admin=False)
    sid = seed.make_session(org_id="org_other", owner_user_id=owner)
    # member default org, НЕ member org_other → 404 (гейт org member)
    rando = seed.make_user(is_admin=False)
    seed.add_membership(seed.DEFAULT_ORG, rando, "viewer")
    r = client.get(f"/sessions/{sid}/agent/history", headers=_auth(seed.make_token(rando)))
    assert r.status_code == 404, r.text


def test_history_404_unknown_session(client, member_user):
    r = client.get("/sessions/sess_nonexistent/agent/history", headers=_auth(member_user["token"]))
    assert r.status_code == 404, r.text


def test_history_200_org_member(client, member_user, session_id):
    r = client.get(f"/sessions/{session_id}/agent/history", headers=_auth(member_user["token"]))
    assert r.status_code == 200, r.text
    assert r.json() == {"turns": []}


def test_history_200_admin_without_membership(client, seed):
    admin = seed.make_user(is_admin=True)
    sid = seed.make_session(org_id="org_other", owner_user_id=seed.make_user())
    r = client.get(f"/sessions/{sid}/agent/history", headers=_auth(seed.make_token(admin)))
    assert r.status_code == 200, r.text
