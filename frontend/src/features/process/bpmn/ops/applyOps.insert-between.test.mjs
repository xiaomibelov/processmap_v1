import assert from "node:assert/strict";
import test from "node:test";

import { applyOpsToModeler } from "./applyOps.js";

function createMockModeler() {
  const byId = new Map();
  const root = {
    id: "Process_1",
    type: "bpmn:Process",
    businessObject: { $type: "bpmn:Process" },
    incoming: [],
    outgoing: [],
    parent: null,
  };
  byId.set(root.id, root);

  function createTask(id, name, x) {
    const task = {
      id,
      type: "bpmn:Task",
      businessObject: { $type: "bpmn:Task", name },
      x,
      y: 120,
      width: 120,
      height: 80,
      incoming: [],
      outgoing: [],
      parent: root,
    };
    byId.set(id, task);
    return task;
  }

  function linkSequence(id, source, target, when = "") {
    const flow = {
      id,
      type: "bpmn:SequenceFlow",
      businessObject: { $type: "bpmn:SequenceFlow", name: when },
      source,
      target,
      waypoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      parent: root,
    };
    source.outgoing.push(flow);
    target.incoming.push(flow);
    byId.set(id, flow);
    return flow;
  }

  const taskA = createTask("Task_A", "A", 120);
  const taskB = createTask("Task_B", "B", 420);
  linkSequence("Flow_AB", taskA, taskB, "when_ab");

  let shapeSeq = 0;
  let flowSeq = 0;

  const registry = {
    get(id) {
      return byId.get(String(id || "")) || null;
    },
    getAll() {
      return Array.from(byId.values());
    },
  };

  const modeling = {
    createShape(shapeLike, pos, parent) {
      shapeSeq += 1;
      const type = String(shapeLike?.type || "bpmn:Task");
      const shape = {
        id: `Task_NEW_${shapeSeq}`,
        type,
        businessObject: { $type: type, name: "" },
        x: Number(pos?.x || 200),
        y: Number(pos?.y || 180),
        width: 120,
        height: 80,
        incoming: [],
        outgoing: [],
        parent: parent || root,
      };
      byId.set(shape.id, shape);
      return shape;
    },
    connect(source, target, options = {}) {
      flowSeq += 1;
      const type = String(options?.type || "bpmn:SequenceFlow");
      const flow = {
        id: `Flow_NEW_${flowSeq}`,
        type,
        businessObject: { $type: type, name: "" },
        source,
        target,
        waypoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        parent: root,
      };
      source.outgoing.push(flow);
      target.incoming.push(flow);
      byId.set(flow.id, flow);
      return flow;
    },
    removeConnection(connection) {
      const id = String(connection?.id || "");
      const conn = byId.get(id);
      if (!conn) return;
      const src = conn.source;
      const dst = conn.target;
      if (src?.outgoing) src.outgoing = src.outgoing.filter((item) => String(item?.id || "") !== id);
      if (dst?.incoming) dst.incoming = dst.incoming.filter((item) => String(item?.id || "") !== id);
      byId.delete(id);
    },
    removeShape(shape) {
      const id = String(shape?.id || "");
      const target = byId.get(id);
      if (!target) return;
      [...(target.incoming || [])].forEach((conn) => this.removeConnection(conn));
      [...(target.outgoing || [])].forEach((conn) => this.removeConnection(conn));
      byId.delete(id);
    },
    updateLabel(element, label) {
      if (!element?.businessObject) return;
      element.businessObject.name = String(label || "");
    },
  };

  const elementFactory = {
    createShape(options = {}) {
      return { type: String(options?.type || "bpmn:Task") };
    },
  };

  const canvas = {
    getRootElement() {
      return root;
    },
  };

  return {
    get(name) {
      if (name === "elementRegistry") return registry;
      if (name === "modeling") return modeling;
      if (name === "elementFactory") return elementFactory;
      if (name === "canvas") return canvas;
      return null;
    },
    __registry: registry,
  };
}

test("insertBetween replaces A->B with A->C and C->B (old edge removed)", async () => {
  const modeler = createMockModeler();
  const result = await applyOpsToModeler(modeler, [
    {
      type: "insertBetween",
      fromId: "Task_A",
      toId: "Task_B",
      flowId: "Flow_AB",
      newTaskName: "Task_C",
      whenPolicy: "to_first",
    },
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.applied, 1);
  assert.equal(result.failed, 0);

  const registry = modeler.__registry;
  assert.equal(registry.get("Flow_AB"), null);

  const all = registry.getAll();
  const tasks = all.filter((el) => String(el?.type || "") === "bpmn:Task");
  const flows = all.filter((el) => String(el?.type || "") === "bpmn:SequenceFlow");
  assert.equal(tasks.length, 3);
  assert.equal(flows.length, 2);

  const inserted = tasks.find((el) => String(el?.businessObject?.name || "") === "Task_C");
  assert.ok(inserted, "inserted task should exist");
  const edgeFromA = flows.find(
    (el) => String(el?.source?.id || "") === "Task_A" && String(el?.target?.id || "") === String(inserted?.id || ""),
  );
  const edgeToB = flows.find(
    (el) => String(el?.source?.id || "") === String(inserted?.id || "") && String(el?.target?.id || "") === "Task_B",
  );
  assert.ok(edgeFromA, "A->C edge should exist");
  assert.ok(edgeToB, "C->B edge should exist");
  assert.equal(String(edgeFromA?.businessObject?.name || ""), "when_ab");
});
