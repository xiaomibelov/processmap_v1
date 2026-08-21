import pytest
from fastapi.testclient import TestClient

from app.auth import create_access_token, create_user
from app.main import app
from app.storage import (
    create_org_record,
    upsert_org_membership,
    push_storage_request_scope,
    pop_storage_request_scope,
)
from app.repositories import project_repo


@pytest.mark.llm_generated
def test_admin_permissions_matrix_patch_returns_200():
    user = create_user("llm_gen_admin_matrix@local", "password", is_admin=True)
    uid = str(user["id"])
    org_id = "org_llm_gen_matrix"
    create_org_record("LLM Gen Matrix", created_by=uid, org_id=org_id)
    upsert_org_membership(org_id, uid, "owner")

    scope = push_storage_request_scope(user_id=uid, is_admin=False, org_id=org_id)
    try:
        project_id = project_repo.create_project(
            "Matrix Project", user_id=uid, org_id=org_id
        )
    finally:
        pop_storage_request_scope(scope)

    headers = {"Authorization": f"Bearer {create_access_token(uid)}"}
    client = TestClient(app)

    response = client.request(
        "PATCH",
        f"/api/admin/permissions/matrix/user/{uid}/project/{project_id}",
        headers=headers,
        json={"permissions": {"read": True, "write": False}},
    )

    assert response.status_code == 200


@pytest.mark.llm_generated
def test_admin_permissions_matrix_patch_without_body_returns_422():
    user = create_user("llm_gen_admin_matrix_422@local", "password", is_admin=True)
    uid = str(user["id"])
    headers = {"Authorization": f"Bearer {create_access_token(uid)}"}
    client = TestClient(app)

    response = client.request(
        "PATCH",
        f"/api/admin/permissions/matrix/user/{uid}/project/proj_123",
        headers=headers,
    )

    assert response.status_code == 422
    assert "detail" in response.json()
