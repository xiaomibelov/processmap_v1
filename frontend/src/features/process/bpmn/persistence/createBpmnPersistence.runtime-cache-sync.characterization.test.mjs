import test from "node:test";
import assert from "node:assert/strict";

import createBpmnPersistence from "./createBpmnPersistence.js";

// ---------------------------------------------------------------------------
// Characterization contour canvas-save-hot-path-v1 (Группа 3).
//
// BASELINE: createBpmnPersistence.js writeRuntimeCache вызывает
// window.localStorage.setItem НЕМЕДЛЕННО, в том же синхронном тике, что и
// вызов cacheRaw (createBpmnPersistence.js:196-222). Никакой отложенной
// записи (queue / requestIdleCallback / setTimeout) нет. Контур намеренно
// меняет hot-path записи в runtime cache, поэтому тест фиксирует текущее
// синхронное поведение.
// ---------------------------------------------------------------------------

function installFakeWindow() {
  const setItemCalls = [];
  const fakeWindow = {
    localStorage: {
      setItem: (key, value) => {
        setItemCalls.push({ key, value: String(value) });
      },
      getItem: () => null,
    },
  };
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, "window");
  const prevWindow = globalThis.window;
  globalThis.window = fakeWindow;
  return {
    setItemCalls,
    restore() {
      if (hadWindow) globalThis.window = prevWindow;
      else delete globalThis.window;
    },
  };
}

test("CURRENT: cacheRaw writes window.localStorage synchronously in the same tick", () => {
  const env = installFakeWindow();
  try {
    const persistence = createBpmnPersistence({});
    const xml = "<bpmn:definitions id=\"cache_sync\"/>";

    // Синхронный вызов — БЕЗ await до проверки записи.
    const result = persistence.cacheRaw("sid_cache_sync", xml, 7, "runtime_change");

    // КЛЮЧЕВАЯ ФИКСАЦИЯ: setItem уже вызван в этом же тике.
    assert.equal(env.setItemCalls.length, 1, "localStorage.setItem must fire synchronously inside cacheRaw");
    assert.equal(env.setItemCalls[0].key, "fpc_bpmn_runtime_cache:sid_cache_sync");
    const payload = JSON.parse(env.setItemCalls[0].value);
    assert.equal(payload.xml, xml);
    assert.equal(payload.rev, 7);
    assert.equal(payload.reason, "runtime_change");
    assert.equal(typeof payload.ts, "number");
    assert.ok(payload.hash.length === 8, "payload carries fnv1a hash");

    assert.equal(result.ok, true);
    assert.equal(result.rev, 7);
  } finally {
    env.restore();
  }
});

test("CURRENT: repeated cacheRaw calls each hit localStorage synchronously (no coalescing)", () => {
  const env = installFakeWindow();
  try {
    const persistence = createBpmnPersistence({});
    persistence.cacheRaw("sid_cache_many", "<a/>", 1, "runtime_change");
    persistence.cacheRaw("sid_cache_many", "<b/>", 2, "runtime_change");
    persistence.cacheRaw("sid_cache_many", "<c/>", 3, "flush_save");

    assert.equal(env.setItemCalls.length, 3, "every cacheRaw writes through immediately, no batching");
    assert.deepEqual(
      env.setItemCalls.map((c) => JSON.parse(c.value).rev),
      [1, 2, 3],
    );
  } finally {
    env.restore();
  }
});

test("EDGE: cacheRaw without window is a graceful no-op", () => {
  const persistence = createBpmnPersistence({});
  const result = persistence.cacheRaw("sid_no_window", "<a/>", 1, "runtime_change");
  assert.equal(result.ok, false);
});
