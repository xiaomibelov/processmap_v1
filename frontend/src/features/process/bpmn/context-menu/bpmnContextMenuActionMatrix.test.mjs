import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveBpmnContextMenuActions,
  resolveBpmnContextTargetKind,
} from "./bpmnContextMenuActionMatrix.js";

function actionIds(target) {
  return resolveBpmnContextMenuActions(target).map((item) => String(item.id || ""));
}

test("canvas action matrix includes V1 canvas actions", () => {
  const ids = actionIds({ kind: "canvas" });
  assert.deepEqual(ids, [
    "undo",
    "redo",
    "create_task",
    "create_gateway",
    "create_start_event",
    "create_end_event",
    "create_subprocess",
    "paste",
    "add_annotation",
  ]);
});

test("task action matrix includes add_next_step and utility actions", () => {
  const ids = actionIds({ bpmnType: "bpmn:Task" });
  assert.deepEqual(ids, [
    "rename",
    "open_properties",
    "add_next_step",
    "undo",
    "redo",
    "copy_name",
    "copy_id",
    "delete",
  ]);
});

test("gateway action matrix includes add_outgoing_branch", () => {
  const ids = actionIds({ bpmnType: "bpmn:ExclusiveGateway" });
  assert.equal(ids.includes("add_outgoing_branch"), true);
  assert.equal(ids.includes("add_next_step"), false);
  assert.equal(ids.includes("duplicate"), false);
});

test("sequence flow action matrix includes edit_label and delete only from V1 set", () => {
  const ids = actionIds({ bpmnType: "bpmn:SequenceFlow", isConnection: true });
  assert.deepEqual(ids, [
    "edit_label",
    "open_properties",
    "undo",
    "redo",
    "copy_id",
    "delete",
  ]);
});

test("undo/redo actions reflect runtime availability", () => {
  const actions = resolveBpmnContextMenuActions({
    kind: "canvas",
    canUndo: false,
    canRedo: true,
  });
  const undo = actions.find((item) => item.id === "undo");
  const redo = actions.find((item) => item.id === "redo");
  assert.equal(undo?.disabled, true);
  assert.equal(redo?.disabled, false);
});

test("target kind detection is stable for BPMN core types", () => {
  assert.equal(resolveBpmnContextTargetKind({ bpmnType: "bpmn:SubProcess" }), "subprocess");
  assert.equal(resolveBpmnContextTargetKind({ bpmnType: "bpmn:StartEvent" }), "start_event");
  assert.equal(resolveBpmnContextTargetKind({ bpmnType: "bpmn:EndEvent" }), "end_event");
  assert.equal(resolveBpmnContextTargetKind({ bpmnType: "bpmn:UserTask" }), "task");
  assert.equal(resolveBpmnContextTargetKind({ bpmnType: "bpmn:SequenceFlow" }), "sequence_flow");
});
