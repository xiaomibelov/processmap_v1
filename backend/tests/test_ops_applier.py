"""Server-side fail-safe validation for unsafe artifact shape ops (Task 6)."""

import xml.etree.ElementTree as ET

import pytest

from app.save_services.ops_applier import (
    BPMN_NS,
    BPMNDI_NS,
    OperationApplyError,
    _local,
    _ns,
    apply_operations,
)

XML = (
    '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" '
    'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" id="Defs">'
    '<bpmn:process id="P"/>'
    '<bpmndi:BPMNDiagram id="D"><bpmndi:BPMNPlane id="Plane" bpmnElement="P"/>'
    '</bpmndi:BPMNDiagram></bpmn:definitions>'
)

UNSAFE_CREATE_CASES = [
    "bpmn:Participant",
    # S4 волна 2 сняла data-refs; волна 3 — lane (golden-parity evidence/s4).
    "bpmn:DataInputAssociation",
    "bpmn:DataOutputAssociation",
    # S4 волна 1: Association/TextAnnotation выведены в ops (golden-parity
    # evidence/s4) — в списке остаются неснятые cold-типы.
]


def _create_op(element_id, bpmn_type):
    return {
        "op": "shape.create",
        "opId": f"op-{element_id}",
        "type": "shape.create",
        "elementId": element_id,
        "elementType": bpmn_type,
        "bounds": {"x": 0, "y": 0, "width": 100, "height": 80},
    }


@pytest.mark.parametrize("bpmn_type", UNSAFE_CREATE_CASES)
def test_shape_create_unsafe_type_rejected_not_constructed(bpmn_type):
    element_id = f"El_{bpmn_type.split(':')[1]}"
    with pytest.raises(OperationApplyError) as excinfo:
        apply_operations(XML, [_create_op(element_id, bpmn_type)])
    err = excinfo.value
    assert err.reason == "full_save_required_for_bpmn_type"
    assert err.op_id == f"op-{element_id}"
    assert err.op_type == "shape.create"
    # Fail-safe: element must not appear in the serialized result on rollback —
    # apply_operations raises before returning, so nothing to check here; the
    # raised error shape is the contract (op id/type + explicit code).


def test_shape_create_task_still_works():
    result = apply_operations(XML, [_create_op("Task_1", "bpmn:Task")])
    assert 'id="Task_1"' in result
    assert "<bpmn:task" in result


CONNECTION_XML = (
    '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" '
    'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" id="Defs">'
    '<bpmn:process id="P">'
    '<bpmn:task id="Task_A"/><bpmn:task id="Task_B"/>'
    '</bpmn:process>'
    '<bpmndi:BPMNDiagram id="D"><bpmndi:BPMNPlane id="Plane" bpmnElement="P"/>'
    '</bpmndi:BPMNDiagram></bpmn:definitions>'
)

UNSAFE_CONNECTION_TYPES = [
    # S4 волна 1 сняла bpmn:Association (golden-parity).
    "bpmn:DataInputAssociation",
    "bpmn:DataOutputAssociation",
]


def _connection_op(connection_id, bpmn_type):
    return {
        "op": "connection.create",
        "opId": f"op-{connection_id}",
        "type": "connection.create",
        "elementId": connection_id,
        "elementType": bpmn_type,
        "sourceId": "Task_A",
        "targetId": "Task_B",
        "waypoints": [{"x": 0, "y": 0}, {"x": 100, "y": 100}],
    }


@pytest.mark.parametrize("bpmn_type", UNSAFE_CONNECTION_TYPES)
def test_connection_create_unsafe_type_rejected_not_constructed(bpmn_type):
    connection_id = f"Conn_{bpmn_type.split(':')[1]}"
    with pytest.raises(OperationApplyError) as excinfo:
        apply_operations(CONNECTION_XML, [_connection_op(connection_id, bpmn_type)])
    err = excinfo.value
    assert err.reason == "full_save_required_for_bpmn_type"
    assert err.op_id == f"op-{connection_id}"
    assert err.op_type == "connection.create"


def test_connection_create_sequence_flow_still_works():
    result = apply_operations(CONNECTION_XML, [_connection_op("Flow_1", "bpmn:SequenceFlow")])
    assert 'id="Flow_1"' in result
    assert "<bpmn:sequenceFlow" in result


