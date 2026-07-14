import assert from "node:assert/strict";
import test from "node:test";

import { resolveBoundaryIndex, resolveMoveIndex } from "./diagramSearchActiveNav.js";

test("resolveMoveIndex: moves forward/backward with wraparound", () => {
  assert.equal(resolveMoveIndex({ length: 3, activeIndex: 0, step: 1 }), 1);
  assert.equal(resolveMoveIndex({ length: 3, activeIndex: 2, step: 1 }), 0);
  assert.equal(resolveMoveIndex({ length: 3, activeIndex: 0, step: -1 }), 2);
  assert.equal(resolveMoveIndex({ length: 3, activeIndex: 2, step: -1 }), 1);
});

test("resolveMoveIndex: no active selection starts at an edge by direction", () => {
  assert.equal(resolveMoveIndex({ length: 5, activeIndex: -1, step: 1 }), 0);
  assert.equal(resolveMoveIndex({ length: 5, activeIndex: -1, step: -1 }), 4);
  assert.equal(resolveMoveIndex({ length: 5, activeIndex: 99, step: 1 }), 0);
});

test("resolveMoveIndex: empty result set yields -1", () => {
  assert.equal(resolveMoveIndex({ length: 0, activeIndex: -1, step: 1 }), -1);
  assert.equal(resolveMoveIndex({ length: Number.NaN, activeIndex: 0, step: 1 }), -1);
  assert.equal(resolveMoveIndex({}), -1);
});

test("resolveBoundaryIndex: start/end edges, empty set safe", () => {
  assert.equal(resolveBoundaryIndex({ length: 4, edge: "start" }), 0);
  assert.equal(resolveBoundaryIndex({ length: 4, edge: "end" }), 3);
  assert.equal(resolveBoundaryIndex({ length: 4, edge: "END" }), 3);
  assert.equal(resolveBoundaryIndex({ length: 0, edge: "end" }), -1);
  assert.equal(resolveBoundaryIndex({}), -1);
});
