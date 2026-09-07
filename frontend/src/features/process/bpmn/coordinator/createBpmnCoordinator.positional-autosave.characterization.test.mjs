import test from "node:test";
import assert from "node:assert/strict";

import createBpmnStore from "../store/createBpmnStore.js";
import { fnv1aHex } from "../lib/bpmnXmlHash.js";
import createBpmnCoordinator from "./createBpmnCoordinator.js";

// ---------------------------------------------------------------------------
// Characterization contour canvas-save-hot-path-v1 (Группа 2, коммит 4).
//
// BASELINE (коммиты 1-3): позиционная команда проходит staging
// (STAGE_POSITIONAL_CHANGE с reason "positional_command"), но autosave
// запрошен не был — чисто-positional drag заканчивался БЕЗ final-flush
// (замер: >60с молчания после drag-end).
//
// НОВОЕ ПОВЕДЕНИЕ (коммит 4, RC7): завершённые positional-изменения
// приводят к autosave-flush:
//   - standalone positional-серия (без drag-событий) → keep-latest throttle
//     на dragFinalDebounceMs → flushSave("autosave");
//   - positional drag → notifyDragEnd → dragFinalTimer → flushSave("autosave");
//   - если XML фактически не изменился, skip-if-unchanged (#924) даёт 0 PUT.
// Семантика пропуска сериализации positional-кадров в staging (К1) не меняется.
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis;
}

const FRESH_XML = "<bpmn:definitions id=\"fresh\"/>";
const SAME_XML = "<bpmn:definitions id=\"same\"/>";

function createHarness(overrides = {}) {
  const store = overrides.store || createBpmnStore({
    xml: "<bpmn:definitions id=\"old\"/>",
    rev: 1,
    dirty: false,
    lastSavedRev: 1,
  });
  const saveRawCalls = [];
  const traces = [];
  let dragging = false;
  let changeCb = null;
  const runtimeXml = overrides.runtimeXml || FRESH_XML;
  const runtime = {
    getStatus: () => ({ ready: true, defs: true, token: 3 }),
    getXml: async (options = {}) => ({ ok: true, xml: runtimeXml, token: 3, options }),
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

function createUnchangedHarness() {
  // XML рантайма совпадает с последним сохранённым → skip-if-unchanged.
  return createHarness({
    store: createBpmnStore({
      xml: SAME_XML,
      rev: 1,
      dirty: false,
      lastSavedRev: 1,
      savedHash: fnv1aHex(SAME_XML),
    }),
    runtimeXml: SAME_XML,
  });
}

function eventsOf(traces, name) {
  return traces.filter((t) => t.event === name);
}

test("NEW: standalone positional series flushes one autosave after positional debounce", async () => {
  const { coordinator, fireCommand, saveRawCalls, traces } = createHarness();
  try {
    fireCommand("shape.move");
    fireCommand("elements.move");

    // Keep-latest throttle: серия коллапсируется в один flush.
    await sleep(150);

    const staged = eventsOf(traces, "STAGE_POSITIONAL_CHANGE");
    assert.equal(staged.length, 2, "both positional commands must reach staging");
    assert.ok(staged.every((t) => t.payload.reason === "positional_command"));

    // Обычный scheduleSave по-прежнему не вызывается для positional-команд.
    assert.equal(eventsOf(traces, "SAVE_SCHEDULED").length, 0, "positional path must not use the regular autosave schedule");
    // Но positional final-flush происходит через dragFinalDebounceMs.
    assert.equal(eventsOf(traces, "SAVE_PERSIST_STARTED").length, 1, "positional series must flush exactly once");
    assert.equal(saveRawCalls.length, 1, "positional series must hit persistence once");
    assert.equal(saveRawCalls[0].reason, "autosave");
  } finally {
    coordinator.destroy();
  }
});

test("NEW: positional-only drag flushes after drag end via dragFinalTimer", async () => {
  const { coordinator, fireCommand, saveRawCalls, traces, setDragging } = createHarness();
  try {
    setDragging(true);
    fireCommand("shape.move");
    fireCommand("elements.move");
    await sleep(100);
    assert.equal(saveRawCalls.length, 0, "no flush while dragging");

    setDragging(false);
    coordinator.notifyDragEnd();
    await sleep(150);

    assert.equal(saveRawCalls.length, 1, "positional drag end must flush one autosave");
    assert.equal(saveRawCalls[0].reason, "autosave");
    assert.equal(eventsOf(traces, "SAVE_PERSIST_STARTED").length, 1);
    assert.equal(eventsOf(traces, "SAVE_SCHEDULED").length, 0);
  } finally {
    coordinator.destroy();
  }
});

test("NEW: positional flush with unchanged XML is skipped by skip-if-unchanged (0 PUT)", async () => {
  const { coordinator, fireCommand, saveRawCalls, traces } = createUnchangedHarness();
  try {
    fireCommand("shape.move");
    await sleep(150);

    assert.equal(eventsOf(traces, "SAVE_PERSIST_SKIPPED_UNCHANGED").length, 1, "unchanged positional flush must be skipped");
    assert.equal(saveRawCalls.length, 0, "unchanged XML must produce zero PUT");
  } finally {
    coordinator.destroy();
  }
});

test("NEW: positional burst within debounce window collapses into a single flush", async () => {
  const { coordinator, fireCommand, saveRawCalls } = createHarness();
  try {
    for (let i = 0; i < 5; i += 1) {
      fireCommand("shape.move");
      await sleep(10);
    }
    await sleep(150);
    assert.equal(saveRawCalls.length, 1, "burst of positional frames must collapse into one flush");
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
