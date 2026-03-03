import assert from "node:assert/strict";
import test from "node:test";

import {
  applyHybridModeTransition,
  applyHybridVisibilityTransition,
  getHybridUiStorageKey,
  loadHybridUiPrefs,
  normalizeHybridLayerMap,
  normalizeHybridUiPrefs,
  saveHybridUiPrefs,
} from "./hybridLayerUi.js";

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(String(key), String(value));
    },
  };
}

test("normalizeHybridUiPrefs: maps mode and opacity presets", () => {
  const prefs = normalizeHybridUiPrefs({
    visible: 1,
    mode: "EDIT",
    opacity: 53,
    lock: "1",
    focus: 1,
  });
  assert.deepEqual(prefs, {
    visible: true,
    mode: "edit",
    opacity: 60,
    lock: true,
    focus: true,
  });
});

test("load/save prefs roundtrip with per-user key", () => {
  const storage = createMemoryStorage();
  const key = getHybridUiStorageKey("u_123");
  const saved = saveHybridUiPrefs(storage, key, {
    visible: true,
    mode: "view",
    opacity: 30,
    lock: false,
    focus: true,
  }, "u_123");
  assert.equal(saved, true);
  const loaded = loadHybridUiPrefs(storage, key, "u_123");
  assert.deepEqual(loaded, {
    visible: true,
    mode: "view",
    opacity: 30,
    lock: false,
    focus: true,
  });
  const loadedAnon = loadHybridUiPrefs(storage, key, "u_other");
  assert.deepEqual(loadedAnon, {
    visible: false,
    mode: "view",
    opacity: 60,
    lock: false,
    focus: false,
  });
});

test("transitions Hidden -> View -> Edit keep deterministic shape", () => {
  const hidden = normalizeHybridUiPrefs({});
  const view = applyHybridVisibilityTransition(hidden, true);
  const edit = applyHybridModeTransition(view, "edit");
  assert.equal(view.visible, true);
  assert.equal(view.mode, "view");
  assert.equal(edit.visible, true);
  assert.equal(edit.mode, "edit");
});

test("normalizeHybridLayerMap accepts dx/dy and x/y aliases", () => {
  const map = normalizeHybridLayerMap({
    Task_A: { dx: 12, dy: -8 },
    Task_B: { x: "5", y: "-3" },
  });
  assert.deepEqual(map, {
    Task_A: { dx: 12, dy: -8 },
    Task_B: { dx: 5, dy: -3 },
  });
});
