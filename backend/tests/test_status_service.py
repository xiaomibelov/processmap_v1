"""Tests for the dedicated status transition endpoint and service."""

from __future__ import annotations

import unittest
import uuid

from fastapi.testclient import TestClient

from app.auth import create_access_token, create_user
from app.main import app
from app.save_services.status_service.status_service import change_session_status
from app.schemas.legacy_api import StatusPatchIn
from app.storage import (
    create_org_record,
    get_storage,
    upsert_org_membership,
    upsert_project_membership,
)


class TestStatusService(unittest.TestCase):
    def setUp(self):
        self.st = get_storage()
        self.client = TestClient(app)

        suffix = uuid.uuid4().hex
        self.owner = create_user(f"owner_status_service_{suffix}@local", "password", is_admin=True)
        self.editor = create_user(f"editor_status_service_{suffix}@local", "password", is_admin=False)
        self.viewer = create_user(f"viewer_status_service_{suffix}@local", "password", is_admin=False)

        self.org_id = f"org_status_service_{suffix}"
        create_org_record("Status Service Org", created_by=str(self.owner["id"]), org_id=self.org_id)
        upsert_org_membership(self.org_id, str(self.owner["id"]), "owner")
        upsert_org_membership(self.org_id, str(self.editor["id"]), "editor")
        upsert_org_membership(self.org_id, str(self.viewer["id"]), "viewer")
        upsert_project_membership(self.org_id, "proj_1", str(self.owner["id"]), "owner")
        upsert_project_membership(self.org_id, "proj_1", str(self.editor["id"]), "editor")
        upsert_project_membership(self.org_id, "proj_1", str(self.viewer["id"]), "viewer")

        self.owner_token = create_access_token(str(self.owner["id"]))
        self.editor_token = create_access_token(str(self.editor["id"]))
        self.viewer_token = create_access_token(str(self.viewer["id"]))

        self.sid = self.st.create(
            title="status-service-session",
            user_id=str(self.owner["id"]),
            org_id=self.org_id,
            project_id="proj_1",
        )

    def _status(self, sid, payload, token):
        return self.client.patch(
            f"/api/sessions/{sid}/status",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )

    def _load(self):
        return self.st.load(self.sid, org_id=self.org_id, is_admin=True)

    def test_status_endpoint_transitions_draft_to_in_progress(self):
        sess = self._load()
        base = int(getattr(sess, "diagram_state_version", 0) or 0)

        response = self._status(
            self.sid,
            {"status": "in_progress", "base_diagram_state_version": base},
            self.owner_token,
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(((data.get("interview") or {}).get("status")), "in_progress")
        self.assertEqual(self._load().diagram_state_version, base)

    def test_status_endpoint_requires_base_diagram_state_version(self):
        response = self._status(self.sid, {"status": "in_progress"}, self.owner_token)
        self.assertEqual(response.status_code, 409)
        detail = response.json().get("detail") or {}
        self.assertEqual(detail.get("code"), "DIAGRAM_STATE_BASE_VERSION_REQUIRED")

    def test_status_endpoint_rejects_stale_base_version(self):
        response = self._status(
            self.sid,
            {"status": "in_progress", "base_diagram_state_version": 999},
            self.owner_token,
        )
        self.assertEqual(response.status_code, 409)
        detail = response.json().get("detail") or {}
        self.assertEqual(detail.get("code"), "DIAGRAM_STATE_CONFLICT")

    def test_status_endpoint_rejects_invalid_transition(self):
        sess = self._load()
        base = int(getattr(sess, "diagram_state_version", 0) or 0)
        response = self._status(
            self.sid,
            {"status": "review", "base_diagram_state_version": base},
            self.owner_token,
        )
        self.assertEqual(response.status_code, 409)
        detail = response.json().get("detail") or {}
        self.assertEqual(detail.get("code"), "STATUS_TRANSITION_INVALID")

    def test_status_endpoint_forbids_viewer(self):
        sess = self._load()
        base = int(getattr(sess, "diagram_state_version", 0) or 0)
        response = self._status(
            self.sid,
            {"status": "in_progress", "base_diagram_state_version": base},
            self.viewer_token,
        )
        self.assertEqual(response.status_code, 403)

    def test_editor_can_change_status_but_not_archive(self):
        sess = self._load()
        base = int(getattr(sess, "diagram_state_version", 0) or 0)
        r1 = self._status(
            self.sid,
            {"status": "in_progress", "base_diagram_state_version": base},
            self.editor_token,
        )
        self.assertEqual(r1.status_code, 200)

        r1_data = r1.json() or {}
        self.assertEqual(self._load().diagram_state_version, base)
        next_base = r1_data.get("diagram_state_version")
        if next_base is None:
            next_base = base
        r2 = self._status(
            self.sid,
            {"status": "archived", "base_diagram_state_version": next_base},
            self.editor_token,
        )
        self.assertEqual(r2.status_code, 403)

    def test_status_transition_preserves_diagram_state_version(self):
        sess = self._load()
        base = int(getattr(sess, "diagram_state_version", 0) or 0)
        response = self._status(
            self.sid,
            {"status": "in_progress", "base_diagram_state_version": base},
            self.owner_token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._load().diagram_state_version, base)

    def test_status_ready_transition_preserves_diagram_state_version(self):
        sess = self._load()
        base = int(getattr(sess, "diagram_state_version", 0) or 0)
        r1 = self._status(
            self.sid,
            {"status": "in_progress", "base_diagram_state_version": base},
            self.owner_token,
        )
        self.assertEqual(r1.status_code, 200)
        self.assertEqual(self._load().diagram_state_version, base)

        r2 = self._status(
            self.sid,
            {"status": "ready", "base_diagram_state_version": base},
            self.owner_token,
        )
        self.assertEqual(r2.status_code, 200)
        data = r2.json() or {}
        self.assertEqual(((data.get("interview") or {}).get("status")), "ready")
        self.assertEqual(self._load().diagram_state_version, base)

    def test_mixed_payload_with_status_rejected(self):
        sess = self._load()
        base = int(getattr(sess, "diagram_state_version", 0) or 0)
        response = self.client.patch(
            f"/api/sessions/{self.sid}",
            json={"status": "in_progress", "title": "new title", "base_diagram_state_version": base},
            headers={"Authorization": f"Bearer {self.owner_token}"},
        )
        self.assertEqual(response.status_code, 422)

    def test_service_returns_not_found_for_missing_session(self):
        result = change_session_status("missing_session_xyz", StatusPatchIn(status="in_progress"))
        self.assertEqual(result.get("error"), "not found")

    def test_service_returns_not_found_without_request_scope(self):
        result = change_session_status(
            self.sid,
            StatusPatchIn(status="in_progress", base_diagram_state_version=0),
        )
        self.assertEqual(result.get("error"), "not found")


if __name__ == "__main__":
    unittest.main()
