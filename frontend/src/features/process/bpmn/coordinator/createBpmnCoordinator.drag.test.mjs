import test from "node:test";
import assert from "node:assert/strict";

import createBpmnCoordinator from "./createBpmnCoordinator.js";

// The coordinator uses window.setTimeout; polyfill for node test runner.
if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis;
}

function createStore(initial = {}) {
  let state = {
    xml: "<bpmn:definitions/>",
    rev: 1,
    dirty: false,
    lastSavedRev: 0,
    lastHash: "",
    ...initial,
  };
  return {
    getState: () => state,
    setXml: (xml, source, options = {}) => {
      state = {
        ...state,
        xml,
        dirty: options?.dirty !== false,
        rev: options?.bumpRev === false ? state.rev : state.rev + 1,
      };
      return state;
    },
    markSaved: (rev, hash) => {
      state = { ...state, lastSavedRev: rev, lastHash: hash, dirty: false };
    },
  };
}

function createRuntime() {
  let token = 1;
  return {
    getStatus: () => ({ ready: true, defs: true, token }),
    getXml: async () => ({ ok: true, xml: "<bpmn:definitions/>", token }),
    onChange: (cb) => {
      // not used in these tests
      return () => {};
    },
    onStatus: () => () => {},
  };
}

test("does not flush autosave while dragging and coalesces into throttle/final debounce", async () => {
  const store = createStore();
  const persistCalls = [];
  let dragging = false;
  const coordinator = createBpmnCoordinator({
    store,
    getRuntime: createRuntime,
    getSessionId: () => "sid_drag",
    debounceMs: 10_000,
    getIsDragging: () => dragging,
    dragThrottleMs: 100,
    dragFinalDebounceMs: 20,
    persistence: {
      saveRaw: async (sid, xml, rev, reason) => {
        persistCalls.push({ sid, xml, rev, reason });
        return { ok: true, storedRev: rev, hash: "hash" };
      },
      cacheRaw: () => ({ ok: true }),
      loadRaw: async () => ({ ok: true, xml: "", rev: 0 }),
    },
  });

  dragging = true;
  coordinator.scheduleSave("autosave");
  coordinator.scheduleSave("autosave");
  coordinator.scheduleSave("autosave");

  // Immediately after scheduling while dragging, no persist should have happened.
  assert.equal(persistCalls.length, 0);

  // Notify drag end before the throttle fires.
  coordinator.notifyDragEnd();

  // Wait for the final debounce.
  await new Promise((resolve) => setTimeout(resolve, 60));

  // Exactly one flush should have happened after drag end.
  assert.equal(persistCalls.length, 1);
  assert.equal(persistCalls[0].reason, "autosave");

  coordinator.destroy();
});

test("throttle allows at most one autosave per dragThrottleMs while dragging", async () => {
  const store = createStore();
  const persistCalls = [];
  let dragging = false;
  const coordinator = createBpmnCoordinator({
    store,
    getRuntime: createRuntime,
    getSessionId: () => "sid_drag_throttle",
    debounceMs: 10_000,
    getIsDragging: () => dragging,
    dragThrottleMs: 80,
    dragFinalDebounceMs: 20,
    persistence: {
      saveRaw: async (sid, xml, rev, reason) => {
        persistCalls.push({ sid, xml, rev, reason });
        return { ok: true, storedRev: rev, hash: "hash" };
      },
      cacheRaw: () => ({ ok: true }),
      loadRaw: async () => ({ ok: true, xml: "", rev: 0 }),
    },
  });

  dragging = true;
  coordinator.scheduleSave("autosave");
  await new Promise((resolve) => setTimeout(resolve, 30));
  coordinator.scheduleSave("autosave");
  await new Promise((resolve) => setTimeout(resolve, 30));
  coordinator.scheduleSave("autosave");
  await new Promise((resolve) => setTimeout(resolve, 80));

  // First throttle window should have fired exactly once.
  assert.equal(persistCalls.length, 1);

  // More changes in the same drag should start a new throttle window.
  coordinator.scheduleSave("autosave");
  await new Promise((resolve) => setTimeout(resolve, 120));

  assert.equal(persistCalls.length, 2);

  coordinator.destroy();
});

test("non-drag autosave still uses debounceMs", async () => {
  const store = createStore();
  const persistCalls = [];
  const coordinator = createBpmnCoordinator({
    store,
    getRuntime: createRuntime,
    getSessionId: () => "sid_no_drag",
    debounceMs: 40,
    getIsDragging: () => false,
    dragThrottleMs: 100,
    dragFinalDebounceMs: 20,
    persistence: {
      saveRaw: async (sid, xml, rev, reason) => {
        persistCalls.push({ sid, xml, rev, reason });
        return { ok: true, storedRev: rev, hash: "hash" };
      },
      cacheRaw: () => ({ ok: true }),
      loadRaw: async () => ({ ok: true, xml: "", rev: 0 }),
    },
  });

  coordinator.scheduleSave("autosave");
  assert.equal(persistCalls.length, 0);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(persistCalls.length, 1);

  coordinator.destroy();
});
