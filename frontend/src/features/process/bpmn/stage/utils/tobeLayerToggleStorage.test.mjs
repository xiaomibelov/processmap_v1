import assert from "node:assert/strict";
import test from "node:test";

import { readTobeLayerEnabled, writeTobeLayerEnabled } from "./tobeLayerToggleStorage.js";

function setupMockLocalStorage() {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => { store.set(key, String(value)); },
      removeItem: (key) => { store.delete(key); },
    },
  };
  return store;
}

test("tobeLayerToggleStorage: defaults to false when nothing stored", () => {
  setupMockLocalStorage();
  assert.equal(readTobeLayerEnabled(), false);
});

test("tobeLayerToggleStorage: write true then read true", () => {
  const store = setupMockLocalStorage();
  writeTobeLayerEnabled(true);
  assert.equal(store.get("processmap_tobe_layer_enabled"), "true");
  assert.equal(readTobeLayerEnabled(), true);
});

test("tobeLayerToggleStorage: write false then read false", () => {
  setupMockLocalStorage();
  writeTobeLayerEnabled(true);
  writeTobeLayerEnabled(false);
  assert.equal(readTobeLayerEnabled(), false);
});

test("tobeLayerToggleStorage: storage errors fall back to false", () => {
  globalThis.window = {
    localStorage: {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("denied"); },
    },
  };
  assert.equal(readTobeLayerEnabled(), false);
  writeTobeLayerEnabled(true); // must not throw
});
