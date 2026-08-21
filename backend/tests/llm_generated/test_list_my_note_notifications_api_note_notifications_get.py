import pytest
from fastapi.testclient import TestClient

from app.auth import create_access_token, create_user
from app.main import app
from app.storage import create_org_record, upsert_org_membership


@pytest.mark.llm_generated
def test_list_my_note_notifications_returns_200():
    user = create_user("llm_gen_notes_list@local", "password")
    uid = str(user["id"])
    org_id = "org_llm_gen_notes_list"
    create_org_record("LLM Gen Notes Org", created_by=uid, org_id=org_id)
    upsert_org_membership(org_id, uid, "owner")
    headers = {"Authorization": f"Bearer {create_access_token(uid)}"}
    client = TestClient(app)

    response = client.get("/api/note-notifications", headers=headers)

    assert response.status_code == 200
    assert isinstance(response.json(), dict)


@pytest.mark.llm_generated
def test_list_my_note_notifications_invalid_limit_returns_422():
    user = create_user("llm_gen_notes_bad@local", "password")
    uid = str(user["id"])
    org_id = "org_llm_gen_notes_bad"
    create_org_record("LLM Gen Notes Bad Org", created_by=uid, org_id=org_id)
    upsert_org_membership(org_id, uid, "owner")
    headers = {"Authorization": f"Bearer {create_access_token(uid)}"}
    client = TestClient(app)

    response = client.get(
        "/api/note-notifications",
        headers=headers,
        params={"limit": "not_an_integer"},
    )

    assert response.status_code == 422
    assert "detail" in response.json()
