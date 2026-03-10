import test from "node:test";
import assert from "node:assert/strict";

import { resolveDrawioOverlayRenderMatrix } from "./drawioOverlayMatrix.js";

test("resolveDrawioOverlayRenderMatrix prefers live getter over stale prop matrix", () => {
  const staleProp = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const live = { a: 1.2, b: 0, c: 0, d: 1.2, e: -116.4, f: -53.1 };
  const result = resolveDrawioOverlayRenderMatrix({
    overlayMatrix: staleProp,
    overlayMatrixRef: { current: staleProp },
    getOverlayMatrix: () => live,
  });
  assert.deepEqual(result, live);
});

test("resolveDrawioOverlayRenderMatrix falls back to ref when getter is unavailable", () => {
  const staleProp = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const liveRef = { a: 0.8, b: 0, c: 0, d: 0.8, e: 48, f: 21 };
  const result = resolveDrawioOverlayRenderMatrix({
    overlayMatrix: staleProp,
    overlayMatrixRef: { current: liveRef },
  });
  assert.deepEqual(result, liveRef);
});

test("resolveDrawioOverlayRenderMatrix falls back to prop matrix as compatibility path", () => {
  const propMatrix = { a: 1.1, b: 0, c: 0, d: 1.1, e: -10, f: -12 };
  const result = resolveDrawioOverlayRenderMatrix({
    overlayMatrix: propMatrix,
  });
  assert.deepEqual(result, propMatrix);
});
