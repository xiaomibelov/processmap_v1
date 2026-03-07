import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeSelectionId,
  shouldClearSelectionInvisible,
  shouldClearSelectionMissing,
} from "./useDrawioSelection.js";

test("selection: normalizeSelectionId trims and handles empty input", () => {
  assert.equal(normalizeSelectionId(" shapeA "), "shapeA");
  assert.equal(normalizeSelectionId(""), "");
  assert.equal(normalizeSelectionId(null), "");
});

test("selection: clears when selected element is missing", () => {
  const elementMap = new Map([["shapeA", {}]]);
  assert.equal(shouldClearSelectionMissing("shapeA", elementMap), false);
  assert.equal(shouldClearSelectionMissing("shapeB", elementMap), true);
  assert.equal(shouldClearSelectionMissing("", elementMap), false);
});

test("selection: clears when resolve flags report non-visible selection", () => {
  const resolveVisible = () => ({ visible: true });
  const resolveHidden = () => ({ visible: false });
  assert.equal(shouldClearSelectionInvisible({
    selectedId: "shapeA",
    resolveElementFlags: resolveVisible,
    meta: {},
    layerMap: new Map(),
    elementMap: new Map(),
  }), false);
  assert.equal(shouldClearSelectionInvisible({
    selectedId: "shapeA",
    resolveElementFlags: resolveHidden,
    meta: {},
    layerMap: new Map(),
    elementMap: new Map(),
  }), true);
});
