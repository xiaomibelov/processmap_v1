import pytest
from fastapi.testclient import TestClient

from app.auth import create_user, create_access_token
from app.main import app


@pytest.mark.llm_generated
def test_admin_permissions_matrix_bulk_returns_200():
    user = create_user("llm_gen_admin_bulk@local", "password", is_admin=True)
    uid = str(user["id"])
    headers = {"Authorization": f"Bearer {create_access_token(uid)}"}
    client = TestClient(app)

    payload = {
        "updates": [
            {
                "principal_type": "user",
                "principal_id": uid,
                "entity_type": "project",
                "entity_id": "project_llm_gen_bulk",
                "permissions": {"read": True, "write": True},
            }
        ]
    }
    response = client.post(
        "/api/admin/permissions/matrix/bulk",
        json=payload,
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json() is not None


@pytest.mark.llm_generated
def test_admin_permissions_matrix_bulk_invalid_body_returns_422():
    user = create_user("llm_gen_admin_bulk_422@local", "password", is_admin=True)
    uid = str(user["id"])
    headers = {"Authorization": f"Bearer {create_access_token(uid)}"}
    client = TestClient(app)

    payload = {
        "updates": [
            {
                # principal_type is intentionally omitted
                "principal_id": uid,
                "entity_type": "project",
                "entity_id": "project_llm_gen_bulk",
            }
        ]
    }
    response = client.post(
        "/api/admin/permissions/matrix/bulk",
        json=payload,
        headers=headers,
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert isinstance(detail, list)
    assert len(detail) > 0
