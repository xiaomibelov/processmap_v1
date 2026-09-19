"""fix/self-conflict-silent-rebase B1: writer-info (client_id) во ВСЕХ путях
диаграммной записи — включая session PATCH (interview autosave / meta).

Баг: patch_session вызывал _mark_diagram_truth_write БЕЗ client_id, поэтому
409-payload нёс server_last_write.client_id == "" и фронтенд-классификатор
видел ложный same_user_other_tab (модал «другой вашей вкладке» при одной
вкладке), а same_tab auto-resolve не срабатывал.
"""

import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

SAMPLE_BPMN_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_A" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_A" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1" name="Task A">
      <bpmn:incoming>Flow_1</bpmn:incoming>
    </bpmn:task>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
  </bpmn:process>
</bpmn:definitions>
"""

# Отличающийся XML (другой id/name) — нужен, чтобы PUT не попадал под
# no-op guard (идентичный XML + base <= current = 200 без бампа версии).
SAMPLE_BPMN_XML_B = SAMPLE_BPMN_XML.replace(
    'id="Definitions_A"', 'id="Definitions_B"'
).replace('id="Process_A"', 'id="Process_B"').replace('name="Task A"', 'name="Task B"')


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str, client_id: str = ""):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}
        if client_id:
            self.headers["x-client-id"] = client_id
        self.query_params = {}
        self.scope = {"type": "http"}


class ConflictLastWriteClientIdTests(unittest.TestCase):
    def setUp(self):
        self.tmp_sessions = tempfile.TemporaryDirectory()
        self.tmp_projects = tempfile.TemporaryDirectory()
        self.old_sessions_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_projects_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp_sessions.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp_projects.name
        os.environ.pop("PROCESS_DB_PATH", None)

        from app._legacy_main import (
            BpmnXmlIn,
            CreateSessionIn,
            UpdateSessionIn,
            create_session,
            get_storage,
            patch_session,
            session_bpmn_save,
        )
        from app.storage import get_default_org_id

        self.BpmnXmlIn = BpmnXmlIn
        self.CreateSessionIn = CreateSessionIn
        self.UpdateSessionIn = UpdateSessionIn
        self.create_session = create_session
        self.get_storage = get_storage
        self.patch_session = patch_session
        self.session_bpmn_save = session_bpmn_save
        self.default_org_id = get_default_org_id()

        created = self.create_session(self.CreateSessionIn(title="client-id test"))
        self.sid = str(created.get("id") or "")
        self.assertTrue(self.sid)
        self.user = {
            "id": "cid_admin_user",
            "email": "cid_admin_user@test.local",
            "is_admin": True,
        }

    def tearDown(self):
        if self.old_sessions_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_sessions_dir
        if self.old_projects_dir is None:
            os.environ.pop("PROJECT_STORAGE_DIR", None)
        else:
            os.environ["PROJECT_STORAGE_DIR"] = self.old_projects_dir
        if self.old_db_path is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = self.old_db_path
        self.tmp_sessions.cleanup()
        self.tmp_projects.cleanup()

    def _req(self, client_id: str = "") -> _DummyRequest:
        return _DummyRequest(self.user, active_org_id=self.default_org_id, client_id=client_id)

    def _seed_xml_version_1(self) -> None:
        out = self.session_bpmn_save(
            self.sid,
            self.BpmnXmlIn(xml=SAMPLE_BPMN_XML, base_diagram_state_version=0),
            self._req("xml-client"),
        )
        self.assertEqual(out.get("ok"), True)

    def test_patch_session_diagram_write_records_client_id_in_last_write(self):
        self._seed_xml_version_1()
        req = self._req("meta-client-abc")
        out = self.patch_session(
            self.sid,
            self.UpdateSessionIn(
                interview={"answers": {"q1": "a1"}},
                base_diagram_state_version=1,
            ),
            req,
        )
        self.assertFalse(str(out.get("error") or ""), out)

        sess = self.get_storage().load(self.sid, is_admin=True)
        self.assertEqual(str(getattr(sess, "diagram_last_write_client_id", "") or ""), "meta-client-abc")
        self.assertEqual(
            list(getattr(sess, "diagram_last_write_changed_keys", []) or []),
            ["interview"],
        )

    def test_conflict_payload_after_meta_write_contains_client_id(self):
        self._seed_xml_version_1()
        meta_req = self._req("meta-client-abc")
        self.patch_session(
            self.sid,
            self.UpdateSessionIn(
                interview={"answers": {"q1": "a1"}},
                base_diagram_state_version=1,
            ),
            meta_req,
        )

        # stale PUT (base=1) → 409; server_last_write должен атрибутировать
        # meta-client-abc, а не пустую строку.
        with self.assertRaises(HTTPException) as cm:
            self.session_bpmn_save(
                self.sid,
                self.BpmnXmlIn(xml=SAMPLE_BPMN_XML_B, base_diagram_state_version=1),
                self._req("xml-client"),
            )
        self.assertEqual(int(getattr(cm.exception, "status_code", 0) or 0), 409)
        detail = getattr(cm.exception, "detail", {}) or {}
        last_write = detail.get("server_last_write") or {}
        self.assertEqual(str(last_write.get("client_id") or ""), "meta-client-abc")
        self.assertEqual(list(last_write.get("changed_keys") or []), ["interview"])
        self.assertEqual(str(last_write.get("actor_user_id") or ""), "cid_admin_user")

    def test_bpmn_put_keeps_recording_client_id(self):
        self._seed_xml_version_1()
        out = self.session_bpmn_save(
            self.sid,
            self.BpmnXmlIn(xml=SAMPLE_BPMN_XML_B, base_diagram_state_version=1),
            self._req("xml-client-2"),
        )
        self.assertEqual(out.get("ok"), True)
        sess = self.get_storage().load(self.sid, is_admin=True)
        self.assertEqual(str(getattr(sess, "diagram_last_write_client_id", "") or ""), "xml-client-2")


if __name__ == "__main__":
    unittest.main()
