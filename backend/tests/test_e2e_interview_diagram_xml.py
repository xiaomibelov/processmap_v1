import os
import sys
import tempfile
import types
import unittest
import xml.etree.ElementTree as ET


SAMPLE_BPMN_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_0t0ftcl">
    <bpmn:participant id="Participant_0ub2h40" name="Суп туда сюда" processRef="Process_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:laneSet id="LaneSet_0syutxa">
      <bpmn:lane id="Lane_1doyq3b" name="Повар 1">
        <bpmn:flowNodeRef>StartEvent_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Activity_0blnk6h</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Activity_0v7dlne</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="Lane_0vjalvj" name="Повар 2">
        <bpmn:flowNodeRef>Event_1mtfpzu</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="StartEvent_1" name="Стартовое событие">
      <bpmn:outgoing>Flow_14robu7</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="Flow_14robu7" sourceRef="StartEvent_1" targetRef="Activity_0blnk6h" />
    <bpmn:task id="Activity_0blnk6h" name="первая">
      <bpmn:incoming>Flow_14robu7</bpmn:incoming>
      <bpmn:outgoing>Flow_0zicb8i</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Activity_0v7dlne" name="Вторая">
      <bpmn:incoming>Flow_0zicb8i</bpmn:incoming>
      <bpmn:outgoing>Flow_1hou5tu</bpmn:outgoing>
    </bpmn:task>
    <bpmn:sequenceFlow id="Flow_0zicb8i" sourceRef="Activity_0blnk6h" targetRef="Activity_0v7dlne" />
    <bpmn:sequenceFlow id="Flow_1hou5tu" sourceRef="Activity_0v7dlne" targetRef="Event_1mtfpzu" />
    <bpmn:endEvent id="Event_1mtfpzu" name="Событие завершено">
      <bpmn:incoming>Flow_1hou5tu</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_0t0ftcl">
      <bpmndi:BPMNShape id="Participant_0ub2h40_di" bpmnElement="Participant_0ub2h40" isHorizontal="true">
        <dc:Bounds x="123" y="50" width="807" height="420" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_0vjalvj_di" bpmnElement="Lane_0vjalvj" isHorizontal="true">
        <dc:Bounds x="153" y="260" width="777" height="210" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_1doyq3b_di" bpmnElement="Lane_1doyq3b" isHorizontal="true">
        <dc:Bounds x="153" y="50" width="777" height="210" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1">
        <dc:Bounds x="222" y="92" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_0blnk6h_di" bpmnElement="Activity_0blnk6h">
        <dc:Bounds x="310" y="90" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_0v7dlne_di" bpmnElement="Activity_0v7dlne">
        <dc:Bounds x="470" y="90" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Event_1mtfpzu_di" bpmnElement="Event_1mtfpzu">
        <dc:Bounds x="812" y="312" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
