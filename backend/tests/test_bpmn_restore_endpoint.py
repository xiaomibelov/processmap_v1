"""Regression test for BPMN version restore endpoint wiring.

Before the fix, `routers/sessions.py` and `session_service.py` passed the
FastAPI `Request` object positionally to `session_bpmn_restore`, whose legacy
signature is `(session_id, version_id, inp=None, request=None)`.  This caused
`request` inside the legacy function to be `None`, so session/org resolution
fell back to the default org and could return `{"error": "not found"}`.
"""

from __future__ import annotations

import os
import tempfile
import unittest
import uuid

from fastapi.testclient import TestClient

from app.auth import create_access_token, create_user
from app.main import app
from app.storage import get_storage, get_default_org_id


SIMPLE_BPMN_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  id="Definitions_test"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_test" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:task id="Task_1" name="Task" />
    <bpmn:endEvent id="EndEvent_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>"""


class BpmnRestoreEndpointTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ.setdefault("JWT_SECRET", "test-secret")

        self.st = get_storage()
        self.client = TestClient(app)

        suffix = uuid.uuid4().hex
        self.owner = create_user(f"owner_restore_{suffix}@local", "password", is_admin=True)
        self.token = create_access_token(str(self.owner["id"]))
        self.org_id = str(get_default_org_id() or "").strip() or "default"

        self.sid = self.st.create(
            title="restore-endpoint-session",
            user_id=str(self.owner["id"]),
            org_id=self.org_id,
            project_id="proj_1",
        )

    def tearDown(self):
        self.tmp.cleanup()

    def _headers(self):
        return {
            "Authorization": f"Bearer {self.token}",
            "x-active-org-id": self.org_id,
        }

    def test_restore_endpoint_returns_ok_and_restores_xml(self):
        # 1. Save BPMN to create a version snapshot.
        save_resp = self.client.put(
            f"/api/sessions/{self.sid}/bpmn",
            json={"xml": SIMPLE_BPMN_XML, "base_diagram_state_version": 0},
            headers=self._headers(),
        )
        self.assertEqual(save_resp.status_code, 200, save_resp.text)
        save_body = save_resp.json()
        self.assertTrue(save_body.get("ok"), save_body)
        current_version = int(save_body.get("diagram_state_version") or 0)
        self.assertGreater(current_version, 0)

        snapshot = save_body.get("bpmn_version_snapshot") or {}
        version_id = str(snapshot.get("id") or "").strip()
        self.assertTrue(version_id, "expected a version snapshot id")

        # 2. Restore the created version through the router/service/legacy chain.
        restore_resp = self.client.post(
            f"/api/sessions/{self.sid}/bpmn/restore/{version_id}",
            json={"base_diagram_state_version": current_version},
            headers=self._headers(),
        )
        self.assertEqual(restore_resp.status_code, 200, restore_resp.text)
        restore_body = restore_resp.json()
        self.assertTrue(restore_body.get("ok"), restore_body)
        self.assertIn("bpmn_xml", restore_body)
        self.assertIn("Task_1", restore_body["bpmn_xml"])

    def test_restore_endpoint_without_base_version_requires_cas_refresh(self):
        # Save to create a version.
        save_resp = self.client.put(
            f"/api/sessions/{self.sid}/bpmn",
            json={"xml": SIMPLE_BPMN_XML, "base_diagram_state_version": 0},
            headers=self._headers(),
        )
        save_body = save_resp.json()
        version_id = str((save_body.get("bpmn_version_snapshot") or {}).get("id") or "")
        self.assertTrue(version_id)

        # Restore without base_diagram_state_version should now be rejected
        # because request and body are correctly forwarded to the legacy CAS guard.
        restore_resp = self.client.post(
            f"/api/sessions/{self.sid}/bpmn/restore/{version_id}",
            headers=self._headers(),
        )
        self.assertEqual(restore_resp.status_code, 409, restore_resp.text)
        detail = restore_resp.json().get("detail") or {}
        self.assertEqual(detail.get("code"), "DIAGRAM_STATE_BASE_VERSION_REQUIRED")


if __name__ == "__main__":
    unittest.main()