# ---------------------------------------------------------------------------
# Контур feature/mutation-gateway-c3 (срез S4, волна 1): textAnnotation +
# association. Golden — реальный full-PUT bpmn-js (evidence/s4/logs/s4-golden.xml):
# <bpmn:textAnnotation id><bpmn:text>..</bpmn:text></bpmn:textAnnotation>;
# <bpmn:association id sourceRef targetRef/> БЕЗ incoming/outgoing у endpoints.
# ---------------------------------------------------------------------------

ARTIFACT_BASE_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Defs_art" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_art" isExecutable="false">
    <bpmn:userTask id="Task_1" name="Task one">
      <bpmn:incoming>Flow_1</bpmn:incoming>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="D1"><bpmndi:BPMNPlane id="P1" bpmnElement="Process_art">
    <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1"><dc:Bounds x="290" y="148" width="170" height="80" /></bpmndi:BPMNShape>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>"""


def test_s4w1_text_annotation_create_matches_golden():
    from app.save_services.ops_applier import apply_operations
    out = apply_operations(ARTIFACT_BASE_XML, [
        {"opId": "a1", "type": "shape.create", "elementId": "TextAnnotation_1",
         "bpmnType": "bpmn:TextAnnotation", "x": 650, "y": 485, "width": 100, "height": 30,
         "parentId": "Process_art"},
    ])
    root = ET.fromstring(out)
    ann = _find_semantic_by_id(root, "TextAnnotation_1")
    assert ann is not None and ann.tag == f"{{{BPMN_NS}}}textAnnotation"
    texts = [ch for ch in ann if ch.tag == f"{{{BPMN_NS}}}text"]
    assert len(texts) <= 1  # пустая аннотация — без <bpmn:text> или с пустым
    di = [el for el in root.iter() if el.tag == f"{{{BPMNDI_NS}}}BPMNShape"
          and el.get("bpmnElement") == "TextAnnotation_1"]
    assert len(di) == 1


def _find_semantic_by_id(root, element_id):
    for el in root.iter():
        if el.get("id") == element_id and _ns(el.tag) == BPMN_NS:
            return el
    return None


def test_s4w1_association_create_no_incoming_outgoing():
    from app.save_services.ops_applier import apply_operations
    ops = [
        {"opId": "a1", "type": "shape.create", "elementId": "TextAnnotation_1",
         "bpmnType": "bpmn:TextAnnotation", "x": 650, "y": 485, "width": 100, "height": 30,
         "parentId": "Process_art"},
        {"opId": "a2", "type": "connection.create", "elementId": "Association_1",
         "bpmnType": "bpmn:Association", "sourceId": "Task_1", "targetId": "TextAnnotation_1",
         "waypoints": [[417, 228], [684, 485]]},
    ]
    out = apply_operations(ARTIFACT_BASE_XML, ops)
    root = ET.fromstring(out)
    assoc = _find_semantic_by_id(root, "Association_1")
    assert assoc is not None and assoc.tag == f"{{{BPMN_NS}}}association"
    assert assoc.get("sourceRef") == "Task_1"
    assert assoc.get("targetRef") == "TextAnnotation_1"
    # golden parity: incoming/outgoing НЕ создаются для association.
    task = _find_semantic_by_id(root, "Task_1")
    incident = [ch for ch in task if _local(ch.tag) in ("incoming", "outgoing")]
    assert [ch.text for ch in incident] == ["Flow_1"]
    ann = _find_semantic_by_id(root, "TextAnnotation_1")
    assert len([ch for ch in ann if _local(ch.tag) in ("incoming", "outgoing")]) == 0
    edges = [el for el in root.iter() if el.tag == f"{{{BPMNDI_NS}}}BPMNEdge"
             and el.get("bpmnElement") == "Association_1"]
    assert len(edges) == 1


def test_s4w1_association_missing_artifact_ref_typed_422():
    from app.save_services.ops_applier import OperationApplyError, apply_operations
    with pytest.raises(OperationApplyError) as exc:
        apply_operations(ARTIFACT_BASE_XML, [
            {"opId": "a2", "type": "connection.create", "elementId": "Association_1",
             "bpmnType": "bpmn:Association", "sourceId": "Task_1", "targetId": "Ghost_9",
             "waypoints": [[1, 2], [3, 4]]},
        ])
    assert "target_not_found" in str(exc.value)


