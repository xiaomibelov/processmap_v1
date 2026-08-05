// T3#2 — дублирование блока (modelUtils.duplicateNode).
// Запуск: node --test src/features/technologist/constructor/duplicateNode.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { duplicateNode } from "./modelUtils.js";

const MODEL = {
  nodes: [
    { id: "Task_1", bpmn_type: "task", name: "Мойка", display_name: "Мойка", operation_code: "move",
      params: { a: 1 }, outputs: { o: "x" }, recipe_params: ["r1"], x: 100, y: 200, width: 140, height: 70 },
    { id: "Task_2", bpmn_type: "task", name: "Резка", x: 300, y: 200 },
    { id: "Gateway_1", bpmn_type: "exclusiveGateway", name: "?", x: 500, y: 200 },
  ],
  flows: [
    { id: "Flow_1", source_ref: "Task_1", target_ref: "Task_2" },
    { id: "Flow_2", source_ref: "Task_2", target_ref: "Gateway_1" },
  ],
  lanes: [],
};

test("копия создаётся с новым id по nextId, смещением x/y и суффиксом имени", () => {
  const { model, node } = duplicateNode(MODEL, "Task_1", { nameSuffix: " (копия)" });
  assert.equal(node.id, "Task_3"); // max(Task_1, Task_2) + 1
  assert.equal(node.x, 140);
  assert.equal(node.y, 240);
  assert.equal(node.display_name, "Мойка (копия)");
  assert.equal(node.operation_code, "move");
  assert.deepEqual(node.params, { a: 1 });
  assert.equal(model.nodes.length, 4);
});

test("потоки НЕ копируются", () => {
  const { model, node } = duplicateNode(MODEL, "Task_1");
  assert.equal(model.flows.length, 2); // как было
  assert.ok(!model.flows.some((f) => f.source_ref === node.id || f.target_ref === node.id));
});

test("префикс id сохраняется от исходного узла (Gateway)", () => {
  const { node } = duplicateNode(MODEL, "Gateway_1");
  assert.equal(node.id, "Gateway_2");
});

test("исходная модель не мутируется (immutable)", () => {
  const before = JSON.stringify(MODEL);
  duplicateNode(MODEL, "Task_1");
  assert.equal(JSON.stringify(MODEL), before);
});

test("без суффикса имена совпадают; несуществующий id → node=null, модель без изменений", () => {
  const { node } = duplicateNode(MODEL, "Task_2");
  assert.equal(node.name, "Резка");
  const res = duplicateNode(MODEL, "Task_999");
  assert.equal(res.node, null);
  assert.equal(res.model, MODEL);
});
