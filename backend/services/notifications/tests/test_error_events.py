from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _sample_payload(**overrides):
    defaults = {
        "event_type": "api_failure",
        "severity": "error",
        "message": "test message",
        "source": "frontend",
    }
    defaults.update(overrides)
    return defaults


def test_health(client: TestClient):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "notifications"}


def test_create_error_event(client: TestClient):
    response = client.post("/error_events", json=_sample_payload())
    assert response.status_code == 201
    data = response.json()
    assert data["ok"] is True
    assert data["item"]["id"].startswith("evt_")


def test_create_error_event_rejects_invalid_severity(client: TestClient):
    response = client.post("/error_events", json=_sample_payload(severity="critical"))
    assert response.status_code == 422


def test_list_error_events(client: TestClient):
    runtime_id = "runtime_list_test"
    for i in range(3):
        client.post("/error_events", json=_sample_payload(message=f"msg {i}", runtime_id=runtime_id))

    response = client.get(f"/error_events?limit=10&runtime_id={runtime_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert len(data["items"]) == 3
    assert data["count"] == 3


def test_get_error_event(client: TestClient):
    created = client.post("/error_events", json=_sample_payload()).json()
    event_id = created["item"]["id"]

    response = client.get(f"/error_events/{event_id}")
    assert response.status_code == 200
    assert response.json()["id"] == event_id


def test_get_missing_error_event(client: TestClient):
    response = client.get("/error_events/nonexistent")
    assert response.status_code == 404


def test_patch_error_event(client: TestClient):
    created = client.post("/error_events", json=_sample_payload()).json()
    event_id = created["item"]["id"]

    response = client.patch(f"/error_events/{event_id}", json={"severity": "warn"})
    assert response.status_code == 200
    data = response.json()
    assert data["severity"] == "warn"


def test_delete_error_event(client: TestClient):
    created = client.post("/error_events", json=_sample_payload()).json()
    event_id = created["item"]["id"]

    response = client.delete(f"/error_events/{event_id}")
    assert response.status_code == 204

    response = client.get(f"/error_events/{event_id}")
    assert response.status_code == 404