def test_s4w1_text_annotation_text_update_child_element():
    from app.save_services.ops_applier import apply_operations
    ops = [
        {"opId": "a1", "type": "shape.create", "elementId": "TextAnnotation_1",
         "bpmnType": "bpmn:TextAnnotation", "x": 650, "y": 485, "width": 100, "height": 30,
         "parentId": "Process_art"},
        {"opId": "a3", "type": "element.updateProperties", "elementId": "TextAnnotation_1",
         "properties": {"text": "Золотой эталон"}},
        {"opId": "a4", "type": "element.updateProperties", "elementId": "TextAnnotation_1",
         "properties": {"text": "Правка два"}},
    ]
    out = apply_operations(ARTIFACT_BASE_XML, ops)
    root = ET.fromstring(out)
    ann = _find_semantic_by_id(root, "TextAnnotation_1")
    texts = [ch for ch in ann if ch.tag == f"{{{BPMN_NS}}}text"]
    assert len(texts) == 1, "повторная правка заменяет <bpmn:text>, а не плодит"
    assert texts[0].text == "Правка два"
    assert ann.get("text") is None, "текст аннотации — НЕ атрибут (golden parity)"


def test_s4w1_delete_annotation_cascades_association():
    from app.save_services.ops_applier import apply_operations
    ops = [
        {"opId": "a1", "type": "shape.create", "elementId": "TextAnnotation_1",
         "bpmnType": "bpmn:TextAnnotation", "x": 650, "y": 485, "width": 100, "height": 30,
         "parentId": "Process_art"},
        {"opId": "a2", "type": "connection.create", "elementId": "Association_1",
         "bpmnType": "bpmn:Association", "sourceId": "Task_1", "targetId": "TextAnnotation_1",
         "waypoints": [[417, 228], [684, 485]]},
        {"opId": "a5", "type": "shape.delete", "elementId": "TextAnnotation_1"},
    ]
    out = apply_operations(ARTIFACT_BASE_XML, ops)
    root = ET.fromstring(out)
    assert _find_semantic_by_id(root, "TextAnnotation_1") is None
    assert _find_semantic_by_id(root, "Association_1") is None
    edges = [el for el in root.iter() if el.tag == f"{{{BPMNDI_NS}}}BPMNEdge"
             and el.get("bpmnElement") == "Association_1"]
    assert len(edges) == 0


# ---------------------------------------------------------------------------
# Контур feature/mutation-gateway-c3 (срез S4, волна 2): dataStoreReference /
# dataObjectReference. Golden — evidence/s4/logs/s4-wave23-golden.xml:
# dataStoreReference — пустой leaf; dataObjectReference — dataObjectRef на
# companion <bpmn:dataObject> (bpmn-js чистит сироту при save — backend
# повторяет при delete).
# ---------------------------------------------------------------------------

def test_s4w2_data_store_reference_create_golden_leaf():
    from app.save_services.ops_applier import apply_operations
    out = apply_operations(ARTIFACT_BASE_XML, [
        {"opId": "d1", "type": "shape.create", "elementId": "DataStoreReference_1",
         "bpmnType": "bpmn:DataStoreReference", "x": 300, "y": 620, "width": 50, "height": 50,
         "parentId": "Process_art"},
    ])
    root = ET.fromstring(out)
    store = _find_semantic_by_id(root, "DataStoreReference_1")
    assert store is not None and store.tag == f"{{{BPMN_NS}}}dataStoreReference"
    assert len(list(store)) == 0, "golden: пустой leaf без дочерних"
    di = [el for el in root.iter() if el.tag == f"{{{BPMNDI_NS}}}BPMNShape"
          and el.get("bpmnElement") == "DataStoreReference_1"]
    assert len(di) == 1


def test_s4w2_data_object_reference_create_companion_data_object():
    from app.save_services.ops_applier import apply_operations
    out = apply_operations(ARTIFACT_BASE_XML, [
        {"opId": "d2", "type": "shape.create", "elementId": "DataObjectReference_1",
         "bpmnType": "bpmn:DataObjectReference", "x": 900, "y": 620, "width": 36, "height": 50,
         "parentId": "Process_art"},
    ])
    root = ET.fromstring(out)
    ref = _find_semantic_by_id(root, "DataObjectReference_1")
    assert ref is not None and ref.tag == f"{{{BPMN_NS}}}dataObjectReference"
    data_object_ref = ref.get("dataObjectRef")
    assert data_object_ref, "companion dataObjectRef обязан быть выставлен"
    companion = _find_semantic_by_id(root, data_object_ref)
    assert companion is not None and companion.tag == f"{{{BPMN_NS}}}dataObject"
    di = [el for el in root.iter() if el.tag == f"{{{BPMNDI_NS}}}BPMNShape"
          and el.get("bpmnElement") == "DataObjectReference_1"]
    assert len(di) == 1