"""

MODIFIED_BPMN_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_0t0ftcl">
    <bpmn:participant id="Participant_0ub2h40" name="Суп туда сюда" processRef="Process_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:laneSet id="LaneSet_0syutxa">
      <bpmn:lane id="Lane_1doyq3b" name="Повар 1">
        <bpmn:flowNodeRef>StartEvent_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Activity_0blnk6h</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Activity_0v7dlne</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Activity_new_1</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="Lane_0vjalvj" name="Повар 2">
        <bpmn:flowNodeRef>Event_1mtfpzu</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="StartEvent_1" name="Стартовое событие">
      <bpmn:outgoing>Flow_14robu7</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="Flow_14robu7" sourceRef="StartEvent_1" targetRef="Activity_0blnk6h" />
    <bpmn:task id="Activity_0blnk6h" name="первая">
      <bpmn:incoming>Flow_14robu7</bpmn:incoming>
      <bpmn:outgoing>Flow_0zicb8i</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Activity_0v7dlne" name="Вторая">
      <bpmn:incoming>Flow_0zicb8i</bpmn:incoming>
      <bpmn:outgoing>Flow_to_new_1</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Activity_new_1" name="третья">
      <bpmn:incoming>Flow_to_new_1</bpmn:incoming>
      <bpmn:outgoing>Flow_new_to_end_1</bpmn:outgoing>
    </bpmn:task>
    <bpmn:sequenceFlow id="Flow_0zicb8i" sourceRef="Activity_0blnk6h" targetRef="Activity_0v7dlne" />
    <bpmn:sequenceFlow id="Flow_to_new_1" sourceRef="Activity_0v7dlne" targetRef="Activity_new_1" />
    <bpmn:sequenceFlow id="Flow_new_to_end_1" sourceRef="Activity_new_1" targetRef="Event_1mtfpzu" />
    <bpmn:endEvent id="Event_1mtfpzu" name="Событие завершено">
      <bpmn:incoming>Flow_new_to_end_1</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_0t0ftcl">
      <bpmndi:BPMNShape id="Participant_0ub2h40_di" bpmnElement="Participant_0ub2h40" isHorizontal="true">
        <dc:Bounds x="123" y="50" width="1040" height="420" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_0vjalvj_di" bpmnElement="Lane_0vjalvj" isHorizontal="true">
        <dc:Bounds x="153" y="260" width="1010" height="210" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_1doyq3b_di" bpmnElement="Lane_1doyq3b" isHorizontal="true">
        <dc:Bounds x="153" y="50" width="1010" height="210" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1">
        <dc:Bounds x="222" y="92" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_0blnk6h_di" bpmnElement="Activity_0blnk6h">
        <dc:Bounds x="310" y="90" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_0v7dlne_di" bpmnElement="Activity_0v7dlne">
        <dc:Bounds x="610" y="90" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_new_1_di" bpmnElement="Activity_new_1">
        <dc:Bounds x="780" y="90" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Event_1mtfpzu_di" bpmnElement="Event_1mtfpzu">
        <dc:Bounds x="1030" y="312" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_14robu7_di" bpmnElement="Flow_14robu7">
        <di:waypoint x="258" y="110" />
        <di:waypoint x="284" y="110" />
        <di:waypoint x="284" y="130" />
        <di:waypoint x="310" y="130" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_0zicb8i_di" bpmnElement="Flow_0zicb8i">
        <di:waypoint x="410" y="130" />
        <di:waypoint x="610" y="130" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_to_new_1_di" bpmnElement="Flow_to_new_1">
        <di:waypoint x="710" y="130" />
        <di:waypoint x="780" y="130" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_new_to_end_1_di" bpmnElement="Flow_new_to_end_1">
        <di:waypoint x="900" y="130" />
        <di:waypoint x="965" y="130" />
        <di:waypoint x="965" y="330" />
        <di:waypoint x="1030" y="330" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
"""


def _local(tag: str) -> str:
    return str(tag or "").split("}", 1)[-1].lower()


def _iter_local(root, local_name: str):
    q = str(local_name or "").lower()
    for el in root.iter():
        if _local(el.tag) == q:
            yield el


def _shape_bounds_map(root) -> dict[str, tuple[int, int, int, int]]:
    out: dict[str, tuple[int, int, int, int]] = {}
    for shape in _iter_local(root, "BPMNShape"):
        bpmn_el = str(shape.attrib.get("bpmnElement") or "").strip()
        if not bpmn_el:
            continue
        bounds = next(_iter_local(shape, "Bounds"), None)
        if bounds is None:
            continue
        try:
            x = int(float(bounds.attrib.get("x", "0")))
            y = int(float(bounds.attrib.get("y", "0")))
            w = int(float(bounds.attrib.get("width", "0")))
            h = int(float(bounds.attrib.get("height", "0")))
        except Exception:
            continue
        out[bpmn_el] = (x, y, w, h)
    return out


def _core_diagram_fingerprint(xml_text: str) -> dict:
    root = ET.fromstring(xml_text)
    flow_nodes = {
        str(el.attrib.get("id") or "").strip()
        for name in ("startEvent", "task", "endEvent")
        for el in _iter_local(root, name)
        if str(el.attrib.get("id") or "").strip()
    }
    flows = {
        str(el.attrib.get("id") or "").strip()
        for el in _iter_local(root, "sequenceFlow")
        if str(el.attrib.get("id") or "").strip()
    }
    lane_names = sorted(
        str(el.attrib.get("name") or "").strip()
        for el in _iter_local(root, "lane")
        if str(el.attrib.get("name") or "").strip()
    )
    bounds = _shape_bounds_map(root)
    key_bounds = {k: bounds.get(k) for k in ("Activity_0v7dlne", "Activity_new_1", "Event_1mtfpzu")}
    return {
        "flow_nodes": sorted(flow_nodes),
        "flows": sorted(flows),
        "lane_names": lane_names,
        "key_bounds": key_bounds,
    }


