from __future__ import annotations

import xml.etree.ElementTree as ET

from app.services.bpmn_navigation import (
    _local_tag,
    auto_target_element_id,
    called_element_id,
    element_type,
    extract_embedded_process_xml,
    extract_subprocess_xml,
    find_bpmn_element,
    resolve_target_element_id,
)

SAMPLE_BPMN = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
  <bpmn:process id="Process_main" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:callActivity id="CallActivity_1" calledElement="Process_sub" />
    <bpmn:subProcess id="SubProcess_1">
      <bpmn:userTask id="UserTask_in_sub" />
    </bpmn:subProcess>
    <bpmn:userTask id="UserTask_main" />
    <bpmn:task id="Task_main" />
  </bpmn:process>
  <bpmn:process id="Process_sub">
    <bpmn:startEvent id="StartEvent_sub" />
    <bpmn:userTask id="UserTask_sub" />
  </bpmn:process>
</bpmn:definitions>
"""


def test_find_bpmn_element_returns_element():
    el = find_bpmn_element(SAMPLE_BPMN, "CallActivity_1")
    assert el is not None
    assert el.attrib.get("id") == "CallActivity_1"


def test_find_bpmn_element_missing_returns_none():
    assert find_bpmn_element(SAMPLE_BPMN, "Missing") is None


def test_element_type():
    assert element_type(SAMPLE_BPMN, "CallActivity_1") == "callactivity"
    assert element_type(SAMPLE_BPMN, "SubProcess_1") == "subprocess"
    assert element_type(SAMPLE_BPMN, "UserTask_main") == "usertask"
    assert element_type(SAMPLE_BPMN, "Missing") is None


def test_called_element_id():
    assert called_element_id(SAMPLE_BPMN, "CallActivity_1") == "Process_sub"
    assert called_element_id(SAMPLE_BPMN, "Missing") is None
    assert called_element_id(SAMPLE_BPMN, "SubProcess_1") is None


def _find_process_id(root):
    for el in root.iter():
        if _local_tag(el.tag) == "process":
            return el.attrib.get("id")
    return None


def test_extract_embedded_process_xml():
    xml = extract_embedded_process_xml(SAMPLE_BPMN, "Process_sub")
    assert xml is not None
    assert "bpmn:definitions" in xml
    root = ET.fromstring(xml)
    assert _local_tag(root.tag) == "definitions"
    assert _find_process_id(root) == "Process_sub"
    tags = {_local_tag(el.tag) for el in root.iter()}
    assert "usertask" in tags
    assert "startevent" in tags


def test_extract_subprocess_xml_call_activity():
    xml = extract_subprocess_xml(SAMPLE_BPMN, "CallActivity_1")
    assert xml is not None
    assert "bpmn:definitions" in xml
    root = ET.fromstring(xml)
    assert _local_tag(root.tag) == "definitions"
    assert _find_process_id(root) == "Process_sub"


def test_extract_subprocess_xml_embedded_subprocess():
    xml = extract_subprocess_xml(SAMPLE_BPMN, "SubProcess_1")
    assert xml is not None
    assert "bpmn:definitions" in xml
    root = ET.fromstring(xml)
    assert _local_tag(root.tag) == "definitions"
    assert _find_process_id(root) == "SubProcess_1"
    tags = {_local_tag(el.tag) for el in root.iter()}
    assert "usertask" in tags


def test_auto_target_element_id_prefers_user_task():
    # Returns the first userTask found in document order.
    assert auto_target_element_id(SAMPLE_BPMN) == "UserTask_in_sub"


def test_resolve_target_element_id_explicit_override():
    assert resolve_target_element_id(SAMPLE_BPMN, explicit_target_id="UserTask_sub") == "UserTask_sub"
    assert resolve_target_element_id(SAMPLE_BPMN, explicit_target_id="Missing") == "UserTask_in_sub"
    assert resolve_target_element_id(SAMPLE_BPMN) == "UserTask_in_sub"


BPMN_SUBPROCESS_WITHOUT_DI = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
  <bpmn:process id="Process_main" isExecutable="true">
    <bpmn:subProcess id="SubProcess_no_di">
      <bpmn:startEvent id="Start_no_di" />
      <bpmn:task id="Task_no_di" />
      <bpmn:endEvent id="End_no_di" />
      <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_no_di" targetRef="Task_no_di" />
      <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_no_di" targetRef="End_no_di" />
    </bpmn:subProcess>
  </bpmn:process>
</bpmn:definitions>
"""


