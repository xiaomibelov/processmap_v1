import test from "node:test";
import assert from "node:assert/strict";
import { deleteHybridIds } from "./hybridDelete.js";

test("deleteHybridIds: delete element cascades edges and bindings", () => {
  const input = {
    elements: [
      { id: "E1", type: "rect", x: 10, y: 10, w: 120, h: 60 },
      { id: "E2", type: "rect", x: 220, y: 10, w: 120, h: 60 },
    ],
    edges: [
      { id: "A1", type: "arrow", from: { element_id: "E1" }, to: { element_id: "E2" } },
      { id: "A2", type: "arrow", from: { element_id: "E2" }, to: { element_id: "E1" } },
    ],
    bindings: [
      { hybrid_id: "E1", bpmn_id: "Task_1", type: "node" },
      { hybrid_id: "A1", bpmn_id: "Flow_1", type: "flow" },
      { hybrid_id: "A2", bpmn_id: "Flow_2", type: "flow" },
      { hybrid_id: "E2", bpmn_id: "Task_2", type: "node" },
    ],
  };

  const out = deleteHybridIds(input, ["E1"]);

  assert.deepEqual(out.deleted.elements, ["E1"]);
  assert.deepEqual(out.deleted.edges.sort(), ["A1", "A2"]);
  assert.equal(out.nextHybridV2.elements.some((row) => row.id === "E1"), false);
  assert.equal(out.nextHybridV2.edges.length, 0);
  assert.equal(out.nextHybridV2.bindings.some((row) => row.hybrid_id === "E1"), false);
  assert.equal(out.nextHybridV2.bindings.some((row) => row.hybrid_id === "A1"), false);
  assert.equal(out.nextHybridV2.bindings.some((row) => row.hybrid_id === "A2"), false);
  assert.equal(out.nextHybridV2.bindings.some((row) => row.hybrid_id === "E2"), true);
  assert.equal(out.cleanedBindingsCount, 3);
});

test("deleteHybridIds: delete edge removes only edge and edge binding", () => {
  const input = {
    elements: [
      { id: "E1", type: "rect", x: 10, y: 10, w: 120, h: 60 },
      { id: "E2", type: "rect", x: 220, y: 10, w: 120, h: 60 },
    ],
    edges: [
      { id: "A1", type: "arrow", from: { element_id: "E1" }, to: { element_id: "E2" } },
    ],
    bindings: [
      { hybrid_id: "E1", bpmn_id: "Task_1", type: "node" },
      { hybrid_id: "A1", bpmn_id: "Flow_1", type: "flow" },
    ],
  };

  const out = deleteHybridIds(input, ["A1"]);

  assert.deepEqual(out.deleted.elements, []);
  assert.deepEqual(out.deleted.edges, ["A1"]);
  assert.equal(out.nextHybridV2.elements.length, 2);
  assert.equal(out.nextHybridV2.edges.length, 0);
  assert.equal(out.nextHybridV2.bindings.length, 1);
  assert.equal(out.nextHybridV2.bindings[0].hybrid_id, "E1");
  assert.equal(out.cleanedBindingsCount, 1);
});

test("deleteHybridIds: unknown id is no-op", () => {
  const input = {
    elements: [{ id: "E1", type: "rect", x: 10, y: 10, w: 120, h: 60 }],
    edges: [],
    bindings: [{ hybrid_id: "E1", bpmn_id: "Task_1", type: "node" }],
  };

  const out = deleteHybridIds(input, ["UNKNOWN"]);

  assert.deepEqual(out.deleted, { elements: [], edges: [] });
  assert.equal(out.cleanedBindingsCount, 0);
  assert.equal(out.nextHybridV2.elements.length, 1);
  assert.equal(out.nextHybridV2.bindings.length, 1);
});

test("deleteHybridIds: removes bindings for explicit ids even if item is absent", () => {
  const input = {
    elements: [{ id: "E1", type: "rect", x: 10, y: 10, w: 120, h: 60 }],
    edges: [],
    bindings: [
      { hybrid_id: "E1", bpmn_id: "Task_1", type: "node" },
      { hybrid_id: "X9", bpmn_id: "Task_9", type: "node" },
    ],
  };

  const out = deleteHybridIds(input, ["X9"]);

  assert.equal(out.nextHybridV2.elements.length, 1);
  assert.equal(out.nextHybridV2.bindings.length, 1);
  assert.equal(out.nextHybridV2.bindings[0].hybrid_id, "E1");
  assert.equal(out.cleanedBindingsCount, 0);
});