class E2EInterviewDiagramXmlTest(unittest.TestCase):
    def setUp(self):
        if "yaml" not in sys.modules:
            mod = types.ModuleType("yaml")
            mod.safe_dump = lambda *args, **kwargs: ""
            mod.safe_load = lambda *args, **kwargs: {}
            sys.modules["yaml"] = mod

        self.tmp_sessions = tempfile.TemporaryDirectory()
        self.tmp_projects = tempfile.TemporaryDirectory()
        self.old_sessions_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_projects_dir = os.environ.get("PROJECT_STORAGE_DIR")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp_sessions.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp_projects.name

        from app._legacy_main import (
            BpmnXmlIn,
            CreateSessionIn,
            UpdateSessionIn,
            ai_questions,
            create_session,
            get_session,
            get_session_analytics,
            patch_session,
            recompute,
            session_bpmn_export,
            session_bpmn_save,
        )

        self.BpmnXmlIn = BpmnXmlIn
        self.CreateSessionIn = CreateSessionIn
        self.UpdateSessionIn = UpdateSessionIn
        self.ai_questions = ai_questions
        self.create_session = create_session
        self.get_session = get_session
        self.get_session_analytics = get_session_analytics
        self.patch_session = patch_session
        self.recompute = recompute
        self.session_bpmn_export = lambda sid, raw=0, include_overlay=1: (
            session_bpmn_export(sid, raw=raw, include_overlay=include_overlay)
        )
        self.session_bpmn_save = session_bpmn_save

    def tearDown(self):
        if self.old_sessions_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_sessions_dir
        if self.old_projects_dir is None:
            os.environ.pop("PROJECT_STORAGE_DIR", None)
        else:
            os.environ["PROJECT_STORAGE_DIR"] = self.old_projects_dir
        self.tmp_sessions.cleanup()
        self.tmp_projects.cleanup()

    def _create_session(self) -> str:
        data = self.create_session(
            self.CreateSessionIn(
                title="E2E test",
                roles=["Повар 1", "Повар 2"],
                start_role="Повар 1",
            )
        )
        self.assertIn("id", data)
        return str(data["id"])

    def test_import_interview_comment_export_xml_keeps_diagram_and_adds_annotation(self):
        sid = self._create_session()

        put_res = self.session_bpmn_save(sid, self.BpmnXmlIn(xml=SAMPLE_BPMN_XML))
        self.assertTrue(put_res.get("ok"))

        patch_res = self.patch_session(
            sid,
            self.UpdateSessionIn(
                interview={
                    "steps": [
                        {
                            "id": "step_1",
                            "node_id": "Activity_0blnk6h",
                            "action": "первая",
                            "comment": "Проверить солёность",
                        }
                    ]
                },
            ),
        )
        self.assertEqual(
            patch_res.get("interview", {}).get("steps", [{}])[0].get("comment"),
            "Проверить солёность",
        )

        export_res = self.session_bpmn_export(sid)
        self.assertEqual(export_res.status_code, 200)
        xml = (export_res.body or b"").decode("utf-8", errors="replace")
        root = ET.fromstring(xml)

        lane_names = [str(x.attrib.get("name") or "").strip() for x in _iter_local(root, "lane")]
        self.assertIn("Повар 1", lane_names)
        self.assertIn("Повар 2", lane_names)

        end_ids = {str(x.attrib.get("id") or "").strip() for x in _iter_local(root, "endevent")}
        self.assertIn("Event_1mtfpzu", end_ids)

        annotations = list(_iter_local(root, "textAnnotation"))
        self.assertGreaterEqual(len(annotations), 1)
        ann_id = ""
        for ann in annotations:
            txt_node = next(_iter_local(ann, "text"), None)
            txt = str(getattr(txt_node, "text", "") or "").strip()
            if txt == "Проверить солёность":
                ann_id = str(ann.attrib.get("id") or "").strip()
                break
        self.assertTrue(ann_id, "Ожидался textAnnotation с комментарием из Interview")

        associations = list(_iter_local(root, "association"))
        linked = any(
            str(a.attrib.get("sourceRef") or "").strip() == "Activity_0blnk6h"
            and str(a.attrib.get("targetRef") or "").strip() == ann_id
            for a in associations
        )
        self.assertTrue(linked, "Ожидалась association от Activity_0blnk6h к textAnnotation")

    def test_reexport_replaces_previous_fpc_annotation_for_same_step(self):
        sid = self._create_session()
        self.session_bpmn_save(sid, self.BpmnXmlIn(xml=SAMPLE_BPMN_XML))

        self.patch_session(
            sid,
            self.UpdateSessionIn(
                interview={
                    "steps": [
                        {"id": "step_1", "node_id": "Activity_0blnk6h", "action": "первая", "comment": "Первый текст"}
                    ]
                },
            ),
        )
        self.session_bpmn_export(sid)

        self.patch_session(
            sid,
            self.UpdateSessionIn(
                interview={
                    "steps": [
                        {"id": "step_1", "node_id": "Activity_0blnk6h", "action": "первая", "comment": "Второй текст"}
                    ]
                },
            ),
        )
        xml2 = (self.session_bpmn_export(sid).body or b"").decode("utf-8", errors="replace")
        root2 = ET.fromstring(xml2)

        ann_texts = []
        for ann in _iter_local(root2, "textAnnotation"):
            txt_node = next(_iter_local(ann, "text"), None)
            txt = str(getattr(txt_node, "text", "") or "").strip()
            if txt:
                ann_texts.append(txt)
        self.assertIn("Второй текст", ann_texts)
        self.assertNotIn("Первый текст", ann_texts)

    def test_tab_cycle_keeps_added_and_moved_bpmn_elements(self):
        sid = self._create_session()
        put_res = self.session_bpmn_save(sid, self.BpmnXmlIn(xml=MODIFIED_BPMN_XML))
        self.assertTrue(put_res.get("ok"))

        xml_before = (self.session_bpmn_export(sid).body or b"").decode("utf-8", errors="replace")
        fp_before = _core_diagram_fingerprint(xml_before)
        self.assertIn("Activity_new_1", fp_before["flow_nodes"])
        self.assertEqual(fp_before["key_bounds"]["Activity_0v7dlne"], (610, 90, 100, 80))
        self.assertEqual(fp_before["key_bounds"]["Activity_new_1"], (780, 90, 120, 80))
        self.assertEqual(fp_before["key_bounds"]["Event_1mtfpzu"], (1030, 312, 36, 36))

        # diagram -> interview
        patch_res = self.patch_session(
            sid,
            self.UpdateSessionIn(
                interview={
                    "steps": [
                        {
                            "id": "step_new_1",
                            "node_id": "Activity_new_1",
                            "action": "третья",
                            "role": "Повар 1",
                            "comment": "Комментарий после перемещения узла",
                        }
                    ]
                },
            ),
        )
        self.assertEqual(patch_res.get("error"), None)

        # interview -> review
        analytics = self.get_session_analytics(sid)
        self.assertEqual(analytics.get("session_id"), sid)

        # review -> llm (вкладка сама по себе не должна менять BPMN; API без ключа вернет error)
        llm_attempt = self.ai_questions(sid, types.SimpleNamespace(limit=5, mode="sequential", node_id=None, step_id=None, reset=False))
        self.assertIn("error", llm_attempt)

        # llm -> xml
        xml_mid = (self.session_bpmn_export(sid).body or b"").decode("utf-8", errors="replace")
        fp_mid = _core_diagram_fingerprint(xml_mid)
        self.assertEqual(fp_mid, fp_before)

        # xml -> diagram -> interview -> review -> llm -> xml (второй цикл)
        self.recompute(sid)
        current = self.get_session(sid)
        self.assertEqual(str(current.get("id") or ""), sid)
        xml_after = (self.session_bpmn_export(sid).body or b"").decode("utf-8", errors="replace")
        fp_after = _core_diagram_fingerprint(xml_after)
        self.assertEqual(fp_after, fp_before)

    def test_interview_graph_change_regenerates_xml_from_updated_nodes_edges(self):
        sid = self._create_session()
        put_res = self.session_bpmn_save(sid, self.BpmnXmlIn(xml=SAMPLE_BPMN_XML))
        self.assertTrue(put_res.get("ok"))

        patch_res = self.patch_session(
            sid,
            self.UpdateSessionIn(
                nodes=[
                    {"id": "Activity_0blnk6h", "type": "step", "title": "первая", "actor_role": "Повар 1"},
                    {"id": "Activity_0v7dlne", "type": "step", "title": "Вторая", "actor_role": "Повар 1"},
                    {"id": "Activity_new_sync", "type": "step", "title": "третья", "actor_role": "Повар 1"},
                ],
                edges=[
                    {"from_id": "Activity_0blnk6h", "to_id": "Activity_0v7dlne"},
                    {"from_id": "Activity_0v7dlne", "to_id": "Activity_new_sync"},
                    {"from_id": "Activity_new_sync", "to_id": "EndEvent_1"},
                ],
                interview={
                    "steps": [
                        {"id": "step_1", "node_id": "Activity_0blnk6h", "action": "первая", "role": "Повар 1"},
                        {"id": "step_2", "node_id": "Activity_0v7dlne", "action": "Вторая", "role": "Повар 1"},
                        {"id": "step_3", "node_id": "Activity_new_sync", "action": "третья", "role": "Повар 1"},
                    ]
                },
            ),
        )
        self.assertEqual(patch_res.get("error"), None)

        export_res = self.session_bpmn_export(sid)
        self.assertEqual(export_res.status_code, 200)
        xml = (export_res.body or b"").decode("utf-8", errors="replace")
        root = ET.fromstring(xml)

        task_ids = {str(x.attrib.get("id") or "").strip() for x in _iter_local(root, "task")}
        self.assertIn("Activity_new_sync", task_ids)

        current = self.get_session(sid)
        self.assertTrue(str(current.get("bpmn_graph_fingerprint") or "").strip())


if __name__ == "__main__":
    unittest.main()
