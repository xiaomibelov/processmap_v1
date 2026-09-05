// AGENT-3 — unit-тесты view-модели pending edits (панель diff в чате агента).
// Чистая логика (без React): edit_plan/diff + resolver имён → строки панели.
// Запуск: node --test src/features/process/processman/chat/editDiffFormat.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildNodeNameResolver,
  formatEditPlan,
} from "./editDiffFormat.js";

const NODES = [
  { id: "Task_1", name: "Проверить партию" },
  { id: "Task_2", title: "Упаковка" },
  { id: "Gateway_1", label: "Контроль пройден?" },
];

test("resolver: имя из name/title/label, null для неизвестного id", () => {
  const resolve = buildNodeNameResolver(NODES);
  assert.equal(resolve("Task_1"), "Проверить партию");
  assert.equal(resolve("Task_2"), "Упаковка");
  assert.equal(resolve("Gateway_1"), "Контроль пройден?");
  assert.equal(resolve("Task_unknown"), null);
  assert.equal(resolve(""), null);
  const empty = buildNodeNameResolver(null);
  assert.equal(empty("Task_1"), null);
});

test("rename-план: поддержан, «было» из модели, «стало» из плана", () => {
  const resolve = buildNodeNameResolver(NODES);
  const vm = formatEditPlan({
    editPlan: { note: "переименовать шаг", operations: [{ op: "update_node", node_id: "Task_1", fields: { title: "Проверка партии сырья" } }] },
    diff: [{ op: "update", node_id: "Task_1", field: "title", new_value: "Проверка партии сырья" }],
    resolveNodeName: resolve,
  });
  assert.equal(vm.items.length, 1);
  const item = vm.items[0];
  assert.equal(item.op, "update");
  assert.equal(item.nodeId, "Task_1");
  assert.equal(item.nodeName, "Проверить партию");
  assert.equal(item.field, "title");
  assert.equal(item.oldValue, "Проверить партию", "«было» = текущее имя из модели (D1-A)");
  assert.equal(item.newValue, "Проверка партии сырья");
  assert.equal(item.supported, true);
  assert.equal(vm.hasUnsupported, false);
  assert.equal(vm.applySupported, true);
});

test("add_node: не поддержан бэкендом для BPMN, помечен и блокирует apply", () => {
  const vm = formatEditPlan({
    editPlan: { note: "", operations: [{ op: "add_node", node_id: "Task_9", title: "Новый шаг" }] },
    diff: [{ op: "add_node", node_id: "Task_9", title: "Новый шаг" }],
    resolveNodeName: buildNodeNameResolver(NODES),
  });
  assert.equal(vm.items[0].op, "add_node");
  assert.equal(vm.items[0].newValue, "Новый шаг");
  assert.equal(vm.items[0].oldValue, null);
  assert.equal(vm.items[0].supported, false);
  assert.equal(vm.hasUnsupported, true);
  assert.equal(vm.applySupported, false, "без тихих частичных применений");
});

test("смешанный план (rename + delete_node): apply целиком не поддержан", () => {
  const vm = formatEditPlan({
    editPlan: {
      operations: [
        { op: "update_node", node_id: "Task_1", fields: { title: "Новое имя" } },
        { op: "delete_node", node_id: "Task_2" },
      ],
    },
    diff: [
      { op: "update", node_id: "Task_1", field: "title", new_value: "Новое имя" },
      { op: "delete_node", node_id: "Task_2" },
    ],
    resolveNodeName: buildNodeNameResolver(NODES),
  });
  assert.equal(vm.items.length, 2);
  assert.deepEqual(vm.items.map((i) => i.supported), [true, false]);
  assert.equal(vm.applySupported, false);
});

test("update с не-rename полем (operation_code) не поддержан", () => {
  const vm = formatEditPlan({
    editPlan: { operations: [{ op: "update_node", node_id: "Task_1", fields: { operation_code: "OP-7" } }] },
    diff: [{ op: "update", node_id: "Task_1", field: "operation_code", new_value: "OP-7" }],
    resolveNodeName: buildNodeNameResolver(NODES),
  });
  assert.equal(vm.items[0].supported, false);
  assert.equal(vm.items[0].oldValue, null, "«было» для не-rename полей не резолвим на фронте");
  assert.equal(vm.applySupported, false);
});

test("delete_edge из edit_plan отображается (в diff бэкенд его не кладёт)", () => {
  const resolve = buildNodeNameResolver(NODES);
  const vm = formatEditPlan({
    editPlan: { operations: [{ op: "delete_edge", from_id: "Task_1", to_id: "Gateway_1" }] },
    diff: [],
    resolveNodeName: resolve,
  });
  assert.equal(vm.items.length, 1);
  assert.equal(vm.items[0].op, "delete_edge");
  assert.equal(vm.items[0].fromId, "Task_1");
  assert.equal(vm.items[0].toId, "Gateway_1");
  assert.equal(vm.items[0].fromName, "Проверить партию");
  assert.equal(vm.items[0].toName, "Контроль пройден?");
  assert.equal(vm.items[0].supported, false);
});

test("fallback на diff, когда edit_plan без operations", () => {
  const resolve = buildNodeNameResolver(NODES);
  const vm = formatEditPlan({
    editPlan: {},
    diff: [{ op: "update", node_id: "Task_1", field: "title", new_value: "Renamed" }],
    resolveNodeName: resolve,
  });
  assert.equal(vm.items.length, 1);
  assert.equal(vm.items[0].op, "update");
  assert.equal(vm.items[0].newValue, "Renamed");
  assert.equal(vm.items[0].oldValue, "Проверить партию");
  assert.equal(vm.applySupported, true);
});

test("unknown op помечается как не поддержанный без падения", () => {
  const vm = formatEditPlan({
    editPlan: { operations: [{ op: "warp_node", node_id: "Task_1" }] },
    diff: [],
    resolveNodeName: buildNodeNameResolver(NODES),
  });
  assert.equal(vm.items[0].op, "unknown");
  assert.equal(vm.items[0].supported, false);
  assert.equal(vm.applySupported, false);
});

test("note агента прокидывается в view-модель", () => {
  const vm = formatEditPlan({
    editPlan: { note: "согласовать с QA", operations: [{ op: "update_node", node_id: "Task_1", fields: { title: "X" } }] },
    diff: [],
    resolveNodeName: buildNodeNameResolver(NODES),
  });
  assert.equal(vm.note, "согласовать с QA");
});
