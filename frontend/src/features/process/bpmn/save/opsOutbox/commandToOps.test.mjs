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
      connection: el("Flow_1", { type: "bpmn:SequenceFlow", waypoints: [[1, 2], [3, 4]] }),
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
      connection: el("Flow_2", { type: "bpmn:SequenceFlow", waypoints: [[1, 2], [3, 4]] }),
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

test("non-whitelisted commands → needsFullSave, no ops (lane.resize, canvas.updateRoot)", () => {
  // S3: spaceTool выведен в whitelist (декомпозиция); пустой контекст spaceTool
  // по-прежнему даёт needsFullSave через fail-closed маппер (см. S3-тесты ниже).
  for (const command of [
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

// ---------------------------------------------------------------------------
// Регрессия e2e-прогона async-save-operations (2026-09-15): реальный wire-контекст
// рантайма НЕ содержит shape/connection — snapshotCommandContext нормализует
// ref элемента в `element` (id/type/bounds/name/waypoints). Мапперы обязаны
// принимать обе формы, иначе connection.create молча уходит в needsFullSave,
// а connection.delete уходит опом → серверный 422 connection_not_found.
// Формы ниже скопированы с захваченных payload реального прогона.
// ---------------------------------------------------------------------------

test("wire form: shape.move with element-normalized ref + delta maps to op", () => {
  const out = mapCommandToOps({
    command: "shape.move",
    action: "execute",
    source: "user",
    commandContext: {
      element: { id: "Task_1_3", type: "bpmn:Task", bounds: { x: 430, y: 212, width: 120, height: 80 } },
      __elementId: "Task_1_3",
      delta: { x: 30, y: 12 },
      newParent: { id: "Lane_1", type: "bpmn:Lane" },
    },
  });
  assert.equal(out.needsFullSave, false);
  assert.equal(out.ops.length, 1);
  assert.equal(out.ops[0].type, "shape.move");
  assert.equal(out.ops[0].elementId, "Task_1_3");
  assert.deepEqual(out.ops[0].delta, { x: 30, y: 12 });
});

test("wire form: shape.resize with element ref + newBounds maps to op", () => {
  const out = mapCommandToOps({
    command: "shape.resize",
    action: "execute",
    source: "user",
    commandContext: {
      element: { id: "Task_1_5", type: "bpmn:Task", bounds: { x: 100, y: 200, width: 132, height: 90 } },
      __elementId: "Task_1_5",
      newBounds: { x: 100, y: 200, width: 132, height: 90 },
      oldBounds: { x: 100, y: 200, width: 120, height: 80 },
    },
  });
  assert.equal(out.needsFullSave, false);
  assert.equal(out.ops.length, 1);
  assert.equal(out.ops[0].type, "shape.resize");
  assert.equal(out.ops[0].elementId, "Task_1_5");
  assert.deepEqual(out.ops[0].bounds, { x: 100, y: 200, width: 132, height: 90 });
});

test("wire form: shape.create with element ref (id/type/bounds) + lane parent maps to op", () => {
  const out = mapCommandToOps({
    command: "shape.create",
    action: "execute",
    source: "user",
    commandContext: {
      element: { id: "Activity_1xpagaq", type: "bpmn:Task", bounds: { x: 1750, y: 306, width: 120, height: 80 } },
      __elementId: "Activity_1xpagaq",
      parent: { id: "Lane_1", type: "bpmn:Lane" },
    },
  });
  assert.equal(out.needsFullSave, false);
  assert.equal(out.ops.length, 1);
  assert.equal(out.ops[0].type, "shape.create");
  assert.equal(out.ops[0].elementId, "Activity_1xpagaq");
  assert.equal(out.ops[0].elementType, "bpmn:Task");
  assert.deepEqual(out.ops[0].bounds, { x: 1750, y: 306, width: 120, height: 80 });
  assert.equal(out.ops[0].parentId, "Lane_1");
});

test("wire form: connection.create with element ref carrying waypoints maps to op", () => {
  const out = mapCommandToOps({
    command: "connection.create",
    action: "execute",
    source: "user",
    commandContext: {
      element: {
        id: "Flow_1480jvh",
        type: "bpmn:SequenceFlow",
        waypoints: [
          [1870, 346],
          [1930, 346],
        ],
      },
      __elementId: "Flow_1480jvh",
      parent: { id: "Participant_1", type: "bpmn:Participant" },
      source: { id: "Activity_1xpagaq", type: "bpmn:Task" },
      target: { id: "Activity_1y3kfa", type: "bpmn:Task" },
    },
  });
  assert.equal(out.needsFullSave, false);
  assert.equal(out.ops.length, 1);
  assert.equal(out.ops[0].type, "connection.create");
  assert.equal(out.ops[0].elementId, "Flow_1480jvh");
  assert.equal(out.ops[0].sourceId, "Activity_1xpagaq");
  assert.equal(out.ops[0].targetId, "Activity_1y3kfa");
  assert.equal(out.ops[0].parentId, "Participant_1");
  // waypoints обязаны уйти на сервер (connection.create без них → 422).
  assert.deepEqual(out.ops[0].waypoints, [
    [1870, 346],
    [1930, 346],
  ]);
});

test("wire form: connection.delete with element ref maps to op (пара к create)", () => {
  const out = mapCommandToOps({
    command: "connection.delete",
    action: "execute",
    source: "user",
    commandContext: {
      element: { id: "Flow_1480jvh", type: "bpmn:SequenceFlow" },
      __elementId: "Flow_1480jvh",
      parent: { id: "Participant_1", type: "bpmn:Participant" },
      source: { id: "Activity_1xpagaq", type: "bpmn:Task" },
      target: { id: "Activity_1y3kfa", type: "bpmn:Task" },
    },
  });
  assert.equal(out.needsFullSave, false);
  assert.deepEqual(
    out.ops.map((o) => [o.type, o.elementId]),
    [["connection.delete", "Flow_1480jvh"]],
  );
});

// ---------------------------------------------------------------------------
// Контур feature/async-save-pipeline-step2 (TESTS §1.3, наследие п.6):
//  - connection.reconnect / reconnectStart / reconnectEnd нормализуются в
//    одну op connection.reconnect {connectionId, source, target};
//  - undo reconnect → compensating op со старыми source/target (не needsFullSave);
//  - create-ops несут клиентский id в payload (сервер применяет с сохранением
//    id — replay create при 409-rebase безопасен);
//  - undo create → compensating delete-op (не needsFullSave);
//  - coverage: reconnect теперь mapped.
// ---------------------------------------------------------------------------

test("connection.reconnect / reconnectStart / reconnectEnd → single normalized op {connectionId, source, target}", () => {
  const baseContext = {
    connection: { id: "Flow_1", type: "bpmn:SequenceFlow", source: { id: "Task_1" }, target: { id: "Task_2" } },
  };
  for (const command of ["connection.reconnect", "connection.reconnectStart", "connection.reconnectEnd"]) {
    const out = mapCommandToOps({ command, action: "execute", context: baseContext });
    assert.equal(out.needsFullSave, false, `${command} is whitelisted in step2`);
    assert.equal(out.ops.length, 1);
    assert.equal(out.ops[0].type, "connection.reconnect", `${command} normalizes to connection.reconnect`);
    assert.equal(out.ops[0].elementId, "Flow_1");
    assert.equal(out.ops[0].connectionId, "Flow_1");
    assert.equal(out.ops[0].source, "Task_1");
    assert.equal(out.ops[0].target, "Task_2");
  }

  // Явные source/target в контексте (wire-форма) побеждают дефолтные из connection.
  const explicit = mapCommandToOps({
    command: "connection.reconnectEnd",
    action: "execute",
    context: {
      element: { id: "Flow_9", type: "bpmn:SequenceFlow" },
      source: { id: "Task_A" },
      target: { id: "Task_B" },
    },
  });
  assert.equal(explicit.needsFullSave, false);
  assert.equal(explicit.ops[0].connectionId, "Flow_9");
  assert.equal(explicit.ops[0].source, "Task_A");
  assert.equal(explicit.ops[0].target, "Task_B");
});

test("connection.reconnect without connection id → needsFullSave (honest fallback)", () => {
  const out = mapCommandToOps({ command: "connection.reconnect", action: "execute", context: {} });
  assert.equal(out.ops.length, 0);
  assert.equal(out.needsFullSave, true);
});

test("undo of connection.reconnect → compensating op with oldSource/oldTarget (не needsFullSave)", () => {
  const out = mapCommandToOps({
    command: "connection.reconnect",
    action: "undo",
    context: {
      connection: { id: "Flow_1", type: "bpmn:SequenceFlow" },
      source: { id: "Task_3" },
      target: { id: "Task_4" },
      oldSource: { id: "Task_1" },
      oldTarget: { id: "Task_2" },
    },
  });
  assert.equal(out.needsFullSave, false, "undo reconnect is a compensating op now");
  assert.equal(out.ops.length, 1);
  assert.equal(out.ops[0].type, "connection.reconnect");
  assert.equal(out.ops[0].connectionId, "Flow_1");
  assert.equal(out.ops[0].source, "Task_1", "oldSource restored");
  assert.equal(out.ops[0].target, "Task_2", "oldTarget restored");
});

test("create ops carry the client-generated element id in payload (server preserves id)", () => {
  const created = mapCommandToOps({
    command: "shape.create",
    action: "execute",
    context: { shape: el("Activity_clientid_1", { businessType: "bpmn:Task" }), parent: { id: "Process_1" } },
  });
  assert.equal(created.needsFullSave, false);
  assert.equal(created.ops[0].elementId, "Activity_clientid_1", "client-generated id is the op elementId");

  const connected = mapCommandToOps({
    command: "connection.create",
    action: "execute",
    context: {
      connection: el("Flow_clientid_2", { type: "bpmn:SequenceFlow", waypoints: [[1, 2], [3, 4]] }),
      source: { id: "Task_1" },
      target: { id: "Task_2" },
    },
  });
  assert.equal(connected.needsFullSave, false);
  assert.equal(connected.ops[0].elementId, "Flow_clientid_2");
  assert.equal(connected.ops[0].sourceId, "Task_1");
  assert.equal(connected.ops[0].targetId, "Task_2");
});

test("shape.create / connection.create of BPMN artifacts (TextAnnotation/Association) → ops (S4 волна 1)", () => {
  // step1 держал эти типы вне ops-payload; S4 волна 1 вывела их в ops
  // (golden-parity evidence/s4, снятие строго парой frontend+backend).
  const annotation = mapCommandToOps({
    command: "shape.create",
    action: "execute",
    context: {
      shape: el("Annotation_1", { type: "bpmn:TextAnnotation" }),
      parent: { id: "Process_1" },
    },
  });
  assert.equal(annotation.needsFullSave, false, "TextAnnotation create — ops с S4 волны 1");
  assert.equal(annotation.ops.length, 1);
  assert.equal(annotation.ops[0].type, "shape.create");

  const association = mapCommandToOps({
    command: "connection.create",
    action: "execute",
    context: {
      connection: el("Assoc_1", { type: "bpmn:Association", waypoints: [[1, 2], [3, 4]] }),
      source: { id: "Task_1" },
      target: { id: "Annotation_1" },
    },
  });
  assert.equal(association.needsFullSave, false, "Association create — ops с S4 волны 1");
  assert.equal(association.ops.length, 1);
  assert.equal(association.ops[0].type, "connection.create");

  const task = mapCommandToOps({
    command: "shape.create",
    action: "execute",
    context: {
      shape: el("Task_1", { type: "bpmn:Task" }),
      parent: { id: "Process_1" },
    },
  });
  assert.equal(task.needsFullSave, false, "Task create still maps to op");
  const flow = mapCommandToOps({
    command: "connection.create",
    action: "execute",
    context: {
      connection: el("Flow_1", { type: "bpmn:SequenceFlow", waypoints: [[1, 2], [3, 4]] }),
      source: { id: "Task_1" },
      target: { id: "Task_2" },
    },
  });
  assert.equal(flow.needsFullSave, false, "SequenceFlow create still maps to op");
});

test("unsafe BPMN artifact shape.create types → needsFullSave with no ops", () => {
  // S4 волны 1-3 сняли TextAnnotation, data-refs и lane; cold — participant.
  for (const type of [
    "bpmn:Participant",
  ]) {
    const out = mapCommandToOps({
      command: "shape.create",
      action: "execute",
      context: {
        shape: { id: "X", type, businessObject: { $type: type }, x: 1, y: 1, width: 10, height: 10 },
        parent: { id: "Process_1" },
      },
    });
    assert.equal(out.needsFullSave, true, `${type} requires full save`);
    assert.deepEqual(out.ops, []);
  }
  // connection-создание data-ассоциаций уходит в full save (S4 волна 1 сняла
  // только bpmn:Association).
  for (const type of ["bpmn:DataInputAssociation", "bpmn:DataOutputAssociation"]) {
    const out = mapCommandToOps({
      command: "connection.create",
      action: "execute",
      context: {
        connection: el("X", { type }),
        source: { id: "Task_1" },
        target: { id: "Task_2" },
      },
    });
    assert.equal(out.needsFullSave, true, `${type} requires full save`);
    assert.deepEqual(out.ops, []);
  }
});

test("task shape.create still maps to op (unsafe guard does not leak)", () => {
  const result = mapCommandToOps({
    command: "shape.create",
    action: "execute",
    context: {
      shape: { id: "T", type: "bpmn:Task", businessObject: { $type: "bpmn:Task" }, x: 1, y: 1, width: 10, height: 10 },
      parent: { id: "Process_1" },
    },
  });
  assert.equal(result.needsFullSave, false);
  assert.equal(result.ops[0].type, "shape.create");
});

test("unsafe BPMN artifact element.updateProperties types → needsFullSave with no ops", () => {
  // S4 волны 1-3 сняли TextAnnotation/Association, data-refs и lane; cold —
  // participant.
  for (const type of [
    "bpmn:Participant",
  ]) {
    const elRef = { id: "X", businessObject: { $type: type } };
    for (const action of ["execute", "undo"]) {
      const out = mapCommandToOps({
        command: "element.updateProperties",
        action,
        context: {
          element: elRef,
          properties: { name: "n" },
          oldProperties: { name: "o" },
        },
      });
      assert.equal(out.needsFullSave, true, `${type} updateProperties (${action}) requires full save`);
      assert.deepEqual(out.ops, []);
    }
  }
});

test("artifact element.updateLabel: cold-типы needsFullSave, textAnnotation — ops (S4 волна 1)", () => {
  for (const type of ["bpmn:Participant"]) {
    const out = mapCommandToOps({
      command: "element.updateLabel",
      action: "execute",
      context: {
        element: { id: "X", businessObject: { $type: type } },
        newLabel: "n",
        oldLabel: "o",
      },
    });
    assert.equal(out.needsFullSave, true, `${type} updateLabel still cold`);
    assert.deepEqual(out.ops, []);
  }
  const annotation = mapCommandToOps({
    command: "element.updateLabel",
    action: "execute",
    context: {
      element: { id: "X", type: "bpmn:TextAnnotation", bounds: { x: 1, y: 1, width: 10, height: 10 } },
      newLabel: "n",
      oldLabel: "o",
    },
  });
  assert.equal(annotation.needsFullSave, false, "TextAnnotation updateLabel — text-op с S4 волны 1");
  assert.equal(annotation.ops.length >= 1, true);
});

test("task element.updateProperties still maps to op (unsafe guard does not leak)", () => {
  const result = mapCommandToOps({
    command: "element.updateProperties",
    action: "execute",
    context: {
      element: { id: "T", businessObject: { $type: "bpmn:Task" } },
      properties: { name: "n" },
    },
  });
  assert.equal(result.needsFullSave, false);
  assert.equal(result.ops[0].type, "element.updateProperties");
});

test("undo of shape.create / connection.create → compensating delete op (не needsFullSave)", () => {
  const undoShape = mapCommandToOps({
    command: "shape.create",
    action: "undo",
    context: { shape: el("Task_9", { businessType: "bpmn:Task" }), parent: { id: "Process_1" } },
  });
  assert.equal(undoShape.needsFullSave, false, "undo create is compensating delete-op now");
  assert.deepEqual(
    undoShape.ops.map((o) => [o.type, o.elementId]),
    [["shape.delete", "Task_9"]],
  );

  const undoConn = mapCommandToOps({
    command: "connection.create",
    action: "undo",
    context: {
      connection: el("Flow_2", { type: "bpmn:SequenceFlow", waypoints: [[1, 2], [3, 4]] }),
      source: { id: "Task_1" },
      target: { id: "Task_2" },
    },
  });
  assert.equal(undoConn.needsFullSave, false);
  assert.deepEqual(
    undoConn.ops.map((o) => [o.type, o.elementId]),
    [["connection.delete", "Flow_2"]],
  );
});

test("coverage: reconnect commands are mapped now (fullSave counter does not grow)", () => {
  __resetOpsCoverageForTests();
  for (const command of ["connection.reconnect", "connection.reconnectStart", "connection.reconnectEnd"]) {
    mapCommandToOps({
      command,
      action: "execute",
      context: { connection: { id: "Flow_1", source: { id: "A" }, target: { id: "B" } } },
    });
  }
  const coverage = getOpsCoverage();
  assert.equal(coverage.total, 3);
  assert.equal(coverage.mapped, 3, "all three reconnect commands are mapped");
  assert.equal(coverage.fullSave, 0, "no fullSave fallback for reconnect vocabulary");
});

// ---------------------------------------------------------------------------
// Контур feature/async-save-pipeline-step2 (UI.md §4): remote-apply echo
// suppression — команды с context.__pmOpSource === "remote" (применение чужих
// ops к live-модели) не становятся op и не двигают coverage-счётчики.
// ---------------------------------------------------------------------------

test("remote-source command is suppressed like replay — no ops, no coverage counters", () => {
  __resetOpsCoverageForTests();
  const out = mapCommandToOps({
    command: "element.updateProperties",
    action: "execute",
    context: {
      element: { id: "Task_1" },
      properties: { name: "Чужое" },
      __pmOpSource: "remote",
    },
  });
  assert.equal(out.replay, true, "remote command treated as echo-suppressed");
  assert.equal(out.ops.length, 0);
  assert.equal(out.needsFullSave, false);
  const coverage = getOpsCoverage();
  assert.deepEqual(coverage, { total: 0, mapped: 0, fullSave: 0 }, "coverage counters untouched");
});

// ---------------------------------------------------------------------------
// Контур feature/mutation-gateway-c3 (срез S3, op wave A):
//  - elements.move → БАТЧ shape.move (по shapes-листу снапшота) +
//    element.updateDi для affectedConnections (финальные waypoints;
//    вложенные connection-обновления diagram-js «тихие» — commandStack.changed
//    фаерится только на outermost action, S3-probe).
//  - undo → компенсирующий батч: -delta по shapes; updateDi с captured-
//    waypoints (на undo-changed рантайн переснимает post-undo состояние).
//  - fail-closed: непустые shapes без id / без delta → needsFullSave;
//    reparent (hints.oldParent ≠ newParent) и attach → needsFullSave.
//  - spaceTool → декомпозиция: movingShapes→shape.move(delta),
//    resizingShapes→shape.resize(resizeBounds-математика direction+delta),
//    affectedConnections→updateDi. Undo spaceTool → needsFullSave (oldBounds
//    не живёт в снапшоте; полный undo-цикл — S7).
// ---------------------------------------------------------------------------

function moveDescriptor(overrides = {}) {
  return {
    command: "elements.move",
    action: "execute",
    commandContext: {
      shapes: [
        { id: "Task_1", type: "bpmn:Task", bounds: { x: 100, y: 200, width: 120, height: 80 } },
        { id: "Task_2", type: "bpmn:Task", bounds: { x: 300, y: 200, width: 120, height: 80 } },
      ],
      delta: { x: 40, y: 30 },
      newParent: { id: "Process_1" },
      affectedConnections: [
        { id: "Flow_1", waypoints: [[140, 240], [340, 230]] },
      ],
      ...overrides,
    },
  };
}

test("S3: elements.move → батч shape.move по всем shapes + updateDi для affectedConnections", () => {
  const out = mapCommandToOps(moveDescriptor());
  assert.equal(out.needsFullSave, false);
  const types = out.ops.map((op) => op.type);
  assert.deepEqual(types, ["shape.move", "shape.move", "element.updateDi"]);
  assert.equal(out.ops[0].elementId, "Task_1");
  assert.equal(out.ops[1].elementId, "Task_2");
  assert.deepEqual(out.ops[0].delta, { x: 40, y: 30 });
  assert.deepEqual(out.ops[1].delta, { x: 40, y: 30 });
  assert.equal(out.ops[2].elementId, "Flow_1");
  assert.deepEqual(out.ops[2].waypoints, [[140, 240], [340, 230]]);
  assert.equal(out.ops[0].source, "user");
});

test("S3: undo elements.move → компенсирующий батч (-delta) + updateDi с captured-waypoints", () => {
  const descriptor = moveDescriptor();
  descriptor.action = "undo";
  const out = mapCommandToOps(descriptor);
  assert.equal(out.needsFullSave, false);
  assert.deepEqual(out.ops.map((op) => op.type), ["shape.move", "shape.move", "element.updateDi"]);
  assert.deepEqual(out.ops[0].delta, { x: -40, y: -30 });
  assert.deepEqual(out.ops[1].delta, { x: -40, y: -30 });
  // undo-changed переснимает post-undo waypoints — маппер использует captured как есть.
  assert.deepEqual(out.ops[2].waypoints, [[140, 240], [340, 230]]);
});

test("S3: elements.move fail-closed — без shapes / без delta / shape без id → needsFullSave", () => {
  const noShapes = mapCommandToOps(moveDescriptor({ shapes: [] }));
  assert.equal(noShapes.needsFullSave, true, "пустой shapes-лист: честный full-save");
  assert.equal(noShapes.ops.length, 0);

  const noDelta = mapCommandToOps(moveDescriptor({ delta: null }));
  assert.equal(noDelta.needsFullSave, true, "без delta батч неприменим");

  const badId = mapCommandToOps(moveDescriptor({
    shapes: [{ id: "", type: "bpmn:Task" }, { id: "Task_2" }],
  }));
  assert.equal(badId.needsFullSave, true, "shape без id — молчаливая потеря запрещена (pinpoint-урок)");
  assert.equal(badId.ops.length, 0);
});

test("S3: elements.move reparent/attach → needsFullSave (ops не покрывают смену parent/host)", () => {
  const reparent = mapCommandToOps(moveDescriptor({
    hints: { oldParent: { id: "Sub_1" } },
  }));
  assert.equal(reparent.needsFullSave, true, "oldParent≠newParent — reparent вне ops-покрытия");

  const attach = mapCommandToOps(moveDescriptor({
    hints: { oldParent: { id: "Process_1" }, attach: true },
  }));
  assert.equal(attach.needsFullSave, true, "attach (host change) — консервативно full-save");

  const sameParent = mapCommandToOps(moveDescriptor({
    hints: { oldParent: { id: "Process_1" } },
  }));
  assert.equal(sameParent.needsFullSave, false, "same-parent drag остаётся в ops");
});

function spaceToolDescriptor(overrides = {}) {
  return {
    command: "spaceTool",
    action: "execute",
    commandContext: {
      delta: { x: 80, y: 0 },
      direction: "e",
      start: 1580,
      movingShapes: [
        { id: "Task_8", type: "bpmn:Task", bounds: { x: 1640, y: 200, width: 120, height: 80 } },
      ],
      resizingShapes: [
        { id: "Task_7", type: "bpmn:Task", bounds: { x: 1460, y: 200, width: 120, height: 80 } },
      ],
      affectedConnections: [
        { id: "Flow_8", waypoints: [[1556, 240], [1640, 240]] },
      ],
      ...overrides,
    },
  };
}

test("S3: spaceTool → декомпозиция shape.move + shape.resize (resizeBounds) + updateDi", () => {
  const out = mapCommandToOps(spaceToolDescriptor());
  assert.equal(out.needsFullSave, false);
  assert.deepEqual(out.ops.map((op) => op.type), ["shape.move", "shape.resize", "element.updateDi"]);
  assert.equal(out.ops[0].elementId, "Task_8");
  assert.deepEqual(out.ops[0].delta, { x: 80, y: 0 });
  assert.equal(out.ops[1].elementId, "Task_7");
  // direction 'e' + delta.x=80 → width +80 (SpaceUtil.resizeBounds parity).
  assert.deepEqual(out.ops[1].bounds, { x: 1460, y: 200, width: 200, height: 80 });
  assert.equal(out.ops[2].elementId, "Flow_8");
  assert.deepEqual(out.ops[2].waypoints, [[1556, 240], [1640, 240]]);
});

test("S3: spaceTool resizeBounds parity для всех направлений (n/s/e/w)", () => {
  const base = { id: "Lane_1", type: "bpmn:Task", bounds: { x: 100, y: 100, width: 200, height: 100 } };
  const cases = [
    ["n", { x: 0, y: -30 }, { x: 100, y: 70, width: 200, height: 130 }],
    ["s", { x: 0, y: 30 }, { x: 100, y: 100, width: 200, height: 130 }],
    ["e", { x: 50, y: 0 }, { x: 100, y: 100, width: 250, height: 100 }],
    ["w", { x: -50, y: 0 }, { x: 50, y: 100, width: 250, height: 100 }],
  ];
  for (const [direction, delta, expected] of cases) {
    const out = mapCommandToOps(spaceToolDescriptor({
      delta,
      direction,
      movingShapes: [],
      resizingShapes: [base],
      affectedConnections: [],
    }));
    assert.equal(out.needsFullSave, false, `direction ${direction} mapped`);
    assert.deepEqual(out.ops[0].bounds, expected, `resizeBounds parity ${direction}`);
  }
});

test("S3→S7: undo spaceTool → компенсирующий батч (post-undo live-снапшот)", () => {
  const descriptor = spaceToolDescriptor();
  descriptor.action = "undo";
  // S7: на undo-changed resizingShapes несут исходные bounds — inverse маппится.
  descriptor.commandContext.resizingShapes = [
    { id: "Task_7", type: "bpmn:Task", bounds: { x: 1460, y: 200, width: 120, height: 80 } },
  ];
  const out = mapCommandToOps(descriptor);
  assert.equal(out.needsFullSave, false);
  assert.deepEqual(out.ops.map((op) => op.type), ["shape.move", "shape.resize", "element.updateDi"]);
  assert.deepEqual(out.ops[1].bounds, { x: 1460, y: 200, width: 120, height: 80 });
});

test("S3: spaceTool fail-closed — без direction/bounds → needsFullSave", () => {
  const noDirection = mapCommandToOps(spaceToolDescriptor({ direction: "" }));
  assert.equal(noDirection.needsFullSave, true);

  const noBounds = mapCommandToOps(spaceToolDescriptor({
    resizingShapes: [{ id: "Task_7" }],
  }));
  assert.equal(noBounds.needsFullSave, true, "resize без bounds — молчаливая потеря запрещена");
});

// ---------------------------------------------------------------------------
// Контур feature/mutation-gateway-c3 (срез S4, волна 1): textAnnotation +
// association в ops. Golden-эталон — реальный full-PUT bpmn-js (evidence/s4/
// logs/s4-golden.xml): text — дочерний <bpmn:text>; association — атрибуты
// sourceRef/targetRef БЕЗ incoming/outgoing. Undo-семантика волны (явно):
// create undo → compensating delete-op; move undo → -delta (S3); text-edit
// undo → needsFullSave (oldBounds не живёт в снапшоте — записано в PR_S4).
// ---------------------------------------------------------------------------

test("S4w1: shape.create bpmn:TextAnnotation → op (тип снят из full-save pattern)", () => {
  const out = mapCommandToOps({
    command: "shape.create",
    action: "execute",
    context: {
      element: { id: "TextAnnotation_1", type: "bpmn:TextAnnotation", bounds: { x: 650, y: 485, width: 100, height: 30 } },
      parent: { id: "Process_1" },
    },
  });
  assert.equal(out.needsFullSave, false);
  assert.equal(out.ops.length, 1);
  assert.equal(out.ops[0].type, "shape.create");
  assert.equal(out.ops[0].elementType, "bpmn:TextAnnotation");
  assert.deepEqual(out.ops[0].bounds, { x: 650, y: 485, width: 100, height: 30 });
});

test("S4w1: connection.create bpmn:Association → op (artifactRef в sourceId/targetId)", () => {
  const out = mapCommandToOps({
    command: "connection.create",
    action: "execute",
    context: {
      element: { id: "Association_1", type: "bpmn:Association", waypoints: [[417, 228], [684, 485]] },
      source: { id: "Task_1" },
      target: { id: "TextAnnotation_1" },
      parent: { id: "Process_1" },
    },
  });
  assert.equal(out.needsFullSave, false);
  assert.equal(out.ops.length, 1);
  assert.equal(out.ops[0].type, "connection.create");
  assert.equal(out.ops[0].elementType, "bpmn:Association");
  assert.equal(out.ops[0].sourceId, "Task_1");
  assert.equal(out.ops[0].targetId, "TextAnnotation_1");
  assert.deepEqual(out.ops[0].waypoints, [[417, 228], [684, 485]]);
});

test("S4w1: updateLabel на textAnnotation → updateProperties{text} + shape.resize (bounds под текст)", () => {
  const out = mapCommandToOps({
    command: "element.updateLabel",
    action: "execute",
    context: {
      element: { id: "TextAnnotation_1", type: "bpmn:TextAnnotation", bounds: { x: 650, y: 485, width: 100, height: 30 } },
      newLabel: "Золотой эталон",
      oldLabel: "",
      newBounds: { x: 650, y: 485, width: 140, height: 50 },
    },
  });
  assert.equal(out.needsFullSave, false);
  assert.deepEqual(out.ops.map((op) => op.type), ["element.updateProperties", "shape.resize"]);
  assert.deepEqual(out.ops[0].properties, { text: "Золотой эталон" });
  assert.deepEqual(out.ops[1].bounds, { x: 650, y: 485, width: 140, height: 50 });
});

test("S4w1→S7: undo updateLabel textAnnotation → text(oldLabel) + resize(post-undo bounds)", () => {
  const out = mapCommandToOps({
    command: "element.updateLabel",
    action: "undo",
    context: {
      element: { id: "TextAnnotation_1", type: "bpmn:TextAnnotation", bounds: { x: 650, y: 485, width: 100, height: 30 } },
      newLabel: "Новый",
      oldLabel: "Старый",
      newBounds: { x: 650, y: 485, width: 140, height: 50 },
    },
  });
  assert.equal(out.needsFullSave, false, "S7: undo-правка маппится (post-undo bounds в снапшоте)");
  assert.deepEqual(out.ops[0].properties, { text: "Старый" });
  assert.deepEqual(out.ops[1].bounds, { x: 650, y: 485, width: 100, height: 30 });
});

test("S4w1: updateLabel обычного элемента не затронут (name-путь как раньше)", () => {
  const out = mapCommandToOps({
    command: "element.updateLabel",
    action: "execute",
    context: { element: { id: "Task_1", type: "bpmn:UserTask" }, newLabel: "N", oldLabel: "O" },
  });
  assert.equal(out.needsFullSave, false);
  assert.deepEqual(out.ops[0].properties, { name: "N" });
});

test("S4w1→w3: participant остаётся cold (data-refs — волна 2, lane — волна 3)", () => {
  for (const type of ["bpmn:Participant"]) {
    const out = mapCommandToOps({
      command: "shape.create",
      action: "execute",
      context: { element: { id: "X_1", type, bounds: { x: 1, y: 2, width: 3, height: 4 } }, parent: { id: "P" } },
    });
    assert.equal(out.needsFullSave, true, `${type} ещё cold`);
  }
});

// ---------------------------------------------------------------------------
// Контур feature/mutation-gateway-c3 (срез S4, волна 2): dataStoreReference /
// dataObjectReference в ops. Golden (evidence/s4/logs/s4-wave23-golden.xml):
// dataStoreReference — пустой leaf; dataObjectReference несёт dataObjectRef
// на companion <bpmn:dataObject> (bpmn-js удаляет сироту при save — backend
// повторяет). Undo-семантика: create undo → compensating delete-op; move undo
// → -delta (S3); delete undo → needsFullSave (S7-скоуп).
// ---------------------------------------------------------------------------

test("S4w2: shape.create bpmn:DataStoreReference / bpmn:DataObjectReference → ops", () => {
  for (const type of ["bpmn:DataStoreReference", "bpmn:DataObjectReference"]) {
    const out = mapCommandToOps({
      command: "shape.create",
      action: "execute",
      context: {
        element: { id: `${type.split(":")[1]}_1`, type, bounds: { x: 300, y: 620, width: 36, height: 50 } },
        parent: { id: "Process_1" },
      },
    });
    assert.equal(out.needsFullSave, false, `${type} create — ops с S4 волны 2`);
    assert.equal(out.ops.length, 1);
    assert.equal(out.ops[0].type, "shape.create");
    assert.equal(out.ops[0].elementType, type);
  }
});

test("S4w2→w3: participant остаётся cold (lane снят волной 3)", () => {
  for (const type of ["bpmn:Participant"]) {
    const out = mapCommandToOps({
      command: "shape.create",
      action: "execute",
      context: {
        element: { id: "X_1", type, bounds: { x: 1, y: 2, width: 3, height: 4 } },
        parent: { id: "P" },
      },
    });
    assert.equal(out.needsFullSave, true, `${type} ещё cold`);
  }
});

// ---------------------------------------------------------------------------
// Контур feature/mutation-gateway-c3 (срез S4, волна 3): lane в ops
// (flowNodeRef-контракт). Golden (evidence/s4/logs/s4-wave23-golden.xml):
// <bpmn:laneSet><bpmn:lane id/></bpmn:laneSet> в process; DI isHorizontal.
// Undo-семантика: create undo → compensating delete-op; delete ПУСТОГО lane →
// ops; delete lane с flowNodeRef → backend typed 422 (fail-closed) → честный
// full-save через degrade (S6 закроет молчаливость).
// ---------------------------------------------------------------------------

test("S4w3: shape.create bpmn:Lane → op; participant остаётся cold", () => {
  const lane = mapCommandToOps({
    command: "shape.create",
    action: "execute",
    context: {
      element: { id: "Lane_1", type: "bpmn:Lane", bounds: { x: 900, y: 210, width: 400, height: 100 } },
      parent: { id: "Participant_1" },
    },
  });
  assert.equal(lane.needsFullSave, false, "Lane create — ops с S4 волны 3");
  assert.equal(lane.ops.length, 1);
  assert.equal(lane.ops[0].elementType, "bpmn:Lane");
  assert.equal(lane.ops[0].parentId, "Participant_1");

  const participant = mapCommandToOps({
    command: "shape.create",
    action: "execute",
    context: {
      element: { id: "Participant_1", type: "bpmn:Participant", bounds: { x: 1, y: 2, width: 3, height: 4 } },
      parent: { id: "Process_1" },
    },
  });
  assert.equal(participant.needsFullSave, true, "participant — cold навсегда");
});

// ---------------------------------------------------------------------------
// Контур feature/mutation-gateway-c3 (срез S5): property panel → ops.
// Класс B (documentation): bpmn-js шлёт моддл-массив modeling.updateProperties(
// el, {documentation: [moddle]}). sanitizeValue терял его молча (ДЫРА: no-op op).
// S5: сериализация rows {text, textFormat} → op-payload; backend replace-children.
// Класс C (extensionElements / camunda custom properties): структурный payload —
// fail-closed needsFullSave (round-trip риск #995; boundary пишет full-PUT).
// Undo: oldProperties-ветка зеркалит execute (documentation rows).
// ---------------------------------------------------------------------------

function documentationDescriptor(text, textFormat = "text/plain") {
  // имитация moddle-объекта bpmn:Documentation (геттеры text/textFormat)
  return { $type: "bpmn:Documentation", text, textFormat };
}

test("S5: updateProperties documentation (moddle rows) → op payload rows (раньше молча терялось)", () => {
  const out = mapCommandToOps({
    command: "element.updateProperties",
    action: "execute",
    context: {
      element: { id: "Task_1", type: "bpmn:UserTask" },
      properties: { documentation: [documentationDescriptor("Строка 1"), documentationDescriptor("Строка 2", "text/html")] },
    },
  });
  assert.equal(out.needsFullSave, false, "documentation rows маппятся в op (больше не молчаливый no-op)");
  assert.equal(out.ops.length, 1);
  assert.deepEqual(out.ops[0].properties.documentation, [
    { text: "Строка 1", textFormat: "text/plain" },
    { text: "Строка 2", textFormat: "text/html" },
  ]);
});

test("S5: undo updateProperties documentation → oldProperties rows (parity)", () => {
  const out = mapCommandToOps({
    command: "element.updateProperties",
    action: "undo",
    context: {
      element: { id: "Task_1", type: "bpmn:UserTask" },
      properties: { documentation: [documentationDescriptor("Новое")] },
      oldProperties: { documentation: [documentationDescriptor("Старое")] },
    },
  });
  assert.equal(out.needsFullSave, false);
  assert.deepEqual(out.ops[0].properties.documentation, [{ text: "Старое", textFormat: "text/plain" }]);
});

test("S5: updateProperties с documentation-битым row → needsFullSave (fail-closed)", () => {
  const out = mapCommandToOps({
    command: "element.updateProperties",
    action: "execute",
    context: {
      element: { id: "Task_1", type: "bpmn:UserTask" },
      properties: { documentation: [{ $type: "bpmn:Documentation" }] },
    },
  });
  assert.equal(out.needsFullSave, true, "row без text — не сериализуем, честный full-save");
  assert.equal(out.ops.length, 0);
});

test("S5: updateProperties extensionElements (moddle) → needsFullSave (класс C cold, причина #995)", () => {
  const out = mapCommandToOps({
    command: "element.updateProperties",
    action: "execute",
    context: {
      element: { id: "Task_1", type: "bpmn:UserTask" },
      properties: { extensionElements: { $type: "bpmn:ExtensionElements", values: [] } },
    },
  });
  assert.equal(out.needsFullSave, true, "extensionElements — структурный payload, fail-closed");
  assert.equal(out.ops.length, 0);

  const mixed = mapCommandToOps({
    command: "element.updateProperties",
    action: "execute",
    context: {
      element: { id: "Task_1", type: "bpmn:UserTask" },
      properties: { name: "X", extensionElements: { $type: "bpmn:ExtensionElements" } },
    },
  });
  assert.equal(mixed.needsFullSave, true, "смешанный payload с moddle — целиком full-save");
});

test("S5: updateProperties sanitize-контракт — скаляры/вложенные plain-объекты по-прежнему ок", () => {
  const out = mapCommandToOps({
    command: "element.updateProperties",
    action: "execute",
    context: {
      element: { id: "Task_1", type: "bpmn:UserTask" },
      properties: { name: "N", "camunda:assignee": "demo", meta: { a: 1, b: [1, 2] } },
    },
  });
  assert.equal(out.needsFullSave, false);
  assert.deepEqual(out.ops[0].properties, { name: "N", "camunda:assignee": "demo", meta: { a: 1, b: [1, 2] } });
});

// ---------------------------------------------------------------------------
// Контур feature/mutation-gateway-c3 (срез S7): undo/redo полнота.
//  - undo delete → compensating create-op С СОХРАНЕНИЕМ id (контракт step2;
//    snapshotElementRef enrichment: parentId + text для textAnnotation);
//  - undo spaceTool / undo text-edit аннотации — inverse по post-undo
//    live-состоянию (снимок на undo-changed = восстановленное состояние);
//  - documentation как plain string (pinpoint drift :470 — регрессия S5);
//  - fail-closed: битый снапшот (нет bounds/type) → needsFullSave с причиной.
// ---------------------------------------------------------------------------

test("S7: undo shape.delete → compensating shape.create с тем же id/bounds/parentId", () => {
  const out = mapCommandToOps({
    command: "shape.delete",
    action: "undo",
    context: {
      element: { id: "Task_9", type: "bpmn:UserTask", bounds: { x: 300, y: 200, width: 120, height: 80 }, parentId: "Process_1" },
    },
  });
  assert.equal(out.needsFullSave, false);
  assert.equal(out.ops.length, 1);
  assert.equal(out.ops[0].type, "shape.create");
  assert.equal(out.ops[0].elementId, "Task_9");
  assert.equal(out.ops[0].elementType, "bpmn:UserTask");
  assert.deepEqual(out.ops[0].bounds, { x: 300, y: 200, width: 120, height: 80 });
  assert.equal(out.ops[0].parentId, "Process_1");
});

test("S7: undo connection.delete → compensating connection.create (source/target/waypoints)", () => {
  const out = mapCommandToOps({
    command: "connection.delete",
    action: "undo",
    context: {
      element: { id: "Flow_9", type: "bpmn:SequenceFlow", waypoints: [[100, 240], [300, 240]], parentId: "Process_1" },
      source: { id: "Task_1" },
      target: { id: "Task_2" },
    },
  });
  assert.equal(out.needsFullSave, false);
  assert.equal(out.ops[0].type, "connection.create");
  assert.equal(out.ops[0].elementId, "Flow_9");
  assert.equal(out.ops[0].sourceId, "Task_1");
  assert.equal(out.ops[0].targetId, "Task_2");
  assert.deepEqual(out.ops[0].waypoints, [[100, 240], [300, 240]]);
});

test("S7: undo delete textAnnotation → create с text-пayload", () => {
  const out = mapCommandToOps({
    command: "shape.delete",
    action: "undo",
    context: {
      element: { id: "TextAnnotation_9", type: "bpmn:TextAnnotation", bounds: { x: 650, y: 485, width: 100, height: 30 }, parentId: "Process_1", text: "Сохранить id" },
    },
  });
  assert.equal(out.needsFullSave, false);
  assert.equal(out.ops[0].type, "shape.create");
  assert.equal(out.ops[0].elementType, "bpmn:TextAnnotation");
  assert.equal(out.ops[0].text, "Сохранить id");
});

test("S7: undo delete fail-closed — нет bounds/type → needsFullSave (не молчаливый no-op)", () => {
  const noBounds = mapCommandToOps({
    command: "shape.delete",
    action: "undo",
    context: { element: { id: "Task_9", type: "bpmn:UserTask" } },
  });
  assert.equal(noBounds.needsFullSave, true, "recreate без bounds — дыра DI");
  const noType = mapCommandToOps({
    command: "shape.delete",
    action: "undo",
    context: { element: { id: "Task_9", bounds: { x: 1, y: 1, width: 10, height: 10 } } },
  });
  assert.equal(noType.needsFullSave, true, "recreate без типа — нечего создавать");
});

test("S7: undo spaceTool → -delta move + resize по post-undo bounds + updateDi", () => {
  const out = mapCommandToOps({
    command: "spaceTool",
    action: "undo",
    context: {
      delta: { x: 80, y: 0 },
      movingShapes: [
        { id: "Task_8", type: "bpmn:UserTask", bounds: { x: 1480, y: 200, width: 120, height: 80 } },
      ],
      resizingShapes: [
        // post-undo live bounds = исходные
        { id: "Task_7", type: "bpmn:UserTask", bounds: { x: 1300, y: 200, width: 120, height: 80 } },
      ],
      affectedConnections: [
        { id: "Flow_8", waypoints: [[1476, 240], [1480, 240]] },
      ],
    },
  });
  assert.equal(out.needsFullSave, false);
  assert.deepEqual(out.ops.map((op) => op.type), ["shape.move", "shape.resize", "element.updateDi"]);
  assert.deepEqual(out.ops[0].delta, { x: -80, y: -0 });
  assert.deepEqual(out.ops[1].bounds, { x: 1300, y: 200, width: 120, height: 80 });
  assert.deepEqual(out.ops[2].waypoints, [[1476, 240], [1480, 240]]);
});

test("S7: undo spaceTool fail-closed — resize без bounds → needsFullSave", () => {
  const out = mapCommandToOps({
    command: "spaceTool",
    action: "undo",
    context: {
      delta: { x: 80, y: 0 },
      movingShapes: [],
      resizingShapes: [{ id: "Task_7" }],
      affectedConnections: [],
    },
  });
  assert.equal(out.needsFullSave, true);
});

test("S7: undo text-edit аннотации → text(oldLabel) + resize по post-undo bounds", () => {
  const out = mapCommandToOps({
    command: "element.updateLabel",
    action: "undo",
    context: {
      element: { id: "TextAnnotation_1", type: "bpmn:TextAnnotation", bounds: { x: 650, y: 485, width: 100, height: 30 } },
      newLabel: "Новый",
      oldLabel: "Старый",
    },
  });
  assert.equal(out.needsFullSave, false);
  assert.deepEqual(out.ops.map((op) => op.type), ["element.updateProperties", "shape.resize"]);
  assert.deepEqual(out.ops[0].properties, { text: "Старый" });
  assert.deepEqual(out.ops[1].bounds, { x: 650, y: 485, width: 100, height: 30 });
});

test("S7: undo text-edit аннотации fail-closed — нет bounds → needsFullSave", () => {
  const out = mapCommandToOps({
    command: "element.updateLabel",
    action: "undo",
    context: {
      element: { id: "TextAnnotation_1", type: "bpmn:TextAnnotation" },
      newLabel: "N",
      oldLabel: "O",
    },
  });
  assert.equal(out.needsFullSave, true, "без bounds resize-компенсация невозможна");
});

test("S7: documentation как plain string маппится (pinpoint drift :470, регрессия S5)", () => {
  const out = mapCommandToOps({
    command: "element.updateProperties",
    action: "execute",
    context: {
      element: { id: "Task_1", type: "bpmn:UserTask" },
      properties: { documentation: "Строка без массива" },
    },
  });
  assert.equal(out.needsFullSave, false, "string documentation — валидный payload (было: needsFullSave)");
  assert.deepEqual(out.ops[0].properties.documentation, [{ text: "Строка без массива" }]);
});

// ---------------------------------------------------------------------------
// Контур fix/ops-422-quick-create-property (audit RC1/RC2 + parity-gaps):
//  - elements.create (палитра bpmn-js 18 / diagram-js batch) → декомпозиция
//    в СУЩЕСТВУЮЩИЕ shape.create/connection.create ops (новых типов НЕТ);
//    undo → compensating delete-батч. Fail-closed: неполный elements →
//    needsFullSave (не молчаливый no-op).
//  - parity (a): properties с ключом id — ключ отфильтровывается; только id →
//    needsFullSave (applier 422 protected_property недопустим).
//  - parity (b): connection.create БЕЗ waypoints → needsFullSave (applier
//    требует ≥2 waypoints → иначе 422 missing_waypoints).
// ---------------------------------------------------------------------------

test("fix422: elements.create (палитра) → батч shape.create/connection.create ops", () => {
  const out = mapCommandToOps({
    command: "elements.create",
    action: "execute",
    context: {
      elements: [
        { id: "Task_new1", type: "bpmn:UserTask", bounds: { x: 300, y: 200, width: 120, height: 80 }, parentId: "Process_1" },
        { id: "Task_new2", type: "bpmn:UserTask", bounds: { x: 520, y: 200, width: 120, height: 80 }, parentId: "Process_1" },
        { id: "Flow_new", type: "bpmn:SequenceFlow", sourceId: "Task_new1", targetId: "Task_new2", waypoints: [[420, 240], [520, 240]], parentId: "Process_1" },
      ],
    },
  });
  assert.equal(out.needsFullSave, false);
  assert.deepEqual(out.ops.map((op) => op.type), ["shape.create", "shape.create", "connection.create"]);
  assert.equal(out.ops[0].elementType, "bpmn:UserTask");
  assert.deepEqual(out.ops[0].bounds, { x: 300, y: 200, width: 120, height: 80 });
  assert.equal(out.ops[2].sourceId, "Task_new1");
  assert.equal(out.ops[2].targetId, "Task_new2");
  assert.deepEqual(out.ops[2].waypoints, [[420, 240], [520, 240]]);
});

test("fix422: undo elements.create → compensating delete-батч", () => {
  const out = mapCommandToOps({
    command: "elements.create",
    action: "undo",
    context: {
      elements: [
        { id: "Task_new1", type: "bpmn:UserTask", bounds: { x: 300, y: 200, width: 120, height: 80 } },
        { id: "Flow_new", type: "bpmn:SequenceFlow", sourceId: "Task_new1", targetId: "Task_new2", waypoints: [[420, 240], [520, 240]] },
      ],
    },
  });
  assert.equal(out.needsFullSave, false);
  assert.deepEqual(out.ops.map((op) => op.type), ["shape.delete", "connection.delete"]);
  assert.equal(out.ops[0].elementId, "Task_new1");
  assert.equal(out.ops[1].elementId, "Flow_new");
});

test("fix422: elements.create fail-closed — пустой elements / entry без id/bounds → needsFullSave", () => {
  const empty = mapCommandToOps({ command: "elements.create", action: "execute", context: { elements: [] } });
  assert.equal(empty.needsFullSave, true);

  const noBounds = mapCommandToOps({
    command: "elements.create",
    action: "execute",
    context: { elements: [{ id: "Task_x", type: "bpmn:UserTask" }] },
  });
  assert.equal(noBounds.needsFullSave, true, "shape без bounds — recreate дырявый");

  const unsafe = mapCommandToOps({
    command: "elements.create",
    action: "execute",
    context: { elements: [{ id: "Participant_x", type: "bpmn:Participant", bounds: { x: 1, y: 2, width: 3, height: 4 }, parentId: "P" }] },
  });
  assert.equal(unsafe.needsFullSave, true, "unsafe-тип — cold как раньше");
});

test("fix422: parity(a) — properties с ключом id: ключ отфильтрован; только id → needsFullSave", () => {
  const mixed = mapCommandToOps({
    command: "element.updateProperties",
    action: "execute",
    context: {
      element: { id: "Task_1", type: "bpmn:UserTask" },
      properties: { id: "Hacked", name: "N" },
    },
  });
  assert.equal(mixed.needsFullSave, false);
  assert.deepEqual(mixed.ops[0].properties, { name: "N" }, "id не уходит в op-payload (applier 422 protected_property)");

  const onlyId = mapCommandToOps({
    command: "element.updateProperties",
    action: "execute",
    context: {
      element: { id: "Task_1", type: "bpmn:UserTask" },
      properties: { id: "Hacked" },
    },
  });
  assert.equal(onlyId.needsFullSave, true, "только id — нечего писать, честный full-save");
});

test("fix422: parity(b) — connection.create без waypoints → needsFullSave (не 422 missing_waypoints)", () => {
  const out = mapCommandToOps({
    command: "connection.create",
    action: "execute",
    context: {
      element: { id: "Flow_x", type: "bpmn:SequenceFlow" },
      source: { id: "Task_1" },
      target: { id: "Task_2" },
    },
  });
  assert.equal(out.needsFullSave, true);
  assert.equal(out.ops.length, 0);
});

// Контур fix/ops-422 (RC2): deferredSaveRetry — одноразовый retry по
// directEditing.complete/cancel.

// ---------------------------------------------------------------------------
// Контур fix/canvas-move-di-desync-409-tracker, срез S1 (F1/F2).
// Одиночный drag фаерит shape.move, resize — shape.resize; вложенные
// connection-обновления diagram-js «тихие» (commandStack.changed — только
// outermost action), поэтому runtime-enrichment доснимает affectedConnections
// (positionalSnapshot.js), а мапперы добавляют updateDi-батч ПОСЛЕ shape-op.
// Fail-closed: не-строковый id / waypoints-битые записи → needsFullSave.
// Undo-паритет (S7-контракт): снапшот post-undo, updateDi берёт captured
// waypoints как есть; shape.move — negated delta; shape.resize — oldBounds.
// ---------------------------------------------------------------------------

function s1MoveDescriptor(overrides = {}) {
  return {
    command: "shape.move",
    action: "execute",
    source: "user",
    commandContext: {
      shape: { id: "Task_1", type: "bpmn:Task", bounds: { x: 140, y: 240, width: 120, height: 80 } },
      delta: { x: 40, y: 30 },
      affectedConnections: [
        { id: "Flow_1", type: "bpmn:SequenceFlow", waypoints: [[140, 240], [340, 230]] },
        { id: "Flow_2", type: "bpmn:SequenceFlow", waypoints: [[260, 280], [500, 400]] },
      ],
      ...overrides,
    },
  };
}

test("S1: shape.move + affectedConnections → shape.move, затем updateDi-батч (порядок ops)", () => {
  const out = mapCommandToOps(s1MoveDescriptor());
  assert.equal(out.needsFullSave, false);
  assert.deepEqual(out.ops.map((op) => op.type), ["shape.move", "element.updateDi", "element.updateDi"]);
  assert.equal(out.ops[0].elementId, "Task_1");
  assert.deepEqual(out.ops[0].delta, { x: 40, y: 30 });
  assert.equal(out.ops[1].elementId, "Flow_1");
  assert.deepEqual(out.ops[1].waypoints, [[140, 240], [340, 230]]);
  assert.equal(out.ops[2].elementId, "Flow_2");
  assert.deepEqual(out.ops[2].waypoints, [[260, 280], [500, 400]]);
  assert.equal(out.ops[0].source, "user");
});

test("S1: undo shape.move → negated delta + updateDi с captured waypoints как есть", () => {
  const descriptor = s1MoveDescriptor();
  descriptor.action = "undo";
  // S7: на undo-changed runtime переснимает post-undo waypoints — в дескрипторе
  // они уже post-undo; маппер не инвертирует waypoints, только delta.
  descriptor.commandContext.affectedConnections = [
    { id: "Flow_1", type: "bpmn:SequenceFlow", waypoints: [[100, 210], [300, 200]] },
  ];
  const out = mapCommandToOps(descriptor);
  assert.equal(out.needsFullSave, false);
  assert.deepEqual(out.ops.map((op) => op.type), ["shape.move", "element.updateDi"]);
  assert.deepEqual(out.ops[0].delta, { x: -40, y: -30 });
  assert.deepEqual(out.ops[1].waypoints, [[100, 210], [300, 200]]);
});

test("S1: shape.move без affectedConnections → одиночный shape.move (регрессии нет)", () => {
  const out = mapCommandToOps(s1MoveDescriptor({ affectedConnections: [] }));
  assert.equal(out.needsFullSave, false);
  assert.deepEqual(out.ops.map((op) => op.type), ["shape.move"]);
});

test("S1: shape.move fail-closed — не-строковый id шейпа / битая запись affectedConnections → needsFullSave", () => {
  const badShape = mapCommandToOps(s1MoveDescriptor({
    shape: { id: { nested: "Task_1" }, type: "bpmn:Task" },
  }));
  assert.equal(badShape.needsFullSave, true, "не-строковый id шейпа не превращается в '[object Object]'");
  assert.equal(badShape.ops.length, 0);

  const badConnId = mapCommandToOps(s1MoveDescriptor({
    affectedConnections: [{ id: 42, waypoints: [[1, 2], [3, 4]] }],
  }));
  assert.equal(badConnId.needsFullSave, true, "strictIdOf: не-строковый id связи → честный full-save");
  assert.equal(badConnId.ops.length, 0);

  const noWaypoints = mapCommandToOps(s1MoveDescriptor({
    affectedConnections: [{ id: "Flow_1" }],
  }));
  assert.equal(noWaypoints.needsFullSave, true, "связь без waypoints → updateDi неприменим, full-save");
  assert.equal(noWaypoints.ops.length, 0);

  const partialWp = mapCommandToOps(s1MoveDescriptor({
    affectedConnections: [{ id: "Flow_1", waypoints: [[1, 2], ["x", 4]] }],
  }));
  assert.equal(partialWp.needsFullSave, true, "битая точка waypoints → full-save");
});

function s1ResizeDescriptor(overrides = {}) {
  return {
    command: "shape.resize",
    action: "execute",
    commandContext: {
      shape: { id: "Task_1", type: "bpmn:Task", bounds: { x: 100, y: 200, width: 200, height: 100 } },
      newBounds: { x: 100, y: 200, width: 200, height: 100 },
      oldBounds: { x: 100, y: 200, width: 200, height: 160 },
      affectedConnections: [
        { id: "Flow_1", type: "bpmn:SequenceFlow", waypoints: [[300, 250], [420, 250]] },
      ],
      ...overrides,
    },
  };
}

test("S1: shape.resize + affectedConnections → shape.resize, затем updateDi-батч", () => {
  const out = mapCommandToOps(s1ResizeDescriptor());
  assert.equal(out.needsFullSave, false);
  assert.deepEqual(out.ops.map((op) => op.type), ["shape.resize", "element.updateDi"]);
  assert.deepEqual(out.ops[0].bounds, { x: 100, y: 200, width: 200, height: 100 });
  assert.equal(out.ops[1].elementId, "Flow_1");
  assert.deepEqual(out.ops[1].waypoints, [[300, 250], [420, 250]]);
});

test("S1: undo shape.resize → oldBounds + updateDi с captured waypoints как есть", () => {
  const descriptor = s1ResizeDescriptor();
  descriptor.action = "undo";
  descriptor.commandContext.affectedConnections = [
    { id: "Flow_1", type: "bpmn:SequenceFlow", waypoints: [[300, 220], [420, 220]] },
  ];
  const out = mapCommandToOps(descriptor);
  assert.equal(out.needsFullSave, false);
  assert.deepEqual(out.ops.map((op) => op.type), ["shape.resize", "element.updateDi"]);
  assert.deepEqual(out.ops[0].bounds, { x: 100, y: 200, width: 200, height: 160 });
  assert.deepEqual(out.ops[1].waypoints, [[300, 220], [420, 220]]);
});

// ---------------------------------------------------------------------------
// Контур fix/canvas-move-di-desync-409-tracker, срез S4 (F3).
// Backend _apply_connection_reconnect намеренно не мигрирует DI-edge
// (API.md §5.4) → companion element.updateDi с актуальными waypoints из
// снапшотного ref (post-action/post-undo parity, S7). Waypoints отсутствуют →
// reconnect без updateDi (by design); waypoints битые / id не строка →
// needsFullSave (fail-closed, strictIdOf).
// ---------------------------------------------------------------------------

test("S4: reconnect + waypoints в снапшоте → companion element.updateDi (порядок reconnect → updateDi)", () => {
  const out = mapCommandToOps({
    command: "connection.reconnectEnd",
    action: "execute",
    context: {
      connection: {
        id: "Flow_1",
        type: "bpmn:SequenceFlow",
        source: { id: "Task_3" },
        target: { id: "Task_4" },
        waypoints: [[420, 240], [480, 300], [540, 240]],
      },
    },
  });
  assert.equal(out.needsFullSave, false);
  assert.deepEqual(out.ops.map((op) => op.type), ["connection.reconnect", "element.updateDi"]);
  assert.equal(out.ops[0].connectionId, "Flow_1");
  assert.equal(out.ops[0].source, "Task_3");
  assert.equal(out.ops[0].target, "Task_4");
  assert.equal(out.ops[1].elementId, "Flow_1");
  assert.deepEqual(out.ops[1].waypoints, [[420, 240], [480, 300], [540, 240]]);
});

test("S4: undo reconnect → compensating reconnect(oldSource/oldTarget) + updateDi с captured post-undo waypoints", () => {
  const out = mapCommandToOps({
    command: "connection.reconnect",
    action: "undo",
    context: {
      connection: {
        id: "Flow_1",
        type: "bpmn:SequenceFlow",
        waypoints: [[420, 200], [540, 200]],
      },
      source: { id: "Task_3" },
      target: { id: "Task_4" },
      oldSource: { id: "Task_1" },
      oldTarget: { id: "Task_2" },
    },
  });
  assert.equal(out.needsFullSave, false);
  assert.deepEqual(out.ops.map((op) => op.type), ["connection.reconnect", "element.updateDi"]);
  assert.equal(out.ops[0].source, "Task_1");
  assert.equal(out.ops[0].target, "Task_2");
  // S7-parity: post-undo captured waypoints уходят как есть (не инвертируются).
  assert.deepEqual(out.ops[1].waypoints, [[420, 200], [540, 200]]);
});

test("S4: reconnect без waypoints в снапшоте → reconnect только (by design, не needsFullSave)", () => {
  const out = mapCommandToOps({
    command: "connection.reconnect",
    action: "execute",
    context: {
      connection: { id: "Flow_1", type: "bpmn:SequenceFlow", source: { id: "Task_1" }, target: { id: "Task_2" } },
    },
  });
  assert.equal(out.needsFullSave, false);
  assert.deepEqual(out.ops.map((op) => op.type), ["connection.reconnect"]);
});

test("S4: reconnect fail-closed — не-строковый id связи / битые waypoints → needsFullSave", () => {
  const badId = mapCommandToOps({
    command: "connection.reconnect",
    action: "execute",
    context: {
      connection: { id: { nested: "Flow_1" }, source: { id: "Task_1" }, target: { id: "Task_2" } },
    },
  });
  assert.equal(badId.needsFullSave, true, "strictIdOf: не-строковый id не превращается в '[object Object]'");
  assert.equal(badId.ops.length, 0);

  const badWaypoints = mapCommandToOps({
    command: "connection.reconnect",
    action: "execute",
    context: {
      connection: {
        id: "Flow_1",
        source: { id: "Task_1" },
        target: { id: "Task_2" },
        waypoints: [[1, 2], ["x", 4]],
      },
    },
  });
  assert.equal(badWaypoints.needsFullSave, true, "waypoints заявлены, но битые — честный full-save, молчаливая потеря запрещена");
  assert.equal(badWaypoints.ops.length, 0);
});

test("align v2: fpc.alignDiagram не порождает ops и не дёргает full-save (execute и undo)", () => {
  __resetOpsCoverageForTests();
  const execute = mapCommandToOps({ command: "fpc.alignDiagram", action: "execute", context: {} });
  assert.deepEqual(execute.ops, []);
  assert.equal(execute.needsFullSave, false);
  assert.equal(execute.replay, false);
  const undo = mapCommandToOps({ command: "fpc.alignDiagram", action: "undo", context: {} });
  assert.deepEqual(undo.ops, []);
  assert.equal(undo.needsFullSave, false);
});
