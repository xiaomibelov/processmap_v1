import json
import os
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


SOURCE_BPMN_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_Source" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_Source" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Start">
      <bpmn:outgoing>Flow_to_sub</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:subProcess id="SubProcess_1" name="Review package">
      <bpmn:incoming>Flow_to_sub</bpmn:incoming>
      <bpmn:outgoing>Flow_from_sub</bpmn:outgoing>
      <bpmn:startEvent id="SubStart_1" name="Sub start">
        <bpmn:outgoing>SF_1</bpmn:outgoing>
      </bpmn:startEvent>
      <bpmn:userTask id="InnerTask_1" name="Inner approve" camunda:assignee="ops">
        <bpmn:documentation>Inner task doc</bpmn:documentation>
        <bpmn:incoming>SF_1</bpmn:incoming>
        <bpmn:outgoing>SF_2</bpmn:outgoing>
        <bpmn:extensionElements>
          <camunda:properties>
            <camunda:property name="priority" value="high" />
          </camunda:properties>
        </bpmn:extensionElements>
      </bpmn:userTask>
      <bpmn:exclusiveGateway id="Gateway_1" name="Route">
        <bpmn:incoming>SF_2</bpmn:incoming>
        <bpmn:outgoing>SF_3</bpmn:outgoing>
      </bpmn:exclusiveGateway>
      <bpmn:serviceTask id="ServiceTask_1" name="Call risk engine" camunda:class="svc.Check">
        <bpmn:documentation>Service task doc</bpmn:documentation>
        <bpmn:incoming>SF_3</bpmn:incoming>
        <bpmn:outgoing>SF_4</bpmn:outgoing>
        <bpmn:extensionElements>
          <camunda:properties>
            <camunda:property name="service_level" value="gold" />
          </camunda:properties>
        </bpmn:extensionElements>
      </bpmn:serviceTask>
      <bpmn:endEvent id="SubEnd_1" name="Sub end">
        <bpmn:incoming>SF_4</bpmn:incoming>
      </bpmn:endEvent>
      <bpmn:sequenceFlow id="SF_1" sourceRef="SubStart_1" targetRef="InnerTask_1" />
      <bpmn:sequenceFlow id="SF_2" sourceRef="InnerTask_1" targetRef="Gateway_1" />
      <bpmn:sequenceFlow id="SF_3" sourceRef="Gateway_1" targetRef="ServiceTask_1" name="happy" />
      <bpmn:sequenceFlow id="SF_4" sourceRef="ServiceTask_1" targetRef="SubEnd_1" />
    </bpmn:subProcess>
    <bpmn:endEvent id="EndEvent_1" name="End">
      <bpmn:incoming>Flow_from_sub</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_to_sub" sourceRef="StartEvent_1" targetRef="SubProcess_1" />
    <bpmn:sequenceFlow id="Flow_from_sub" sourceRef="SubProcess_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_Source">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="100" y="220" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubProcess_1_di" bpmnElement="SubProcess_1" isExpanded="true">
        <dc:Bounds x="220" y="120" width="520" height="280" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubStart_1_di" bpmnElement="SubStart_1">
        <dc:Bounds x="260" y="240" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="InnerTask_1_di" bpmnElement="InnerTask_1">
        <dc:Bounds x="340" y="218" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_1_di" bpmnElement="Gateway_1">
        <dc:Bounds x="500" y="233" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ServiceTask_1_di" bpmnElement="ServiceTask_1">
        <dc:Bounds x="590" y="218" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubEnd_1_di" bpmnElement="SubEnd_1">
        <dc:Bounds x="760" y="240" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="860" y="220" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_to_sub_di" bpmnElement="Flow_to_sub">
        <di:waypoint x="136" y="238" />
        <di:waypoint x="220" y="238" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="SF_1_di" bpmnElement="SF_1">
        <di:waypoint x="296" y="258" />
        <di:waypoint x="340" y="258" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="SF_2_di" bpmnElement="SF_2">
        <di:waypoint x="460" y="258" />
        <di:waypoint x="500" y="258" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="SF_3_di" bpmnElement="SF_3">
        <di:waypoint x="550" y="258" />
        <di:waypoint x="590" y="258" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="SF_4_di" bpmnElement="SF_4">
        <di:waypoint x="710" y="258" />
        <di:waypoint x="760" y="258" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_from_sub_di" bpmnElement="Flow_from_sub">
        <di:waypoint x="740" y="238" />
        <di:waypoint x="860" y="238" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
