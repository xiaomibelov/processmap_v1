import assert from "node:assert/strict";
import test from "node:test";

import { GHOST_VISIBILITY_STORAGE_KEY } from "./ghostVisibilityStorage.js";
import {
  getGhostVisibility,
  hydrateGhostVisibility,
  setGhostVisibility,
  subscribeTobeOverlayUnderlay,
} from "./tobeOverlayUnderlayStore.js";

// T2: ghost-видимость в store — lazy-hydrate из localStorage (без side-effect
// при импорте), set с normalize + persist, нотификация слушателей.
// Тесты инжектят memory-storage — реальный localStorage не трогаем.

function makeMemoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    dump: () => Object.fromEntries(map),
  };
}

test("store.ghost: дефолт medium при пустом storage", () => {
  const storage = makeMemoryStorage();
  assert.equal(hydrateGhostVisibility(storage), "medium");
  assert.equal(getGhostVisibility(), "medium");
});

test("store.ghost: set('strong') → getter 'strong' + write в storage", () => {
  const storage = makeMemoryStorage();
  hydrateGhostVisibility(storage);

  const next = setGhostVisibility("strong", storage);
  assert.equal(next, "strong");
  assert.equal(getGhostVisibility(), "strong");
  assert.equal(storage.dump()[GHOST_VISIBILITY_STORAGE_KEY], "strong");
});

test("store.ghost: set('bogus') → normalize в medium", () => {
  const storage = makeMemoryStorage();
  hydrateGhostVisibility(storage);

  setGhostVisibility("bogus", storage);
  assert.equal(getGhostVisibility(), "medium");
  assert.equal(storage.dump()[GHOST_VISIBILITY_STORAGE_KEY], "medium");
});

test("store.ghost: изменение пресета нотифицирует подписчиков", () => {
  const storage = makeMemoryStorage();
  hydrateGhostVisibility(storage);

  let calls = 0;
  const unsubscribe = subscribeTobeOverlayUnderlay(() => {
    calls += 1;
  });
  setGhostVisibility("faint", storage);
  assert.equal(calls, 1);
  setGhostVisibility("bogus", storage);
  assert.equal(calls, 2);
  unsubscribe();
  setGhostVisibility("strong", storage);
  assert.equal(calls, 2);
});