def test_s4w2_delete_data_object_reference_cascades_companion():
    from app.save_services.ops_applier import apply_operations
    out = apply_operations(ARTIFACT_BASE_XML, [
        {"opId": "d2", "type": "shape.create", "elementId": "DataObjectReference_1",
         "bpmnType": "bpmn:DataObjectReference", "x": 900, "y": 620, "width": 36, "height": 50,
         "parentId": "Process_art"},
        {"opId": "d3", "type": "shape.delete", "elementId": "DataObjectReference_1"},
    ])
    root = ET.fromstring(out)
    assert _find_semantic_by_id(root, "DataObjectReference_1") is None
    # golden bpmn-js: сирота dataObject чистится при save — backend повторяет.
    leftovers = [el for el in root.iter() if el.tag == f"{{{BPMN_NS}}}dataObject"]
    assert leftovers == [], f"orphan dataObject must be removed: {[el.get('id') for el in leftovers]}"


# ---------------------------------------------------------------------------
# Контур feature/mutation-gateway-c3 (срез S4, волна 3): lane. Golden —
# evidence/s4/logs/s4-wave23-golden.xml: <bpmn:laneSet><bpmn:lane/></bpmn:laneSet>
# в process (laneset создаётся при отсутствии); DI isHorizontal="true".
# ---------------------------------------------------------------------------

POOL_BASE_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Defs_pool" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_pool" isExecutable="false">
    <bpmn:task id="Task_A" name="A" />
  </bpmn:process>
  <bpmn:process id="Process_part" isExecutable="false" />
  <bpmn:collaboration id="Collab_1">
    <bpmn:participant id="Participant_1" processRef="Process_part" />
  </bpmn:collaboration>
  <bpmndi:BPMNDiagram id="D1"><bpmndi:BPMNPlane id="P1" bpmnElement="Collab_1">
    <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1"><dc:Bounds x="200" y="100" width="600" height="300" /></bpmndi:BPMNShape>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>"""


def _lane_of(root, lane_id):
    for el in root.iter():
        if el.tag == f"{{{BPMN_NS}}}lane" and el.get("id") == lane_id:
            return el
    return None


def test_s4w3_lane_create_into_process_lane_set_created():
    from app.save_services.ops_applier import apply_operations
    out = apply_operations(POOL_BASE_XML, [
        {"opId": "l1", "type": "shape.create", "elementId": "Lane_1",
         "bpmnType": "bpmn:Lane", "x": 900, "y": 210, "width": 400, "height": 100,
         "parentId": "Process_pool"},
    ])
    root = ET.fromstring(out)
    lane = _lane_of(root, "Lane_1")
    assert lane is not None
    lane_set = next((el for el in root.iter() if el.tag == f"{{{BPMN_NS}}}laneSet"), None)
    assert lane_set is not None and lane in list(lane_set)
    assert lane_set.get("id"), "laneSet минтит id (golden LaneSet_*)"
    # golden DI: isHorizontal="true".
    di = [el for el in root.iter() if el.tag == f"{{{BPMNDI_NS}}}BPMNShape"
          and el.get("bpmnElement") == "Lane_1"]
    assert len(di) == 1 and di[0].get("isHorizontal") == "true"


def test_s4w3_lane_create_into_participant_resolves_process_ref():
    from app.save_services.ops_applier import apply_operations
    out = apply_operations(POOL_BASE_XML, [
        {"opId": "l2", "type": "shape.create", "elementId": "Lane_2",
         "bpmnType": "bpmn:Lane", "x": 220, "y": 120, "width": 400, "height": 100,
         "parentId": "Participant_1"},
    ])
    root = ET.fromstring(out)
    lane = _lane_of(root, "Lane_2")
    assert lane is not None
    process_part = _find_semantic_by_id(root, "Process_part")
    lane_set = next((ch for ch in process_part if ch.tag == f"{{{BPMN_NS}}}laneSet"), None)
    assert lane_set is not None and lane in list(lane_set), "lane participant'а живёт в processRef->laneSet"


