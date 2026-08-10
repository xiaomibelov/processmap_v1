import pytest
from fastapi.testclient import TestClient

from app.auth import create_access_token, create_user
from app.main import app


@pytest.mark.llm_generated
def test_admin_permissions_matrix_returns_200():
    user = create_user("admin_permissions_matrix_200@local", "password", is_admin=True)
    uid = str(user["id"])
    headers = {"Authorization": f"Bearer {create_access_token(uid)}"}
    client = TestClient(app)

    response = client.get("/api/admin/permissions/matrix", headers=headers)

    assert response.status_code == 200
    assert response.json() is not None
