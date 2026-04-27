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
            session_bpmn_version_detail,
            session_bpmn_versions_list,
            session_bpmn_restore,
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
        self.session_bpmn_version_detail = session_bpmn_version_detail
        self.session_bpmn_versions_list = session_bpmn_versions_list
        self.session_bpmn_restore = session_bpmn_restore

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

    def test_bpmn_import_creates_bpmn_only_version_snapshot(self):
        st = self.get_storage()
        before_versions = st.list_bpmn_versions(self.sid)
        before_count = len(before_versions)

        saved = self.session_bpmn_save(
            self.sid,
            self.BpmnXmlIn(
                xml=PRUNED_BPMN_XML,
                source_action="import_bpmn",
                import_note="manual stage import",
            ),
        )
        self.assertEqual(saved.get("ok"), True)
        snapshot = saved.get("bpmn_version_snapshot", {})
        self.assertEqual(snapshot.get("source_action"), "import_bpmn")
        self.assertEqual(int(snapshot.get("version_number") or 0), before_count + 1)
        self.assertEqual(snapshot.get("import_note"), "manual stage import")

        versions_meta = st.list_bpmn_versions(self.sid)
        self.assertEqual(len(versions_meta), before_count + 1)
        self.assertNotIn("bpmn_xml", versions_meta[0])

        versions = st.list_bpmn_versions(self.sid, include_xml=True)
        self.assertEqual(len(versions), before_count + 1)
        self.assertEqual(versions[0].get("source_action"), "import_bpmn")
        self.assertEqual(versions[0].get("import_note"), "manual stage import")
        self.assertEqual(versions[0].get("bpmn_xml"), PRUNED_BPMN_XML)

        current = st.load(self.sid, is_admin=True)
        self.assertIsNotNone(current)
        self.assertEqual(str(current.bpmn_xml or ""), PRUNED_BPMN_XML)

    def test_regular_bpmn_put_with_xml_change_creates_version_snapshot(self):
        st = self.get_storage()
        before_count = len(st.list_bpmn_versions(self.sid))
        saved = self.session_bpmn_save(
            self.sid,
            self.BpmnXmlIn(xml=PRUNED_BPMN_XML),
        )
        self.assertEqual(saved.get("ok"), True)
        snapshot = saved.get("bpmn_version_snapshot", {})
        self.assertTrue(str(snapshot.get("id") or "").strip())
        self.assertEqual(str(snapshot.get("source_action") or ""), "manual_save")
        self.assertEqual(len(st.list_bpmn_versions(self.sid)), before_count + 1)

    def test_publish_manual_save_with_unchanged_xml_creates_session_truth_snapshot(self):
        st = self.get_storage()
        initial = self.session_bpmn_save(
            self.sid,
            self.BpmnXmlIn(xml=PRUNED_BPMN_XML),
        )
        self.assertEqual(initial.get("ok"), True)
        self.assertIsInstance(initial.get("bpmn_version_snapshot"), dict)
        before_versions = len(st.list_bpmn_versions(self.sid))

        published = self.session_bpmn_save(
            self.sid,
            self.BpmnXmlIn(xml=PRUNED_BPMN_XML, source_action="publish_manual_save"),
        )
        self.assertEqual(published.get("ok"), True)
        self.assertIsInstance(published.get("bpmn_version_snapshot"), dict)
        self.assertEqual(str(published["bpmn_version_snapshot"].get("source_action") or ""), "publish_manual_save")
        self.assertTrue(str(published["bpmn_version_snapshot"].get("session_payload_hash") or "").strip())
        after_versions = st.list_bpmn_versions(self.sid, include_xml=True)
        self.assertEqual(len(after_versions), before_versions + 1)
        state_versions = st.list_session_state_versions(self.sid)
        self.assertGreaterEqual(len(state_versions), 1)

    def test_bpmn_versions_endpoint_uses_session_payload_hash_for_availability(self):
        published = self.session_bpmn_save(
            self.sid,
            self.BpmnXmlIn(xml=PRUNED_BPMN_XML, source_action="publish_manual_save"),
        )
        self.assertEqual(published.get("ok"), True)
        clean = self.session_bpmn_versions_list(self.sid, include_xml=0)
        self.assertEqual(clean.get("has_session_changes_since_latest_bpmn_version"), False)

        patched = self.patch_session(
            self.sid,
            self.UpdateSessionIn(interview={"doc_html": "<p>changed</p>"}),
        )
        self.assertEqual(patched.get("id"), self.sid)
        dirty = self.session_bpmn_versions_list(self.sid, include_xml=0)
        self.assertEqual(dirty.get("has_session_changes_since_latest_bpmn_version"), True)
        self.assertNotEqual(
            str(dirty.get("current_session_payload_hash") or ""),
            str(dirty.get("latest_user_version_session_payload_hash") or ""),
        )

    def test_bpmn_versions_endpoint_returns_metadata_and_optional_xml(self):
        before_count = int((self.session_bpmn_versions_list(self.sid, include_xml=0) or {}).get("count") or 0)
        self.session_bpmn_save(
            self.sid,
            self.BpmnXmlIn(xml=PRUNED_BPMN_XML, source_action="import_bpmn", import_note="first import"),
        )

        listed_meta = self.session_bpmn_versions_list(self.sid, include_xml=0)
        self.assertEqual(listed_meta.get("ok"), True)
        self.assertEqual(int(listed_meta.get("count") or 0), before_count + 1)
        item_meta = (listed_meta.get("items") or [{}])[0]
        self.assertEqual(item_meta.get("source_action"), "import_bpmn")
        self.assertEqual(item_meta.get("import_note"), "first import")
        self.assertGreater(int(item_meta.get("created_at_ms") or 0), 0)
        self.assertTrue(str(item_meta.get("created_at_iso") or "").strip())
        self.assertIsInstance(item_meta.get("author"), dict)
        self.assertIn("author_display", item_meta)
        self.assertNotIn("bpmn_xml", item_meta)

        listed_full = self.session_bpmn_versions_list(self.sid, include_xml=1)
        self.assertEqual(listed_full.get("ok"), True)
        item_full = (listed_full.get("items") or [{}])[0]
        self.assertEqual(str(item_full.get("bpmn_xml") or ""), PRUNED_BPMN_XML)

        detail = self.session_bpmn_version_detail(self.sid, item_meta.get("id"))
        self.assertEqual(detail.get("ok"), True)
        detail_item = detail.get("item") or {}
        self.assertEqual(detail_item.get("source_action"), "import_bpmn")
        self.assertEqual(str(detail_item.get("bpmn_xml") or ""), PRUNED_BPMN_XML)

    def test_bpmn_versions_endpoint_formats_technical_author_id_to_short_display(self):
        st = self.get_storage()
        technical_id = "8f4b7f5fd3b146b4bf5160f8c0d9821a"
        st.create_bpmn_version_snapshot(
            self.sid,
            bpmn_xml=XOR_BPMN_XML,
            source_action="import_bpmn",
            created_by=technical_id,
            import_note="author format",
        )

        listed = self.session_bpmn_versions_list(self.sid, include_xml=0)
        self.assertEqual(listed.get("ok"), True)
        item = (listed.get("items") or [{}])[0]
        self.assertEqual(item.get("created_by"), technical_id)
        self.assertEqual(str(item.get("author_display") or "").startswith("Пользователь 8f4b7f5f"), True)
        self.assertEqual(str((item.get("author") or {}).get("display_name") or "").startswith("Пользователь 8f4b7f5f"), True)

    def test_bpmn_restore_replaces_xml_and_preserves_overlay_layers(self):
        drawio_doc = '<mxfile host="app.diagrams.net"><diagram id="d1">X</diagram></mxfile>'
        self._seed_raw_bpmn_meta(
            {
                "version": 11,
                "drawio": {
                    "enabled": True,
                    "doc_xml": drawio_doc,
                    "svg_cache": '<svg xmlns="http://www.w3.org/2000/svg"><g id="Task_yes"></g></svg>',
                    "drawio_layers_v1": [
                        {"id": "DL1", "name": "Default", "visible": True, "locked": False, "opacity": 1},
                    ],
                    "drawio_elements_v1": [
                        {"id": "Task_yes", "layer_id": "DL1", "offset_x": 12, "offset_y": -6},
                    ],
                },
                "hybrid_v2": {
                    "schema_version": 2,
                    "layers": [{"id": "L1", "name": "Hybrid"}],
                    "elements": [
                        {"id": "H1", "layer_id": "L1", "type": "rect", "x": 100, "y": 120, "w": 180, "h": 70}
                    ],
                    "edges": [],
                    "bindings": [{"hybrid_id": "H1", "bpmn_id": "Task_yes", "kind": "node"}],
                    "view": {"mode": "view", "tool": "select", "active_layer_id": "L1"},
                },
            }
        )

        baseline_versions = self.session_bpmn_versions_list(self.sid, include_xml=0)
        baseline_items = baseline_versions.get("items") or []
        self.assertTrue(len(baseline_items) >= 1)
        baseline_snapshot_id = str(baseline_items[0].get("id") or "")
        self.assertTrue(baseline_snapshot_id)

        imported = self.session_bpmn_save(
            self.sid,
            self.BpmnXmlIn(xml=PRUNED_BPMN_XML, source_action="import_bpmn", import_note="restore checkpoint"),
        )
        self.assertEqual(imported.get("ok"), True)
        snapshot = imported.get("bpmn_version_snapshot", {})
        self.assertTrue(str(snapshot.get("id") or "").strip())

        restored = self.session_bpmn_restore(self.sid, baseline_snapshot_id)
        self.assertEqual(restored.get("ok"), True)
        self.assertEqual(str(restored.get("bpmn_xml") or ""), XOR_BPMN_XML)
        self.assertEqual(str((restored.get("restored_version") or {}).get("id") or ""), baseline_snapshot_id)

        st = self.get_storage()
        reloaded = st.load(self.sid, is_admin=True)
        self.assertIsNotNone(reloaded)
        self.assertEqual(str(getattr(reloaded, "bpmn_xml", "") or ""), XOR_BPMN_XML)
        reloaded_meta = dict(getattr(reloaded, "bpmn_meta", {}) or {})
        self.assertEqual(reloaded_meta.get("drawio", {}).get("doc_xml"), drawio_doc)
        self.assertEqual(reloaded_meta.get("drawio", {}).get("drawio_elements_v1", [{}])[0].get("id"), "Task_yes")
        self.assertEqual(reloaded_meta.get("hybrid_v2", {}).get("elements", [{}])[0].get("id"), "H1")

    def test_bpmn_import_keeps_drawio_and_hybrid_meta_after_reload(self):
        drawio_doc = '<mxfile host="app.diagrams.net"><diagram id="d1">X</diagram></mxfile>'
        self._seed_raw_bpmn_meta(
            {
                "version": 11,
                "drawio": {
                    "enabled": True,
                    "doc_xml": drawio_doc,
                    "svg_cache": '<svg xmlns="http://www.w3.org/2000/svg"><g id="Task_yes"></g></svg>',
                    "drawio_layers_v1": [
                        {"id": "DL1", "name": "Default", "visible": True, "locked": False, "opacity": 1},
                    ],
                    "drawio_elements_v1": [
                        {"id": "Task_yes", "layer_id": "DL1", "offset_x": 12, "offset_y": -6},
                    ],
                },
                "hybrid_v2": {
                    "schema_version": 2,
                    "layers": [{"id": "L1", "name": "Hybrid"}],
                    "elements": [
                        {"id": "H1", "layer_id": "L1", "type": "rect", "x": 100, "y": 120, "w": 180, "h": 70}
                    ],
                    "edges": [],
                    "bindings": [{"hybrid_id": "H1", "bpmn_id": "Task_yes", "kind": "node"}],
                    "view": {"mode": "view", "tool": "select", "active_layer_id": "L1"},
                },
            }
        )

        saved = self.session_bpmn_save(
            self.sid,
            self.BpmnXmlIn(xml=PRUNED_BPMN_XML, source_action="import_bpmn"),
        )
        self.assertEqual(saved.get("ok"), True)
        self.assertIsInstance(saved.get("bpmn_version_snapshot"), dict)

        immediate = self.session_bpmn_meta_get(self.sid)
        self.assertEqual(immediate.get("drawio", {}).get("doc_xml"), drawio_doc)
        self.assertEqual(immediate.get("drawio", {}).get("drawio_elements_v1", [{}])[0].get("id"), "Task_yes")
        self.assertEqual(immediate.get("hybrid_v2", {}).get("elements", [{}])[0].get("id"), "H1")

        st = self.get_storage()
        reloaded = st.load(self.sid, is_admin=True)
        self.assertIsNotNone(reloaded)
        reloaded_meta = dict(getattr(reloaded, "bpmn_meta", {}) or {})
        self.assertEqual(reloaded_meta.get("drawio", {}).get("doc_xml"), drawio_doc)
        self.assertEqual(reloaded_meta.get("drawio", {}).get("drawio_elements_v1", [{}])[0].get("id"), "Task_yes")
        self.assertEqual(reloaded_meta.get("hybrid_v2", {}).get("elements", [{}])[0].get("id"), "H1")
        self.assertEqual(str(getattr(reloaded, "bpmn_xml", "") or ""), PRUNED_BPMN_XML)

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


if __name__ == "__main__":
    unittest.main()
