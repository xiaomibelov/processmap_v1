import os
import tempfile
import unittest
import json
from pathlib import Path


XOR_BPMN_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_start_gateway</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:exclusiveGateway id="Gateway_1" default="Flow_no">
      <bpmn:incoming>Flow_start_gateway</bpmn:incoming>
      <bpmn:outgoing>Flow_yes</bpmn:outgoing>
      <bpmn:outgoing>Flow_no</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:task id="Task_yes">
      <bpmn:incoming>Flow_yes</bpmn:incoming>
      <bpmn:outgoing>Flow_yes_end</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Task_no">
      <bpmn:incoming>Flow_no</bpmn:incoming>
      <bpmn:outgoing>Flow_no_end</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="End_1">
      <bpmn:incoming>Flow_yes_end</bpmn:incoming>
      <bpmn:incoming>Flow_no_end</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_start_gateway" sourceRef="StartEvent_1" targetRef="Gateway_1" />
    <bpmn:sequenceFlow id="Flow_yes" sourceRef="Gateway_1" targetRef="Task_yes" />
    <bpmn:sequenceFlow id="Flow_no" sourceRef="Gateway_1" targetRef="Task_no" />
    <bpmn:sequenceFlow id="Flow_yes_end" sourceRef="Task_yes" targetRef="End_1" />
    <bpmn:sequenceFlow id="Flow_no_end" sourceRef="Task_no" targetRef="End_1" />
  </bpmn:process>
</bpmn:definitions>
"""


PRUNED_BPMN_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_2" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_2" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_only</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1">
      <bpmn:incoming>Flow_only</bpmn:incoming>
      <bpmn:outgoing>Flow_end</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="End_1">
      <bpmn:incoming>Flow_end</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_only" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_end" sourceRef="Task_1" targetRef="End_1" />
  </bpmn:process>
</bpmn:definitions>
"""


class BpmnMetaApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-issuer")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")

        from app.main import (
            BpmnMetaPatchIn,
            InferRtiersIn,
            BpmnXmlIn,
            CreateSessionIn,
            create_session,
            session_bpmn_meta_get,
            session_bpmn_meta_patch,
            session_bpmn_meta_infer_rtiers,
            session_bpmn_save,
        )

        self.BpmnMetaPatchIn = BpmnMetaPatchIn
        self.InferRtiersIn = InferRtiersIn
        self.BpmnXmlIn = BpmnXmlIn
        self.CreateSessionIn = CreateSessionIn
        self.create_session = create_session
        self.session_bpmn_meta_get = session_bpmn_meta_get
        self.session_bpmn_meta_patch = session_bpmn_meta_patch
        self.session_bpmn_meta_infer_rtiers = session_bpmn_meta_infer_rtiers
        self.session_bpmn_save = session_bpmn_save

        created = self.create_session(CreateSessionIn(title="meta test"))
        self.sid = str(created.get("id") or "")
        self.assertTrue(self.sid)
        self.assertEqual(self.session_bpmn_save(self.sid, self.BpmnXmlIn(xml=XOR_BPMN_XML)).get("ok"), True)

    def tearDown(self):
        self.tmp.cleanup()

    def test_xor_p0_and_p1_are_unique_per_gateway(self):
        first = self.session_bpmn_meta_patch(self.sid, self.BpmnMetaPatchIn(flowId="Flow_yes", tier="P0"))
        self.assertEqual(first.get("flow_meta", {}).get("Flow_yes", {}).get("tier"), "P0")

        second = self.session_bpmn_meta_patch(self.sid, self.BpmnMetaPatchIn(flowId="Flow_no", tier="P0"))
        flow_meta = second.get("flow_meta", {})
        self.assertEqual(flow_meta.get("Flow_no", {}).get("tier"), "P0")
        self.assertNotIn("Flow_yes", flow_meta)

        third = self.session_bpmn_meta_patch(self.sid, self.BpmnMetaPatchIn(flowId="Flow_yes", tier="P1"))
        self.assertEqual(third.get("flow_meta", {}).get("Flow_yes", {}).get("tier"), "P1")
        fourth = self.session_bpmn_meta_patch(self.sid, self.BpmnMetaPatchIn(flowId="Flow_no", tier="P1"))
        self.assertEqual(fourth.get("flow_meta", {}).get("Flow_no", {}).get("tier"), "P1")
        self.assertNotIn("Flow_yes", fourth.get("flow_meta", {}))

    def test_legacy_happy_is_migrated_to_p0(self):
        meta = self.session_bpmn_meta_patch(self.sid, self.BpmnMetaPatchIn(flowId="Flow_yes", happy=True))
        self.assertEqual(meta.get("flow_meta", {}).get("Flow_yes", {}).get("tier"), "P0")

    def test_bpmn_save_prunes_stale_flow_meta(self):
        self.session_bpmn_meta_patch(self.sid, self.BpmnMetaPatchIn(flowId="Flow_yes", tier="P0"))
        self.assertEqual(self.session_bpmn_meta_get(self.sid).get("flow_meta", {}).get("Flow_yes", {}).get("tier"), "P0")

        self.assertEqual(self.session_bpmn_save(self.sid, self.BpmnXmlIn(xml=PRUNED_BPMN_XML)).get("ok"), True)
        meta = self.session_bpmn_meta_get(self.sid)
        self.assertNotIn("Flow_yes", meta.get("flow_meta", {}))

    def test_node_path_meta_roundtrip_and_normalization(self):
        patched = self.session_bpmn_meta_patch(
            self.sid,
            self.BpmnMetaPatchIn(
                node_id="Task_yes",
                paths=["p1", "P0", "P1", "bad"],
                sequence_key=" Mitigated #1 ",
                source="manual",
            ),
        )
        entry = patched.get("node_path_meta", {}).get("Task_yes", {})
        self.assertEqual(entry.get("paths"), ["P0", "P1"])
        self.assertEqual(entry.get("sequence_key"), "mitigated_1")
        self.assertEqual(entry.get("source"), "manual")

    def test_node_path_meta_pruned_after_bpmn_change(self):
        self.session_bpmn_meta_patch(
            self.sid,
            self.BpmnMetaPatchIn(
                node_updates=[
                    {"node_id": "Task_yes", "paths": ["P0"], "sequence_key": "primary", "source": "manual"},
                    {"node_id": "Task_no", "paths": ["P1"], "sequence_key": "mitigated_1", "source": "manual"},
                ],
            ),
        )
        meta_before = self.session_bpmn_meta_get(self.sid)
        self.assertIn("Task_yes", meta_before.get("node_path_meta", {}))
        self.assertIn("Task_no", meta_before.get("node_path_meta", {}))

        self.assertEqual(self.session_bpmn_save(self.sid, self.BpmnXmlIn(xml=PRUNED_BPMN_XML)).get("ok"), True)
        meta_after = self.session_bpmn_meta_get(self.sid)
        self.assertNotIn("Task_yes", meta_after.get("node_path_meta", {}))
        self.assertNotIn("Task_no", meta_after.get("node_path_meta", {}))

    def test_robot_meta_roundtrip_and_prune(self):
        patched = self.session_bpmn_meta_patch(
            self.sid,
            self.BpmnMetaPatchIn(
                robot_element_id="Task_yes",
                robot_meta={
                    "exec": {
                        "mode": "machine",
                        "executor": "node_red",
                        "action_key": "soup.reheat",
                        "timeout_sec": 120,
                        "retry": {"max_attempts": 2, "backoff_sec": 3},
                    },
                    "mat": {
                        "from_zone": "cold",
                        "to_zone": "microwave",
                        "inputs": [{"kind": "container"}],
                        "outputs": [{"kind": "heated"}],
                    },
                    "qc": {"critical": True, "checks": ["temperature"]},
                },
            ),
        )
        robot_map = patched.get("robot_meta_by_element_id", {})
        self.assertEqual(robot_map.get("Task_yes", {}).get("robot_meta_version"), "v1")
        self.assertEqual(robot_map.get("Task_yes", {}).get("exec", {}).get("mode"), "machine")
        self.assertEqual(robot_map.get("Task_yes", {}).get("exec", {}).get("action_key"), "soup.reheat")
        self.assertEqual(robot_map.get("Task_yes", {}).get("exec", {}).get("retry", {}).get("max_attempts"), 2)

        self.assertEqual(self.session_bpmn_save(self.sid, self.BpmnXmlIn(xml=PRUNED_BPMN_XML)).get("ok"), True)
        meta_after = self.session_bpmn_meta_get(self.sid)
        self.assertNotIn("Task_yes", meta_after.get("robot_meta_by_element_id", {}))

    def test_robot_meta_remove_via_patch(self):
        self.session_bpmn_meta_patch(
            self.sid,
            self.BpmnMetaPatchIn(
                robot_updates=[
                    {
                        "element_id": "Task_yes",
                        "robot_meta": {"exec": {"mode": "machine", "action_key": "x"}},
                    }
                ],
            ),
        )
        first = self.session_bpmn_meta_get(self.sid)
        self.assertIn("Task_yes", first.get("robot_meta_by_element_id", {}))

        second = self.session_bpmn_meta_patch(
            self.sid,
            self.BpmnMetaPatchIn(
                robot_updates=[
                    {"element_id": "Task_yes", "remove": True},
                ],
            ),
        )
        self.assertNotIn("Task_yes", second.get("robot_meta_by_element_id", {}))

    def test_infer_rtiers_smoke_afbb609e19(self):
        afbb_path = Path(__file__).resolve().parents[2] / "workspace" / ".session_store" / "afbb609e19.json"
        if not afbb_path.exists():
            self.skipTest("afbb609e19 fixture missing")
        payload = json.loads(afbb_path.read_text(encoding="utf-8"))
        xml = str(payload.get("bpmn_xml") or "")
        if not xml.strip():
            self.skipTest("afbb609e19 has no bpmn_xml")

        created = self.create_session(self.CreateSessionIn(title="afbb smoke"))
        sid = str(created.get("id") or "")
        if not sid:
            self.skipTest("cannot create temp session for smoke test")

        self.assertEqual(self.session_bpmn_save(sid, self.BpmnXmlIn(xml=xml)).get("ok"), True)
        before = self.session_bpmn_meta_get(sid)
        self.assertEqual(len(before.get("flow_meta", {})), 0)

        inferred = self.session_bpmn_meta_infer_rtiers(
            sid,
            self.InferRtiersIn(
                scopeStartId="Event_05ckyt4",
                successEndIds=["Event_1pqduoq"],
                failEndIds=["Event_1aulnyq"],
            ),
        )
        meta = inferred.get("meta", {})
        flow_meta = meta.get("flow_meta", {})
        self.assertGreater(len(flow_meta), 0)
        rtier_count = sum(1 for row in flow_meta.values() if str((row or {}).get("rtier") or "").strip())
        self.assertGreater(rtier_count, 0)
        self.assertEqual(flow_meta.get("Flow_02mqvh5", {}).get("rtier"), "R2")
        self.assertEqual(flow_meta.get("Flow_02mqvh5", {}).get("source"), "inferred")

        persisted = self.session_bpmn_meta_get(sid)
        self.assertEqual(persisted.get("flow_meta", {}).get("Flow_02mqvh5", {}).get("rtier"), "R2")


if __name__ == "__main__":
    unittest.main()
