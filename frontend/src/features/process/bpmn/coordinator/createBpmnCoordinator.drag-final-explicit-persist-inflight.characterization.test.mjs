import test from "node:test";
import assert from "node:assert/strict";

import createBpmnCoordinator from "./createBpmnCoordinator.js";

// ---------------------------------------------------------------------------
// Characterization contour canvas-save-hot-path-v1 (дельта-ревью, F3-residual):
// drag-end, пришедшийся на in-flight property-Persist (persistExplicitXml),
// не должен залипать без drag-final таймера.
//
// Сценарий находки: persistExplicitXml держит тот же saveInFlight, но его
// finally снимает флаг без armDragFinalTimer() — pendingPositionalChange,
// выставленный drag-end'ом во время property PUT, остаётся без таймера и не
// перепроверяется. Контракт: после снятия saveInFlight (finally
// persistExplicitXml) drag-final таймер до-вооружается, если pending-флаги
// ещё стоят (зеркально finally flushSave, F3).
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

test("drag-end during in-flight property-persist re-arms drag-final flush after explicit persist completes", async () => {
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
    getSessionId: () => "sid_drag_explicit_inflight",
    debounceMs: 10_000,
    getIsDragging: () => dragging,
    dragThrottleMs: 10,
    dragFinalDebounceMs: 20,
    persistence: {
      saveRaw: async (sid, xml, rev, reason) => {
        persistCalls.push({ sid, xml, rev, reason });
        if (persistCalls.length === 1) {
          // property PUT «в полёте» — держим его (property-панель на большой
          // диаграмме: секунды).
          await putInFlight;
        }
        return { ok: true, storedRev: rev, hash: "hash" };
      },
      cacheRaw: () => ({ ok: true }),
      loadRaw: async () => ({ ok: true, xml: "", rev: 0 }),
    },
  });
  coordinator.bindRuntime(createRuntime(runtimeHooks));

  // Drag в процессе: positional-команда выставляет pendingPositionalChange
  // (через staging, без таймера во время drag'а).
  dragging = true;
  runtimeHooks.onChangeCb?.({ command: "shape.move" });
  await new Promise((resolve) => setImmediate(resolve));

  // Property-панель стартует persistExplicitXml, пока drag идёт.
  const persistPromise = coordinator.persistExplicitXml(
    "<bpmn:definitions><bpmn:process id='P1'/></bpmn:definitions>",
    "property_persist",
    {},
  );
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(persistCalls.length, 1, "property persist must be in flight");

  // Mouseup при property PUT в полёте: pre-fix таймер не взводится
  // (saveInFlight), и finally persistExplicitXml флаг не перепроверяет.
  dragging = false;
  coordinator.notifyDragEnd();

  // Даём dragFinalDebounceMs пройти при ещё незавершённом property PUT —
  // флашить рано.
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(
    persistCalls.length,
    1,
    "no flush while the property persist is still in flight",
  );

  releasePut();
  await persistPromise;
  // finally persistExplicitXml → re-arm drag-final timer → debounce → flush.
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(
    persistCalls.length,
    2,
    "drag-final flush must happen after the in-flight property persist completes",
  );
  assert.equal(persistCalls[1].reason, "autosave");

  coordinator.destroy();
});