def test_s4w3_delete_empty_lane_ok_and_populated_lane_typed_422():
    from app.save_services.ops_applier import OperationApplyError, apply_operations
    ops = [
        {"opId": "l1", "type": "shape.create", "elementId": "Lane_1",
         "bpmnType": "bpmn:Lane", "x": 900, "y": 210, "width": 400, "height": 100,
         "parentId": "Process_pool"},
        {"opId": "l-del", "type": "shape.delete", "elementId": "Lane_1"},
    ]
    out = apply_operations(POOL_BASE_XML, ops)
    root = ET.fromstring(out)
    assert _lane_of(root, "Lane_1") is None

    populated = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Defs_lp" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_lp" isExecutable="false">
    <bpmn:laneSet id="LaneSet_1"><bpmn:lane id="Lane_9" name="L"><bpmn:flowNodeRef>Task_B</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>
    <bpmn:task id="Task_B" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="D"><bpmndi:BPMNPlane id="P" bpmnElement="Process_lp"/></bpmndi:BPMNDiagram>
</bpmn:definitions>"""
    with pytest.raises(OperationApplyError) as exc:
        apply_operations(populated, [
            {"opId": "l-del2", "type": "shape.delete", "elementId": "Lane_9"},
        ])
    assert "lane_not_empty" in str(exc.value), "populated lane delete — typed 422 (fail-closed)"


# ---------------------------------------------------------------------------
# Контур feature/mutation-gateway-c3 (срез S5): property panel golden-parity.
# Серверный XML после ops === после full-PUT для name / documentation /
# camunda-атрибутов (verbatim через _register_namespaces).
# ---------------------------------------------------------------------------

def test_s5_documentation_rows_replace_children_with_text_format():
    from app.save_services.ops_applier import OperationApplyError, apply_operations
    ops = [
        {"opId": "p1", "type": "element.updateProperties", "elementId": "Task_1",
         "properties": {"documentation": [
             {"text": "Строка 1", "textFormat": "text/plain"},
             {"text": "Строка 2", "textFormat": "text/html"},
         ]}},
        {"opId": "p2", "type": "element.updateProperties", "elementId": "Task_1",
         "properties": {"documentation": [{"text": "Замена", "textFormat": "text/plain"}]}},
    ]
    out = apply_operations(ARTIFACT_BASE_XML, ops)
    root = ET.fromstring(out)
    task = _find_semantic_by_id(root, "Task_1")
    docs = [ch for ch in task if ch.tag == f"{{{BPMN_NS}}}documentation"]
    assert len(docs) == 1, "повторная правка ЗАМЕНЯЕТ documentation-children, не плодит"
    assert docs[0].text == "Замена"
    assert docs[0].get("textFormat") == "text/plain"
    assert list(task)[0] is docs[0], "documentation — первый child (bpmn-js порядок)"

    with pytest.raises(OperationApplyError) as exc:
        apply_operations(ARTIFACT_BASE_XML, [
            {"opId": "p3", "type": "element.updateProperties", "elementId": "Task_1",
             "properties": {"documentation": [{"textFormat": "text/plain"}]}},
        ])
    assert "invalid_documentation" in str(exc.value), "row без text — typed 422 (fail-closed)"


def test_s5_camunda_attribute_verbatim_and_name_golden():
    from app.save_services.ops_applier import apply_operations
    out = apply_operations(ARTIFACT_BASE_XML, [
        {"opId": "p4", "type": "element.updateProperties", "elementId": "Task_1",
         "properties": {"name": "Переименовано", "camunda:assignee": "demo",
                        "camunda:dueDate": "2026-10-03T00:00:00", "camunda:candidateGroups": "grp1,grp2"}},
    ])
    root = ET.fromstring(out)
    task = _find_semantic_by_id(root, "Task_1")
    assert task.get("name") == "Переименовано"
    # golden parity: camunda-атрибуты verbatim. После re-parse префикс —
    # Clark-нотация; сериализованный текст несёт префикс (S5: applier сам
    # добавляет xmlns при отсутствии — unbound prefix невозможен).
    CAMUNDA = "{http://camunda.org/schema/1.0/bpmn}"
    assert task.get(f"{CAMUNDA}assignee") == "demo"
    assert task.get(f"{CAMUNDA}dueDate") == "2026-10-03T00:00:00"
    assert task.get(f"{CAMUNDA}candidateGroups") == "grp1,grp2"
    assert 'camunda:assignee="demo"' in out, "сериализация несёт префикс verbatim"
    assert 'xmlns:camunda=' in out, "объявление добавлено applier'ом"
