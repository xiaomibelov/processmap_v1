import test from "node:test";
import assert from "node:assert/strict";

import {
  createInitialState,
  reduce,
  selectMode,
} from "./bpmnVersionCompareSelection.js";

test("createInitialState returns empty selection", () => {
  assert.deepEqual(createInitialState(), {
    previewId: null,
    compareAId: null,
    compareBId: null,
  });
});

test("preview action sets previewId", () => {
  const state = reduce(createInitialState(), { type: "preview", id: "v1" });
  assert.equal(state.previewId, "v1");
  assert.equal(state.compareAId, null);
  assert.equal(state.compareBId, null);
  assert.equal(selectMode(state), "single");
});

test("assign fills A and B slots independently", () => {
  let state = reduce(createInitialState(), { type: "assign", slot: "A", id: "v1" });
  state = reduce(state, { type: "assign", slot: "B", id: "v2" });
  assert.equal(state.compareAId, "v1");
  assert.equal(state.compareBId, "v2");
  assert.equal(selectMode(state), "compare");
});

test("assign of id already in the other slot swaps slots", () => {
  let state = reduce(createInitialState(), { type: "assign", slot: "A", id: "v1" });
  state = reduce(state, { type: "assign", slot: "B", id: "v2" });
  state = reduce(state, { type: "assign", slot: "A", id: "v2" });
  assert.equal(state.compareAId, "v2");
  assert.equal(state.compareBId, "v1");
  assert.notEqual(state.compareAId, state.compareBId);
});

test("assign same id to same slot toggles it off", () => {
  let state = reduce(createInitialState(), { type: "assign", slot: "A", id: "v1" });
  state = reduce(state, { type: "assign", slot: "A", id: "v1" });
  assert.equal(state.compareAId, null);
});

test("toggle off B keeps A and mode becomes single only via preview", () => {
  let state = reduce(createInitialState(), { type: "assign", slot: "A", id: "v1" });
  state = reduce(state, { type: "assign", slot: "B", id: "v2" });
  state = reduce(state, { type: "assign", slot: "B", id: "v2" });
  assert.equal(state.compareAId, "v1");
  assert.equal(state.compareBId, null);
  assert.equal(selectMode(state), null);
});

test("clear removes only the requested slot", () => {
  let state = reduce(createInitialState(), { type: "assign", slot: "A", id: "v1" });
  state = reduce(state, { type: "assign", slot: "B", id: "v2" });
  state = reduce(state, { type: "clear", slot: "A" });
  assert.equal(state.compareAId, null);
  assert.equal(state.compareBId, "v2");
});

test("clear on empty slot is a no-op", () => {
  const state = reduce(createInitialState(), { type: "clear", slot: "B" });
  assert.deepEqual(state, createInitialState());
});

test("reset restores initial state", () => {
  let state = reduce(createInitialState(), { type: "preview", id: "v1" });
  state = reduce(state, { type: "assign", slot: "A", id: "v1" });
  state = reduce(state, { type: "assign", slot: "B", id: "v2" });
  state = reduce(state, { type: "reset" });
  assert.deepEqual(state, createInitialState());
  assert.equal(selectMode(state), null);
});

test("invariant A !== B holds across mixed assign sequence", () => {
  let state = createInitialState();
  const ids = ["v1", "v2", "v3", "v4"];
  const slots = ["A", "B", "A", "B", "A", "B"];
  slots.forEach((slot, i) => {
    state = reduce(state, { type: "assign", slot, id: ids[i % ids.length] });
    if (state.compareAId && state.compareBId) {
      assert.notEqual(state.compareAId, state.compareBId);
    }
  });
});

test("assign after swap from empty other slot just fills the slot", () => {
  let state = reduce(createInitialState(), { type: "assign", slot: "B", id: "v1" });
  assert.equal(state.compareBId, "v1");
  state = reduce(state, { type: "assign", slot: "A", id: "v2" });
  assert.equal(state.compareAId, "v2");
  assert.equal(state.compareBId, "v1");
});

test("unknown action type returns state unchanged", () => {
  const state = reduce(createInitialState(), { type: "nope" });
  assert.deepEqual(state, createInitialState());
});
