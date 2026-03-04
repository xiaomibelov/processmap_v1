import test from "node:test";
import assert from "node:assert/strict";
import {
  HYBRID_MIN_HEIGHT,
  HYBRID_MIN_WIDTH,
  applyDrag,
  applyResize,
} from "../hybridTransform.js";

test("applyDrag updates x/y by dx/dy", () => {
  const element = { id: "E1", type: "rect", x: 100, y: 200, w: 180, h: 80 };
  const next = applyDrag(element, 12, -7);
  assert.equal(next.x, 112);
  assert.equal(next.y, 193);
  assert.equal(next.w, 180);
  assert.equal(next.h, 80);
});

test("applyResize se grows width and height", () => {
  const element = { id: "E1", type: "rect", x: 100, y: 200, w: 180, h: 80 };
  const next = applyResize(element, "se", 20, 10);
  assert.equal(next.x, 100);
  assert.equal(next.y, 200);
  assert.equal(next.w, 200);
  assert.equal(next.h, 90);
});

test("applyResize nw updates x/y/w/h", () => {
  const element = { id: "E1", type: "rect", x: 100, y: 200, w: 180, h: 80 };
  const next = applyResize(element, "nw", -15, -5);
  assert.equal(next.x, 85);
  assert.equal(next.y, 195);
  assert.equal(next.w, 195);
  assert.equal(next.h, 85);
});

test("applyResize clamps to min size", () => {
  const element = { id: "E1", type: "rect", x: 100, y: 200, w: 80, h: 40 };
  const next = applyResize(element, "se", -100, -100);
  assert.equal(next.w, HYBRID_MIN_WIDTH);
  assert.equal(next.h, HYBRID_MIN_HEIGHT);
});
