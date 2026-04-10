import json
import os
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import sys

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


SAMPLE_BPMN_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="Task_1" name="Approve request" camunda:assignee="ops">
      <bpmn:documentation>Review the incoming request</bpmn:documentation>
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="priority" value="high" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:userTask>
    <bpmn:exclusiveGateway id="Gateway_1" name="Decide">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:endEvent id="EndEvent_1">
      <bpmn:incoming>Flow_3</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="Gateway_1" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Gateway_1" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>
"""

TARGET_BPMN_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_Target"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_Target" isExecutable="false">
    <bpmn:startEvent id="TargetStart">
      <bpmn:outgoing>TargetFlow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:endEvent id="TargetEnd">
      <bpmn:incoming>TargetFlow_1</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="TargetFlow_1" sourceRef="TargetStart" targetRef="TargetEnd" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_Target">
    <bpmndi:BPMNPlane id="BPMNPlane_Target" bpmnElement="Process_Target">
      <bpmndi:BPMNShape id="Shape_TargetStart" bpmnElement="TargetStart">
        <dc:Bounds x="120" y="180" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Shape_TargetEnd" bpmnElement="TargetEnd">
        <dc:Bounds x="260" y="180" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Edge_TargetFlow_1" bpmnElement="TargetFlow_1">
        <di:waypoint x="156" y="198" />
        <di:waypoint x="260" y="198" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
"""


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
        if cache_key not in self.store:
            return 0
        self.store.pop(cache_key, None)
        self.ttl.pop(cache_key, None)
        return 1

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


