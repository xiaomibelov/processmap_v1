import test from "node:test";
import assert from "node:assert/strict";
import { deleteHybridIds } from "../hybridDelete.js";

test("delete element cascades edges and bindings cleanup", () => {
  const doc = {
    elements: [
      { id: "E1", type: "rect", x: 10, y: 10, w: 100, h: 50 },
      { id: "E2", type: "rect", x: 200, y: 10, w: 100, h: 50 },
    ],
    edges: [
      { id: "A1", type: "arrow", from: { element_id: "E1" }, to: { element_id: "E2" } },
      { id: "A2", type: "arrow", from: { element_id: "E2" }, to: { element_id: "E1" } },
    ],
    bindings: [
      { hybrid_id: "E1", bpmn_id: "Task_1", kind: "node" },
      { hybrid_id: "A1", bpmn_id: "Flow_1", kind: "flow" },
      { hybrid_id: "A2", bpmn_id: "Flow_2", kind: "flow" },
      { hybrid_id: "E2", bpmn_id: "Task_2", kind: "node" },
    ],
  };

  const out = deleteHybridIds(doc, ["E1"]);

  assert.deepEqual(out.deletedElements, ["E1"]);
  assert.deepEqual(out.deletedEdges.sort(), ["A1", "A2"]);
  assert.equal(out.nextHybridV2.elements.some((row) => row.id === "E1"), false);
  assert.equal(out.nextHybridV2.edges.length, 0);
  assert.equal(out.nextHybridV2.bindings.some((row) => row.hybrid_id === "E1"), false);
  assert.equal(out.nextHybridV2.bindings.some((row) => row.hybrid_id === "A1"), false);
  assert.equal(out.nextHybridV2.bindings.some((row) => row.hybrid_id === "A2"), false);
  assert.equal(out.cleanedBindings, 3);
});

test("delete edge removes only edge and edge binding", () => {
  const doc = {
    elements: [
      { id: "E1", type: "rect", x: 10, y: 10, w: 100, h: 50 },
      { id: "E2", type: "rect", x: 200, y: 10, w: 100, h: 50 },
    ],
    edges: [{ id: "A1", type: "arrow", from: { element_id: "E1" }, to: { element_id: "E2" } }],
    bindings: [
      { hybrid_id: "A1", bpmn_id: "Flow_1", kind: "flow" },
      { hybrid_id: "E1", bpmn_id: "Task_1", kind: "node" },
    ],
  };

  const out = deleteHybridIds(doc, ["A1"]);
  assert.deepEqual(out.deletedElements, []);
  assert.deepEqual(out.deletedEdges, ["A1"]);
  assert.equal(out.nextHybridV2.elements.length, 2);
  assert.equal(out.nextHybridV2.edges.length, 0);
  assert.equal(out.nextHybridV2.bindings.length, 1);
  assert.equal(out.nextHybridV2.bindings[0].hybrid_id, "E1");
  assert.equal(out.cleanedBindings, 1);
});

test("delete unknown id is no-op", () => {
  const doc = {
    elements: [{ id: "E1", type: "rect", x: 10, y: 10, w: 100, h: 50 }],
    edges: [],
    bindings: [{ hybrid_id: "E1", bpmn_id: "Task_1", kind: "node" }],
  };
  const out = deleteHybridIds(doc, ["UNKNOWN"]);
  assert.deepEqual(out.deletedElements, []);
  assert.deepEqual(out.deletedEdges, []);
  assert.equal(out.cleanedBindings, 0);
  assert.equal(out.nextHybridV2.elements.length, 1);
  assert.equal(out.nextHybridV2.bindings.length, 1);
});
