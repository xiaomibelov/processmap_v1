import assert from "node:assert/strict";
import test from "node:test";

import {
  PANEL_GROUP_IDS,
  PANEL_GROUPS_STORAGE_KEY,
  createDefaultPanelGroupsState,
  loadPanelGroupsState,
  savePanelGroupsState,
  togglePanelGroup,
} from "./panelGroupsModel.js";

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test("panel groups: four documented groups exist", () => {
  assert.deepEqual(PANEL_GROUP_IDS, ["displayMode", "v2Mode", "fields", "toBe"]);
});

test("panel groups: default state = all expanded", () => {
  const state = createDefaultPanelGroupsState();
  PANEL_GROUP_IDS.forEach((id) => assert.equal(state[id], true, `${id} must default to expanded`));
});

test("panel groups: toggle flips a single group, keeps others", () => {
  const next = togglePanelGroup(createDefaultPanelGroupsState(), "fields");
  assert.equal(next.fields, false);
  assert.equal(next.displayMode, true);
  assert.equal(next.toBe, true);
  // toggle back
  assert.equal(togglePanelGroup(next, "fields").fields, true);
});

test("panel groups: unknown group id is a no-op", () => {
  const state = createDefaultPanelGroupsState();
  assert.equal(togglePanelGroup(state, "nope"), state);
});

test("panel groups: load/save roundtrip via storage", () => {
  const storage = fakeStorage();
  savePanelGroupsState(storage, { displayMode: false, v2Mode: true, fields: false, toBe: true });
  const loaded = loadPanelGroupsState(storage);
  assert.deepEqual(loaded, { displayMode: false, v2Mode: true, fields: false, toBe: true });
});

test("panel groups: corrupt/missing storage falls back to defaults", () => {
  const storage = fakeStorage();
  storage.setItem(PANEL_GROUPS_STORAGE_KEY, "{broken");
  assert.deepEqual(loadPanelGroupsState(storage), createDefaultPanelGroupsState());
  storage.setItem(PANEL_GROUPS_STORAGE_KEY, JSON.stringify({ displayMode: false, junk: 1 }));
  const loaded = loadPanelGroupsState(storage);
  assert.equal(loaded.displayMode, false);
  assert.equal(loaded.fields, true, "missing keys fall back to expanded");
  assert.equal(loadPanelGroupsState(null).toBe, true);
});