class BpmnTaskClipboardTests(unittest.TestCase):
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
            clear_current_bpmn_clipboard,
            copy_bpmn_task_to_clipboard,
            get_current_bpmn_clipboard,
            paste_bpmn_clipboard,
        )
        from app.clipboard.redis_store import ClipboardRedisStore, clipboard_key, clipboard_ttl_sec
        from app.clipboard.serializer import ClipboardSerializationError, serialize_task_clipboard_payload
        from app.models import Node
        from app.startup.app_factory import create_app
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
        self.clear_current_bpmn_clipboard = clear_current_bpmn_clipboard
        self.copy_bpmn_task_to_clipboard = copy_bpmn_task_to_clipboard
        self.get_current_bpmn_clipboard = get_current_bpmn_clipboard
        self.paste_bpmn_clipboard = paste_bpmn_clipboard
        self.ClipboardRedisStore = ClipboardRedisStore
        self.clipboard_key = clipboard_key
        self.clipboard_ttl_sec = clipboard_ttl_sec
        self.ClipboardSerializationError = ClipboardSerializationError
        self.serialize_task_clipboard_payload = serialize_task_clipboard_payload
        self.Node = Node
        self.create_app = create_app
        self.create_user = create_user
        self.get_default_org_id = get_default_org_id
        self.upsert_org_membership = upsert_org_membership
        self.upsert_project_membership = upsert_project_membership

        self.org_id = get_default_org_id()
        self.owner = create_user("clipboard_owner@local", "admin", is_admin=False)
        self.peer = create_user("clipboard_peer@local", "peer", is_admin=False)
        self.upsert_org_membership(self.org_id, str(self.owner.get("id") or ""), "org_admin")
        self.upsert_org_membership(self.org_id, str(self.peer.get("id") or ""), "editor")

        project = self.create_project(self.CreateProjectIn(title="Clipboard Project"), self._req(self.owner))
        self.project_id = str(project.get("id") or "")
        session = self.create_project_session(
            self.project_id,
            self.CreateSessionIn(title="Clipboard Session"),
            "quick_skeleton",
            request=self._req(self.owner),
        )
        self.session_id = str(session.get("id") or "")
        self.assertTrue(self.session_id)
        self.upsert_project_membership(self.org_id, self.project_id, str(self.peer.get("id") or ""), "editor")
        self.assertTrue(bool(self.session_bpmn_save(self.session_id, self.BpmnXmlIn(xml=SAMPLE_BPMN_XML), self._req(self.owner)).get("ok")))
        target_session = self.create_project_session(
            self.project_id,
            self.CreateSessionIn(title="Clipboard Target Session"),
            "quick_skeleton",
            request=self._req(self.owner),
        )
        self.target_session_id = str(target_session.get("id") or "")
        self.assertTrue(self.target_session_id)
        self.assertTrue(bool(self.session_bpmn_save(self.target_session_id, self.BpmnXmlIn(xml=TARGET_BPMN_XML), self._req(self.owner)).get("ok")))
        self._seed_task_local_state()

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

    def _seed_task_local_state(self):
        st = self.get_storage()
        sess = st.load(self.session_id, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(sess)
        sess.nodes = [
            self.Node(
                id="Task_1",
                type="step",
                title="Approve request",
                actor_role="ops",
                parameters={"service": "approval"},
            )
        ]
        sess.notes_by_element = {
            "Task_1": {
                "summary": "Task-local notes",
                "items": [{"id": "note_1", "text": "Remember compliance", "createdAt": 1, "updatedAt": 1}],
            }
        }
        sess.bpmn_meta = {
            "version": 1,
            "node_path_meta": {
                "Task_1": {"paths": ["P0"], "sequence_key": "primary", "source": "manual"},
            },
            "robot_meta_by_element_id": {
                "Task_1": {"robot_meta_version": "v1", "exec": {"mode": "machine", "action_key": "approve.run"}},
            },
            "camunda_extensions_by_element_id": {
                "Task_1": {"properties": [{"name": "priority", "value": "high"}]},
            },
            "presentation_by_element_id": {
                "Task_1": {"badge": "ops"},
            },
            "hybrid_layer_by_element_id": {
                "Task_1": {"dx": 8, "dy": 12},
            },
        }
        st.save(sess, user_id=str(self.owner.get("id") or ""), org_id=self.org_id, is_admin=True)

    def test_serializer_builds_normalized_payload(self):
        sess = self.get_storage().load(self.session_id, org_id=self.org_id, is_admin=True)
        payload = self.serialize_task_clipboard_payload(
            session_obj=sess,
            element_id="Task_1",
            copied_by_user_id=str(self.owner.get("id") or ""),
            copied_at=1730000000,
            source_org_id=self.org_id,
        )

        self.assertEqual(payload.schema_version, "pm_bpmn_task_clipboard_v1")
        self.assertEqual(payload.clipboard_item_type, "bpmn_task")
        self.assertEqual(payload.context.source_session_id, self.session_id)
        self.assertEqual(payload.context.source_element_id, "Task_1")
        self.assertEqual(payload.element.element_type, "userTask")
        self.assertEqual(payload.element.name, "Approve request")
        self.assertEqual(payload.element.documentation, "Review the incoming request")
        self.assertEqual(payload.element.extension_elements.get("camunda_properties", {}).get("priority"), "high")
        self.assertEqual(payload.element.session_node.get("actor_role"), "ops")
        task_state = payload.element.task_local_state
        self.assertIn("camunda_extensions_by_element_id", task_state)
        self.assertIn("robot_meta_by_element_id", task_state)
        self.assertIn("presentation_by_element_id", task_state)
        self.assertIn("hybrid_layer_by_element_id", task_state)
        self.assertIn("notes_by_element", task_state)
        attr_values = payload.element.bpmn_attributes
        self.assertTrue(any(key.endswith("::assignee") and value == "ops" for key, value in attr_values.items()))

    def test_serializer_rejects_unsupported_element_type(self):
        sess = self.get_storage().load(self.session_id, org_id=self.org_id, is_admin=True)
        with self.assertRaises(self.ClipboardSerializationError) as exc:
            self.serialize_task_clipboard_payload(
                session_obj=sess,
                element_id="Gateway_1",
                copied_by_user_id=str(self.owner.get("id") or ""),
                copied_at=1730000000,
                source_org_id=self.org_id,
            )
        self.assertEqual(exc.exception.code, "unsupported_element_type")

    def test_redis_store_put_get_clear_uses_ttl(self):
        sess = self.get_storage().load(self.session_id, org_id=self.org_id, is_admin=True)
        payload = self.serialize_task_clipboard_payload(
            session_obj=sess,
            element_id="Task_1",
            copied_by_user_id=str(self.owner.get("id") or ""),
            copied_at=1730000000,
            source_org_id=self.org_id,
        )
        fake = _FakeRedis()
        store = self.ClipboardRedisStore(client=fake)

        self.assertTrue(store.put(user_id=str(self.owner.get("id") or ""), org_id=self.org_id, payload=payload))
        key = self.clipboard_key(user_id=str(self.owner.get("id") or ""), org_id=self.org_id)
        self.assertIn(key, fake.store)
        self.assertEqual(fake.ttl.get(key), self.clipboard_ttl_sec())
        stored = store.get(user_id=str(self.owner.get("id") or ""), org_id=self.org_id)
        self.assertEqual(str((stored or {}).get("context", {}).get("source_element_id") or ""), "Task_1")
        self.assertEqual(store.clear(user_id=str(self.owner.get("id") or ""), org_id=self.org_id), 1)
        self.assertIsNone(store.get(user_id=str(self.owner.get("id") or ""), org_id=self.org_id))

    def test_copy_read_and_clear_endpoints_roundtrip(self):
        fake = _FakeRedis()
        with patch("app.redis_cache.get_client", return_value=fake):
            copy_out = self.copy_bpmn_task_to_clipboard(
                self.ClipboardCopyIn(session_id=self.session_id, element_id="Task_1"),
                self._req(self.owner),
            )
            copy_status, copy_body = _read_response(copy_out)
            self.assertEqual(copy_status, 200)
            self.assertTrue(bool(copy_body.get("ok")))
            self.assertEqual(str(copy_body.get("clipboard_item_type") or ""), "bpmn_task")
            self.assertEqual(str(copy_body.get("element_type") or ""), "userTask")
            self.assertEqual(str(copy_body.get("copied_name") or ""), "Approve request")

            key = self.clipboard_key(user_id=str(self.owner.get("id") or ""), org_id=self.org_id)
            self.assertIn(key, fake.store)
            stored_payload = json.loads(fake.store[key])
            self.assertEqual(str((stored_payload.get("context") or {}).get("source_element_id") or ""), "Task_1")
            self.assertNotIn("Flow_1", json.dumps(stored_payload, ensure_ascii=False))
            self.assertNotIn("sourceRef", json.dumps(stored_payload, ensure_ascii=False))
            self.assertNotIn("targetRef", json.dumps(stored_payload, ensure_ascii=False))

            read_out = self.get_current_bpmn_clipboard(self._req(self.owner))
            read_status, read_body = _read_response(read_out)
            self.assertEqual(read_status, 200)
            self.assertEqual(bool(read_body.get("empty")), False)
            item = read_body.get("item") or {}
            self.assertEqual(str(item.get("clipboard_item_type") or ""), "bpmn_task")
            self.assertEqual(str(item.get("source_element_id") or ""), "Task_1")
            self.assertEqual(str(item.get("copied_name") or ""), "Approve request")

            clear_out = self.clear_current_bpmn_clipboard(self._req(self.owner))
            clear_status, clear_body = _read_response(clear_out)
            self.assertEqual(clear_status, 200)
            self.assertTrue(bool(clear_body.get("ok")))
            self.assertNotIn(key, fake.store)

            read_after_clear = self.get_current_bpmn_clipboard(self._req(self.owner))
            _, cleared_body = _read_response(read_after_clear)
            self.assertEqual(bool(cleared_body.get("empty")), True)

    def test_copy_endpoint_rejects_unsupported_element(self):
        fake = _FakeRedis()
        with patch("app.redis_cache.get_client", return_value=fake):
            out = self.copy_bpmn_task_to_clipboard(
                self.ClipboardCopyIn(session_id=self.session_id, element_id="Gateway_1"),
                self._req(self.owner),
            )
        status, body = _read_response(out)
        self.assertEqual(status, 422)
        self.assertEqual(str(((body.get("error") or {}).get("code") or "")), "unsupported_element_type")

    def test_other_user_cannot_read_clipboard(self):
        fake = _FakeRedis()
        with patch("app.redis_cache.get_client", return_value=fake):
            copy_out = self.copy_bpmn_task_to_clipboard(
                self.ClipboardCopyIn(session_id=self.session_id, element_id="Task_1"),
                self._req(self.owner),
            )
            copy_status, _ = _read_response(copy_out)
            self.assertEqual(copy_status, 200)

            peer_read = self.get_current_bpmn_clipboard(self._req(self.peer))
            peer_status, peer_body = _read_response(peer_read)
            self.assertEqual(peer_status, 200)
            self.assertEqual(bool(peer_body.get("empty")), True)
            self.assertIsNone(peer_body.get("item"))

    def test_task_copy_and_paste_roundtrip_restores_task_semantics(self):
        fake = _FakeRedis()
        with patch("app.redis_cache.get_client", return_value=fake):
            copy_out = self.copy_bpmn_task_to_clipboard(
                self.ClipboardCopyIn(session_id=self.session_id, element_id="Task_1"),
                self._req(self.owner),
            )
            copy_status, copy_body = _read_response(copy_out)
            self.assertEqual(copy_status, 200)
            self.assertEqual(str(copy_body.get("clipboard_item_type") or ""), "bpmn_task")

            read_out = self.get_current_bpmn_clipboard(self._req(self.owner))
            read_status, read_body = _read_response(read_out)
            self.assertEqual(read_status, 200)
            self.assertEqual(bool(read_body.get("empty")), False)
            self.assertEqual(str((read_body.get("item") or {}).get("clipboard_item_type") or ""), "bpmn_task")

            paste_out = self.paste_bpmn_clipboard(
                self.ClipboardPasteIn(session_id=self.target_session_id),
                self._req(self.owner),
            )
            paste_status, paste_body = _read_response(paste_out)
            self.assertEqual(paste_status, 200)
            self.assertTrue(bool(paste_body.get("ok")))
            pasted_task_id = str(paste_body.get("pasted_root_element_id") or "")
            self.assertTrue(pasted_task_id)
            self.assertEqual(list(paste_body.get("created_edge_ids") or []), [])
            self.assertEqual(list(paste_body.get("created_node_ids") or []), [pasted_task_id])

        st = self.get_storage()
        reloaded = st.load(self.target_session_id, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(reloaded)
        root = ET.fromstring(str(getattr(reloaded, "bpmn_xml", "") or ""))
        tasks = [elem for elem in root.iter() if elem.tag.endswith("userTask")]
        pasted_task = next((elem for elem in tasks if str(elem.attrib.get("id") or "") == pasted_task_id), None)
        self.assertIsNotNone(pasted_task)
        self.assertNotEqual(pasted_task_id, "Task_1")
        self.assertEqual(str(pasted_task.attrib.get("name") or ""), "Approve request")
        self.assertEqual(str(pasted_task.attrib.get("{http://camunda.org/schema/1.0/bpmn}assignee") or ""), "ops")

        documentation = next((child for child in list(pasted_task) if child.tag.endswith("documentation")), None)
        self.assertEqual(str("".join(documentation.itertext()) if documentation is not None else ""), "Review the incoming request")
        prop = next((elem for elem in pasted_task.iter() if elem.tag.endswith("property") and str(elem.attrib.get("name") or "") == "priority"), None)
        self.assertIsNotNone(prop)
        self.assertEqual(str(prop.attrib.get("value") or ""), "high")

        meta = getattr(reloaded, "bpmn_meta", {}) if isinstance(getattr(reloaded, "bpmn_meta", {}), dict) else {}
        self.assertIn(pasted_task_id, meta.get("camunda_extensions_by_element_id", {}))
        self.assertEqual(
            meta.get("camunda_extensions_by_element_id", {}).get(pasted_task_id, {}).get("properties", [{}])[0].get("value"),
            "high",
        )
        self.assertIn(pasted_task_id, meta.get("robot_meta_by_element_id", {}))
        self.assertIn(pasted_task_id, meta.get("presentation_by_element_id", {}))
        self.assertIn(pasted_task_id, meta.get("hybrid_layer_by_element_id", {}))
        self.assertIn(pasted_task_id, meta.get("node_path_meta", {}))
        self.assertIn(pasted_task_id, getattr(reloaded, "notes_by_element", {}))
        self.assertTrue(any(str(getattr(node, "id", "") or "") == pasted_task_id for node in list(getattr(reloaded, "nodes", []) or [])))

        second_reload = st.load(self.target_session_id, org_id=self.org_id, is_admin=True)
        self.assertIn(pasted_task_id, getattr(second_reload, "bpmn_meta", {}).get("camunda_extensions_by_element_id", {}))
        self.assertIn(pasted_task_id, getattr(second_reload, "notes_by_element", {}))

    def test_app_factory_includes_clipboard_route_without_breaking_existing_router_registration(self):
        app = self.create_app()
        paths = {str(route.path) for route in app.routes}
        self.assertIn("/api/clipboard/bpmn", paths)
        self.assertIn("/api/clipboard/bpmn/copy", paths)
        self.assertIn("/api/clipboard/bpmn/paste", paths)
        self.assertIn("/api/templates", paths)


if __name__ == "__main__":
    unittest.main()
