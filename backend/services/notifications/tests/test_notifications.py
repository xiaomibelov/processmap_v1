from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _sample_payload(**overrides):
    defaults = {
        "type": "info",
        "title": "Test notification",
        "message": "Hello from tests",
        "priority": "normal",
    }
    defaults.update(overrides)
    return defaults


def test_create_notification(client: TestClient):
    response = client.post("/notifications", json=_sample_payload())
    assert response.status_code == 201
    data = response.json()
    assert data["ok"] is True
    assert data["item"]["id"].startswith("ntf_")


def test_create_notification_rejects_bad_priority(client: TestClient):
    response = client.post("/notifications", json=_sample_payload(priority="extreme"))
    assert response.status_code == 422


def test_list_notifications(client: TestClient):
    uid = "user_notif_1"
    for i in range(2):
        client.post("/notifications", json=_sample_payload(user_id=uid, title=f"t{i}"))

    response = client.get(f"/notifications?user_id={uid}&limit=10")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 2


def test_patch_and_delete_notification(client: TestClient):
    created = client.post("/notifications", json=_sample_payload()).json()
    nid = created["item"]["id"]

    response = client.patch(f"/notifications/{nid}", json={"priority": "high", "read_at": 12345})
    assert response.status_code == 200
    assert response.json()["priority"] == "high"
    assert response.json()["read_at"] == 12345

    response = client.delete(f"/notifications/{nid}")
    assert response.status_code == 204
    assert client.get(f"/notifications/{nid}").status_code == 404
