from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _sample_payload(**overrides):
    defaults = {
        "event_type": "deployment",
        "severity": "info",
        "message": "deployed",
        "source": "backend",
    }
    defaults.update(overrides)
    return defaults


def test_create_system_event(client: TestClient):
    response = client.post("/system-events", json=_sample_payload())
    assert response.status_code == 201
    data = response.json()
    assert data["ok"] is True
    assert data["item"]["id"].startswith("sys_")


def test_list_system_events(client: TestClient):
    source = "test_source"
    for i in range(2):
        client.post("/system-events", json=_sample_payload(source=source, message=f"m{i}"))

    response = client.get(f"/system-events?source={source}&limit=10")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 2


def test_patch_and_delete_system_event(client: TestClient):
    created = client.post("/system-events", json=_sample_payload()).json()
    eid = created["item"]["id"]

    response = client.patch(f"/system-events/{eid}", json={"severity": "warn"})
    assert response.status_code == 200
    assert response.json()["severity"] == "warn"

    response = client.delete(f"/system-events/{eid}")
    assert response.status_code == 204
    assert client.get(f"/system-events/{eid}").status_code == 404
