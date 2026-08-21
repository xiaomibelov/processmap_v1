import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeRuntimeResizeDimension,
  readRuntimeResizableSize,
  resolveRuntimeResizeSurface,
} from "./drawioRuntimeGeometry.js";

test("drawio runtime geometry resolves box resize surface for runtime rect snapshots", () => {
  const snapshot = {
    tagName: "rect",
    attrs: { width: "120", height: "60" },
  };
  assert.equal(resolveRuntimeResizeSurface(snapshot), "box");
  assert.deepEqual(readRuntimeResizableSize(snapshot), { width: 120, height: 60 });
});

test("drawio runtime geometry clamps resize dimensions into safe numeric range", () => {
  assert.equal(normalizeRuntimeResizeDimension("240", 120), 240);
  assert.equal(normalizeRuntimeResizeDimension("", 120), 120);
  assert.equal(normalizeRuntimeResizeDimension("-4", 120), 24);
  assert.equal(normalizeRuntimeResizeDimension("9999", 120), 1600);
});
