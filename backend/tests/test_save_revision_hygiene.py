"""Tests for fix/save-revision-hygiene.

Covers:
- no-op guard in PUT /api/sessions/{id}/bpmn (identical XML+meta does not bump dsv)
- idempotent replay with stale base returns current dsv instead of 409
- CAS stays strict for diverging content
- client_id is echoed in 409 conflict payload
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

VALID_BPMN = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  id="defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="p1" isExecutable="false">
    <bpmn:startEvent id="start" />
  </bpmn:process>
</bpmn:definitions>
"""

CHANGED_BPMN = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  id="defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="p1" isExecutable="false">
    <bpmn:startEvent id="start" />
    <bpmn:task id="task_1" />
  </bpmn:process>
</bpmn:definitions>
"""


class TestSaveRevisionHygiene(unittest.TestCase):
    def setUp(self):
        self.st = get_storage()
        self.client = TestClient(app)

        self.owner = create_user("owner_save_hygiene@local", "password", is_admin=True)
        self.org_id = "org_save_hygiene"
        create_org_record("Save Hygiene Org", created_by=str(self.owner["id"]), org_id=self.org_id)
        upsert_org_membership(self.org_id, str(self.owner["id"]), "owner")
        upsert_project_membership(self.org_id, "proj_1", str(self.owner["id"]), "owner")

        self.token = create_access_token(str(self.owner["id"]))
        self.headers = {"Authorization": f"Bearer {self.token}"}

        self.sid = self.st.create(
            title="save-hygiene-target",
            user_id=str(self.owner["id"]),
            org_id=self.org_id,
            project_id="proj_1",
        )

    def _put_bpmn(self, xml, base_dsv=None, bpmn_meta=None, headers=None):
        body = {"xml": xml}
        if base_dsv is not None:
            body["base_diagram_state_version"] = base_dsv
        if bpmn_meta is not None:
            body["bpmn_meta"] = bpmn_meta
        return self.client.put(
            f"/api/sessions/{self.sid}/bpmn",
            json=body,
            headers=headers if headers is not None else self.headers,
        )

    def test_identical_put_twice_does_not_bump_dsv(self):
        first = self._put_bpmn(VALID_BPMN, base_dsv=0)
        self.assertEqual(first.status_code, 200, first.text)
        first_dsv = first.json().get("diagram_state_version")
        self.assertIsNotNone(first_dsv)

        second = self._put_bpmn(VALID_BPMN, base_dsv=first_dsv)
        self.assertEqual(second.status_code, 200, second.text)
        second_data = second.json()
        self.assertEqual(second_data.get("diagram_state_version"), first_dsv)
        self.assertEqual(second_data.get("changed_keys", []), [])

        loaded = self.st.load(self.sid, org_id=self.org_id, is_admin=True)
        self.assertEqual(int(getattr(loaded, "diagram_state_version", 0) or 0), first_dsv)

    def test_stale_base_identical_content_returns_current_dsv(self):
        first = self._put_bpmn(VALID_BPMN, base_dsv=0)
        self.assertEqual(first.status_code, 200, first.text)
        current_dsv = first.json().get("diagram_state_version")

        replay = self._put_bpmn(VALID_BPMN, base_dsv=current_dsv - 1)
        self.assertEqual(replay.status_code, 200, replay.text)
        replay_data = replay.json()
        self.assertEqual(replay_data.get("diagram_state_version"), current_dsv)
        self.assertEqual(replay_data.get("changed_keys", []), [])

    def test_changed_xml_bumps_dsv_once(self):
        first = self._put_bpmn(VALID_BPMN, base_dsv=0)
        self.assertEqual(first.status_code, 200, first.text)
        first_dsv = first.json().get("diagram_state_version")

        second = self._put_bpmn(CHANGED_BPMN, base_dsv=first_dsv)
        self.assertEqual(second.status_code, 200, second.text)
        second_dsv = second.json().get("diagram_state_version")
        self.assertEqual(second_dsv, first_dsv + 1)

        third = self._put_bpmn(CHANGED_BPMN, base_dsv=second_dsv)
        self.assertEqual(third.status_code, 200, third.text)
        self.assertEqual(third.json().get("diagram_state_version"), second_dsv)

    def test_meta_only_change_bumps_dsv(self):
        first = self._put_bpmn(VALID_BPMN, base_dsv=0)
        first_dsv = first.json().get("diagram_state_version")

        second = self._put_bpmn(VALID_BPMN, base_dsv=first_dsv, bpmn_meta={"viewport": {"x": 1}})
        self.assertEqual(second.status_code, 200, second.text)
        second_data = second.json()
        self.assertEqual(second_data.get("diagram_state_version"), first_dsv + 1)

    def test_diverging_content_with_stale_base_returns_409(self):
        first = self._put_bpmn(VALID_BPMN, base_dsv=0)
        first_dsv = first.json().get("diagram_state_version")

        self._put_bpmn(CHANGED_BPMN, base_dsv=first_dsv)

        stale = self._put_bpmn(VALID_BPMN, base_dsv=first_dsv)
        self.assertEqual(stale.status_code, 409, stale.text)
        detail = stale.json().get("detail", {})
        self.assertEqual(detail.get("code"), "DIAGRAM_STATE_CONFLICT")

    def test_conflict_includes_client_id(self):
        headers = {**self.headers, "X-PM-Client-Id": "tab-alpha-1"}
        first = self._put_bpmn(VALID_BPMN, base_dsv=0, headers=headers)
        first_dsv = first.json().get("diagram_state_version")

        self._put_bpmn(CHANGED_BPMN, base_dsv=first_dsv, headers=headers)

        stale = self._put_bpmn(VALID_BPMN, base_dsv=first_dsv, headers=headers)
        self.assertEqual(stale.status_code, 409, stale.text)
        detail = stale.json().get("detail", {})
        last_write = detail.get("server_last_write", {})
        self.assertEqual(last_write.get("client_id"), "tab-alpha-1")


if __name__ == "__main__":
    unittest.main()
