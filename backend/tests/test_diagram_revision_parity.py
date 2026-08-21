import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


SAMPLE_BPMN_XML_A = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_A" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_A" isExecutable="false">
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


SAMPLE_BPMN_XML_B = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_B" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_B" isExecutable="false">
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


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}
        self.query_params = {}
        self.scope = {"type": "http"}


class DiagramRevisionParityTests(unittest.TestCase):
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
            BpmnMetaPatchIn,
            BpmnXmlIn,
            CreateNodeIn,
            CreateSessionIn,
            add_node,
            create_session,
            get_storage,
            session_bpmn_meta_patch,
            session_bpmn_save,
        )
        from app.storage import get_default_org_id

        self.BpmnMetaPatchIn = BpmnMetaPatchIn
        self.BpmnXmlIn = BpmnXmlIn
        self.CreateNodeIn = CreateNodeIn
        self.CreateSessionIn = CreateSessionIn
        self.add_node = add_node
        self.create_session = create_session
        self.get_storage = get_storage
        self.session_bpmn_meta_patch = session_bpmn_meta_patch
        self.session_bpmn_save = session_bpmn_save
        self.default_org_id = get_default_org_id()

        created = self.create_session(self.CreateSessionIn(title="revision parity test"))
        self.sid = str(created.get("id") or "")
        self.assertTrue(self.sid)
        self.req = _DummyRequest(
            {"id": "parity_admin", "email": "parity_admin@test.local", "is_admin": True},
            active_org_id=self.default_org_id,
        )

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

    def _trace_count_for_version(self, version: int) -> int:
        st = self.get_storage()
        bpmn_count = len(
            [
                row
                for row in st.list_bpmn_versions(self.sid)
                if int(row.get("diagram_state_version") or 0) == int(version)
            ]
        )
        state_count = len(
            [
                row
                for row in st.list_session_state_versions(self.sid)
                if int(row.get("diagram_state_version") or 0) == int(version)
            ]
        )
        return bpmn_count + state_count

    def test_bpmn_xml_write_creates_bpmn_version_trace_with_diagram_state_version(self):
        out = self.session_bpmn_save(
            self.sid,
            self.BpmnXmlIn(
                xml=SAMPLE_BPMN_XML_A,
                source_action="manual_save",
                base_diagram_state_version=0,
            ),
            self.req,
        )
        self.assertEqual(out.get("ok"), True)
        self.assertEqual(int(out.get("diagram_state_version") or 0), 1)

        snapshot = out.get("bpmn_version_snapshot") or {}
        self.assertTrue(str(snapshot.get("id") or "").strip())
        self.assertEqual(int(snapshot.get("diagram_state_version") or 0), 1)

        st = self.get_storage()
        bpmn_versions = st.list_bpmn_versions(self.sid)
        self.assertTrue(any(int(row.get("diagram_state_version") or 0) == 1 for row in bpmn_versions))

        state_versions = st.list_session_state_versions(self.sid)
        self.assertFalse(any(int(row.get("diagram_state_version") or 0) == 1 for row in state_versions))

    def test_non_bpmn_diagram_write_creates_session_state_version_trace(self):
        self.session_bpmn_save(
            self.sid,
            self.BpmnXmlIn(xml=SAMPLE_BPMN_XML_A, source_action="manual_save", base_diagram_state_version=0),
            self.req,
        )
        self.session_bpmn_meta_patch(
            self.sid,
            self.BpmnMetaPatchIn(
                flowId="Flow_1",
                tier="P0",
                base_diagram_state_version=1,
            ),
            self.req,
        )

        st = self.get_storage()
        current = st.load(self.sid, is_admin=True)
        self.assertIsNotNone(current)
        self.assertEqual(int(getattr(current, "diagram_state_version", 0) or 0), 2)

        state_rows = [
            row for row in st.list_session_state_versions(self.sid) if int(row.get("diagram_state_version") or 0) == 2
        ]
        self.assertEqual(len(state_rows), 1)
        row = state_rows[0]
        self.assertEqual(int(row.get("parent_diagram_state_version") or 0), 1)
        self.assertIn("bpmn_meta", list(row.get("changed_keys") or []))
        self.assertEqual(len(str(row.get("payload_hash") or "")), 64)

        bpmn_rows_v2 = [row for row in st.list_bpmn_versions(self.sid) if int(row.get("diagram_state_version") or 0) == 2]
        self.assertEqual(len(bpmn_rows_v2), 0)

    def test_each_accepted_write_has_exactly_one_durable_trace_for_result_version(self):
        self.session_bpmn_save(
            self.sid,
            self.BpmnXmlIn(xml=SAMPLE_BPMN_XML_A, source_action="manual_save", base_diagram_state_version=0),
            self.req,
        )
        self.session_bpmn_meta_patch(
            self.sid,
            self.BpmnMetaPatchIn(
                flowId="Flow_1",
                tier="P0",
                base_diagram_state_version=1,
            ),
            self.req,
        )
        self.session_bpmn_save(
            self.sid,
            self.BpmnXmlIn(xml=SAMPLE_BPMN_XML_B, source_action="manual_save", base_diagram_state_version=2),
            self.req,
        )

        self.assertEqual(self._trace_count_for_version(1), 1)
        self.assertEqual(self._trace_count_for_version(2), 1)
        self.assertEqual(self._trace_count_for_version(3), 1)

    def test_legacy_mutation_path_also_gets_non_bpmn_state_trace(self):
        self.session_bpmn_save(
            self.sid,
            self.BpmnXmlIn(xml=SAMPLE_BPMN_XML_A, source_action="manual_save", base_diagram_state_version=0),
            self.req,
        )
        out = self.add_node(
            self.sid,
            self.CreateNodeIn(id="n1", title="Node 1", type="step", base_diagram_state_version=1),
            self.req,
        )
        self.assertEqual(int(out.get("diagram_state_version") or 0), 2)

        st = self.get_storage()
        state_rows = [
            row for row in st.list_session_state_versions(self.sid) if int(row.get("diagram_state_version") or 0) == 2
        ]
        self.assertEqual(len(state_rows), 1)
        self.assertIn("nodes", list(state_rows[0].get("changed_keys") or []))


if __name__ == "__main__":
    unittest.main()
