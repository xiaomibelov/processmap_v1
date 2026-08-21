import assert from "node:assert/strict";
import test from "node:test";

import { createCommandOpsAdapter } from "./commandOpsAdapter.js";

async function withWindowStub(run) {
  const prevWindow = globalThis.window;
  const timerCalls = [];
  globalThis.window = {
    setTimeout(fn, ms) {
      timerCalls.push(Number(ms || 0));
      if (typeof fn === "function") fn();
      return 1;
    },
  };
  try {
    await run({ timerCalls });
  } finally {
    globalThis.window = prevWindow;
  }
}

test("applyCommandOpsOnModeler returns modeler_not_ready when modeler is unavailable", async () => {
  const adapter = createCommandOpsAdapter({
    getModelerOrEnsure: async () => null,
    applyOpsToModeler: async () => ({ ok: true }),
    emitDiagramMutation: () => {},
  });

  const result = await adapter.applyCommandOpsOnModeler({ ops: [{ op: "noop" }] });
  assert.deepEqual(result, {
    ok: false,
    applied: 0,
    failed: 0,
    changedIds: [],
    results: [],
    error: "modeler_not_ready",
  });
});

test("applyCommandOpsOnModeler applies ops, highlights changed ids, emits mutation", async () => {
  await withWindowStub(async ({ timerCalls }) => {
    const selectedCalls = [];
    const markerAdds = [];
    const markerRemoves = [];
    const emitCalls = [];
    const applyCalls = [];

    const registryMap = {
      Task_1: { id: "Task_1" },
      Task_2: { id: "Task_2" },
    };

    const inst = {
      get(name) {
        if (name === "elementRegistry") {
          return {
            get(id) {
              return registryMap[String(id || "")] || null;
            },
          };
        }
        if (name === "selection") {
          return {
            select(items) {
              selectedCalls.push(items);
            },
          };
        }
        if (name === "canvas") {
          return {
            addMarker(id, cls) {
              markerAdds.push({ id: String(id || ""), cls: String(cls || "") });
            },
            removeMarker(id, cls) {
              markerRemoves.push({ id: String(id || ""), cls: String(cls || "") });
            },
          };
        }
        return null;
      },
    };

    const adapter = createCommandOpsAdapter({
      getModelerOrEnsure: async () => inst,
      applyOpsToModeler: async (modeler, ops, options) => {
        applyCalls.push({ modeler, ops, options });
        return {
          ok: true,
          applied: 2,
          failed: 0,
          changedIds: ["Task_1", "Task_2"],
          results: [{ ok: true }],
        };
      },
      emitDiagramMutation: (name, payload) => {
        emitCalls.push({ name, payload });
      },
    });

    const result = await adapter.applyCommandOpsOnModeler({
      ops: [{ op: "change", id: "Task_1" }],
      selectedElementId: "  Task_1  ",
    });

    assert.equal(result?.ok, true);
    assert.equal(applyCalls.length, 1);
    assert.equal(applyCalls[0].options.selectedElementId, "Task_1");
    assert.equal(selectedCalls.length, 1);
    assert.equal(selectedCalls[0].length, 2);
    assert.deepEqual(markerAdds, [
      { id: "Task_1", cls: "fpcElementSelected" },
      { id: "Task_2", cls: "fpcElementSelected" },
    ]);
    assert.deepEqual(markerRemoves, [
      { id: "Task_1", cls: "fpcElementSelected" },
      { id: "Task_2", cls: "fpcElementSelected" },
    ]);
    assert.deepEqual(timerCalls, [1200]);
    assert.deepEqual(emitCalls, [{
      name: "diagram.ai_command_ops",
      payload: { applied: 2, failed: 0 },
    }]);
  });
});
