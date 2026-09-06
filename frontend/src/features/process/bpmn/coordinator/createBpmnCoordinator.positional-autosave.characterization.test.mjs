import test from "node:test";
import assert from "node:assert/strict";

import createBpmnStore from "../store/createBpmnStore.js";
import createBpmnCoordinator from "./createBpmnCoordinator.js";

// ---------------------------------------------------------------------------
// Characterization contour canvas-save-hot-path-v1 (Группа 2).
//
// BASELINE: позиционная команда (shape.move / elements.move) проходит staging
// (сериализация + rev bump + STAGE_POSITIONAL_CHANGE с reason
// "positional_command"), но НЕ порождает autosave: coordinator.scheduleSave
// не вызывается (requestAutosave в staging пропущен), flushSave не происходит,
// persistence.saveRaw не дёргается. Даже после drag-end (notifyDragEnd)
// positional-only драг не даёт flush. Контур намеренно меняет hot-path, поэтому
// тест фиксирует текущее поведение через публичный API coordinator.
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis;
}

function createHarness(overrides = {}) {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"old\"/>",
    rev: 1,
    dirty: false,
    lastSavedRev: 1,
  });
  const saveRawCalls = [];
  const traces = [];
  let dragging = false;
  let changeCb = null;
  const runtime = {
    getStatus: () => ({ ready: true, defs: true, token: 3 }),
    getXml: async (options = {}) => ({ ok: true, xml: "<bpmn:definitions id=\"fresh\"/>", token: 3, options }),
    onChange: (cb) => {
      changeCb = cb;
      return () => {};
    },
    onStatus: () => () => {},
  };
  const coordinator = createBpmnCoordinator({
    store,
    getSessionId: () => "sid_positional_autosave",
    getRuntime: () => runtime,
    getIsDragging: () => dragging,
    debounceMs: 40,
    dragThrottleMs: 40,
    dragFinalDebounceMs: 40,
    onTrace: (event, payload) => traces.push({ event, payload }),
    persistence: {
      saveRaw: async (sid, xml, rev, reason) => {
        saveRawCalls.push({ sid, xml, rev, reason });
        return { ok: true, status: 200, storedRev: rev + 1, hash: "h" };
      },
    },
    ...overrides,
  });
  coordinator.bindRuntime(runtime);
  return {
    store,
    coordinator,
    runtime,
    saveRawCalls,
    traces,
    fireCommand: (command) => changeCb({ type: "commandStack.changed", command }),
    setDragging: (value) => {
      dragging = value;
    },
  };
}

function eventsOf(traces, name) {
  return traces.filter((t) => t.event === name);
}

test("CURRENT: positional shape.move stages change but never schedules autosave or flushes", async () => {
  const { coordinator, fireCommand, saveRawCalls, traces } = createHarness();
  try {
    fireCommand("shape.move");
    fireCommand("elements.move");
    await sleep(150);

    // Staging обработал события (иначе тест проверял бы no-op):
    const staged = eventsOf(traces, "STAGE_POSITIONAL_CHANGE");
    assert.equal(staged.length, 2, "both positional commands must reach staging");
    assert.ok(staged.every((t) => t.payload.reason === "positional_command"));

    // КЛЮЧЕВАЯ ФИКСАЦИЯ: ни schedule, ни flush, ни persist.
    assert.equal(eventsOf(traces, "SAVE_SCHEDULED").length, 0, "positional command must not schedule autosave");
    assert.equal(eventsOf(traces, "SAVE_PERSIST_STARTED").length, 0, "positional command must not flush");
    assert.equal(saveRawCalls.length, 0, "positional command must not hit persistence");
  } finally {
    coordinator.destroy();
  }
});

test("CONTROL: structural shape.create schedules autosave and flushes via debounce", async () => {
  const { coordinator, fireCommand, saveRawCalls, traces } = createHarness();
  try {
    fireCommand("shape.create");
    await sleep(150);

    assert.equal(eventsOf(traces, "SAVE_SCHEDULED").length, 1, "structural command schedules autosave");
    assert.equal(eventsOf(traces, "SAVE_PERSIST_STARTED").length, 1);
    assert.equal(saveRawCalls.length, 1, "harness can observe a real flush");
    assert.equal(saveRawCalls[0].reason, "autosave");
  } finally {
    coordinator.destroy();
  }
});

test("CURRENT: positional-only drag produces no flush even after drag end", async () => {
  const { coordinator, fireCommand, saveRawCalls, traces, setDragging } = createHarness();
  try {
    setDragging(true);
    fireCommand("shape.move");
    fireCommand("elements.move");
    await sleep(100);
    assert.equal(saveRawCalls.length, 0, "no flush while dragging");

    // Drag end: notifyDragEnd смотрит dragPendingStructural, который
    // positional-only драг не ставит.
    setDragging(false);
    coordinator.notifyDragEnd();
    await sleep(150);

    assert.equal(saveRawCalls.length, 0, "CURRENT BEHAVIOR: positional drag end flushes nothing");
    assert.equal(eventsOf(traces, "SAVE_PERSIST_STARTED").length, 0);
    assert.equal(eventsOf(traces, "SAVE_SCHEDULED").length, 0);
  } finally {
    coordinator.destroy();
  }
});
