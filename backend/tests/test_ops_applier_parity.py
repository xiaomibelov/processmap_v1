"""Parity / golden tests for the server-side ops applier (feature/async-save-pipeline-step1).

TESTS.md §2.2: canonical XML equivalence (не byte-compare), DI-инварианты после
move/resize/create/delete, реальные фикстуры + большой синтетический документ.
"""

from __future__ import annotations

import os
import time
import unittest
import xml.etree.ElementTree as ET

BPMN_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL"
BPMNDI_NS = "http://www.omg.org/spec/BPMN/20100524/DI"
DI_NS = "http://www.omg.org/spec/DD/20100524/DI"
DC_NS = "http://www.omg.org/spec/DD/20100524/DC"

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")

SMALL_BPMN_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  id="Definitions_parity" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_parity" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1" name="Old name">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_parity">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="172" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="260" y="80" width="100" height="80" />
        <bpmndi:BPMNLabel id="Task_1_label">
          <dc:Bounds x="280" y="112" width="60" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="592" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="208" y="120" />
        <di:waypoint x="260" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="360" y="120" />
        <di:waypoint x="592" y="120" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
"""


def _canonical(xml_text: str) -> str:
    return ET.canonicalize(xml_text, strip_text=True)


def _gen_large_bpmn(task_count: int = 150) -> str:
    """Синтетическая схема 300+ элементов (task + sequenceFlow + DI на каждый)."""
    nodes = []
    edges = []
    shapes = []
    di_edges = []
    prev = "StartEvent_root"
    nodes.append(f'    <bpmn:startEvent id="{prev}">\n      <bpmn:outgoing>Flow_0</bpmn:outgoing>\n    </bpmn:startEvent>')
    shapes.append(
        '      <bpmndi:BPMNShape id="StartEvent_root_di" bpmnElement="StartEvent_root">\n'
        '        <dc:Bounds x="172" y="120" width="36" height="36" />\n      </bpmndi:BPMNShape>'
    )
    for i in range(task_count):
        x = 260 + (i % 10) * 160
        y = 80 + (i // 10) * 140
        nodes.append(
            f'    <bpmn:task id="Task_g{i}" name="Generated {i}">\n'
            f'      <bpmn:incoming>Flow_{i}</bpmn:incoming>\n'
            f'      <bpmn:outgoing>Flow_{i + 1}</bpmn:outgoing>\n    </bpmn:task>'
        )
        shapes.append(
            f'      <bpmndi:BPMNShape id="Task_g{i}_di" bpmnElement="Task_g{i}">\n'
            f'        <dc:Bounds x="{x}" y="{y}" width="100" height="80" />\n      </bpmndi:BPMNShape>'
        )
        edges.append(
            f'    <bpmn:sequenceFlow id="Flow_{i}" sourceRef="{prev}" targetRef="Task_g{i}" />'
        )
        di_edges.append(
            f'      <bpmndi:BPMNEdge id="Flow_{i}_di" bpmnElement="Flow_{i}">\n'
            f'        <di:waypoint x="0" y="{y + 40}" />\n        <di:waypoint x="{x}" y="{y + 40}" />\n      </bpmndi:BPMNEdge>'
        )
        prev = f"Task_g{i}"
    nodes.append(f'    <bpmn:endEvent id="EndEvent_root">\n      <bpmn:incoming>Flow_{task_count}</bpmn:incoming>\n    </bpmn:endEvent>')
    shapes.append(
        '      <bpmndi:BPMNShape id="EndEvent_root_di" bpmnElement="EndEvent_root">\n'
        '        <dc:Bounds x="120" y="120" width="36" height="36" />\n      </bpmndi:BPMNShape>'
    )
    edges.append(
        f'    <bpmn:sequenceFlow id="Flow_{task_count}" sourceRef="{prev}" targetRef="EndEvent_root" />'
    )
    di_edges.append(
        f'      <bpmndi:BPMNEdge id="Flow_{task_count}_di" bpmnElement="Flow_{task_count}">\n'
        '        <di:waypoint x="1" y="1" />\n        <di:waypoint x="2" y="2" />\n      </bpmndi:BPMNEdge>'
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"\n'
        '                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"\n'
        '                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"\n'
        '                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"\n'
        '                  id="Definitions_large" targetNamespace="http://bpmn.io/schema/bpmn">\n'
        '  <bpmn:process id="Process_large" isExecutable="false">\n'
        + "\n".join(nodes + edges)
        + '\n  </bpmn:process>\n'
        + '  <bpmndi:BPMNDiagram id="BPMNDiagram_1">\n'
        + '    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_large">\n'
        + "\n".join(shapes + di_edges)
        + '\n    </bpmndi:BPMNPlane>\n  </bpmndi:BPMNDiagram>\n</bpmn:definitions>\n'
    )


class OpsApplierParityTests(unittest.TestCase):
    def setUp(self):
        from app.save_services import ops_applier

        self.ops_applier = ops_applier

    def _apply(self, xml_text, operations):
        return self.ops_applier.apply_operations(xml_text, operations)

    # --- helpers -------------------------------------------------------

    @staticmethod
    def _local(tag: str) -> str:
        return tag.rsplit("}", 1)[-1] if "}" in tag else tag

    def _find(self, root, element_id):
        for el in root.iter():
            if el.get("id") == element_id:
                return el
        return None

    def _di_shape(self, root, element_id):
        for el in root.iter():
            if self._local(el.tag) == "BPMNShape" and el.get("bpmnElement") == element_id:
                return el
        return None

    def _di_edge(self, root, element_id):
        for el in root.iter():
            if self._local(el.tag) == "BPMNEdge" and el.get("bpmnElement") == element_id:
                return el
        return None

    def _semantic_ids(self, root):
        return {
            el.get("id")
            for el in root.iter()
            if el.get("id") and el.tag.startswith(f"{{{BPMN_NS}}}")
        }

    DI_SHAPE_REQUIRED = {
        "startEvent", "endEvent", "intermediateThrowEvent", "intermediateCatchEvent",
        "task", "userTask", "serviceTask", "manualTask", "scriptTask",
        "businessRuleTask", "sendTask", "receiveTask", "callActivity",
        "subProcess", "transaction", "adHocSubProcess",
        "exclusiveGateway", "parallelGateway", "inclusiveGateway",
        "complexGateway", "eventBasedGateway",
        "lane", "participant", "textAnnotation", "group",
    }
    DI_EDGE_REQUIRED = {
        "sequenceFlow", "messageFlow", "association",
    }

    def _assert_di_invariants(self, root, deleted_ids=(), required_ids=None):
        deleted = set(deleted_ids)
        if required_ids is None:
            candidates = [
                el.get("id")
                for el in root.iter()
                if el.tag.startswith(f"{{{BPMN_NS}}}") and self._local(el.tag) in self.DI_SHAPE_REQUIRED
            ]
        else:
            candidates = list(required_ids)
        for element_id in candidates:
            if not element_id or element_id in deleted:
                continue
            self.assertIsNotNone(
                self._di_shape(root, element_id) or self._di_edge(root, element_id),
                f"DI missing for semantic element {element_id}",
            )
        for el in root.iter():
            if self._local(el.tag) == "BPMNEdge":
                waypoints = [ch for ch in el if self._local(ch.tag) == "waypoint"]
                self.assertGreaterEqual(len(waypoints), 2, f"edge {el.get('id')} lost waypoints")

    # --- round-trip ----------------------------------------------------

    def test_noop_batch_is_canonical_equivalent(self):
        result = self._apply(SMALL_BPMN_XML, [])
        self.assertEqual(_canonical(result), _canonical(SMALL_BPMN_XML))

    def test_roundtrip_preserves_real_fixtures(self):
        for name in (
            "itmo_razogrev_v02.bpmn",
            "tobe_razogrev_supa_rtk_v03.bpmn",
            "camunda_15_subprocesses.bpmn",
        ):
            with open(os.path.join(FIXTURES_DIR, name), encoding="utf-8") as fh:
                xml_text = fh.read()
            result = self._apply(xml_text, [])
            self.assertEqual(_canonical(result), _canonical(xml_text), name)

    # --- golden per-type apply ------------------------------------------

    def test_golden_update_properties(self):
        result = self._apply(SMALL_BPMN_XML, [
            {"opId": "g1", "type": "element.updateProperties", "elementId": "Task_1",
             "properties": {"name": "Renamed"}},
        ])
        root = ET.fromstring(result)
        self.assertEqual(self._find(root, "Task_1").get("name"), "Renamed")
        self.assertEqual(_canonical(result), _canonical(
            SMALL_BPMN_XML.replace('name="Old name"', 'name="Renamed"')))

    def test_golden_move_updates_shape_and_label(self):
        result = self._apply(SMALL_BPMN_XML, [
            {"opId": "g2", "type": "shape.move", "elementId": "Task_1", "x": 360, "y": 180},
        ])
        root = ET.fromstring(result)
        shape = self._di_shape(root, "Task_1")
        bounds = next(ch for ch in shape if self._local(ch.tag) == "Bounds")
        self.assertEqual((bounds.get("x"), bounds.get("y")), ("360", "180"))
        # Label сдвигается на тот же delta (dx=100, dy=100).
        label = next(ch for ch in shape if self._local(ch.tag) == "BPMNLabel")
        label_bounds = next(ch for ch in label if self._local(ch.tag) == "Bounds")
        self.assertEqual((label_bounds.get("x"), label_bounds.get("y")), ("380", "212"))

    def test_golden_resize_keeps_position_by_default(self):
        result = self._apply(SMALL_BPMN_XML, [
            {"opId": "g3", "type": "shape.resize", "elementId": "Task_1", "width": 160, "height": 100},
        ])
        root = ET.fromstring(result)
        bounds = next(ch for ch in self._di_shape(root, "Task_1") if self._local(ch.tag) == "Bounds")
        self.assertEqual(
            (bounds.get("x"), bounds.get("y"), bounds.get("width"), bounds.get("height")),
            ("260", "80", "160", "100"),
        )

    def test_golden_create_shape_connection_and_delete(self):
        created = self._apply(SMALL_BPMN_XML, [
            {"opId": "g4", "type": "shape.create", "elementId": "Task_x", "bpmnType": "bpmn:Task",
             "x": 700, "y": 200, "width": 120, "height": 90, "parentId": "Process_parity",
             "name": "X"},
            {"opId": "g5", "type": "connection.create", "connectionId": "Flow_x",
             "bpmnType": "bpmn:SequenceFlow", "sourceId": "Task_1", "targetId": "Task_x",
             "waypoints": [[360, 120], [700, 200]]},
        ])
        root = ET.fromstring(created)
        task = self._find(root, "Task_x")
        self.assertEqual(task.get("name"), "X")
        flow = self._find(root, "Flow_x")
        self.assertEqual((flow.get("sourceRef"), flow.get("targetRef")), ("Task_1", "Task_x"))
        self.assertIsNotNone(self._di_shape(root, "Task_x"))
        edge = self._di_edge(root, "Flow_x")
        self.assertEqual(len([ch for ch in edge if self._local(ch.tag) == "waypoint"]), 2)
        self._assert_di_invariants(root)

        deleted = self._apply(created, [
            {"opId": "g6", "type": "shape.delete", "elementId": "Task_x"},
        ])
        root2 = ET.fromstring(deleted)
        self.assertIsNone(self._find(root2, "Task_x"))
        self.assertIsNone(self._find(root2, "Flow_x"))
        self._assert_di_invariants(root2, deleted_ids=("Task_x", "Flow_x"))

    def test_client_wire_format_aliases(self):
        """Wire-формат commandToOps (frontend slice): delta/bounds/elementType/
        elementId-для-connection/waypoints-объекты — сервер принимает наряду
        с каноническим API.md."""
        result = self._apply(SMALL_BPMN_XML, [
            {"opId": "w1", "type": "shape.move", "elementId": "Task_1", "delta": {"x": 10, "y": -20}},
            {"opId": "w2", "type": "shape.resize", "elementId": "Task_1",
             "bounds": {"x": 300, "y": 100, "width": 140, "height": 90}},
            {"opId": "w3", "type": "shape.create", "elementId": "Task_wire", "elementType": "bpmn:UserTask",
             "bounds": {"x": 800, "y": 300, "width": 110, "height": 70}, "parentId": "Process_parity"},
            {"opId": "w4", "type": "connection.create", "elementId": "Flow_wire",
             "elementType": "bpmn:SequenceFlow", "sourceId": "Task_1", "targetId": "Task_wire",
             "waypoints": [{"x": 1, "y": 2}, {"x": 3, "y": 4}]},
        ])
        root = ET.fromstring(result)
        bounds = next(ch for ch in self._di_shape(root, "Task_1") if self._local(ch.tag) == "Bounds")
        self.assertEqual(
            (bounds.get("x"), bounds.get("y"), bounds.get("width"), bounds.get("height")),
            ("300", "100", "140", "90"),
        )
        task_wire = self._find(root, "Task_wire")
        self.assertEqual(task_wire.tag, f"{{{BPMN_NS}}}userTask")
        self.assertIsNotNone(self._di_shape(root, "Task_wire"))
        flow_wire = self._find(root, "Flow_wire")
        self.assertEqual((flow_wire.get("sourceRef"), flow_wire.get("targetRef")), ("Task_1", "Task_wire"))
        edge = self._di_edge(root, "Flow_wire")
        waypoints = [ch for ch in edge if self._local(ch.tag) == "waypoint"]
        self.assertEqual((waypoints[0].get("x"), waypoints[0].get("y")), ("1", "2"))

    def test_golden_update_di_waypoints(self):
        result = self._apply(SMALL_BPMN_XML, [
            {"opId": "g7", "type": "element.updateDi", "elementId": "Flow_2",
             "waypoints": [[360, 140], [500, 160], [592, 140]]},
        ])
        root = ET.fromstring(result)
        edge = self._di_edge(root, "Flow_2")
        waypoints = [ch for ch in edge if self._local(ch.tag) == "waypoint"]
        self.assertEqual(len(waypoints), 3)
        self.assertEqual((waypoints[1].get("x"), waypoints[1].get("y")), ("500", "160"))
        self.assertEqual(_canonical(result), _canonical(
            SMALL_BPMN_XML.replace(
                '<di:waypoint x="360" y="120" />\n        <di:waypoint x="592" y="120" />',
                '<di:waypoint x="360" y="140" />\n        <di:waypoint x="500" y="160" />\n'
                '        <di:waypoint x="592" y="140" />')))

    # --- connection.reconnect / create с клиентским id (step2) ---------

    def test_golden_connection_reconnect_rewrites_refs_and_relinks(self):
        result = self._apply(SMALL_BPMN_XML, [
            {"opId": "r1", "type": "connection.reconnect", "connectionId": "Flow_2",
             "source": "StartEvent_1", "target": "EndEvent_1"},
        ])
        root = ET.fromstring(result)
        flow = self._find(root, "Flow_2")
        self.assertEqual((flow.get("sourceRef"), flow.get("targetRef")), ("StartEvent_1", "EndEvent_1"))
        # incoming/outgoing перелинкованы: старый source больше не ссылается.
        task_1 = self._find(root, "Task_1")
        self.assertNotIn("Flow_2", [el.text for el in task_1 if self._local(el.tag) == "outgoing"])
        start = self._find(root, "StartEvent_1")
        self.assertIn("Flow_2", [el.text for el in start if self._local(el.tag) == "outgoing"])
        end = self._find(root, "EndEvent_1")
        self.assertIn("Flow_2", [el.text for el in end if self._local(el.tag) == "incoming"])
        self.assertEqual(len([el.text for el in end if self._local(el.tag) == "incoming"]), 1)
        # DI-edge на месте, waypoints сохранились (DI-only миграция краёв).
        edge = self._di_edge(root, "Flow_2")
        self.assertIsNotNone(edge)
        waypoints = [ch for ch in edge if self._local(ch.tag) == "waypoint"]
        self.assertEqual([(wp.get("x"), wp.get("y")) for wp in waypoints], [("360", "120"), ("592", "120")])

    def test_reconnect_missing_source_raises_typed_error(self):
        with self.assertRaises(self.ops_applier.OperationApplyError) as ctx:
            self._apply(SMALL_BPMN_XML, [
                {"opId": "r2", "type": "connection.reconnect", "connectionId": "Flow_2",
                 "source": "Nope", "target": "EndEvent_1"},
            ])
        self.assertIn("source_not_found", ctx.exception.reason)

    def test_reconnect_missing_connection_raises_typed_error(self):
        with self.assertRaises(self.ops_applier.OperationApplyError) as ctx:
            self._apply(SMALL_BPMN_XML, [
                {"opId": "r3", "type": "connection.reconnect", "connectionId": "Flow_missing",
                 "source": "Task_1", "target": "EndEvent_1"},
            ])
        self.assertIn("connection_not_found", ctx.exception.reason)

    def test_reconnect_wire_aliases_element_id_and_reconnect_source_target(self):
        """Wire-формат commandToOps: id connection в elementId, поля source/target."""
        result = self._apply(SMALL_BPMN_XML, [
            {"opId": "r4", "type": "connection.reconnect", "elementId": "Flow_2",
             "source": "StartEvent_1", "target": "Task_1"},
        ])
        root = ET.fromstring(result)
        flow = self._find(root, "Flow_2")
        self.assertEqual((flow.get("sourceRef"), flow.get("targetRef")), ("StartEvent_1", "Task_1"))
        start = self._find(root, "StartEvent_1")
        self.assertIn("Flow_2", [el.text for el in start if self._local(el.tag) == "outgoing"])

    def test_reconnect_parity_on_real_fixture_with_collaboration(self):
        """Parity golden: reconnect sequenceFlow в документе с participant."""
        with open(os.path.join(FIXTURES_DIR, "tobe_razogrev_supa_rtk_v03.bpmn"), encoding="utf-8") as fh:
            xml_text = fh.read()
        root = ET.fromstring(xml_text)
        flow = next(
            el for el in root.iter()
            if el.tag == f"{{{BPMN_NS}}}sequenceFlow" and el.get("sourceRef") and el.get("targetRef")
        )
        flows = [el for el in root.iter() if el.tag == f"{{{BPMN_NS}}}sequenceFlow"]
        candidates = [
            el for el in root.iter()
            if el.tag.startswith(f"{{{BPMN_NS}}}") and el.get("id")
            and self._local(el.tag) not in (
                "definitions", "process", "sequenceFlow", "messageFlow", "association",
                "incoming", "outgoing", "documentation", "extensionElements",
                "collaboration",
            )
            and not ("sourceRef" in el.attrib and "targetRef" in el.attrib)
        ]
        old_source, old_target = flow.get("sourceRef"), flow.get("targetRef")
        new_source = next(c.get("id") for c in candidates if c.get("id") not in (old_source, old_target))
        new_target = old_target
        result = self._apply(xml_text, [
            {"opId": "r5", "type": "connection.reconnect", "connectionId": flow.get("id"),
             "source": new_source, "target": new_target},
        ])
        out = ET.fromstring(result)
        moved = self._find(out, flow.get("id"))
        self.assertEqual(moved.get("sourceRef"), new_source)
        self.assertEqual(moved.get("targetRef"), new_target)
        old_source_el = self._find(out, old_source)
        if old_source_el is not None:
            self.assertNotIn(
                flow.get("id"),
                [el.text for el in old_source_el if self._local(el.tag) == "outgoing"],
            )
        new_source_el = self._find(out, new_source)
        self.assertIn(flow.get("id"), [el.text for el in new_source_el if self._local(el.tag) == "outgoing"])
        # DI-инварианты не пострадали.
        self._assert_di_invariants(out, required_ids={
            el.get("bpmnElement")
            for el in out.iter()
            if self._local(el.tag) in ("BPMNShape", "BPMNEdge") and el.get("bpmnElement")
        })

    def test_shape_create_with_client_generated_id(self):
        result = self._apply(SMALL_BPMN_XML, [
            {"opId": "c1", "type": "shape.create", "id": "Task_client",
             "bpmnType": "bpmn:Task", "x": 700, "y": 200, "width": 120, "height": 90,
             "parentId": "Process_parity", "name": "Client id"},
        ])
        root = ET.fromstring(result)
        task = self._find(root, "Task_client")
        self.assertIsNotNone(task)
        self.assertEqual(task.get("name"), "Client id")
        self.assertIsNotNone(self._di_shape(root, "Task_client"))

    def test_connection_create_with_client_generated_id(self):
        result = self._apply(SMALL_BPMN_XML, [
            {"opId": "c2", "type": "connection.create", "id": "Flow_client",
             "bpmnType": "bpmn:SequenceFlow", "sourceId": "Task_1", "targetId": "EndEvent_1",
             "waypoints": [[360, 120], [592, 120]]},
        ])
        root = ET.fromstring(result)
        flow = self._find(root, "Flow_client")
        self.assertIsNotNone(flow)
        self.assertEqual((flow.get("sourceRef"), flow.get("targetRef")), ("Task_1", "EndEvent_1"))

    def test_create_client_id_collision_raises_typed_error(self):
        with self.assertRaises(self.ops_applier.OperationApplyError) as ctx:
            self._apply(SMALL_BPMN_XML, [
                {"opId": "c3", "type": "shape.create", "id": "Task_1",
                 "bpmnType": "bpmn:Task", "x": 1, "y": 1, "width": 10, "height": 10,
                 "parentId": "Process_parity"},
            ])
        self.assertIn("already_exists", ctx.exception.reason)

    # --- ошибки ---------------------------------------------------------

    def test_unsupported_type_raises_typed_error(self):
        with self.assertRaises(self.ops_applier.OperationApplyError) as ctx:
            self._apply(SMALL_BPMN_XML, [
                {"opId": "e1", "type": "shape.warp", "elementId": "Task_1"},
            ])
        self.assertEqual(ctx.exception.op_id, "e1")
        self.assertEqual(ctx.exception.op_type, "shape.warp")
        self.assertTrue(ctx.exception.reason)

    def test_missing_payload_field_raises_typed_error(self):
        with self.assertRaises(self.ops_applier.OperationApplyError):
            self._apply(SMALL_BPMN_XML, [
                {"opId": "e2", "type": "shape.move", "elementId": "Task_1"},
            ])

    def test_missing_element_raises_typed_error(self):
        with self.assertRaises(self.ops_applier.OperationApplyError) as ctx:
            self._apply(SMALL_BPMN_XML, [
                {"opId": "e3", "type": "element.updateProperties", "elementId": "Nope",
                 "properties": {"name": "X"}},
            ])
        self.assertIn("element", ctx.exception.reason)

    # --- parity на реальных фикстурах -----------------------------------

    def _mixed_ops_for(self, root):
        """Подбирает валидные ops по реальному документу."""
        ops = []
        counter = [0]

        def next_id():
            counter[0] += 1
            return f"parity-op-{counter[0]}"

        has_plane = any(
            el.tag == f"{{{BPMNDI_NS}}}BPMNPlane" for el in root.iter()
        )
        semantic_tasks = [
            el for el in root.iter()
            if el.tag.startswith(f"{{{BPMN_NS}}}") and el.get("id")
            and self._local(el.tag) not in (
                "definitions", "process", "sequenceFlow", "messageFlow", "association",
                "incoming", "outgoing", "documentation", "extensionElements",
            )
            and not ("sourceRef" in el.attrib and "targetRef" in el.attrib)
            and self._di_shape(root, el.get("id")) is not None
        ]
        flows = [
            el for el in root.iter()
            if el.tag.startswith(f"{{{BPMN_NS}}}") and self._local(el.tag) == "sequenceFlow"
            and self._di_edge(root, el.get("id")) is not None
        ]
        semantic_any = [
            el for el in root.iter()
            if el.tag.startswith(f"{{{BPMN_NS}}}") and el.get("id")
            and self._local(el.tag) not in (
                "definitions", "process", "sequenceFlow", "messageFlow", "association",
                "incoming", "outgoing", "documentation", "extensionElements",
            )
            and not ("sourceRef" in el.attrib and "targetRef" in el.attrib)
        ]
        if not semantic_any:
            self.skipTest("fixture has no tasks")
        target = semantic_tasks[0] if semantic_tasks else semantic_any[0]
        rename_target = semantic_any[0]
        ops.append({"opId": next_id(), "type": "element.updateProperties",
                    "elementId": rename_target.get("id"), "properties": {"name": "PM parity rename"}})
        if not has_plane or not semantic_tasks:
            # Фикстура без DI (camunda_15_subprocesses) — только семантические ops.
            return ops
        ops.append({"opId": next_id(), "type": "shape.move",
                    "elementId": target.get("id"), "x": 111, "y": 222})
        if len(semantic_tasks) >= 2:
            second = semantic_tasks[1]
            ops.append({"opId": next_id(), "type": "shape.resize",
                        "elementId": second.get("id"), "width": 150, "height": 110})
        if flows:
            ops.append({"opId": next_id(), "type": "element.updateDi",
                        "elementId": flows[0].get("id"), "waypoints": [[1, 2], [3, 4], [5, 6]]})
        ops.append({"opId": next_id(), "type": "shape.create", "elementId": "PM_parity_task",
                    "bpmnType": "bpmn:Task", "x": 900, "y": 400, "width": 100, "height": 80,
                    "parentId": self._process_id(root),
                    "name": "PM parity created"})
        if len(semantic_tasks) >= 2:
            ops.append({"opId": next_id(), "type": "connection.create", "connectionId": "PM_parity_flow",
                        "bpmnType": "bpmn:SequenceFlow", "sourceId": semantic_tasks[0].get("id"),
                        "targetId": "PM_parity_task", "waypoints": [[400, 300], [900, 440]]})
            ops.append({"opId": next_id(), "type": "shape.delete",
                        "elementId": semantic_tasks[1].get("id")})
        return ops

    def _process_id(self, root):
        for el in root.iter():
            if el.tag == f"{{{BPMN_NS}}}process":
                return el.get("id")
        return None

    def test_real_fixture_parity_and_di_invariants(self):
        for name in (
            "itmo_razogrev_v02.bpmn",
            "tobe_razogrev_supa_rtk_v03.bpmn",
            "camunda_15_subprocesses.bpmn",
        ):
            with self.subTest(fixture=name):
                with open(os.path.join(FIXTURES_DIR, name), encoding="utf-8") as fh:
                    xml_text = fh.read()
                root = ET.fromstring(xml_text)
                ops = self._mixed_ops_for(root)
                # DI-инвариант проверяем для элементов, имевших DI до батча
                # (некоторые реальные фикстуры содержат элементы без DI),
                # плюс созданные элементы.
                preexisting_di_ids = {
                    el.get("bpmnElement")
                    for el in root.iter()
                    if self._local(el.tag) in ("BPMNShape", "BPMNEdge") and el.get("bpmnElement")
                }
                result = self._apply(xml_text, ops)
                out = ET.fromstring(result)
                renamed = None
                deleted_id = None
                created_ids = set()
                for op in ops:
                    if op["type"] == "element.updateProperties":
                        renamed = op["elementId"]
                    if op["type"] == "shape.delete":
                        deleted_id = op["elementId"]
                    if op["type"] == "shape.create":
                        created_ids.add(op["elementId"])
                    if op["type"] == "connection.create":
                        created_ids.add(op["connectionId"])
                self.assertEqual(self._find(out, renamed).get("name"), "PM parity rename")
                for created_id in created_ids:
                    self.assertIsNotNone(self._find(out, created_id), created_id)
                after_ids = {
                    el.get("id")
                    for el in out.iter()
                    if el.tag.startswith(f"{{{BPMN_NS}}}") and el.get("id")
                }
                removed_ids = {
                    el.get("id")
                    for el in root.iter()
                    if el.tag.startswith(f"{{{BPMN_NS}}}") and el.get("id") and el.get("id") not in after_ids
                }
                if deleted_id:
                    self.assertIn(deleted_id, removed_ids)
                required = (preexisting_di_ids - removed_ids) | created_ids
                self._assert_di_invariants(out, required_ids=required)

    # --- масштаб --------------------------------------------------------

    def test_large_document_batch_applies_fast_and_keeps_invariants(self):
        xml_text = _gen_large_bpmn(150)  # 150 tasks + 151 flows + 152 shapes + DI > 600 элементов
        root = ET.fromstring(xml_text)
        self.assertGreater(len(list(root.iter())), 300)
        ops = []
        for i in range(20):
            ops.append({"opId": f"large-op-{i}", "type": "element.updateProperties",
                        "elementId": f"Task_g{i}", "properties": {"name": f"Edited {i}"}})
        ops.append({"opId": "large-move", "type": "shape.move", "elementId": "Task_g5",
                    "x": 42, "y": 43})
        ops.append({"opId": "large-resize", "type": "shape.resize", "elementId": "Task_g7",
                    "width": 200, "height": 120})
        ops.append({"opId": "large-create", "type": "shape.create", "elementId": "Task_large_new",
                    "bpmnType": "bpmn:Task", "x": 50, "y": 60, "width": 100, "height": 80,
                    "parentId": "Process_large"})
        ops.append({"opId": "large-delete", "type": "shape.delete", "elementId": "Task_g100"})
        start = time.monotonic()
        result = self._apply(xml_text, ops)
        elapsed = time.monotonic() - start
        self.assertLess(elapsed, 5.0, f"apply too slow: {elapsed:.2f}s")
        out = ET.fromstring(result)
        for i in range(20):
            self.assertEqual(self._find(out, f"Task_g{i}").get("name"), f"Edited {i}")
        self.assertIsNone(self._find(out, "Task_g100"))
        self.assertIsNone(self._find(out, "Flow_100"))
        self.assertIsNone(self._find(out, "Flow_101"))
        self.assertIsNotNone(self._find(out, "Task_large_new"))
        self._assert_di_invariants(out, deleted_ids=("Task_g100", "Flow_100", "Flow_101"))

    def test_scale_guard_1000_elements_50_ops_applies_fast(self):
        # S3 (op wave A): scale-guard контура — 1000 элементов (1000 tasks +
        # 1001 flows + DI) и батч 50 ops. До id-индекса applier был
        # O(ops×N) по root.iter(); индекс даёт O(N) на батч + O(1) на op.
        xml_text = _gen_large_bpmn(1000)
        root = ET.fromstring(xml_text)
        self.assertGreater(len(list(root.iter())), 2000)
        ops = []
        for i in range(46):
            ops.append({"opId": f"sg-op-{i}", "type": "element.updateProperties",
                        "elementId": f"Task_g{i}", "properties": {"name": f"SG {i}"}})
        ops.append({"opId": "sg-move", "type": "shape.move", "elementId": "Task_g500",
                    "x": 42, "y": 43})
        ops.append({"opId": "sg-resize", "type": "shape.resize", "elementId": "Task_g501",
                    "width": 200, "height": 120})
        ops.append({"opId": "sg-di", "type": "element.updateDi", "elementId": "Flow_500",
                    "waypoints": [[1, 2], [3, 4]]})
        ops.append({"opId": "sg-create", "type": "shape.create", "elementId": "Task_sg_new",
                    "bpmnType": "bpmn:Task", "x": 50, "y": 60, "width": 100, "height": 80,
                    "parentId": "Process_large"})
        self.assertEqual(len(ops), 50)
        start = time.monotonic()
        result = self._apply(xml_text, ops)
        elapsed = time.monotonic() - start
        self.assertLess(elapsed, 5.0, f"apply too slow at 1000 elements / 50 ops: {elapsed:.2f}s")
        out = ET.fromstring(result)
        for i in range(46):
            self.assertEqual(self._find(out, f"Task_g{i}").get("name"), f"SG {i}")
        self.assertIsNotNone(self._find(out, "Task_sg_new"))
        self._assert_di_invariants(out, required_ids={"Task_sg_new"})


if __name__ == "__main__":
    unittest.main()
