"""Server-side fail-safe validation for unsafe artifact shape ops (Task 6)."""

import pytest

from app.save_services.ops_applier import OperationApplyError, apply_operations

XML = (
    '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" '
    'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" id="Defs">'
    '<bpmn:process id="P"/>'
    '<bpmndi:BPMNDiagram id="D"><bpmndi:BPMNPlane id="Plane" bpmnElement="P"/>'
    '</bpmndi:BPMNDiagram></bpmn:definitions>'
)

UNSAFE_CREATE_CASES = [
    "bpmn:Participant",
    "bpmn:Lane",
    "bpmn:DataStoreReference",
    "bpmn:DataObjectReference",
    "bpmn:DataInputAssociation",
    "bpmn:DataOutputAssociation",
    "bpmn:Association",
    "bpmn:TextAnnotation",
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
