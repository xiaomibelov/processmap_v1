from __future__ import annotations

import xml.etree.ElementTree as ET

import os

from app.services.bpmn_navigation import (
    _local_tag,
    auto_target_element_id,
    called_element_id,
    element_type,
    extract_embedded_process_xml,
    extract_subprocess_xml,
    find_bpmn_element,
    preserve_existing_di,
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


# ---------------------------------------------------------------------------
# preserve_existing_di tests
# ---------------------------------------------------------------------------


def _bounds_dict(root, bpmn_element):
    ns = {"bpmndi": "http://www.omg.org/spec/BPMN/20100524/DI", "dc": "http://www.omg.org/spec/DD/20100524/DC"}
    for shape in root.findall(".//bpmndi:BPMNShape", ns):
        if shape.attrib.get("bpmnElement") == bpmn_element:
            bounds = shape.find("dc:Bounds", ns)
            if bounds is not None:
                return {k: float(bounds.attrib[k]) for k in ["x", "y", "width", "height"]}
    return None


def _waypoints(root, bpmn_element):
    ns = {"bpmndi": "http://www.omg.org/spec/BPMN/20100524/DI", "di": "http://www.omg.org/spec/DD/20100524/DI"}
    for edge in root.findall(".//bpmndi:BPMNEdge", ns):
        if edge.attrib.get("bpmnElement") == bpmn_element:
            return [(float(wp.attrib["x"]), float(wp.attrib["y"])) for wp in edge.findall("di:waypoint", ns)]
    return None


def _rects_overlap(a, b):
    return not (
        a["x"] + a["width"] <= b["x"]
        or b["x"] + b["width"] <= a["x"]
        or a["y"] + a["height"] <= b["y"]
        or b["y"] + b["height"] <= a["y"]
    )


BPMN_OLD_WITH_DI = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  id="Definitions_old">
  <bpmn:process id="Process_old">
    <bpmn:startEvent id="Start_1" />
    <bpmn:task id="Task_A" name="A" />
    <bpmn:task id="Task_B" name="B" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_A" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_A" targetRef="Task_B" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_old">
    <bpmndi:BPMNPlane id="BPMNPlane_old" bpmnElement="Process_old">
      <bpmndi:BPMNShape id="Start_1_di" bpmnElement="Start_1">
        <dc:Bounds x="242" y="212" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_A_di" bpmnElement="Task_A">
        <dc:Bounds x="330" y="190" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_B_di" bpmnElement="Task_B">
        <dc:Bounds x="650" y="190" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="260" y="230" />
        <di:waypoint x="380" y="230" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="430" y="230" />
        <di:waypoint x="700" y="230" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
"""


BPMN_NEW_GRID_WITH_EXTRA = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  id="Definitions_new">
  <bpmn:process id="Process_new">
    <bpmn:startEvent id="Start_1" />
    <bpmn:task id="Task_A" name="A renamed" />
    <bpmn:task id="Task_B" name="B" />
    <bpmn:task id="Task_C" name="C" />
    <bpmn:task id="Task_D" name="D" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_A" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_A" targetRef="Task_B" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_B" targetRef="Task_C" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_new">
    <bpmndi:BPMNPlane id="BPMNPlane_new" bpmnElement="Process_new">
      <bpmndi:BPMNShape id="Start_1_di" bpmnElement="Start_1">
        <dc:Bounds x="50" y="50" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_A_di" bpmnElement="Task_A">
        <dc:Bounds x="170" y="50" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_B_di" bpmnElement="Task_B">
        <dc:Bounds x="290" y="50" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_C_di" bpmnElement="Task_C">
        <dc:Bounds x="50" y="130" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_D_di" bpmnElement="Task_D">
        <dc:Bounds x="170" y="130" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1" sourceElement="Start_1" targetElement="Task_A">
        <di:waypoint x="68" y="68" />
        <di:waypoint x="220" y="90" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2" sourceElement="Task_A" targetElement="Task_B">
        <di:waypoint x="270" y="90" />
        <di:waypoint x="340" y="90" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3" sourceElement="Task_B" targetElement="Task_C">
        <di:waypoint x="340" y="90" />
        <di:waypoint x="100" y="170" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
"""


def test_preserve_existing_di_keeps_old_bounds():
    result = preserve_existing_di(BPMN_NEW_GRID_WITH_EXTRA, BPMN_OLD_WITH_DI)
    assert result is not None
    root = ET.fromstring(result)

    assert _bounds_dict(root, "Start_1") == {"x": 242, "y": 212, "width": 36, "height": 36}
    assert _bounds_dict(root, "Task_A") == {"x": 330, "y": 190, "width": 100, "height": 80}
    assert _bounds_dict(root, "Task_B") == {"x": 650, "y": 190, "width": 100, "height": 80}


def test_preserve_existing_di_places_new_shapes_in_free_area_without_overlap():
    result = preserve_existing_di(BPMN_NEW_GRID_WITH_EXTRA, BPMN_OLD_WITH_DI)
    assert result is not None
    root = ET.fromstring(result)

    preserved = ["Start_1", "Task_A", "Task_B"]
    new_ones = ["Task_C", "Task_D"]

    preserved_bounds = [_bounds_dict(root, eid) for eid in preserved]
    new_bounds = [_bounds_dict(root, eid) for eid in new_ones]

    for nb in new_bounds:
        assert nb is not None
        # New shape must not overlap any preserved shape.
        for pb in preserved_bounds:
            assert not _rects_overlap(nb, pb)
        # New shapes must not overlap each other.
        for other in new_bounds:
            if other is not nb:
                assert not _rects_overlap(nb, other)
        # New shape must be placed to the right/below the preserved bounding box.
        max_preserved_x = max(pb["x"] + pb["width"] for pb in preserved_bounds)
        max_preserved_y = max(pb["y"] + pb["height"] for pb in preserved_bounds)
        assert nb["x"] >= max_preserved_x + 100  # at least one grid step to the right
        assert nb["y"] >= max_preserved_y + 60   # at least most of one grid step down


def test_preserve_existing_di_preserves_old_edge_waypoints():
    result = preserve_existing_di(BPMN_NEW_GRID_WITH_EXTRA, BPMN_OLD_WITH_DI)
    assert result is not None
    root = ET.fromstring(result)

    assert _waypoints(root, "Flow_1") == [(260.0, 230.0), (380.0, 230.0)]
    assert _waypoints(root, "Flow_2") == [(430.0, 230.0), (700.0, 230.0)]


def test_preserve_existing_di_recalculates_new_edge_waypoints_from_final_bounds():
    result = preserve_existing_di(BPMN_NEW_GRID_WITH_EXTRA, BPMN_OLD_WITH_DI)
    assert result is not None
    root = ET.fromstring(result)

    # Task_B center after merge = (650+50, 190+40) = (700, 230)
    task_b = _bounds_dict(root, "Task_B")
    task_c = _bounds_dict(root, "Task_C")
    expected = [
        (task_b["x"] + task_b["width"] / 2, task_b["y"] + task_b["height"] / 2),
        (task_c["x"] + task_c["width"] / 2, task_c["y"] + task_c["height"] / 2),
    ]
    assert _waypoints(root, "Flow_3") == expected


def test_preserve_existing_di_returns_new_xml_when_old_unparseable():
    result = preserve_existing_di(BPMN_NEW_GRID_WITH_EXTRA, "not xml")
    assert result == BPMN_NEW_GRID_WITH_EXTRA


def test_preserve_existing_di_returns_new_xml_when_old_has_no_di():
    old_no_di = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
  <bpmn:process id="Process_1">
    <bpmn:startEvent id="Start_1" />
    <bpmn:task id="Task_A" name="A" />
  </bpmn:process>
</bpmn:definitions>
"""
    result = preserve_existing_di(BPMN_NEW_GRID_WITH_EXTRA, old_no_di)
    assert result == BPMN_NEW_GRID_WITH_EXTRA


def test_preserve_existing_di_returns_none_when_new_unparseable():
    result = preserve_existing_di("not xml", BPMN_OLD_WITH_DI)
    assert result is None


def test_preserve_existing_di_regression_773ec635cf_v15():
    fixtures_dir = os.path.join(os.path.dirname(__file__), "fixtures", "subprocess_preserve_di")
    with open(os.path.join(fixtures_dir, "773ec635cf_v15.xml"), encoding="utf-8") as f:
        old_xml = f.read()
    with open(os.path.join(fixtures_dir, "773ec635cf_current.xml"), encoding="utf-8") as f:
        new_xml = f.read()

    result = preserve_existing_di(new_xml, old_xml)
    assert result is not None
    root = ET.fromstring(result)

    expected_coords = {
        "Event_0ehaumf": (242, 212),
        "Activity_12yc0lk": (330, 190),
        "Activity_0fpcwm9": (490, 190),
        "Activity_1l1h3t3": (650, 190),
        "Event_0z8txn9": (812, 212),
    }
    for eid, (x, y) in expected_coords.items():
        bounds = _bounds_dict(root, eid)
        assert bounds is not None, f"missing bounds for {eid}"
        assert bounds["x"] == x, f"{eid} x expected {x}, got {bounds['x']}"
        assert bounds["y"] == y, f"{eid} y expected {y}, got {bounds['y']}"
