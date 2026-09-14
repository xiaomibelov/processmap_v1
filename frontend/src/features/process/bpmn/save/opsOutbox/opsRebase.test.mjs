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

function makeModeler({ elements = {}, executeImpl } = {}) {
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
  assert.deepEqual(modeler.executed[0].context.newWaypoints, [[0, 0], [10, 10]]);
});

test("replayOpsOnModeler: create ops are not replayable in step1 → fuzzyMiss/needsFullSave path", async () => {
  const modeler = makeModeler({ elements: {} });
  const result = await replayOpsOnModeler(modeler, [
    { opId: "op-6", type: "shape.create", elementId: "Task_New", elementType: "bpmn:Task" },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.results[0].fuzzyMiss, true);
});
