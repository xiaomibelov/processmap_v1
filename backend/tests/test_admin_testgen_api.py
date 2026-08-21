"""Admin API /api/admin/testgen/* — запуск LLM-генератора из админки (Часть 2).

Покрытие: 401/403, валидация (белый список тегов, limit ≤ 20), запуск
(workflow_dispatch замокан), 409 на дубль активного запуска, статусы
queued/running/done/failed через синк с GitHub API (тоже замокан).
"""
from __future__ import annotations

from unittest import mock

import pytest
from fastapi.testclient import TestClient

from app.auth import create_access_token, create_user
from app.main import app
from app.routers import admin_testgen
from app.storage import create_org_record, upsert_org_membership


@pytest.fixture()
def client():
    return TestClient(app, raise_server_exceptions=False)


def _headers(user) -> dict:
    return {"Authorization": f"Bearer {create_access_token(str(user['id']))}"}


@pytest.fixture()
def admin_headers():
    user = create_user("tg_admin@local", "password", is_admin=True)
    return _headers(user)


@pytest.fixture()
def viewer_headers():
    """Орг-роль viewer: читать может, права «API Docs» нет → 403."""
    user = create_user("tg_viewer@local", "password", is_admin=False)
    org = create_org_record("TG Org Viewer", created_by=str(user["id"]))
    upsert_org_membership(org["id"], str(user["id"]), "viewer", None)
    return _headers(user)


@pytest.fixture()
def owner_headers():
    """Орг-роль org_owner: право «API Docs» есть → запуск разрешён."""
    user = create_user("tg_owner@local", "password", is_admin=False)
    org = create_org_record("TG Org Owner", created_by=str(user["id"]))
    upsert_org_membership(org["id"], str(user["id"]), "org_owner", None)
    return _headers(user)


@pytest.fixture(autouse=True)
def github_token(monkeypatch):
    monkeypatch.setenv("GITHUB_TOKEN", "test-token")
    monkeypatch.delenv("GH_PAT", raising=False)
    yield


# ---------------------------------------------------------------- auth

def test_run_401_no_token(client):
    assert client.post("/api/admin/testgen/run", json={"tag": "notes", "limit": 5}).status_code == 401
    assert client.get("/api/admin/testgen/runs").status_code == 401
    assert client.get("/api/admin/testgen/runs/tg_x").status_code == 401


def test_run_403_without_api_docs_right(client, viewer_headers):
    resp = client.post("/api/admin/testgen/run", json={"tag": "notes", "limit": 5}, headers=viewer_headers)
    assert resp.status_code == 403
    assert client.get("/api/admin/testgen/runs", headers=viewer_headers).status_code == 403


# ---------------------------------------------------------------- validation

def test_run_422_tag_not_in_whitelist(client, admin_headers):
    resp = client.post("/api/admin/testgen/run", json={"tag": "../../etc", "limit": 5}, headers=admin_headers)
    assert resp.status_code == 422


def test_run_422_limit_out_of_range(client, admin_headers):
    for limit in (0, 21, 1000):
        resp = client.post("/api/admin/testgen/run", json={"tag": "notes", "limit": limit}, headers=admin_headers)
        assert resp.status_code == 422, f"limit={limit}"


def test_run_503_without_github_token(client, admin_headers, monkeypatch):
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    monkeypatch.delenv("GH_PAT", raising=False)
    resp = client.post("/api/admin/testgen/run", json={"tag": "notes", "limit": 5}, headers=admin_headers)
    assert resp.status_code == 503
    assert resp.json()["error"]["code"] == "github_not_configured"


# ---------------------------------------------------------------- run

def test_run_created_and_dispatch_called(client, admin_headers):
    with mock.patch.object(admin_testgen, "_github_dispatch") as dispatch:
        resp = client.post("/api/admin/testgen/run", json={"tag": "notes", "limit": 3}, headers=admin_headers)
    assert resp.status_code == 201
    item = resp.json()["item"]
    assert item["run_id"].startswith("tg_")
    assert item["status"] == "queued"
    assert item["tag"] == "notes"
    assert item["batch_limit"] == 3
    dispatch.assert_called_once_with("notes", 3, item["run_id"])


def test_run_allowed_for_org_owner(client, owner_headers):
    with mock.patch.object(admin_testgen, "_github_dispatch"):
        resp = client.post("/api/admin/testgen/run", json={"tag": "llm", "limit": 1}, headers=owner_headers)
    assert resp.status_code == 201


