import pytest
from fastapi.testclient import TestClient

from app.auth import create_access_token, create_user
from app.main import app


@pytest.mark.llm_generated
def test_admin_audit_returns_200():
    user = create_user("admin_audit_200@local", "password", is_admin=True)
    uid = str(user["id"])
    client = TestClient(app)
    headers = {"Authorization": f"Bearer {create_access_token(uid)}"}

    response = client.get("/api/admin/audit", headers=headers)

    assert response.status_code == 200
    assert response.json() is not None


@pytest.mark.llm_generated
def test_admin_audit_invalid_limit_returns_422():
    user = create_user("admin_audit_422@local", "password", is_admin=True)
    uid = str(user["id"])
    client = TestClient(app)
    headers = {"Authorization": f"Bearer {create_access_token(uid)}"}

    response = client.get("/api/admin/audit", params={"limit": "abc"}, headers=headers)

    assert response.status_code == 422
    data = response.json()
    assert "detail" in data
    assert isinstance(data["detail"], list)
    assert len(data["detail"]) > 0
