import pytest
from fastapi.testclient import TestClient

from app.auth import create_access_token, create_user
from app.main import app
from app.storage import (
    create_org_record,
    upsert_org_membership,
    create_workspace_record,
    create_workspace_folder,
)


@pytest.mark.llm_generated
def test_get_folder_note_aggregate_returns_200():
    user = create_user("llm_gen_notes_agg_200@local", "password")
    uid = str(user["id"])
    org_id = "org_llm_gen_notes_agg_200"
    create_org_record("LLM Gen Notes Agg Org", created_by=uid, org_id=org_id)
    upsert_org_membership(org_id, uid, "owner")

    ws = create_workspace_record(org_id, "WS", created_by=uid)
    workspace_id = str(ws["id"])
    folder = create_workspace_folder(org_id, workspace_id, "Folder", user_id=uid)
    folder_id = str(folder["id"])

    headers = {"Authorization": f"Bearer {create_access_token(uid)}"}
    client = TestClient(app)

    response = client.get(
        f"/api/folders/{folder_id}/note-aggregate",
        params={"workspace_id": workspace_id},
        headers=headers,
    )

    assert response.status_code == 200
    assert isinstance(response.json(), dict)


@pytest.mark.llm_generated
def test_get_folder_note_aggregate_returns_422_without_workspace_id():
    user = create_user("llm_gen_notes_agg_422@local", "password")
    uid = str(user["id"])
    org_id = "org_llm_gen_notes_agg_422"
    create_org_record("LLM Gen Notes Agg Org 422", created_by=uid, org_id=org_id)
    upsert_org_membership(org_id, uid, "owner")

    ws = create_workspace_record(org_id, "WS 422", created_by=uid)
    workspace_id = str(ws["id"])
    folder = create_workspace_folder(org_id, workspace_id, "Folder 422", user_id=uid)
    folder_id = str(folder["id"])

    headers = {"Authorization": f"Bearer {create_access_token(uid)}"}
    client = TestClient(app)

    response = client.get(
        f"/api/folders/{folder_id}/note-aggregate",
        headers=headers,
    )

    assert response.status_code == 422
    assert "detail" in response.json()
