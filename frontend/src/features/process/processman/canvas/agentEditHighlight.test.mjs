// feat/canvas-edit-highlight — unit-тесты чистой логики подсветки правок агента.
import test from "node:test";

import assert from "node:assert/strict";

import {
  AGENT_EDIT_HIGHLIGHT_LIMIT,
  extractFocusElements,
  opToFlashType,
} from "./agentEditHighlight.js";

test("extractFocusElements: node_id/from_id/to_id из operations, op сохраняется", () => {
  const plan = {
    operations: [
      { op: "update_node", node_id: "Task_1", fields: { title: "x" } },
      { op: "add_node", node_id: "Task_2", title: "y" },
      { op: "add_edge", from_id: "Task_1", to_id: "Task_2" },
      { op: "delete_node", node_id: "Task_3" },
      { op: "delete_edge", from_id: "Task_3", to_id: "Task_1" },
    ],
  };
  const elements = extractFocusElements(plan);
  assert.deepEqual(elements, [
    { op: "update_node", element_id: "Task_1" },
    { op: "add_node", element_id: "Task_2" },
    { op: "add_edge", element_id: "Task_1" },
    { op: "add_edge", element_id: "Task_2" },
    { op: "delete_node", element_id: "Task_3" },
    { op: "delete_edge", element_id: "Task_3" },
    { op: "delete_edge", element_id: "Task_1" },
  ]);
});

test("extractFocusElements: dedupe по (op, element_id), порядок сохранён", () => {
  const plan = {
    operations: [
      { op: "update_node", node_id: "Task_1", fields: { title: "a" } },
      { op: "update_node", node_id: "Task_1", fields: { duration: 5 } },
    ],
  };
  assert.deepEqual(extractFocusElements(plan), [{ op: "update_node", element_id: "Task_1" }]);
});

test("extractFocusElements: пустые/битые данные → пустой список; кап лимита", () => {
  assert.deepEqual(extractFocusElements(null), []);
  assert.deepEqual(extractFocusElements({}), []);
  assert.deepEqual(extractFocusElements({ operations: "nope" }), []);
  assert.deepEqual(extractFocusElements({ operations: [{ op: "", node_id: "x" }, { op: "update_node" }] }), []);
  const big = {
    operations: Array.from({ length: AGENT_EDIT_HIGHLIGHT_LIMIT + 10 }, (_, i) => ({
      op: "update_node",
      node_id: `Task_${i}`,
      fields: {},
    })),
  };
  assert.equal(extractFocusElements(big).length, AGENT_EDIT_HIGHLIGHT_LIMIT, "кап лимита");
});

test("opToFlashType: add → add, update → update, delete → delete", () => {
  assert.equal(opToFlashType("add_node"), "add");
  assert.equal(opToFlashType("add_edge"), "add");
  assert.equal(opToFlashType("update_node"), "update");
  assert.equal(opToFlashType("delete_node"), "delete");
  assert.equal(opToFlashType("delete_edge"), "delete");
  assert.equal(opToFlashType("unknown_op"), "update", "дефолт — нейтральный update");
});
