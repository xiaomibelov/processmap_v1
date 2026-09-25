import assert from "node:assert/strict";
import test from "node:test";

import { normalizeGhostVisibility } from "./ghostVisibilityPresets.js";
import {
  GHOST_VISIBILITY_STORAGE_KEY,
  readGhostVisibility,
  writeGhostVisibility,
} from "./ghostVisibilityStorage.js";

// T1: persist пресета видимости ghost-подложки в localStorage.
// Контракт: read/write НЕ бросают наружу (try/catch по образцу
// overlayPanVisibilityStorage.js); значение — plain-строка пресета.

function makeMemoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
    dump: () => Object.fromEntries(map),
  };
}

test("storage: ключ константа tobe_underlay_ghost_visibility", () => {
  assert.equal(GHOST_VISIBILITY_STORAGE_KEY, "tobe_underlay_ghost_visibility");
});

test("storage: write→read roundtrip", () => {
  const storage = makeMemoryStorage();
  assert.equal(writeGhostVisibility("strong", storage), true);
  assert.equal(readGhostVisibility(storage), "strong");
  assert.equal(storage.dump()[GHOST_VISIBILITY_STORAGE_KEY], "strong");
});

test("storage: невалидное значение читается как есть, normalize ведёт в medium", () => {
  // Контракт: readGhostVisibility не валидирует — валидность обеспечивает
  // normalizeGhostVisibility на стороне потребителя (store → medium).
  const storage = makeMemoryStorage({ [GHOST_VISIBILITY_STORAGE_KEY]: "{corrupt" });
  assert.equal(readGhostVisibility(storage), "{corrupt");
  assert.equal(normalizeGhostVisibility(readGhostVisibility(storage)), "medium");
});

test("storage: getItem бросает → read возвращает null, не throw", () => {
  const storage = {
    getItem() {
      throw new Error("SecurityError");
    },
  };
  assert.equal(readGhostVisibility(storage), null);
});

test("storage: setItem бросает SecurityError → write возвращает false, не throw", () => {
  const storage = {
    setItem() {
      const error = new Error("denied");
      error.name = "SecurityError";
      throw error;
    },
  };
  assert.equal(writeGhostVisibility("faint", storage), false);
});

test("storage: quota-error на write → false после retry, не throw", () => {
  const storage = {
    setItem() {
      const error = new Error("quota");
      error.name = "QuotaExceededError";
      throw error;
    },
  };
  assert.equal(writeGhostVisibility("medium", storage), false);
});

test("storage: quota-error только на первой попытке → retry успешен", () => {
  let attempts = 0;
  const backing = makeMemoryStorage();
  const storage = {
    setItem(key, value) {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error("quota");
        error.name = "QuotaExceededError";
        throw error;
      }
      backing.setItem(key, value);
    },
  };
  assert.equal(writeGhostVisibility("medium", storage), true);
  assert.equal(backing.getItem(GHOST_VISIBILITY_STORAGE_KEY), "medium");
});

test("storage: без DOM и без инжекта — read null, write false, не throw", () => {
  assert.equal(readGhostVisibility(), null);
  assert.equal(writeGhostVisibility("faint"), false);
});
