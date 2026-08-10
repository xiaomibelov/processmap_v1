import assert from "node:assert/strict";
import test from "node:test";

import { analyticsColorForLabel, computeBarHeights } from "./analyticsColorModel.js";

test("analyticsColorForLabel maps server color labels", () => {
  assert.equal(analyticsColorForLabel("real_work"), "#10b981");
  assert.equal(analyticsColorForLabel("abandoned"), "#f59e0b");
  assert.equal(analyticsColorForLabel("neutral"), "#94a3b8");
  assert.equal(analyticsColorForLabel("unknown"), "#94a3b8");
  assert.equal(analyticsColorForLabel(""), "#94a3b8");
});

test("computeBarHeights normalizes to max count", () => {
  const bins = [{ count: 10 }, { count: 40 }, { count: 20 }];
  assert.deepEqual(computeBarHeights(bins, 120), [30, 120, 60]);
});

test("computeBarHeights: all-zero and empty inputs", () => {
  assert.deepEqual(computeBarHeights([{ count: 0 }, { count: 0 }], 120), [0, 0]);
  assert.deepEqual(computeBarHeights([], 120), []);
  assert.deepEqual(computeBarHeights(null, 120), []);
});

test("computeBarHeights: missing counts are zero, max caps the tallest bar", () => {
  const bins = [{ count: 5 }, {}, { count: 25 }];
  const heights = computeBarHeights(bins, 100);
  assert.equal(heights[0], 20);
  assert.equal(heights[1], 0);
  assert.equal(heights[2], 100);
});
