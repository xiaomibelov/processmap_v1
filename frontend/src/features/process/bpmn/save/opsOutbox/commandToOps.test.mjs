import test from "node:test";
import assert from "node:assert/strict";

import {
  OPS_OUTBOX_CONFIG,
  createOpsOutboxConfig,
} from "./opsOutboxConfig.js";
import {
  mapCommandToOps,
  getOpsCoverage,
  __resetOpsCoverageForTests,
} from "./commandToOps.js";

if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

// ---------------------------------------------------------------------------
// Контур feature/async-save-pipeline-step1 (TESTS §1.1, RED первым).
// Маппинг commandStack.command → op[] по whitelist PLAN §3.1:
//   element.updateProperties (incl. updateLabel), shape.move, shape.resize,
//   element.updateDi (connection.updateWaypoints / label.move),
//   shape.create/connection.create, shape.delete/connection.delete.
// Вне whitelist → needsFullSave (connection.reconnect*, spaceTool, lane.*,
// canvas.updateRoot, paste). Replay-эхо (__pmOpSource:"replay") пропускается
// полностью — ни один счётчик не растёт. Undo: inverse-payload для
// компенсирующей op (удаление из буфера — зона ответственности outbox).
// Coverage: window.__PM_OPS_COVERAGE__ = {total, mapped, fullSave}.
// ---------------------------------------------------------------------------

function win() {
  return globalThis.window;
}

function el(id, extra = {}) {
  return { id, type: "bpmn:Task", x: 100, y: 200, width: 120, height: 80, ...extra };
}

test.beforeEach(() => {
  __resetOpsCoverageForTests();
});

test("config: defaults match UI.md contract (debounce 2500, threshold 50, coalesce 400 in 300..500)", () => {
  assert.equal(OPS_OUTBOX_CONFIG.flushDebounceMs, 2500);
  assert.equal(OPS_OUTBOX_CONFIG.maxOpsPerFlush, 50);
  assert.equal(OPS_OUTBOX_CONFIG.coalesceMs, 400);
  assert.ok(OPS_OUTBOX_CONFIG.coalesceMs >= 300, "coalesce window lower bound 300ms");
  assert.ok(OPS_OUTBOX_CONFIG.coalesceMs <= 500, "coalesce window upper bound 500ms");
  assert.equal(OPS_OUTBOX_CONFIG.mouseupCommit, true);
  assert.equal(OPS_OUTBOX_CONFIG.pipelineName, "ops");
});

test("config: coalesceMs outside 300..500 is rejected (timing contract is hard)", () => {
  assert.throws(() => createOpsOutboxConfig({ coalesceMs: 250 }), /coalesceMs/);
  assert.throws(() => createOpsOutboxConfig({ coalesceMs: 600 }), /coalesceMs/);
  const cfg = createOpsOutboxConfig({ coalesceMs: 350 });
  assert.equal(cfg.coalesceMs, 350);
});

test("element.updateProperties → 1 op element.updateProperties with new properties", () => {
  const out = mapCommandToOps({
    command: "element.updateProperties",
    action: "execute",
    context: {
      element: el("Task_1"),
      properties: { name: "Новое имя" },
      oldProperties: { name: "Старое имя" },
    },
  });
  assert.equal(out.replay, false);
  assert.equal(out.needsFullSave, false);
  assert.equal(out.ops.length, 1);
  const op = out.ops[0];
  assert.equal(op.type, "element.updateProperties");
  assert.equal(op.elementId, "Task_1");
  assert.deepEqual(op.properties, { name: "Новое имя" });
  assert.equal(op.key, "element.updateProperties::Task_1");
  assert.equal(op.source, "user", "source defaults to user");
});

test("element.updateLabel → op element.updateProperties {name: newLabel}", () => {
  const out = mapCommandToOps({
    command: "element.updateLabel",
    action: "execute",
    context: {
      element: el("Task_2"),
      newLabel: "Метка",
      oldLabel: "Старая",
    },
  });
  assert.equal(out.ops.length, 1);
  assert.equal(out.ops[0].type, "element.updateProperties");
  assert.deepEqual(out.ops[0].properties, { name: "Метка" });
});

test("shape.move → op shape.move with delta; source e2e preserved", () => {
  const out = mapCommandToOps({
    command: "shape.move",
    action: "execute",
    source: "e2e",
    context: {
      shape: el("Task_1"),
      delta: { x: 30, y: -10 },
    },
  });
  assert.equal(out.ops.length, 1);
  assert.equal(out.ops[0].type, "shape.move");
  assert.equal(out.ops[0].elementId, "Task_1");
  assert.deepEqual(out.ops[0].delta, { x: 30, y: -10 });
  assert.equal(out.ops[0].source, "e2e");
});

