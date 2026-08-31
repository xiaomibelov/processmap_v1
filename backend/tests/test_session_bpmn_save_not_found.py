"""Regression tests for PUT /api/sessions/{session_id}/bpmn.

Covers the stage incident where save returned SESSION_NOT_FOUND for an
existing session (F5 in stage-verify-agent-wave-a-v1).
"""

import unittest

from fastapi.testclient import TestClient

from app.auth import create_access_token, create_user
from app.main import app
from app.schemas.legacy_api import BpmnXmlIn
from app.storage import (
    create_org_record,
    get_storage,
    upsert_org_membership,
    upsert_project_membership,
)


SAMPLE_BPMN_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>
"""


class TestSessionBpmnSaveNotFound(unittest.TestCase):
    def setUp(self):
        self.st = get_storage()
        self.client = TestClient(app)

        self.owner = create_user("owner_bpmn_save@local", "password", is_admin=True)
        self.org_id = "org_bpmn_save_regression"
        create_org_record(
            "BPMN Save Regression Org",
            created_by=str(self.owner["id"]),
            org_id=self.org_id,
        )
        upsert_org_membership(self.org_id, str(self.owner["id"]), "owner")
        upsert_project_membership(self.org_id, "proj_bpmn_save", str(self.owner["id"]), "owner")

        self.token = create_access_token(str(self.owner["id"]))
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "X-Active-Org-Id": self.org_id,
        }

        self.sid = self.st.create(
            title="bpmn-save-regression",
            user_id=str(self.owner["id"]),
            org_id=self.org_id,
            project_id="proj_bpmn_save",
        )

    def test_save_existing_session_returns_ok(self):
        response = self.client.put(
            f"/api/sessions/{self.sid}/bpmn",
            json={
                "xml": SAMPLE_BPMN_XML,
                "base_diagram_state_version": 0,
            },
            headers=self.headers,
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data.get("ok"))
        self.assertEqual(data.get("session_id"), self.sid)
        self.assertIn("diagram_state_version", data)

    def test_save_missing_session_returns_404_with_session_id(self):
        missing_sid = "missing_session_12345"
        response = self.client.put(
            f"/api/sessions/{missing_sid}/bpmn",
            json={
                "xml": SAMPLE_BPMN_XML,
                "base_diagram_state_version": 0,
            },
            headers=self.headers,
        )
        self.assertEqual(response.status_code, 404)
        detail = response.json().get("detail", {})
        self.assertEqual(detail.get("code"), "SESSION_NOT_FOUND")
        self.assertEqual(str(detail.get("session_id")), missing_sid)

    def test_save_literal_none_session_id_is_rejected_with_400(self):
        # Defensive guard: frontend must never send the literal string "None"
        # as a session id. If it does, surface a clear 400 instead of masking
        # it as SESSION_NOT_FOUND.
        response = self.client.put(
            "/api/sessions/None/bpmn",
            json={
                "xml": SAMPLE_BPMN_XML,
                "base_diagram_state_version": 0,
            },
            headers=self.headers,
        )
        self.assertEqual(response.status_code, 400)
        detail = response.json().get("detail", {})
        self.assertEqual(detail.get("code"), "INVALID_SESSION_ID")
        self.assertEqual(str(detail.get("session_id")), "None")


if __name__ == "__main__":
    unittest.main()
