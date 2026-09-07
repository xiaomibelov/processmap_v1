import test from "node:test";
import assert from "node:assert/strict";

import createBpmnPersistence from "./createBpmnPersistence.js";

// ---------------------------------------------------------------------------
// Characterization contour canvas-save-hot-path-v1 (Группа 3).
//
// POST-CHANGE: createBpmnPersistence.js writeRuntimeCache уводит
// window.localStorage.setItem С ГОРЯЧЕГО ПУТИ: запись дебаунсится
// (keep-latest, окно RUNTIME_CACHE_WRITE_DEBOUNCE_MS), setItem срабатывает
// ровно один раз по таймеру с последним payload. В окне debounce данные в
// localStorage НЕ видны (readRuntimeCache не читает до flush). Потеря
// pending-записи при clear/shutdown ≤ окна debounce — допустимая по
// контракту CHANGES.md. Формат ключа/payload и читатели не изменились.
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 3000;

function installFakeWindow() {
  const store = new Map();
  const setItemCalls = [];
  const fakeWindow = {
    localStorage: {
      setItem: (key, value) => {
        setItemCalls.push({ key, value: String(value) });
        store.set(String(key), String(value));
      },
      getItem: (key) => (store.has(String(key)) ? String(store.get(String(key))) : null),
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("CURRENT: cacheRaw does NOT write localStorage synchronously in the call tick", async () => {
  const env = installFakeWindow();
  try {
    const persistence = createBpmnPersistence({});
    const xml = "<bpmn:definitions id=\"cache_sync\"/>";

    const result = persistence.cacheRaw("sid_cache_sync", xml, 7, "runtime_change");

    // КЛЮЧЕВАЯ ФИКСАЦИЯ: в тике вызова setItem НЕ вызван — запись ушла в debounce.
    assert.equal(env.setItemCalls.length, 0, "localStorage.setItem must NOT fire synchronously inside cacheRaw");

    assert.equal(result.ok, true);
    assert.equal(result.rev, 7);
    assert.equal(result.hash.length, 8, "scheduled descriptor carries fnv1a hash");

    await sleep(DEBOUNCE_MS + 100);
    assert.equal(env.setItemCalls.length, 1, "exactly one setItem after the debounce window");
    assert.equal(env.setItemCalls[0].key, "fpc_bpmn_runtime_cache:sid_cache_sync");
    const payload = JSON.parse(env.setItemCalls[0].value);
    assert.equal(payload.xml, xml);
    assert.equal(payload.rev, 7);
    assert.equal(payload.reason, "runtime_change");
    assert.equal(typeof payload.ts, "number");
    assert.ok(payload.hash.length === 8, "payload carries fnv1a hash");
  } finally {
    env.restore();
  }
});

test("CURRENT: repeated cacheRaw calls in one window coalesce to a single keep-latest setItem", async () => {
  const env = installFakeWindow();
  try {
    const persistence = createBpmnPersistence({});
    persistence.cacheRaw("sid_cache_many", "<a/>", 1, "runtime_change");
    persistence.cacheRaw("sid_cache_many", "<b/>", 2, "runtime_change");
    persistence.cacheRaw("sid_cache_many", "<c/>", 3, "flush_save");

    assert.equal(env.setItemCalls.length, 0, "no synchronous writes inside the debounce window");

    await sleep(DEBOUNCE_MS + 100);
    assert.equal(env.setItemCalls.length, 1, "three calls in one window → exactly one setItem");
    assert.deepEqual(
      env.setItemCalls.map((c) => JSON.parse(c.value).rev),
      [3],
      "keep-latest: only the last payload is written",
    );
    assert.equal(JSON.parse(env.setItemCalls[0].value).xml, "<c/>");
  } finally {
    env.restore();
  }
});

test("SAFETY: runtime cache is not readable before the debounce flush", async () => {
  const env = installFakeWindow();
  try {
    const persistence = createBpmnPersistence({});
    persistence.cacheRaw("sid_cache_safety", "<bpmn:definitions id=\"pending\"/>", 4, "runtime_change");

    // До flush записи нет: loadRaw без remote API не видит runtime cache.
    const loaded = await persistence.loadRaw("sid_cache_safety");
    assert.equal(loaded.ok, false, "pending write must not be observable before flush");

    await sleep(DEBOUNCE_MS + 100);
    const flushed = await persistence.loadRaw("sid_cache_safety");
    assert.equal(flushed.ok, true);
    assert.equal(flushed.source, "runtime_cache");
    assert.equal(flushed.xml, "<bpmn:definitions id=\"pending\"/>");
    assert.equal(flushed.rev, 4);
  } finally {
    env.restore();
  }
});

test("EDGE: cacheRaw without window is a graceful no-op", () => {
  const persistence = createBpmnPersistence({});
  const result = persistence.cacheRaw("sid_no_window", "<a/>", 1, "runtime_change");
  assert.equal(result.ok, false);
});