"""


TARGET_BPMN_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_Target" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_Target" isExecutable="false">
    <bpmn:startEvent id="TargetStart_1" name="Start">
      <bpmn:outgoing>TargetFlow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="TargetTask_1" name="Existing task">
      <bpmn:incoming>TargetFlow_1</bpmn:incoming>
      <bpmn:outgoing>TargetFlow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="TargetEnd_1" name="End">
      <bpmn:incoming>TargetFlow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="TargetFlow_1" sourceRef="TargetStart_1" targetRef="TargetTask_1" />
    <bpmn:sequenceFlow id="TargetFlow_2" sourceRef="TargetTask_1" targetRef="TargetEnd_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_Target">
    <bpmndi:BPMNPlane id="BPMNPlane_Target" bpmnElement="Process_Target">
      <bpmndi:BPMNShape id="TargetStart_1_di" bpmnElement="TargetStart_1">
        <dc:Bounds x="100" y="100" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="TargetTask_1_di" bpmnElement="TargetTask_1">
        <dc:Bounds x="220" y="78" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="TargetEnd_1_di" bpmnElement="TargetEnd_1">
        <dc:Bounds x="430" y="100" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="TargetFlow_1_di" bpmnElement="TargetFlow_1">
        <di:waypoint x="136" y="118" />
        <di:waypoint x="220" y="118" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="TargetFlow_2_di" bpmnElement="TargetFlow_2">
        <di:waypoint x="340" y="118" />
        <di:waypoint x="430" y="118" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
"""


UNSUPPORTED_SUBPROCESS_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_Bad" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_Bad" isExecutable="false">
    <bpmn:subProcess id="SubProcess_Bad" name="Unsupported">
      <bpmn:startEvent id="SubStart_bad" />
      <bpmn:intermediateCatchEvent id="Timer_1" />
      <bpmn:endEvent id="SubEnd_bad" />
      <bpmn:sequenceFlow id="Bad_Flow_1" sourceRef="SubStart_bad" targetRef="Timer_1" />
      <bpmn:sequenceFlow id="Bad_Flow_2" sourceRef="Timer_1" targetRef="SubEnd_bad" />
    </bpmn:subProcess>
  </bpmn:process>