def test_run_409_duplicate_active(client, admin_headers):
    with mock.patch.object(admin_testgen, "_github_dispatch"):
        first = client.post("/api/admin/testgen/run", json={"tag": "sessions", "limit": 2}, headers=admin_headers)
        assert first.status_code == 201
        second = client.post("/api/admin/testgen/run", json={"tag": "sessions", "limit": 2}, headers=admin_headers)
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "conflict"


def test_run_502_on_dispatch_failure(client, admin_headers):
    with mock.patch.object(admin_testgen, "_github_dispatch", side_effect=RuntimeError("github_api_500")):
        resp = client.post("/api/admin/testgen/run", json={"tag": "reports", "limit": 1}, headers=admin_headers)
    assert resp.status_code == 502
    # Запись помечена failed — не блокирует повторный запуск (409 не будет).
    with mock.patch.object(admin_testgen, "_github_dispatch"):
        retry = client.post("/api/admin/testgen/run", json={"tag": "reports", "limit": 1}, headers=admin_headers)
    assert retry.status_code == 201


# ---------------------------------------------------------------- statuses

def _make_run(admin_headers, client, tag="templates"):
    with mock.patch.object(admin_testgen, "_github_dispatch"):
        resp = client.post("/api/admin/testgen/run", json={"tag": tag, "limit": 2}, headers=admin_headers)
    assert resp.status_code == 201
    return resp.json()["item"]["run_id"]


def test_runs_list_and_detail_404(client, admin_headers):
    run_id = _make_run(admin_headers, client)
    resp = client.get("/api/admin/testgen/runs", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert any(it["run_id"] == run_id for it in data["items"])
    assert client.get("/api/admin/testgen/runs/tg_missing", headers=admin_headers).status_code == 404


def test_sync_queued_to_running_to_done_with_pr(client, admin_headers):
    run_id = _make_run(admin_headers, client, tag="version")

    # GitHub ещё не показывает run — статус остаётся queued, чтение не падает.
    with mock.patch.object(admin_testgen, "_github_find_workflow_run", return_value=None):
        resp = client.get(f"/api/admin/testgen/runs/{run_id}", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["item"]["status"] == "queued"

    # Run найден и идёт.
    gh_run = {"id": 777, "status": "in_progress", "conclusion": None,
              "display_title": f"testgen version x2 [{run_id}]"}
    with mock.patch.object(admin_testgen, "_github_find_workflow_run", return_value=gh_run):
        resp = client.get(f"/api/admin/testgen/runs/{run_id}", headers=admin_headers)
    item = resp.json()["item"]
    assert item["status"] == "running"
    assert item["github_run_id"] == "777"

    # Run завершён успехом, PR найден (синк уже по сохранённому github_run_id).
    gh_run_done = {"id": 777, "status": "completed", "conclusion": "success",
                   "display_title": f"testgen version x2 [{run_id}]"}
    with mock.patch.object(admin_testgen, "_github_get_workflow_run", return_value=gh_run_done), \
         mock.patch.object(admin_testgen, "_github_find_pr", return_value="https://github.com/x/y/pull/42"):
        resp = client.get(f"/api/admin/testgen/runs/{run_id}", headers=admin_headers)
    item = resp.json()["item"]
    assert item["status"] == "done"
    assert item["pr_url"] == "https://github.com/x/y/pull/42"

    # Терминальный статус больше не синкается (моки не нужны).
    resp = client.get(f"/api/admin/testgen/runs/{run_id}", headers=admin_headers)
    assert resp.json()["item"]["status"] == "done"


def test_sync_failed_conclusion(client, admin_headers):
    run_id = _make_run(admin_headers, client, tag="system")
    gh_run = {"id": 888, "status": "completed", "conclusion": "failure",
              "display_title": f"testgen system x2 [{run_id}]"}
    with mock.patch.object(admin_testgen, "_github_find_workflow_run", return_value=gh_run):
        resp = client.get(f"/api/admin/testgen/runs/{run_id}", headers=admin_headers)
    item = resp.json()["item"]
    assert item["status"] == "failed"
    assert item["error"] == "github_conclusion:failure"


def test_sync_survives_github_outage(client, admin_headers):
    run_id = _make_run(admin_headers, client, tag="rag")
    with mock.patch.object(admin_testgen, "_github_find_workflow_run", side_effect=RuntimeError("boom")):
        resp = client.get(f"/api/admin/testgen/runs/{run_id}", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["item"]["status"] == "queued"
