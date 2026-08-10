import pytest
from fastapi.testclient import TestClient

from app.auth import create_access_token, create_user
from app.main import app
from app.storage import create_org_record, upsert_org_membership


@pytest.mark.llm_generated
def test_admin_permissions_entities_returns_200():
    user = create_user("admin_permissions_entities_ok@local", "password", is_admin=True)
    uid = str(user["id"])
    org_id = "org_admin_permissions_entities_ok"
    create_org_record("Admin Permissions Entities Org", created_by=uid, org_id=org_id)
    upsert_org_membership(org_id, uid, "owner")

    headers = {"Authorization": f"Bearer {create_access_token(uid)}"}
    client = TestClient(app)

    response = client.get(
        "/api/admin/permissions/entities",
        headers=headers,
        params={"entity_type": "user"},
    )

    assert response.status_code == 200
    assert response.json() is not None


@pytest.mark.llm_generated
def test_admin_permissions_entities_missing_entity_type_returns_422():
    user = create_user("admin_permissions_entities_422@local", "password", is_admin=True)
    uid = str(user["id"])
    org_id = "org_admin_permissions_entities_422"
    create_org_record("Admin Permissions Entities Org 422", created_by=uid, org_id=org_id)
    upsert_org_membership(org_id, uid, "owner")

    headers = {"Authorization": f"Bearer {create_access_token(uid)}"}
    client = TestClient(app)

    response = client.get(
        "/api/admin/permissions/entities",
        headers=headers,
    )

    assert response.status_code == 422
    assert response.json()["detail"]
