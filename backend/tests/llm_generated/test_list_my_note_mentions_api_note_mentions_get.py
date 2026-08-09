import pytest
from fastapi.testclient import TestClient

from app.auth import create_access_token, create_user
from app.main import app
from app.storage import create_org_record, upsert_org_membership


@pytest.mark.llm_generated
def test_list_my_note_mentions_returns_200():
    user = create_user("note_mentions_200@example.com", "password")
    uid = str(user["id"])
    org_id = "org_note_mentions_200"
    create_org_record("Note Mentions Org", created_by=uid, org_id=org_id)
    upsert_org_membership(org_id, uid, "owner")
    headers = {"Authorization": f"Bearer {create_access_token(uid)}"}
    client = TestClient(app)

    response = client.get("/api/note-mentions", headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)
    if "items" in data:
        assert isinstance(data["items"], list)
    if "total" in data:
        assert isinstance(data["total"], int)


@pytest.mark.llm_generated
def test_list_my_note_mentions_invalid_limit_returns_422():
    user = create_user("note_mentions_422@example.com", "password")
    uid = str(user["id"])
    org_id = "org_note_mentions_422"
    create_org_record("Note Mentions Org 422", created_by=uid, org_id=org_id)
    upsert_org_membership(org_id, uid, "owner")
    headers = {"Authorization": f"Bearer {create_access_token(uid)}"}
    client = TestClient(app)

    response = client.get("/api/note-mentions", params={"limit": "abc"}, headers=headers)

    assert response.status_code == 422
    body = response.json()
    assert "detail" in body
    assert isinstance(body["detail"], list)
    assert len(body["detail"]) > 0
    error = body["detail"][0]
    assert "loc" in error
    assert "msg" in error
    assert "type" in error
