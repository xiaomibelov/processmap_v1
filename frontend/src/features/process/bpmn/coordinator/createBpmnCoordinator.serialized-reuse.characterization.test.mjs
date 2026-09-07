import test from "node:test";
import assert from "node:assert/strict";

import createBpmnCoordinator from "./createBpmnCoordinator.js";

// ---------------------------------------------------------------------------
// Characterization contour canvas-save-hot-path-v1 (ревью-фикс F2):
// probe-reuse последней flush-сериализации (getLastSerializedXml) обязан
// отклоняться, если store с момента сериализации сдвинулся (rev).
//
// Сценарий находки: autosave-flush сериализовал в T0 → structural-правка в
// T0+δ → ручное сохранение <1с reuse'ит stale XML в xmlOverride →
// hash(override) == savedHash → SAVE_PERSIST_SKIPPED_UNCHANGED: Ctrl+S
// молча no-op'ает, последняя правка теряется при закрытии до autosave.
// Контракт: recordSerializedXml фиксирует store rev на момент сериализации,
// getLastSerializedXml возвращает null при расхождении текущего rev.
// ---------------------------------------------------------------------------

if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis;
}

function createStore(initial = {}) {
  let state = {
    xml: "<bpmn:definitions id=\"orig\"/>",
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

function createRuntime() {
  return {
    getStatus: () => ({ ready: true, defs: true, token: 1 }),
    getXml: async () => ({ ok: true, xml: "<bpmn:definitions id=\"serialized\"/>", token: 1 }),
    onChange: () => () => {},
    onStatus: () => () => {},
  };
}

function createHarness(store) {
  const persistCalls = [];
  const coordinator = createBpmnCoordinator({
    store,
    getRuntime: createRuntime,
    getSessionId: () => "sid_reuse",
    debounceMs: 10_000,
    getIsDragging: () => false,
    persistence: {
      saveRaw: async (sid, xml, rev, reason) => {
        persistCalls.push({ sid, xml, rev, reason });
        return { ok: true, storedRev: rev, hash: "hash" };
      },
      cacheRaw: () => ({ ok: true }),
      loadRaw: async () => ({ ok: true, xml: "", rev: 0 }),
    },
  });
  return { coordinator, persistCalls };
}

test("fresh reuse accepted: probe right after flush gets the serialized XML", async () => {
  const store = createStore();
  const { coordinator, persistCalls } = createHarness(store);

  const flushed = await coordinator.flushSave("autosave");
  assert.equal(flushed?.ok, true);
  assert.equal(persistCalls.length, 1);

  const fresh = coordinator.getLastSerializedXml({ maxAgeMs: 1000 });
  assert.ok(fresh, "fresh serialization must be reusable within the freshness window");
  assert.equal(fresh.xml, "<bpmn:definitions id=\"serialized\"/>");

  coordinator.destroy();
});

test("stale reuse rejected: store rev moved after serialization → null", async () => {
  const store = createStore();
  const { coordinator } = createHarness(store);

  await coordinator.flushSave("autosave");
  assert.ok(coordinator.getLastSerializedXml({ maxAgeMs: 1000 }), "precondition: reuse available");

  // Structural-правка моделера немедленно доходит в store через staging
  // (source runtime_change, bumpRev) — сериализация T0 больше не актуальна.
  store.setXml("<bpmn:definitions id=\"edited\"/>", "runtime_change", { bumpRev: true, dirty: true });

  const stale = coordinator.getLastSerializedXml({ maxAgeMs: 1000 });
  assert.equal(stale, null, "reuse must be rejected once the store moved since serialization");

  coordinator.destroy();
});

test("flush_save store write (bumpRev:false) does not break legitimate reuse", async () => {
  const store = createStore();
  const { coordinator } = createHarness(store);

  await coordinator.flushSave("autosave");
  // doFlush пишет formatted XML обратно в store с bumpRev:false — это та же
  // ревизия, legitimate reuse обязан остаться доступным.
  const after = coordinator.getLastSerializedXml({ maxAgeMs: 1000 });
  assert.ok(after, "flush_save write must not invalidate reuse (same store rev)");
  assert.equal(typeof after.rev, "number", "record must expose the recorded store rev");

  coordinator.destroy();
});
