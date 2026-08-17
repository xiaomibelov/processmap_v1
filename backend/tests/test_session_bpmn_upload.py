"""P6 [Г]: интеграционные тесты POST /api/sessions/{id}/bpmn-upload.

Multipart upload .bpmn/.xml: happy path, невалидное расширение/бинарник/
невалидный BPMN → явная 422 (RU detail), >20МБ → 413, без auth → 401/403.
Внутренний путь сохранения общий с PUT /api/sessions/{id}/bpmn (bpmn_save).
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


class TestSessionBpmnUpload(unittest.TestCase):
    def setUp(self):
        self.st = get_storage()
        self.client = TestClient(app)

        self.owner = create_user("owner_bpmn_upload@local", "password", is_admin=True)
        self.org_id = "org_bpmn_upload"
        create_org_record("Bpmn Upload Org", created_by=str(self.owner["id"]), org_id=self.org_id)
        upsert_org_membership(self.org_id, str(self.owner["id"]), "owner")
        upsert_project_membership(self.org_id, "proj_1", str(self.owner["id"]), "owner")

        self.token = create_access_token(str(self.owner["id"]))
        self.headers = {"Authorization": f"Bearer {self.token}"}

        self.sid = self.st.create(
            title="upload-target",
            user_id=str(self.owner["id"]),
            org_id=self.org_id,
            project_id="proj_1",
        )

    def _upload(self, filename, content, content_type="application/xml", headers=None, sid=None):
        return self.client.post(
            f"/api/sessions/{sid or self.sid}/bpmn-upload",
            files={"file": (filename, content, content_type)},
            headers=self.headers if headers is None else headers,
        )

    def test_happy_path_saves_bpmn_xml(self):
        resp = self._upload("process.bpmn", VALID_BPMN.encode("utf-8"))
        self.assertEqual(resp.status_code, 200, resp.text)
        payload = resp.json()
        self.assertTrue(payload.get("ok"), payload)
        saved = self.st.load(self.sid, org_id=self.org_id, is_admin=True)
        self.assertIn("bpmn:definitions", str(getattr(saved, "bpmn_xml", "") or ""))

    def test_xml_extension_accepted(self):
        resp = self._upload("process.xml", VALID_BPMN.encode("utf-8"), "text/xml")
        self.assertEqual(resp.status_code, 200, resp.text)

    def test_wrong_extension_422(self):
        resp = self._upload("process.txt", VALID_BPMN.encode("utf-8"), "text/plain")
        self.assertEqual(resp.status_code, 422)
        self.assertIn(".bpmn", resp.json()["detail"])

    def test_binary_file_422_not_generic_500(self):
        resp = self._upload("diagram.bpmn", b"\x00\x01\x02\xff\xfebinarygarbage", "application/octet-stream")
        self.assertEqual(resp.status_code, 422)
        self.assertIn("UTF-8", resp.json()["detail"])

    def test_wrong_content_type_422(self):
        resp = self._upload("process.bpmn", VALID_BPMN.encode("utf-8"), "image/png")
        self.assertEqual(resp.status_code, 422)
        self.assertIn("Content-Type", resp.json()["detail"])

    def test_oversize_file_413(self):
        big = b"<x>" + b"a" * (20 * 1024 * 1024) + b"</x>"
        resp = self._upload("big.bpmn", big)
        self.assertEqual(resp.status_code, 413)

    def test_parseable_xml_but_not_bpmn_422(self):
        resp = self._upload("data.xml", b"<root><item/></root>")
        self.assertEqual(resp.status_code, 422)
        self.assertIn("BPMN", resp.json()["detail"])

    def test_broken_xml_422(self):
        resp = self._upload("broken.bpmn", b"<bpmn:definitions><unclosed>")
        self.assertEqual(resp.status_code, 422)

    def test_unauthorized_rejected(self):
        resp = self._upload("process.bpmn", VALID_BPMN.encode("utf-8"), headers={})
        self.assertIn(resp.status_code, (401, 403), resp.text)

    def test_missing_session_404(self):
        resp = self._upload("process.bpmn", VALID_BPMN.encode("utf-8"), sid="sess_missing_upload")
        self.assertEqual(resp.status_code, 404)


if __name__ == "__main__":
    unittest.main()
