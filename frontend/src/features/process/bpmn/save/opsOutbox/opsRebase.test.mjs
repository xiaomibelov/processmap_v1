import test from "node:test";
import assert from "node:assert/strict";

import {
  getVersion as getTrackedDiagramStateVersion,
  setVersion as setTrackedDiagramStateVersion,
  __resetForTests as resetCasVersionTracker,
} from "../../../../../lib/casVersionTracker.js";
import {
  createOpsRebase,
  replayOpsOnModeler,
  adoptServerVersion,
} from "./opsRebase.js";

// ---------------------------------------------------------------------------
// Контур feature/async-save-pipeline-step1 (TESTS §1.3).
// opsRebase: 409 → adopt server version (casVersionTracker.setVersion —
// публикация в crossTabVersionSync сохраняется), replay pendingOps на live
// modeler через commandStack.execute с флагами __pmOpId/__pmOpSource:"replay"
// (echo suppression). Fuzzy miss (element не найден) → needsFullSave.
// ---------------------------------------------------------------------------

function makeModeler({ elements = {}, executeImpl, elementFactory } = {}) {
  const executed = [];
  const registry = {
    get: (id) => elements[id] || null,
    getAll: () => Object.values(elements),
  };
  const commandStack = {
    execute: executeImpl || ((command, context) => {
      executed.push({ command, context });
      return { command, context };
    }),
  };
  return {
    executed,
    registry,
    commandStack,
    get(name) {
      if (name === "elementRegistry") return registry;
      if (name === "commandStack") return commandStack;
      if (name === "elementFactory") return elementFactory || null;
      return null;
    },
  };
}

test.beforeEach(() => {
  resetCasVersionTracker();
});

test("adoptServerVersion sets tracked CAS base (cross-tab publish preserved)", () => {
  setTrackedDiagramStateVersion("s1", 7);
  adoptServerVersion("s1", 12);
  assert.equal(getTrackedDiagramStateVersion("s1"), 12);
});