</bpmn:definitions>
"""


def _local(tag: str) -> str:
    return str(tag or "").split("}", 1)[-1]


def _iter_local(root, local_name: str):
    q = str(local_name or "").lower()
    for el in root.iter():
        if _local(el.tag).lower() == q:
            yield el


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class _FakeRedis:
    def __init__(self):
        self.store = {}
        self.ttl = {}

    def get(self, key):
        return self.store.get(str(key))

    def set(self, key, value, ex=None):
        self.store[str(key)] = str(value)
        self.ttl[str(key)] = int(ex or 0)
        return True

    def setex(self, key, ttl, value):
        self.store[str(key)] = str(value)
        self.ttl[str(key)] = int(ttl or 0)
        return True

    def delete(self, key):
        cache_key = str(key)
        existed = cache_key in self.store
        self.store.pop(cache_key, None)
        self.ttl.pop(cache_key, None)
        return 1 if existed else 0

    def scan_iter(self, match=None, count=500):
        _ = count
        expr = str(match or "")
        prefix = expr[:-1] if expr.endswith("*") else expr
        for key in sorted(self.store.keys()):
            if not prefix or key.startswith(prefix):
                yield key


def _read_response(out):
    if hasattr(out, "status_code"):
        try:
            payload = json.loads((out.body or b"{}").decode("utf-8"))
        except Exception:
            payload = {}
        return int(getattr(out, "status_code", 0) or 0), payload
    return 200, out if isinstance(out, dict) else {}


class BpmnSubprocessClipboardTests(unittest.TestCase):
    def setUp(self):
        self.tmp_sessions = tempfile.TemporaryDirectory()
        self.tmp_projects = tempfile.TemporaryDirectory()
        self.old_sessions_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_projects_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_redis_required = os.environ.get("REDIS_REQUIRED")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp_sessions.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp_projects.name
        os.environ.pop("PROCESS_DB_PATH", None)
        os.environ["REDIS_REQUIRED"] = "0"

        from app.auth import create_user
        from app._legacy_main import (
            BpmnXmlIn,
            CreateProjectIn,
            CreateSessionIn,
            create_project,
            create_project_session,
            get_storage,
            session_bpmn_save,
        )
        from app.clipboard.api import (
            ClipboardCopyIn,
            ClipboardPasteIn,
            copy_bpmn_element_to_clipboard,
            get_current_bpmn_clipboard,
            paste_bpmn_clipboard,
        )
        from app.clipboard.redis_store import clipboard_key
        from app.clipboard.serializer import ClipboardSubprocessPayload, serialize_clipboard_payload
        from app.models import Node
        from app.storage import get_default_org_id, upsert_org_membership, upsert_project_membership

        self.BpmnXmlIn = BpmnXmlIn
        self.CreateProjectIn = CreateProjectIn
        self.CreateSessionIn = CreateSessionIn
        self.create_project = create_project
        self.create_project_session = create_project_session
        self.get_storage = get_storage
        self.session_bpmn_save = session_bpmn_save
        self.ClipboardCopyIn = ClipboardCopyIn
        self.ClipboardPasteIn = ClipboardPasteIn
        self.copy_bpmn_element_to_clipboard = copy_bpmn_element_to_clipboard
        self.get_current_bpmn_clipboard = get_current_bpmn_clipboard
        self.paste_bpmn_clipboard = paste_bpmn_clipboard
        self.clipboard_key = clipboard_key
        self.ClipboardSubprocessPayload = ClipboardSubprocessPayload
        self.serialize_clipboard_payload = serialize_clipboard_payload
        self.Node = Node
        self.create_user = create_user
        self.get_default_org_id = get_default_org_id
        self.upsert_org_membership = upsert_org_membership
        self.upsert_project_membership = upsert_project_membership

        self.org_id = get_default_org_id()
        self.owner = create_user("subprocess_clipboard_owner@local", "admin", is_admin=False)
        self.upsert_org_membership(self.org_id, str(self.owner.get("id") or ""), "org_admin")

        source_project = self.create_project(self.CreateProjectIn(title="Source Project"), self._req(self.owner))
        target_project = self.create_project(self.CreateProjectIn(title="Target Project"), self._req(self.owner))
        self.source_project_id = str(source_project.get("id") or "")
        self.target_project_id = str(target_project.get("id") or "")

        source_session = self.create_project_session(
            self.source_project_id,
            self.CreateSessionIn(title="Source Session"),
            "quick_skeleton",
            request=self._req(self.owner),
        )
        target_session = self.create_project_session(
            self.target_project_id,
            self.CreateSessionIn(title="Target Session"),
            "quick_skeleton",
            request=self._req(self.owner),
        )
        self.source_session_id = str(source_session.get("id") or "")
        self.target_session_id = str(target_session.get("id") or "")
        self.assertTrue(self.source_session_id)
        self.assertTrue(self.target_session_id)

        self.assertTrue(bool(self.session_bpmn_save(self.source_session_id, self.BpmnXmlIn(xml=SOURCE_BPMN_XML), self._req(self.owner)).get("ok")))
        self.assertTrue(bool(self.session_bpmn_save(self.target_session_id, self.BpmnXmlIn(xml=TARGET_BPMN_XML), self._req(self.owner)).get("ok")))
        self._seed_source_state()

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
        if self.old_redis_required is None:
            os.environ.pop("REDIS_REQUIRED", None)
        else:
            os.environ["REDIS_REQUIRED"] = self.old_redis_required
        self.tmp_sessions.cleanup()
        self.tmp_projects.cleanup()

    def _req(self, user: dict):
        return _DummyRequest(user, active_org_id=self.org_id)

    def _seed_source_state(self):
        st = self.get_storage()
        sess = st.load(self.source_session_id, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(sess)
        sess.nodes = [
            self.Node(
                id="InnerTask_1",
                type="step",
                title="Inner approve",
                actor_role="ops",
                parameters={"service": "approval"},
            ),
            self.Node(
                id="ServiceTask_1",
                type="step",
                title="Call risk engine",
                actor_role="system",
                parameters={"service": "risk-engine"},
            ),
        ]
        sess.notes_by_element = {
            "InnerTask_1": {
                "summary": "Inner task notes",
                "items": [{"id": "n1", "text": "Check compliance", "createdAt": 1, "updatedAt": 1}],
            }
        }
        sess.bpmn_meta = {
            "version": 1,
            "flow_meta": {"SF_3": {"tier": "P0"}},
            "node_path_meta": {"InnerTask_1": {"paths": ["P0"], "sequence_key": "primary", "source": "manual"}},
            "robot_meta_by_element_id": {
                "InnerTask_1": {"robot_meta_version": "v1", "exec": {"mode": "machine", "action_key": "approve.run"}},
            },
            "camunda_extensions_by_element_id": {
                "InnerTask_1": {"properties": [{"name": "priority", "value": "high"}]},
                "ServiceTask_1": {"properties": [{"name": "service_level", "value": "gold"}]},
            },
            "presentation_by_element_id": {"InnerTask_1": {"badge": "ops"}},
            "hybrid_layer_by_element_id": {"InnerTask_1": {"dx": 6, "dy": 10}},
        }
        st.save(sess, user_id=str(self.owner.get("id") or ""), org_id=self.org_id, is_admin=True)

    def test_serializer_builds_normalized_subprocess_payload(self):
        sess = self.get_storage().load(self.source_session_id, org_id=self.org_id, is_admin=True)
        payload = self.serialize_clipboard_payload(
            session_obj=sess,
            element_id="SubProcess_1",
            copied_by_user_id=str(self.owner.get("id") or ""),
            copied_at=1730000000,
            source_org_id=self.org_id,
        )
        self.assertIsInstance(payload, self.ClipboardSubprocessPayload)
        self.assertEqual(payload.clipboard_item_type, "bpmn_subprocess_subtree")
        self.assertEqual(payload.root.old_id, "SubProcess_1")
        self.assertEqual(payload.root.element_type, "subProcess")
        node_ids = {node.old_id for node in payload.fragment.nodes}
        self.assertEqual(node_ids, {"SubStart_1", "InnerTask_1", "Gateway_1", "ServiceTask_1", "SubEnd_1"})
        edge_ids = {edge.old_id for edge in payload.fragment.edges}
        self.assertEqual(edge_ids, {"SF_1", "SF_2", "SF_3", "SF_4"})
        self.assertNotIn("Flow_to_sub", edge_ids)
        inner_task = next(node for node in payload.fragment.nodes if node.old_id == "InnerTask_1")
        self.assertEqual(inner_task.parent_old_id, "SubProcess_1")
        self.assertEqual(inner_task.documentation, "Inner task doc")
        self.assertEqual(inner_task.task_local_state.get("camunda_extensions_by_element_id", {}).get("properties", [{}])[0].get("value"), "high")
        self.assertEqual(inner_task.task_local_state.get("notes_by_element", {}).get("summary"), "Inner task notes")
        self.assertEqual(inner_task.session_node.get("parameters", {}).get("service"), "approval")
        flow_sf3 = next(edge for edge in payload.fragment.edges if edge.old_id == "SF_3")
        self.assertEqual(flow_sf3.name, "happy")
        self.assertEqual(flow_sf3.edge_local_state.get("tier"), "P0")

    def test_copy_and_paste_roundtrip_restores_inner_semantics_with_new_ids(self):
        fake = _FakeRedis()
        with patch("app.redis_cache.get_client", return_value=fake):
            copy_out = self.copy_bpmn_element_to_clipboard(
                self.ClipboardCopyIn(session_id=self.source_session_id, element_id="SubProcess_1"),
                self._req(self.owner),
            )
            copy_status, copy_body = _read_response(copy_out)
            self.assertEqual(copy_status, 200)
            self.assertEqual(str(copy_body.get("clipboard_item_type") or ""), "bpmn_subprocess_subtree")

            preview_out = self.get_current_bpmn_clipboard(self._req(self.owner))
            _, preview_body = _read_response(preview_out)
            self.assertEqual(bool(preview_body.get("empty")), False)
            self.assertEqual(str((preview_body.get("item") or {}).get("element_type") or ""), "subProcess")

            paste_out = self.paste_bpmn_clipboard(
                self.ClipboardPasteIn(session_id=self.target_session_id),
                self._req(self.owner),
            )
            paste_status, paste_body = _read_response(paste_out)
            self.assertEqual(paste_status, 200)
            self.assertTrue(bool(paste_body.get("ok")))
            pasted_root_id = str(paste_body.get("pasted_root_element_id") or "")
            created_node_ids = set(paste_body.get("created_node_ids") or [])
            created_edge_ids = set(paste_body.get("created_edge_ids") or [])
            self.assertTrue(pasted_root_id)
            self.assertIn(pasted_root_id, created_node_ids)
            self.assertEqual(len(created_node_ids), 6)
            self.assertEqual(len(created_edge_ids), 4)
            self.assertNotIn("SubProcess_1", created_node_ids)
            self.assertNotIn("SF_3", created_edge_ids)

        st = self.get_storage()
        reloaded = st.load(self.target_session_id, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(reloaded)
        root = ET.fromstring(str(getattr(reloaded, "bpmn_xml", "") or ""))
        pasted_subprocess = next((el for el in _iter_local(root, "subProcess") if str(el.attrib.get("id") or "").strip() == pasted_root_id), None)
        self.assertIsNotNone(pasted_subprocess)

        process_xml = str(getattr(reloaded, "bpmn_xml", "") or "")
        self.assertNotIn('id="SubProcess_1"', process_xml)
        self.assertNotIn('id="InnerTask_1"', process_xml)
        self.assertNotIn('sourceRef="SubStart_1"', process_xml)

        inner_task = next((el for el in _iter_local(pasted_subprocess, "userTask") if str(el.attrib.get("name") or "") == "Inner approve"), None)
        self.assertIsNotNone(inner_task)
        inner_task_id = str(inner_task.attrib.get("id") or "")
        self.assertNotEqual(inner_task_id, "InnerTask_1")
        self.assertEqual(str(inner_task.attrib.get("{http://camunda.org/schema/1.0/bpmn}assignee") or ""), "ops")
        doc = next(_iter_local(inner_task, "documentation"), None)
        self.assertEqual(str("".join(doc.itertext()) if doc is not None else ""), "Inner task doc")
        prop = next((el for el in _iter_local(inner_task, "property") if str(el.attrib.get("name") or "") == "priority"), None)
        self.assertIsNotNone(prop)
        self.assertEqual(str(prop.attrib.get("value") or ""), "high")

        service_task = next((el for el in _iter_local(pasted_subprocess, "serviceTask") if str(el.attrib.get("name") or "") == "Call risk engine"), None)
        self.assertIsNotNone(service_task)
        self.assertNotEqual(str(service_task.attrib.get("id") or ""), "ServiceTask_1")
        self.assertEqual(str(service_task.attrib.get("{http://camunda.org/schema/1.0/bpmn}class") or ""), "svc.Check")

        flow_happy = next((el for el in _iter_local(pasted_subprocess, "sequenceFlow") if str(el.attrib.get("name") or "") == "happy"), None)
        self.assertIsNotNone(flow_happy)
        flow_happy_id = str(flow_happy.attrib.get("id") or "")
        self.assertNotEqual(flow_happy_id, "SF_3")
        self.assertIn(str(flow_happy.attrib.get("sourceRef") or ""), created_node_ids)
        self.assertIn(str(flow_happy.attrib.get("targetRef") or ""), created_node_ids)

        meta = getattr(reloaded, "bpmn_meta", {}) if isinstance(getattr(reloaded, "bpmn_meta", {}), dict) else {}
        self.assertIn(inner_task_id, meta.get("camunda_extensions_by_element_id", {}))
        self.assertEqual(
            meta.get("camunda_extensions_by_element_id", {}).get(inner_task_id, {}).get("properties", [{}])[0].get("value"),
            "high",
        )
        self.assertIn(inner_task_id, meta.get("robot_meta_by_element_id", {}))
        self.assertEqual(
            meta.get("robot_meta_by_element_id", {}).get(inner_task_id, {}).get("exec", {}).get("action_key"),
            "approve.run",
        )
        self.assertIn(flow_happy_id, meta.get("flow_meta", {}))
        self.assertEqual(meta.get("flow_meta", {}).get(flow_happy_id, {}).get("tier"), "P0")
        self.assertIn(inner_task_id, getattr(reloaded, "notes_by_element", {}))
        self.assertEqual(getattr(reloaded, "notes_by_element", {}).get(inner_task_id, {}).get("summary"), "Inner task notes")
        self.assertTrue(any(str(getattr(node, "id", "") or "") == inner_task_id for node in list(getattr(reloaded, "nodes", []) or [])))

        # Save/reload proof: second load keeps remapped ids and inner state.
        second_reload = st.load(self.target_session_id, org_id=self.org_id, is_admin=True)
        self.assertIn(inner_task_id, getattr(second_reload, "bpmn_meta", {}).get("camunda_extensions_by_element_id", {}))
        self.assertIn(flow_happy_id, getattr(second_reload, "bpmn_meta", {}).get("flow_meta", {}))

    def test_unsupported_subprocess_topology_rejects_clearly(self):
        extra_project = self.create_project(self.CreateProjectIn(title="Unsupported Project"), self._req(self.owner))
        bad_session = self.create_project_session(
            str(extra_project.get("id") or ""),
            self.CreateSessionIn(title="Bad Session"),
            "quick_skeleton",
            request=self._req(self.owner),
        )
        bad_session_id = str(bad_session.get("id") or "")
        self.assertTrue(bool(self.session_bpmn_save(bad_session_id, self.BpmnXmlIn(xml=UNSUPPORTED_SUBPROCESS_XML), self._req(self.owner)).get("ok")))
        fake = _FakeRedis()
        with patch("app.redis_cache.get_client", return_value=fake):
            out = self.copy_bpmn_element_to_clipboard(
                self.ClipboardCopyIn(session_id=bad_session_id, element_id="SubProcess_Bad"),
                self._req(self.owner),
            )
        status, body = _read_response(out)
        self.assertEqual(status, 422)
        self.assertEqual(str(((body.get("error") or {}).get("code") or "")), "unsupported_subprocess_topology")


if __name__ == "__main__":
    unittest.main()
