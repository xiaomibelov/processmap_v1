import test from "node:test";
import assert from "node:assert/strict";

import createBpmnCoordinator from "./createBpmnCoordinator.js";

// ---------------------------------------------------------------------------
// Characterization contour canvas-save-hot-path-v1 (ревью-фикс F3):
// drag-end, пришедшийся на in-flight PUT, не должен залипать без таймера.
//
// Сценарий находки: notifyDragEnd не взводит dragFinalTimer при saveInFlight,
// pendingPositionalChange остаётся без таймера и не перепроверяется после PUT
// → гарантия «drag → PUT ≤2с» нарушается, изменение сидит до следующего
// действия пользователя. Контракт: после снятия saveInFlight (finally
// flushSave) drag-final таймер до-вооружается, если pending-флаги ещё стоят.
// Positional-флаг выставляется реальным путем: runtime.onChange → staging
// (positional command) → notifyPositionalPending → notePositionalChange.
// ---------------------------------------------------------------------------

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
        source,
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

function createRuntime(hooks = {}) {
  return {
    getStatus: () => ({ ready: true, defs: true, token: 1 }),
    getXml: async () => ({ ok: true, xml: "<bpmn:definitions/>", token: 1 }),
    onChange: (cb) => {
      hooks.onChangeCb = cb;
      return () => {};
    },
    onStatus: () => () => {},
  };
}

test("drag-end during in-flight PUT re-arms drag-final flush after PUT completes", async () => {
  const store = createStore();
  const persistCalls = [];
  const runtimeHooks = {};
  let dragging = false;
  let releasePut;
  const putInFlight = new Promise((resolve) => {
    releasePut = resolve;
  });
  const coordinator = createBpmnCoordinator({
    store,
    getRuntime: () => createRuntime(runtimeHooks),
    getSessionId: () => "sid_drag_inflight",
    debounceMs: 10_000,
    getIsDragging: () => dragging,
    dragThrottleMs: 10,
    dragFinalDebounceMs: 20,
    persistence: {
      saveRaw: async (sid, xml, rev, reason) => {
        persistCalls.push({ sid, xml, rev, reason });
        if (persistCalls.length === 1) {
          // Первый PUT «в полёте» ~1-2с на больших диаграммах — держим его.
          await putInFlight;
        }
        return { ok: true, storedRev: rev, hash: "hash" };
      },
      cacheRaw: () => ({ ok: true }),
      loadRaw: async () => ({ ok: true, xml: "", rev: 0 }),
    },
  });
  coordinator.bindRuntime(createRuntime(runtimeHooks));

  dragging = true;
  coordinator.scheduleSave("autosave");
  // Throttle-таймер firing → flushSave стартует, saveRaw ушёл в полёт.
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(persistCalls.length, 1, "drag-throttle flush must be in flight");

  // Пользователь доводит shape до конца drag'а, пока PUT в полёте: positional
  // команда выставляет pendingPositionalChange (через staging, без таймера
  // во время drag'а).
  runtimeHooks.onChangeCb?.({ command: "shape.move" });
  await new Promise((resolve) => setImmediate(resolve));

  // Mouseup при PUT в полёте: pre-fix таймер не взводится (saveInFlight).
  dragging = false;
  coordinator.notifyDragEnd();

  // Даём dragFinalDebounceMs пройти при ещё незавершённом PUT — флашить рано.
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(persistCalls.length, 1, "no flush while the PUT is still in flight");

  releasePut();
  // finally flushSave → re-arm drag-final timer → debounce → второй flush.
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(
    persistCalls.length,
    2,
    "drag-final flush must happen after the in-flight PUT completes",
  );
  assert.equal(persistCalls[1].reason, "autosave");

  coordinator.destroy();
});