test("shape.resize → op shape.resize with new bounds", () => {
  const out = mapCommandToOps({
    command: "shape.resize",
    action: "execute",
    context: {
      shape: el("Task_1"),
      newBounds: { x: 100, y: 200, width: 200, height: 100 },
      oldBounds: { x: 100, y: 200, width: 120, height: 80 },
    },
  });
  assert.equal(out.ops.length, 1);
  assert.equal(out.ops[0].type, "shape.resize");
  assert.deepEqual(out.ops[0].bounds, { x: 100, y: 200, width: 200, height: 100 });
});

test("connection.updateWaypoints → op element.updateDi with waypoints (DI-only)", () => {
  const out = mapCommandToOps({
    command: "connection.updateWaypoints",
    action: "execute",
    context: {
      connection: el("Flow_1", { type: "bpmn:SequenceFlow" }),
      newWaypoints: [[0, 0], [50, 50]],
      oldWaypoints: [[0, 0], [40, 40]],
    },
  });
  assert.equal(out.ops.length, 1);
  assert.equal(out.ops[0].type, "element.updateDi");
  assert.equal(out.ops[0].elementId, "Flow_1");
  assert.deepEqual(out.ops[0].waypoints, [[0, 0], [50, 50]]);
});

test("label.move → op element.updateDi with bounds", () => {
  const out = mapCommandToOps({
    command: "label.move",
    action: "execute",
    context: {
      label: el("Label_1", { type: "label" }),
      newBounds: { x: 10, y: 20, width: 30, height: 10 },
    },
  });
  assert.equal(out.ops.length, 1);
  assert.equal(out.ops[0].type, "element.updateDi");
  assert.deepEqual(out.ops[0].bounds, { x: 10, y: 20, width: 30, height: 10 });
});

test("shape.create / connection.create → full descriptor ops", () => {
  const created = mapCommandToOps({
    command: "shape.create",
    action: "execute",
    context: {
      shape: el("Task_9", { businessType: "bpmn:UserTask" }),
      parent: { id: "Process_1" },
    },
  });
  assert.equal(created.ops.length, 1);
  assert.equal(created.ops[0].type, "shape.create");
  assert.equal(created.ops[0].elementId, "Task_9");
  assert.equal(created.ops[0].elementType, "bpmn:UserTask");
  assert.deepEqual(created.ops[0].bounds, { x: 100, y: 200, width: 120, height: 80 });
  assert.equal(created.ops[0].parentId, "Process_1");

  const connected = mapCommandToOps({
    command: "connection.create",
    action: "execute",
    context: {
      connection: el("Flow_2", { type: "bpmn:SequenceFlow" }),
      source: { id: "Task_1" },
      target: { id: "Task_2" },
    },
  });
  assert.equal(connected.ops.length, 1);
  assert.equal(connected.ops[0].type, "connection.create");
  assert.equal(connected.ops[0].elementId, "Flow_2");
  assert.equal(connected.ops[0].sourceId, "Task_1");
  assert.equal(connected.ops[0].targetId, "Task_2");
});

test("shape.delete / connection.delete → delete ops", () => {
  const del = mapCommandToOps({
    command: "shape.delete",
    action: "execute",
    context: { shape: el("Task_1") },
  });
  assert.deepEqual(
    del.ops.map((o) => [o.type, o.elementId]),
    [["shape.delete", "Task_1"]],
  );
  const delConn = mapCommandToOps({
    command: "connection.delete",
    action: "execute",
    context: { connection: el("Flow_1", { type: "bpmn:SequenceFlow" }) },
  });
  assert.deepEqual(
    delConn.ops.map((o) => [o.type, o.elementId]),
    [["connection.delete", "Flow_1"]],
  );
});

test("non-whitelisted commands → needsFullSave, no ops (reconnect, spaceTool, lane.resize, canvas.updateRoot)", () => {
  for (const command of [
    "connection.reconnect",
    "connection.reconnectStart",
    "connection.reconnectEnd",
    "spaceTool",
    "lane.resize",
    "canvas.updateRoot",
  ]) {
    const out = mapCommandToOps({ command, action: "execute", context: {} });
    assert.equal(out.ops.length, 0, `${command} must not produce ops in step1`);
    assert.equal(out.needsFullSave, true, `${command} must flag needsFullSave`);
  }
});

test("unknown command without name → needsFullSave, no crash", () => {
  const out = mapCommandToOps({ command: "", action: "execute", context: {} });
  assert.equal(out.ops.length, 0);
  assert.equal(out.needsFullSave, true);
});

