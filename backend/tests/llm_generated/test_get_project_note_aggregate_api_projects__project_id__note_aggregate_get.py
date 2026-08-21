import pytest
from fastapi.testclient import TestClient

from app.auth import create_access_token, create_user
from app.main import app
from app.repositories import project_repo
from app.storage import (
    create_org_record,
    upsert_org_membership,
    push_storage_request_scope,
    pop_storage_request_scope,
    get_storage,
)


@pytest.mark.llm_generated
def test_get_project_note_aggregate_returns_200():
    user = create_user("llm_gen_note_agg@local", "password")
    uid = str(user["id"])
    org_id = "org_llm_gen_note_agg"
    create_org_record("LLM Gen Note Aggregate Org", created_by=uid, org_id=org_id)
    upsert_org_membership(org_id, uid, "owner")

    scope = push_storage_request_scope(user_id=uid, is_admin=False, org_id=org_id)
    try:
        project_id = project_repo.create_project(
            "Note Aggregate Project", user_id=uid, org_id=org_id
        )
    finally:
        pop_storage_request_scope(scope)

    get_storage().create(
        title="Note Session",
        user_id=uid,
        org_id=org_id,
        project_id=project_id,
    )

    headers = {"Authorization": f"Bearer {create_access_token(uid)}"}
    client = TestClient(app)

    response = client.get(
        f"/api/projects/{project_id}/note-aggregate",
        headers=headers,
    )

    assert response.status_code == 200
    assert isinstance(response.json(), dict)
