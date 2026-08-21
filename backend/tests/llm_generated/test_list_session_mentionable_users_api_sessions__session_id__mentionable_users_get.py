import pytest
from fastapi.testclient import TestClient

from app.auth import create_access_token, create_user
from app.main import app
from app.repositories import project_repo
from app.storage import (
    create_org_record,
    get_storage,
    pop_storage_request_scope,
    push_storage_request_scope,
    upsert_org_membership,
)


@pytest.mark.llm_generated
def test_list_session_mentionable_users_returns_200():
    user = create_user("llm_gen_mentionable_200@local", "password")
    uid = str(user["id"])
    org_id = "org_llm_gen_mentionable_200"
    create_org_record("Mentionable Org", created_by=uid, org_id=org_id)
    upsert_org_membership(org_id, uid, "owner")
    headers = {"Authorization": f"Bearer {create_access_token(uid)}"}

    scope = push_storage_request_scope(user_id=uid, is_admin=False, org_id=org_id)
    try:
        project_id = project_repo.create_project(
            "Mentionable Project", user_id=uid, org_id=org_id
        )
        session_id = get_storage().create(
            title="Test Session", user_id=uid, org_id=org_id, project_id=project_id
        )
    finally:
        pop_storage_request_scope(scope)

    client = TestClient(app)
    response = client.get(
        f"/api/sessions/{session_id}/mentionable-users",
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, dict)
    assert body


@pytest.mark.llm_generated
def test_list_session_mentionable_users_nonexistent_session_returns_404():
    user = create_user("llm_gen_mentionable_404@local", "password")
    uid = str(user["id"])
    org_id = "org_llm_gen_mentionable_404"
    create_org_record("Mentionable Org 404", created_by=uid, org_id=org_id)
    upsert_org_membership(org_id, uid, "owner")
    headers = {"Authorization": f"Bearer {create_access_token(uid)}"}

    client = TestClient(app)
    response = client.get(
        "/api/sessions/session_does_not_exist/mentionable-users",
        headers=headers,
    )

    assert response.status_code == 404
