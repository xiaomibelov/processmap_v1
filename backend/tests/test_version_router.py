import os

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_version_endpoint_returns_commit_and_sha_aliases(client, monkeypatch):
    """
    /version.json отдаёт как новые поля (commit/buildTime), так и legacy-алиасы
    (sha/builtAt), чтобы закешированные index.html до PR #821/#822 могли
    самоизлечиться через свой boot guard.
    """
    monkeypatch.setenv("BUILD_ID", "abc123def456")
    monkeypatch.setenv("BUILD_TIME", "2026-08-24T18:14:14Z")
    monkeypatch.setenv("BUILD_BRANCH", "main")
    monkeypatch.setenv("BUILD_ENV", "stage")

    response = client.get("/version")
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["commit"] == "abc123def456"
    assert data["buildTime"] == "2026-08-24T18:14:14Z"
    # Legacy-алиасы обязаны совпадать с commit/buildTime.
    assert data["sha"] == data["commit"]
    assert data["builtAt"] == data["buildTime"]
    assert data["branch"] == "main"
    assert data["env"] == "stage"
    assert "containerId" in data


def test_version_endpoint_falls_back_to_unknown_when_env_missing(client, monkeypatch):
    monkeypatch.delenv("BUILD_ID", raising=False)
    monkeypatch.delenv("BUILD_TIME", raising=False)
    monkeypatch.delenv("BUILD_BRANCH", raising=False)
    monkeypatch.delenv("BUILD_ENV", raising=False)

    response = client.get("/version")
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["commit"] == "unknown"
    assert data["buildTime"] == "unknown"
    assert data["sha"] == "unknown"
    assert data["builtAt"] == "unknown"
    assert data["branch"] == "unknown"
    assert data["env"] == "prod"