test("rebase: adopt version + replay pending ops via applyOps fn; ok → no needsFullSave", async () => {
  setTrackedDiagramStateVersion("s1", 7);
  const replayed = [];
  const rebase = createOpsRebase({
    applyOpsFn: async (modeler, ops) => {
      replayed.push({ modeler, ops });
      return { ok: true, applied: ops.length, failed: 0, results: ops.map((o) => ({ opId: o.opId, ok: true })) };
    },
  });
  const pendingOps = [{ opId: "op-1", type: "element.updateProperties", elementId: "Task_1", properties: { name: "A" } }];
  const result = await rebase.handleConflict({
    sessionId: "s1",
    response: { status: 409, data: { detail: { server_current_version: 11, current_xml: "<xml/>" } } },
    pendingOps,
    modeler: makeModeler(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.needsFullSave, false);
  assert.equal(getTrackedDiagramStateVersion("s1"), 11, "server version adopted");
  assert.equal(replayed.length, 1);
  assert.deepEqual(replayed[0].ops.map((o) => o.opId), ["op-1"], "same opIds replayed");
});

test("rebase: replay failure / fuzzy miss → needsFullSave", async () => {
  setTrackedDiagramStateVersion("s1", 7);
  const rebase = createOpsRebase({
    applyOpsFn: async () => ({
      ok: false,
      applied: 0,
      failed: 1,
      results: [{ opId: "op-1", ok: false, error: "element_not_found", fuzzyMiss: true }],
    }),
  });
  const result = await rebase.handleConflict({
    sessionId: "s1",
    response: { status: 409, data: { detail: { server_current_version: 11, current_xml: "<xml/>" } } },
    pendingOps: [{ opId: "op-1", type: "element.updateProperties", elementId: "Ghost", properties: { name: "A" } }],
    modeler: makeModeler(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.needsFullSave, true);
});

test("rebase: missing server version in 409 body → needsFullSave (no silent adopt)", async () => {
  setTrackedDiagramStateVersion("s1", 7);
  const rebase = createOpsRebase({ applyOpsFn: async () => ({ ok: true, applied: 0, failed: 0, results: [] }) });
  const result = await rebase.handleConflict({
    sessionId: "s1",
    response: { status: 409, data: { detail: {} } },
    pendingOps: [],
    modeler: makeModeler(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.needsFullSave, true);
  assert.equal(getTrackedDiagramStateVersion("s1"), 7, "tracked base untouched");
});

test("replayOpsOnModeler: replays whitelisted ops via commandStack.execute with replay context flags", async () => {
  const task = { id: "Task_1", businessObject: { $type: "bpmn:Task", name: "A" }, x: 0, y: 0, width: 120, height: 80 };
  const modeler = makeModeler({ elements: { Task_1: task } });
  const ops = [
    { opId: "op-1", type: "element.updateProperties", elementId: "Task_1", properties: { name: "B" } },
    { opId: "op-2", type: "shape.move", elementId: "Task_1", delta: { x: 10, y: 5 } },
    { opId: "op-3", type: "shape.resize", elementId: "Task_1", bounds: { x: 0, y: 0, width: 200, height: 100 } },
    { opId: "op-4", type: "shape.delete", elementId: "Task_1" },
  ];
  const result = await replayOpsOnModeler(modeler, ops);
  assert.equal(result.ok, true);
  assert.equal(result.applied, 4);
  assert.equal(modeler.executed.length, 4);
  const [upd, move, resize, del] = modeler.executed;
  assert.equal(upd.command, "element.updateProperties");
  assert.equal(upd.context.__pmOpId, "op-1");
  assert.equal(upd.context.__pmOpSource, "replay");
  assert.equal(move.command, "shape.move");
  assert.deepEqual(move.context.delta, { x: 10, y: 5 });
  assert.equal(resize.command, "shape.resize");
  assert.deepEqual(resize.context.newBounds, { x: 0, y: 0, width: 200, height: 100 });
  assert.equal(del.command, "shape.delete");
  assert.equal(del.context.__pmOpSource, "replay");
});

test("replayOpsOnModeler: fuzzy miss → per-op failure with fuzzyMiss flag, overall not ok", async () => {
  const modeler = makeModeler({ elements: {} });
  const ops = [{ opId: "op-9", type: "element.updateProperties", elementId: "Ghost_1", properties: { name: "B" } }];
  const result = await replayOpsOnModeler(modeler, ops);
  assert.equal(result.ok, false);
  assert.equal(result.failed, 1);
  assert.equal(result.results[0].ok, false);
  assert.equal(result.results[0].fuzzyMiss, true);
  assert.equal(modeler.executed.length, 0, "nothing executed for missing element");
});

test("replayOpsOnModeler: updateDi op with waypoints → connection.updateWaypoints command", async () => {
  const conn = { id: "Flow_1", businessObject: { $type: "bpmn:SequenceFlow" }, waypoints: [] };
  const modeler = makeModeler({ elements: { Flow_1: conn } });
  const result = await replayOpsOnModeler(modeler, [
    { opId: "op-5", type: "element.updateDi", elementId: "Flow_1", waypoints: [[0, 0], [10, 10]] },
  ]);
  assert.equal(result.ok, true);
  assert.equal(modeler.executed[0].command, "connection.updateWaypoints");
  // fix/render-resync-connections-after-409: bpmn-js renderer читает
  // waypoint.x/.y — wire-пары [x,y] нормализуются в {x, y} (raw-пары давали
  // d="M,L,L,L," и исчезающие стрелки после 409-rebase replay).
  assert.deepEqual(modeler.executed[0].context.newWaypoints, [{ x: 0, y: 0 }, { x: 10, y: 10 }]);
});

test("replayOpsOnModeler: create op replayed through commandStack.execute path with replay flags (step2)", async () => {
  const created = { id: "Task_New", type: "bpmn:Task", x: 100, y: 200, width: 120, height: 80 };
  const modeler = makeModeler({
    elements: {},
    elementFactory: {
      createShape: (props) => ({ ...props }),
      createConnection: (props) => ({ ...props, waypoints: props.waypoints || [] }),
    },
  });
  const result = await replayOpsOnModeler(modeler, [
    {
      opId: "op-6",
      type: "shape.create",
      elementId: "Task_New",
      elementType: "bpmn:Task",
      bounds: { x: 100, y: 200, width: 120, height: 80 },
      parentId: "Process_1",
    },
  ]);
  assert.equal(result.ok, true, "create replay is supported in step2 (client id preserved by server)");
  assert.equal(modeler.executed.length, 1);
  assert.equal(modeler.executed[0].command, "shape.create");
  assert.equal(modeler.executed[0].context.__pmOpSource, "replay");
  assert.equal(modeler.executed[0].context.__pmOpId, "op-6");
  assert.equal(modeler.executed[0].context.shape.id, created.id, "client-generated id flows into replay");
});

test("replayOpsOnModeler: create op on element that already exists (idempotent) → ok without execute", async () => {
  const existing = { id: "Task_New", businessObject: { $type: "bpmn:Task" } };
  const modeler = makeModeler({ elements: { Task_New: existing } });
  const result = await replayOpsOnModeler(modeler, [
    { opId: "op-7", type: "shape.create", elementId: "Task_New", elementType: "bpmn:Task", bounds: { x: 0, y: 0, width: 120, height: 80 } },
  ]);
  assert.equal(result.ok, true, "element already on canvas (server preserved client id) — replay is a no-op");
  assert.equal(modeler.executed.length, 0, "no duplicate create executed");
});

test("replayOpsOnModeler: connection.create replay resolves source/target and executes with replay flags", async () => {
  const source = { id: "Task_1" };
  const target = { id: "Task_2" };
  const modeler = makeModeler({
    elements: { Task_1: source, Task_2: target },
    elementFactory: {
      createShape: (props) => ({ ...props }),
      createConnection: (props) => ({ ...props, waypoints: props.waypoints || [] }),
    },
  });
  const result = await replayOpsOnModeler(modeler, [
    {
      opId: "op-8",
      type: "connection.create",
      elementId: "Flow_New",
      elementType: "bpmn:SequenceFlow",
      sourceId: "Task_1",
      targetId: "Task_2",
      waypoints: [[0, 0], [10, 10]],
      parentId: "Process_1",
    },
  ]);
  assert.equal(result.ok, true);
  assert.equal(modeler.executed.length, 1);
  assert.equal(modeler.executed[0].command, "connection.create");
  assert.equal(modeler.executed[0].context.__pmOpSource, "replay");
  assert.equal(modeler.executed[0].context.connection.id, "Flow_New");
  assert.equal(modeler.executed[0].context.source.id, "Task_1");
  assert.equal(modeler.executed[0].context.target.id, "Task_2");
});

test("replayOpsOnModeler: connection.reconnect replay rewrites source/target via commandStack.execute", async () => {
  const conn = { id: "Flow_1", businessObject: { $type: "bpmn:SequenceFlow" }, waypoints: [] };
  const source = { id: "Task_3" };
  const target = { id: "Task_4" };
  const modeler = makeModeler({ elements: { Flow_1: conn, Task_3: source, Task_4: target } });
  const result = await replayOpsOnModeler(modeler, [
    { opId: "op-10", type: "connection.reconnect", elementId: "Flow_1", connectionId: "Flow_1", source: "Task_3", target: "Task_4" },
  ]);
  assert.equal(result.ok, true);
  assert.equal(modeler.executed.length, 1);
  assert.equal(modeler.executed[0].command, "connection.reconnect");
  assert.equal(modeler.executed[0].context.connection.id, "Flow_1");
  assert.equal(modeler.executed[0].context.source.id, "Task_3");
  assert.equal(modeler.executed[0].context.target.id, "Task_4");
  assert.equal(modeler.executed[0].context.__pmOpSource, "replay");
});

test("replayOpsOnModeler: connection.reconnect with missing endpoint → fuzzyMiss (conservative fetch+rebase)", async () => {
  const conn = { id: "Flow_1", businessObject: { $type: "bpmn:SequenceFlow" }, waypoints: [] };
  const modeler = makeModeler({ elements: { Flow_1: conn } });
  const result = await replayOpsOnModeler(modeler, [
    { opId: "op-11", type: "connection.reconnect", elementId: "Flow_1", connectionId: "Flow_1", source: "Ghost_1", target: "Task_4" },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.results[0].ok, false);
  assert.equal(result.results[0].fuzzyMiss, true);
});

test("replayOpsOnModeler: create without elementFactory → fuzzyMiss (no silent skip)", async () => {
  const modeler = makeModeler({ elements: {} });
  const result = await replayOpsOnModeler(modeler, [
    { opId: "op-12", type: "shape.create", elementId: "Task_X", elementType: "bpmn:Task", bounds: { x: 0, y: 0, width: 1, height: 1 } },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.results[0].fuzzyMiss, true);
});

test("replayOpsOnModeler source option: remote apply flags __pmOpSource:\"remote\"", async () => {
  const task = { id: "Task_1", businessObject: { $type: "bpmn:Task", name: "A" }, x: 0, y: 0, width: 120, height: 80 };
  const modeler = makeModeler({ elements: { Task_1: task } });
  const result = await replayOpsOnModeler(
    modeler,
    [{ opId: "r1", type: "element.updateProperties", elementId: "Task_1", properties: { name: "Чужое" } }],
    { source: "remote" },
  );
  assert.equal(result.ok, true);
  assert.equal(modeler.executed.length, 1);
  assert.equal(modeler.executed[0].context.__pmOpSource, "remote");
  assert.equal(modeler.executed[0].context.__pmOpId, "r1");
});

test("replayOpsOnModeler default source stays \"replay\" (step1 regression)", async () => {
  const task = { id: "Task_1", businessObject: { $type: "bpmn:Task", name: "A" }, x: 0, y: 0, width: 120, height: 80 };
  const modeler = makeModeler({ elements: { Task_1: task } });
  await replayOpsOnModeler(modeler, [
    { opId: "op-1", type: "element.updateProperties", elementId: "Task_1", properties: { name: "B" } },
  ]);
  assert.equal(modeler.executed[0].context.__pmOpSource, "replay");
});

test("BLOCKER-1 e2e-followup: shape.move replay context carries hints (real bpmn-js MoveShapeHandler reads context.hints.layout)", async () => {
  const task = { id: "Task_1", parent: { id: "Lane_1" }, businessObject: { $type: "bpmn:Task" }, x: 0, y: 0, width: 120, height: 80 };
  const modeler = makeModeler({ elements: { Task_1: task } });
  const result = await replayOpsOnModeler(modeler, [
    { opId: "op-m1", type: "shape.move", elementId: "Task_1", delta: { x: 10, y: 5 } },
  ]);
  assert.equal(result.ok, true);
  const context = modeler.executed[0].context;
  assert.ok(context.hints && typeof context.hints === "object", "hints object present (diagram-js postExecute reads hints.layout)");
  assert.equal(context.hints.layout, false, "no connection re-layout: wire op is a pure delta, server applies bounds only");
});

// ---------------------------------------------------------------------------
// fix/render-resync-connections-after-409: wire-waypoints — пары [x, y]
// (commandToOps.waypoints, opsOutbox/commandToOps.js). Replay должен отдавать
// bpmn-js connection.updateWaypoints НОРМАЛИЗОВАННЫЕ {x, y}: renderer читает
// waypoint.x/.y; raw-пары дают d="M,L,L,L," (стрелки исчезают после 409-rebase).
// ---------------------------------------------------------------------------

function makeConnection(id = "Flow_1") {
  return { id, type: "bpmn:SequenceFlow", businessObject: { $type: "bpmn:SequenceFlow" }, waypoints: [{ x: 1, y: 2 }, { x: 3, y: 4 }] };
}

test("replay updateDi: wire pairs [[x,y]] normalize to {x,y} objects for connection.updateWaypoints", async () => {
  const conn = makeConnection("Flow_1");
  const modeler = makeModeler({ elements: { Flow_1: conn } });
  const result = await replayOpsOnModeler(modeler, [
    { opId: "op-w1", type: "element.updateDi", elementId: "Flow_1", waypoints: [[208, 170], [234, 170], [234, 320], [820, 320]] },
  ]);
  assert.equal(result.ok, true);
  const context = modeler.executed[0].context;
  assert.equal(modeler.executed[0].command, "connection.updateWaypoints");
  assert.deepEqual(context.newWaypoints, [
    { x: 208, y: 170 },
    { x: 234, y: 170 },
    { x: 234, y: 320 },
    { x: 820, y: 320 },
  ], "bpmn-js renderer reads waypoint.x/.y; pairs must not pass through raw");
});

test("replay updateDi: {x,y} object waypoints stay accepted (idempotent normalize)", async () => {
  const conn = makeConnection("Flow_1");
  const modeler = makeModeler({ elements: { Flow_1: conn } });
  const result = await replayOpsOnModeler(modeler, [
    { opId: "op-w2", type: "element.updateDi", elementId: "Flow_1", waypoints: [{ x: 10, y: 20 }, { x: 30, y: 40 }] },
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(modeler.executed[0].context.newWaypoints, [{ x: 10, y: 20 }, { x: 30, y: 40 }]);
});

test("replay updateDi: non-finite wire waypoint → fuzzyMiss fail-closed (no NaN into model, parity commandToOps.point)", async () => {
  const conn = makeConnection("Flow_1");
  const modeler = makeModeler({ elements: { Flow_1: conn } });
  const result = await replayOpsOnModeler(modeler, [
    { opId: "op-w3", type: "element.updateDi", elementId: "Flow_1", waypoints: [["NaN", 170], [234, 170]] },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.results[0].ok, false);
  assert.equal(result.results[0].fuzzyMiss, true);
  assert.equal(modeler.executed.length, 0, "poisoned DI never reaches the live model");
});

test("replay updateDi: fewer than 2 waypoints → fuzzyMiss (server applier parity: missing_waypoints 422)", async () => {
  const conn = makeConnection("Flow_1");
  const modeler = makeModeler({ elements: { Flow_1: conn } });
  const result = await replayOpsOnModeler(modeler, [
    { opId: "op-w4", type: "element.updateDi", elementId: "Flow_1", waypoints: [[208, 170]] },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.results[0].fuzzyMiss, true);
  assert.equal(modeler.executed.length, 0);
});

test("replay connection.create: wire pairs normalize to {x,y} in elementFactory descriptor", async () => {
  const created = [];
  const elementFactory = {
    createConnection: (descriptor) => { created.push(descriptor); return { id: descriptor.id }; },
  };
  const source = { id: "StartEvent_1" };
  const target = { id: "Task_1" };
  const modeler = makeModeler({
    elements: { StartEvent_1: source, Task_1: target },
    elementFactory,
  });
  const result = await replayOpsOnModeler(modeler, [
    {
      opId: "op-c1",
      type: "connection.create",
      elementId: "Flow_9",
      elementType: "bpmn:SequenceFlow",
      sourceId: "StartEvent_1",
      targetId: "Task_1",
      waypoints: [[208, 170], [280, 170]],
    },
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(created[0].waypoints, [{ x: 208, y: 170 }, { x: 280, y: 170 }]);
});
