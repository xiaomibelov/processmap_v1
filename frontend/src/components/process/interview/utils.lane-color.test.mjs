import test from "node:test";
import assert from "node:assert/strict";

import { laneColor } from "./utils.js";

test("laneColor: unique color per lane index (no repeats)", () => {
  const seen = new Set();
  for (let i = 1; i <= 200; i += 1) {
    const c = laneColor(`lane_${i}`, i);
    assert.equal(seen.has(c), false, `duplicate color at lane index ${i}: ${c}`);
    seen.add(c);
  }
});

test("laneColor: deterministic for same lane index", () => {
  const a = laneColor("cook_1", 7);
  const b = laneColor("cook_1", 7);
  assert.equal(a, b);
});

test("laneColor: deterministic fallback by key without index", () => {
  const a = laneColor("brigadir");
  const b = laneColor("brigadir");
  const c = laneColor("povar");
  assert.equal(a, b);
  assert.notEqual(a, c);
});