def test_extract_subprocess_xml_generates_di_when_parent_plane_missing():
    xml = extract_subprocess_xml(BPMN_SUBPROCESS_WITHOUT_DI, "SubProcess_no_di")
    assert xml is not None
    assert "bpmn:definitions" in xml
    assert "bpmndi:BPMNShape" in xml
    assert "bpmndi:BPMNEdge" in xml
    root = ET.fromstring(xml)
    shape_ids = {el.attrib.get("bpmnElement") for el in root.iter() if _local_tag(el.tag) == "bpmnshape"}
    assert "Start_no_di" in shape_ids
    assert "Task_no_di" in shape_ids
    assert "End_no_di" in shape_ids
    edge_count = sum(1 for el in root.iter() if _local_tag(el.tag) == "bpmnedge")
    assert edge_count == 2


BPMN_SUBPROCESS_AS_EXPANDED_SHAPE = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  id="Definitions_1">
  <bpmn:process id="Process_main" isExecutable="true">
    <bpmn:subProcess id="SubProcess_expanded">
      <bpmn:startEvent id="Start_exp" />
      <bpmn:task id="Task_exp" name="Inner task" />
      <bpmn:endEvent id="End_exp" />
      <bpmn:sequenceFlow id="Flow_exp_1" sourceRef="Start_exp" targetRef="Task_exp" />
      <bpmn:sequenceFlow id="Flow_exp_2" sourceRef="Task_exp" targetRef="End_exp" />
    </bpmn:subProcess>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_main">
      <bpmndi:BPMNShape id="Shape_SubProcess_expanded" bpmnElement="SubProcess_expanded" isExpanded="true">
        <dc:Bounds x="180" y="160" width="600" height="270" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Shape_Start_exp" bpmnElement="Start_exp">
        <dc:Bounds x="222" y="222" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Shape_Task_exp" bpmnElement="Task_exp">
        <dc:Bounds x="290" y="200" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Shape_End_exp" bpmnElement="End_exp">
        <dc:Bounds x="602" y="222" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Edge_Flow_exp_1" bpmnElement="Flow_exp_1">
        <di:waypoint x="258" y="240" />
        <di:waypoint x="290" y="240" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Edge_Flow_exp_2" bpmnElement="Flow_exp_2">
        <di:waypoint x="390" y="240" />
        <di:waypoint x="602" y="240" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
"""


def _shape_by_bpmn_element(root, bpmn_element):
    ns = {"bpmndi": "http://www.omg.org/spec/BPMN/20100524/DI", "dc": "http://www.omg.org/spec/DD/20100524/DC"}
    for shape in root.findall(".//bpmndi:BPMNShape", ns):
        if shape.attrib.get("bpmnElement") == bpmn_element:
            bounds = shape.find("dc:Bounds", ns)
            if bounds is not None:
                return {k: float(bounds.attrib[k]) for k in ["x", "y", "width", "height"]}
    return None


def test_extract_subprocess_xml_uses_expanded_shape_when_no_dedicated_plane():
    xml = extract_subprocess_xml(BPMN_SUBPROCESS_AS_EXPANDED_SHAPE, "SubProcess_expanded")
    assert xml is not None
    assert "bpmn:definitions" in xml
    root = ET.fromstring(xml)

    shape_ids = {el.attrib.get("bpmnElement") for el in root.iter() if _local_tag(el.tag) == "bpmnshape"}
    assert "Start_exp" in shape_ids
    assert "Task_exp" in shape_ids
    assert "End_exp" in shape_ids

    edge_count = sum(1 for el in root.iter() if _local_tag(el.tag) == "bpmnedge")
    assert edge_count == 2

    # Coordinates must be translated relative to the expanded subprocess shape origin (180, 160).
    start_bounds = _shape_by_bpmn_element(root, "Start_exp")
    assert start_bounds is not None
    assert start_bounds["x"] == 222 - 180
    assert start_bounds["y"] == 222 - 160

    task_bounds = _shape_by_bpmn_element(root, "Task_exp")
    assert task_bounds is not None
    assert task_bounds["x"] == 290 - 180
    assert task_bounds["y"] == 200 - 160

    end_bounds = _shape_by_bpmn_element(root, "End_exp")
    assert end_bounds is not None
    assert end_bounds["x"] == 602 - 180
    assert end_bounds["y"] == 222 - 160
