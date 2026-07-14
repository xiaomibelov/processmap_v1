"""Integration tests for PATCH /api/sessions/{session_id}/meta.

These tests verify that the new meta-only endpoint is registered by the runtime
app and is not shadowed by the legacy ``/bpmn_meta`` alias middleware.
"""

import unittest

from fastapi.testclient import TestClient

from app.auth import create_access_token, create_user
from app.main import app
from app.storage import (
    create_org_record,
    get_storage,
    upsert_org_membership,
    upsert_project_membership,
)


class TestSessionMetaEndpoint(unittest.TestCase):
    def setUp(self):
        self.st = get_storage()
        self.client = TestClient(app)

        self.owner = create_user("owner_meta_endpoint@local", "password", is_admin=True)
        self.org_id = "org_meta_endpoint"
        create_org_record("Meta Endpoint Org", created_by=str(self.owner["id"]), org_id=self.org_id)
        upsert_org_membership(self.org_id, str(self.owner["id"]), "owner")
        upsert_project_membership(self.org_id, "proj_1", str(self.owner["id"]), "owner")

        self.token = create_access_token(str(self.owner["id"]))
        self.headers = {"Authorization": f"Bearer {self.token}"}

        self.sid = self.st.create(
            title="meta-endpoint",
            user_id=str(self.owner["id"]),
            org_id=self.org_id,
            project_id="proj_1",
        )

    def _patch_meta(self, payload):
        return self.client.patch(
            f"/api/sessions/{self.sid}/meta",
            json=payload,
            headers=self.headers,
        )

    def test_meta_endpoint_returns_property_save_response(self):
        before = self.st.load(self.sid, org_id=self.org_id, is_admin=True)
        base_version = int(getattr(before, "diagram_state_version", 0) or 0)

        response = self._patch_meta(
            {
                "bpmn_meta_json": {"custom_key": "custom_value"},
                "base_diagram_state_version": base_version,
            }
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data.get("ok"))
        self.assertEqual(data.get("id"), self.sid)
        self.assertEqual(data.get("diagram_state_version"), base_version + 1)
        self.assertEqual(data.get("bpmn_meta_json", {}).get("custom_key"), "custom_value")

    def test_meta_endpoint_is_not_shadowed_by_bpmn_meta_alias(self):
        """The legacy alias middleware used to rewrite /meta to /bpmn_meta.

        This test ensures the request is handled by the property-only save
        endpoint (response contains ``ok``), not the legacy bpmn_meta handler.
        """
        response = self._patch_meta(
            {
                "bpmn_meta_json": {"alias_check": True},
                "base_diagram_state_version": 0,
            }
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("ok", data)
        self.assertTrue(data.get("ok"))

    def test_meta_endpoint_404_for_missing_session(self):
        response = self.client.patch(
            "/api/sessions/nonexistent_session_xyz/meta",
            json={"bpmn_meta_json": {}, "base_diagram_state_version": 0},
            headers=self.headers,
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("error", response.json())


if __name__ == "__main__":
    unittest.main()
