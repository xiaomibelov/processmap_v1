import test from "node:test";
import assert from "node:assert/strict";
import { resolveBpmnContextMenuTarget } from "./resolveBpmnContextMenuTarget.js";

test("resolve target: empty runtime event falls back to canvas", () => {
  const target = resolveBpmnContextMenuTarget({ runtimeEvent: null, scope: "canvas", inst: null });
  assert.equal(target.kind, "canvas");
});

test("resolve target: label hit normalizes to owner element", () => {
  const runtimeEvent = {
    type: "element.contextmenu",
    element: {
      id: "label_Task_1",
      type: "label",
      labelTarget: {
        id: "Task_1",
        type: "bpmn:Task",
        businessObject: { $type: "bpmn:Task", name: "Approve" },
      },
    },
  };

  const target = resolveBpmnContextMenuTarget({
    runtimeEvent,
    scope: "element",
    inst: null,
  });

  assert.equal(target.kind, "element");
  assert.equal(target.id, "Task_1");
  assert.equal(target.bpmnType, "bpmn:Task");
  assert.equal(target.name, "Approve");
});

test("resolve target: root process normalizes to canvas", () => {
  const runtimeEvent = {
    type: "element.contextmenu",
    element: {
      id: "Process_1",
      type: "bpmn:Process",
      businessObject: { $type: "bpmn:Process" },
    },
  };

  const target = resolveBpmnContextMenuTarget({
    runtimeEvent,
    scope: "element",
    inst: null,
  });

  assert.equal(target.kind, "canvas");
});

test("resolve target: sequence flow is classified as connection", () => {
  const runtimeEvent = {
    type: "element.contextmenu",
    element: {
      id: "Flow_1",
      type: "bpmn:SequenceFlow",
      waypoints: [{ x: 1, y: 1 }, { x: 10, y: 10 }],
      businessObject: { $type: "bpmn:SequenceFlow", name: "flow" },
    },
  };

  const target = resolveBpmnContextMenuTarget({
    runtimeEvent,
    scope: "element",
    inst: null,
  });

  assert.equal(target.kind, "connection");
  assert.equal(target.id, "Flow_1");
  assert.equal(target.isConnection, true);
});
