import pytest
from fastapi.testclient import TestClient

from app.auth import create_access_token, create_user
from app.main import app


@pytest.mark.llm_generated
def test_admin_permissions_list_returns_200_for_admin():
    user = create_user("admin_permissions_admin@local", "password", is_admin=True)
    uid = str(user["id"])
    headers = {"Authorization": f"Bearer {create_access_token(uid)}"}
    client = TestClient(app)

    response = client.get("/api/admin/permissions", headers=headers)

    assert response.status_code == 200
    assert response.json() is not None


@pytest.mark.llm_generated
def test_admin_permissions_list_returns_403_for_non_admin():
    user = create_user("admin_permissions_regular@local", "password", is_admin=False)
    uid = str(user["id"])
    headers = {"Authorization": f"Bearer {create_access_token(uid)}"}
    client = TestClient(app)

    response = client.get("/api/admin/permissions", headers=headers)

    assert response.status_code == 403