test("undo of updateProperties → compensating op carries oldProperties", () => {
  const out = mapCommandToOps({
    command: "element.updateProperties",
    action: "undo",
    context: {
      element: el("Task_1"),
      properties: { name: "Новое имя" },
      oldProperties: { name: "Старое имя" },
    },
  });
  assert.equal(out.action, "undo");
  assert.equal(out.ops.length, 1);
  assert.deepEqual(out.ops[0].properties, { name: "Старое имя" });
});

test("undo of shape.move → compensating op with negated delta", () => {
  const out = mapCommandToOps({
    command: "shape.move",
    action: "undo",
    context: { shape: el("Task_1"), delta: { x: 30, y: -10 } },
  });
  assert.deepEqual(out.ops[0].delta, { x: -30, y: 10 });
});

test("undo of shape.resize → compensating op with oldBounds", () => {
  const out = mapCommandToOps({
    command: "shape.resize",
    action: "undo",
    context: {
      shape: el("Task_1"),
      newBounds: { x: 1, y: 2, width: 200, height: 100 },
      oldBounds: { x: 1, y: 2, width: 120, height: 80 },
    },
  });
  assert.deepEqual(out.ops[0].bounds, { x: 1, y: 2, width: 120, height: 80 });
});

test("redo reuses the execute mapping (same payload as execute)", () => {
  const out = mapCommandToOps({
    command: "element.updateProperties",
    action: "redo",
    context: {
      element: el("Task_1"),
      properties: { name: "Новое имя" },
      oldProperties: { name: "Старое имя" },
    },
  });
  assert.deepEqual(out.ops[0].properties, { name: "Новое имя" });
});

test("replay-flagged command is skipped entirely — no ops, no needsFullSave, no coverage counters", () => {
  const before = getOpsCoverage();
  const out = mapCommandToOps({
    command: "element.updateProperties",
    action: "execute",
    context: {
      element: el("Task_1"),
      properties: { name: "Replay" },
      __pmOpId: "op-replay-1",
      __pmOpSource: "replay",
    },
  });
  assert.equal(out.replay, true);
  assert.equal(out.ops.length, 0);
  assert.equal(out.needsFullSave, false);
  const after = getOpsCoverage();
  assert.equal(after.total, before.total, "replay must not touch coverage.total");
  assert.equal(after.mapped, before.mapped, "replay must not touch coverage.mapped");
  assert.equal(after.fullSave, before.fullSave, "replay must not touch coverage.fullSave");
});

test("coverage counters: mapped vs fullSave partition on every non-replay command", () => {
  mapCommandToOps({
    command: "element.updateProperties",
    action: "execute",
    context: { element: el("Task_1"), properties: { name: "A" } },
  });
  mapCommandToOps({ command: "shape.move", action: "execute", context: { shape: el("Task_1"), delta: { x: 1, y: 1 } } });
  mapCommandToOps({ command: "spaceTool", action: "execute", context: {} });
  const cov = getOpsCoverage();
  assert.equal(cov.total, 3);
  assert.equal(cov.mapped, 2);
  assert.equal(cov.fullSave, 1);
  const w = win();
  assert.ok(w.__PM_OPS_COVERAGE__, "recorder lives on window");
  assert.equal(w.__PM_OPS_COVERAGE__.total, 3);
});

test("coverage recorder survives missing window (node env) without crash", () => {
  const saved = globalThis.window;
  try {
    delete globalThis.window;
    const out = mapCommandToOps({
      command: "element.updateProperties",
      action: "execute",
      context: { element: el("Task_1"), properties: { name: "A" } },
    });
    assert.equal(out.ops.length, 1);
    const cov = getOpsCoverage();
    assert.equal(cov.total, 1);
  } finally {
    globalThis.window = saved;
    __resetOpsCoverageForTests();
  }
});

test("runtime event shape: commandContext field (createBpmnRuntime notifyChange payload) is accepted", () => {
  // Рантайм шлёт сериализованный снапшот в commandContext, origin — в source.
  const out = mapCommandToOps({
    command: "shape.move",
    action: "execute",
    source: "user",
    commandContext: {
      shape: { id: "Task_7", type: "bpmn:Task" },
      delta: { x: 12, y: 8 },
      __pmOpSource: "",
    },
  });
  assert.equal(out.ops.length, 1);
  assert.equal(out.ops[0].type, "shape.move");
  assert.equal(out.ops[0].elementId, "Task_7");
  assert.deepEqual(out.ops[0].delta, { x: 12, y: 8 });
});
