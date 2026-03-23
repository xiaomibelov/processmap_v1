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

        # Router split moved these callable/model symbols out of app.main;
        # test harness needs the legacy module that still owns them.
        from app._legacy_main import (
            BpmnMetaPatchIn,
            InferRtiersIn,
            BpmnXmlIn,
            CreateSessionIn,
            UpdateSessionIn,
            create_session,
            get_storage,
            patch_session,
            session_bpmn_meta_get,
            session_bpmn_meta_patch,
            session_bpmn_meta_infer_rtiers,
            session_bpmn_save,
        )

        self.BpmnMetaPatchIn = BpmnMetaPatchIn
        self.InferRtiersIn = InferRtiersIn
        self.BpmnXmlIn = BpmnXmlIn
        self.CreateSessionIn = CreateSessionIn
        self.UpdateSessionIn = UpdateSessionIn
        self.create_session = create_session
        self.get_storage = get_storage
        self.patch_session = patch_session
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

    def _seed_raw_bpmn_meta(self, meta):
        st = self.get_storage()
        sess = st.load(self.sid, is_admin=True)
        self.assertIsNotNone(sess)
        sess.bpmn_meta = dict(meta or {})
        st.save(sess, user_id="test-user", is_admin=True)

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

    def test_bpmn_put_preserves_hybrid_v2(self):
        initial = self.session_bpmn_meta_patch(
            self.sid,
            self.BpmnMetaPatchIn(
                hybrid_v2={
                    "schema_version": 2,
                    "layers": [{"id": "L1", "name": "Hybrid"}],
                    "elements": [
                        {
                            "id": "E1",
                            "layer_id": "L1",
                            "type": "rect",
                            "x": 120,
                            "y": 220,
                            "w": 180,
                            "h": 70,
                            "text": "Hybrid box",
                        }
                    ],
                    "edges": [],
                    "bindings": [
                        {"hybrid_id": "E1", "bpmn_id": "Task_yes", "kind": "node"},
                    ],
                    "view": {"mode": "view", "tool": "select", "active_layer_id": "L1"},
                },
            ),
        )
        self.assertIn("hybrid_v2", initial)
        self.assertEqual(initial.get("hybrid_v2", {}).get("schema_version"), 2)
        self.assertEqual(len(initial.get("hybrid_v2", {}).get("elements", [])), 1)

        save_res = self.session_bpmn_save(self.sid, self.BpmnXmlIn(xml=PRUNED_BPMN_XML))
        self.assertEqual(save_res.get("ok"), True)
        after = self.session_bpmn_meta_get(self.sid)
        hybrid = after.get("hybrid_v2", {})
        self.assertEqual(hybrid.get("schema_version"), 2)
        self.assertEqual(len(hybrid.get("elements", [])), 1)
        self.assertEqual(hybrid.get("elements", [])[0].get("id"), "E1")

    def test_bpmn_put_preserves_hybrid_v2_when_incoming_section_empty(self):
        self.session_bpmn_meta_patch(
            self.sid,
            self.BpmnMetaPatchIn(
                hybrid_v2={
                    "schema_version": 2,
                    "layers": [{"id": "L1", "name": "Hybrid"}],
                    "elements": [
                        {"id": "E1", "layer_id": "L1", "type": "rect", "x": 100, "y": 120, "w": 180, "h": 70}
                    ],
                    "edges": [],
                    "bindings": [],
                    "view": {"mode": "view", "tool": "select", "active_layer_id": "L1"},
                },
            ),
        )
        save_res = self.session_bpmn_save(
            self.sid,
            self.BpmnXmlIn(xml=PRUNED_BPMN_XML, bpmn_meta={"hybrid_v2": {}}),
        )
        self.assertEqual(save_res.get("ok"), True)
        after = self.session_bpmn_meta_get(self.sid)
        self.assertEqual(len(after.get("hybrid_v2", {}).get("elements", [])), 1)

    def test_patch_session_partial_bpmn_meta_preserves_hybrid_v2(self):
        self.session_bpmn_meta_patch(
            self.sid,
            self.BpmnMetaPatchIn(
                hybrid_v2={
                    "schema_version": 2,
                    "layers": [{"id": "L1", "name": "Hybrid"}],
                    "elements": [
                        {"id": "E1", "layer_id": "L1", "type": "rect", "x": 100, "y": 120, "w": 180, "h": 70}
                    ],
                    "edges": [],
                    "bindings": [],
                    "view": {"mode": "view", "tool": "select", "active_layer_id": "L1"},
                },
            ),
        )
        patched = self.patch_session(
            self.sid,
            self.UpdateSessionIn(
                bpmn_meta={
                    "hybrid_layer_by_element_id": {
                        "Task_yes": {"dx": 16, "dy": -4},
                    }
                }
            ),
        )
        hybrid = (patched.get("bpmn_meta") or {}).get("hybrid_v2", {})
        self.assertEqual(len(hybrid.get("elements", [])), 1)

    def test_patch_session_partial_bpmn_meta_preserves_camunda_and_presentation(self):
        self._seed_raw_bpmn_meta(
            {
                "version": 4,
                "camunda_extensions_by_element_id": {
                    "Task_yes": {
                        "properties": {
                            "extensionProperties": [
                                {"id": "prop_1", "name": "ingredient", "value": "Картошка"},
                            ],
                            "extensionListeners": [],
                        },
                        "preservedExtensionElements": [],
                    }
                },
                "presentation_by_element_id": {
                    "Task_yes": {"showPropertiesOverlay": True, "show_properties_overlay": True}
                },
                "execution_plans": [{"id": "v1", "name": "base"}],
                "drawio": {"enabled": False},
            }
        )

        patched = self.patch_session(
            self.sid,
            self.UpdateSessionIn(
                bpmn_meta={
                    "drawio": {
                        "enabled": True,
                        "doc_xml": '<mxfile host="app.diagrams.net"></mxfile>',
                    }
                }
            ),
        )

        meta = patched.get("bpmn_meta", {})
        self.assertEqual(
            meta.get("camunda_extensions_by_element_id", {})
            .get("Task_yes", {})
            .get("properties", {})
            .get("extensionProperties", [{}])[0]
            .get("name"),
            "ingredient",
        )
        self.assertEqual(
            meta.get("presentation_by_element_id", {})
            .get("Task_yes", {})
            .get("showPropertiesOverlay"),
            True,
        )
        self.assertEqual(len(meta.get("execution_plans") or []), 1)
        self.assertEqual(meta.get("drawio", {}).get("enabled"), True)

    def test_bpmn_save_partial_bpmn_meta_preserves_camunda_and_presentation(self):
        self._seed_raw_bpmn_meta(
            {
                "version": 5,
                "camunda_extensions_by_element_id": {
                    "Task_yes": {
                        "properties": {
                            "extensionProperties": [
                                {"id": "prop_1", "name": "equipment", "value": "Весы"},
                            ],
                            "extensionListeners": [],
                        },
                        "preservedExtensionElements": [],
                    }
                },
                "presentation_by_element_id": {
                    "Task_yes": {"showPropertiesOverlay": True, "show_properties_overlay": True}
                },
                "drawio": {"enabled": False},
            }
        )

        saved = self.session_bpmn_save(
            self.sid,
            self.BpmnXmlIn(
                xml=XOR_BPMN_XML,
                bpmn_meta={
                    "drawio": {
                        "enabled": True,
                        "doc_xml": '<mxfile host="app.diagrams.net"></mxfile>',
                    }
                },
            ),
        )
        self.assertEqual(saved.get("ok"), True)
        meta = self.session_bpmn_meta_get(self.sid)
        self.assertEqual(
            meta.get("camunda_extensions_by_element_id", {})
            .get("Task_yes", {})
            .get("properties", {})
            .get("extensionProperties", [{}])[0]
            .get("name"),
            "equipment",
        )
        self.assertEqual(
            meta.get("presentation_by_element_id", {})
            .get("Task_yes", {})
            .get("showPropertiesOverlay"),
            True,
        )
        self.assertEqual(meta.get("drawio", {}).get("enabled"), True)

    def test_patch_session_drawio_only_preserves_bpmn_owned_meta_and_xml(self):
        self.session_bpmn_meta_patch(self.sid, self.BpmnMetaPatchIn(flowId="Flow_yes", tier="P0"))
        self.session_bpmn_meta_patch(
            self.sid,
            self.BpmnMetaPatchIn(
                node_id="Task_yes",
                paths=["P0"],
                sequence_key="primary",
                source="manual",
            ),
        )
        self.session_bpmn_meta_patch(
            self.sid,
            self.BpmnMetaPatchIn(
                robot_element_id="Task_yes",
                robot_meta={
                    "exec": {
                        "mode": "machine",
                        "action_key": "soup.reheat",
                    },
                },
            ),
        )

        patched = self.patch_session(
            self.sid,
            self.UpdateSessionIn(
                bpmn_meta={
                    "drawio": {
                        "enabled": True,
                        "doc_xml": '<mxfile host="app.diagrams.net"></mxfile>',
                        "svg_cache": '<svg xmlns="http://www.w3.org/2000/svg"><g id="Task_yes"></g></svg>',
                        "drawio_layers_v1": [
                            {"id": "DL1", "name": "Default", "visible": True, "locked": False, "opacity": 1},
                        ],
                        "drawio_elements_v1": [
                            {"id": "Task_yes", "layer_id": "DL1", "offset_x": 12, "offset_y": -6},
                        ],
                    },
                }
            ),
        )

        meta = patched.get("bpmn_meta", {})
        self.assertEqual(str(patched.get("bpmn_xml") or ""), XOR_BPMN_XML)
        self.assertEqual(meta.get("flow_meta", {}).get("Flow_yes", {}).get("tier"), "P0")
        self.assertEqual(meta.get("node_path_meta", {}).get("Task_yes", {}).get("paths"), ["P0"])
        self.assertEqual(
            meta.get("robot_meta_by_element_id", {}).get("Task_yes", {}).get("exec", {}).get("action_key"),
            "soup.reheat",
        )
        drawio = meta.get("drawio", {})
        self.assertEqual(drawio.get("doc_xml"), '<mxfile host="app.diagrams.net"></mxfile>')
        self.assertEqual(drawio.get("drawio_elements_v1", [{}])[0].get("id"), "Task_yes")
        self.assertEqual(drawio.get("drawio_elements_v1", [{}])[0].get("offset_x"), 12.0)
        self.assertEqual(drawio.get("drawio_elements_v1", [{}])[0].get("offset_y"), -6.0)

    def test_patch_session_drawio_only_preserves_existing_extra_top_level_branches(self):
        self._seed_raw_bpmn_meta(
            {
                "version": 7,
                "flow_meta": {"Flow_yes": {"tier": "P0"}},
                "drawio": {"enabled": False},
                "custom_branch": {"alpha": 1, "nested": {"beta": 2}},
                "attention_markers": [{"id": "m1", "is_checked": False}],
                "attention_show_on_workspace": False,
            }
        )

        patched = self.patch_session(
            self.sid,
            self.UpdateSessionIn(
                bpmn_meta={
                    "drawio": {
                        "enabled": True,
                        "doc_xml": '<mxfile host="app.diagrams.net"></mxfile>',
                    }
                }
            ),
        )

        meta = patched.get("bpmn_meta", {})
        self.assertEqual(meta.get("custom_branch", {}).get("nested", {}).get("beta"), 2)
        self.assertEqual(meta.get("attention_markers", [{}])[0].get("id"), "m1")
        self.assertEqual(meta.get("attention_show_on_workspace"), False)
        self.assertEqual(meta.get("flow_meta", {}).get("Flow_yes", {}).get("tier"), "P0")
        self.assertEqual(meta.get("drawio", {}).get("doc_xml"), '<mxfile host="app.diagrams.net"></mxfile>')

    def test_patch_session_known_branch_update_preserves_unknown_top_level_branch(self):
        self._seed_raw_bpmn_meta(
            {
                "version": 5,
                "custom_branch": {"flags": ["x"], "nested": {"gamma": 3}},
                "flow_meta": {"Flow_yes": {"tier": "P0"}},
            }
        )

        patched = self.patch_session(
            self.sid,
            self.UpdateSessionIn(
                bpmn_meta={
                    "flow_meta": {
                        "Flow_no": {"tier": "P1"},
                    }
                }
            ),
        )

        meta = patched.get("bpmn_meta", {})
        self.assertEqual(meta.get("custom_branch", {}).get("nested", {}).get("gamma"), 3)
        self.assertEqual(meta.get("flow_meta", {}).get("Flow_no", {}).get("tier"), "P1")
        self.assertNotIn("Flow_yes", meta.get("flow_meta", {}))

    def test_patch_session_known_branch_normalization_still_prunes_unknown_nested_keys(self):
        self._seed_raw_bpmn_meta(
            {
                "version": 3,
                "drawio": {
                    "enabled": True,
                    "doc_xml": '<mxfile host="app.diagrams.net"></mxfile>',
                    "svg_cache": "<svg></svg>",
                    "warnings": ["legacy-warning"],
                    "extra_nested": {"x": 1},
                },
                "flow_meta": {
                    "Flow_yes": {"tier": "P0", "custom": "drop-me"},
                },
            }
        )

        patched = self.patch_session(
            self.sid,
            self.UpdateSessionIn(
                bpmn_meta={
                    "drawio": {
                        "enabled": True,
                        "doc_xml": '<mxfile host="app.diagrams.net"></mxfile>',
                        "svg_cache": "<svg></svg>",
                        "warnings": ["new-warning"],
                        "extra_nested": {"x": 2},
                    }
                }
            ),
        )

        meta = patched.get("bpmn_meta", {})
        self.assertNotIn("warnings", meta.get("drawio", {}))
        self.assertNotIn("extra_nested", meta.get("drawio", {}))
        self.assertEqual(meta.get("flow_meta", {}).get("Flow_yes", {}).get("tier"), "P0")
        self.assertNotIn("custom", meta.get("flow_meta", {}).get("Flow_yes", {}))

    def test_session_bpmn_meta_patch_preserves_existing_extra_top_level_branches(self):
        self._seed_raw_bpmn_meta(
            {
                "version": 4,
                "drawio": {"enabled": False},
                "custom_branch": {"keep": True},
                "attention_show_on_workspace": False,
            }
        )

        patched = self.session_bpmn_meta_patch(
            self.sid,
            self.BpmnMetaPatchIn(
                drawio={
                    "enabled": True,
                    "doc_xml": '<mxfile host="app.diagrams.net"></mxfile>',
                }
            ),
        )

        self.assertEqual(patched.get("custom_branch", {}).get("keep"), True)
        self.assertEqual(patched.get("attention_show_on_workspace"), False)
        self.assertEqual(patched.get("drawio", {}).get("doc_xml"), '<mxfile host="app.diagrams.net"></mxfile>')

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


    def test_bpmn_save_response_tokens_match_sync_state(self):
        """PUT /bpmn response tokens must match GET /sync_state tokens.

        Regression: storage.save() writes updated_at to DB but did not refresh
        the in-memory session object. Token helpers computed stale tokens from
        the old updated_at, causing the frontend sync coordinator to
        misclassify the save as a foreign remote change on the next poll.
        """
        from app._legacy_main import get_session_sync_state

        save_res = self.session_bpmn_save(self.sid, self.BpmnXmlIn(xml=PRUNED_BPMN_XML))
        self.assertTrue(save_res.get("ok"))

        put_sync = str(save_res.get("sync_version_token") or "").strip()
        put_bpmn = str(save_res.get("sync_bpmn_version_token") or "").strip()
        put_collab = str(save_res.get("sync_collab_version_token") or "").strip()
        put_updated = int(save_res.get("updated_at") or 0)

        self.assertTrue(put_sync, "PUT response must include sync_version_token")
        self.assertTrue(put_bpmn, "PUT response must include sync_bpmn_version_token")
        self.assertTrue(put_collab, "PUT response must include sync_collab_version_token")
        self.assertGreater(put_updated, 0, "PUT response must include fresh updated_at")

        sync_state = get_session_sync_state(self.sid)
        ss_sync = str(sync_state.get("version_token") or "").strip()
        ss_bpmn = str(sync_state.get("bpmn_version_token") or "").strip()
        ss_collab = str(sync_state.get("collab_version_token") or "").strip()
        ss_updated = int(sync_state.get("updated_at") or 0)

        self.assertEqual(put_sync, ss_sync,
                         f"sync_version_token mismatch: PUT={put_sync!r} vs sync_state={ss_sync!r}")
        self.assertEqual(put_bpmn, ss_bpmn,
                         f"bpmn_version_token mismatch: PUT={put_bpmn!r} vs sync_state={ss_bpmn!r}")
        self.assertEqual(put_collab, ss_collab,
                         f"collab_version_token mismatch: PUT={put_collab!r} vs sync_state={ss_collab!r}")
        self.assertEqual(put_updated, ss_updated,
                         f"updated_at mismatch: PUT={put_updated} vs sync_state={ss_updated}")


if __name__ == "__main__":
    unittest.main()
