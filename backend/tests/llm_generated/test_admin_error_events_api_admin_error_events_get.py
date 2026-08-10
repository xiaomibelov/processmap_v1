import pytest
from fastapi.testclient import TestClient

from app.auth import create_access_token, create_user
from app.main import app


@pytest.mark.llm_generated
def test_admin_error_events_returns_200():
    user = create_user("admin_error_events_200@local", "password", is_admin=True)
    uid = str(user["id"])
    headers = {"Authorization": f"Bearer {create_access_token(uid)}"}
    client = TestClient(app)

    response = client.get("/api/admin/error-events", headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert isinstance(data["items"], list)
    assert "count" in data
    assert "page" in data


@pytest.mark.llm_generated
def test_admin_error_events_invalid_limit_returns_422():
    user = create_user("admin_error_events_422@local", "password", is_admin=True)
    uid = str(user["id"])
    headers = {"Authorization": f"Bearer {create_access_token(uid)}"}
    client = TestClient(app)

    response = client.get(
        "/api/admin/error-events",
        params={"limit": "abc"},
        headers=headers,
    )

    assert response.status_code == 422
    body = response.json()
    assert "detail" in body
