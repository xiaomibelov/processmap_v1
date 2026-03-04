import test from "node:test";
import assert from "node:assert/strict";
import {
  HYBRID_MIN_HEIGHT,
  HYBRID_MIN_WIDTH,
  applyDrag,
  applyResize,
  canResizeHybridElement,
  clampHybridRect,
} from "./hybridTransform.js";

test("applyDrag: shifts x/y and keeps size", () => {
  const start = { x: 100, y: 80, w: 200, h: 70 };
  const next = applyDrag(start, 15.24, -4.18);
  assert.deepEqual(next, { x: 115.2, y: 75.8, w: 200, h: 70 });
});

test("applyResize: se handle grows width/height", () => {
  const start = { x: 50, y: 40, w: 120, h: 60 };
  const next = applyResize(start, "se", 30, 20);
  assert.deepEqual(next, { x: 50, y: 40, w: 150, h: 80 });
});

test("applyResize: nw handle updates origin and clamps min size", () => {
  const start = { x: 300, y: 200, w: 100, h: 70 };
  const next = applyResize(start, "nw", 80, 80);
  assert.equal(next.w, HYBRID_MIN_WIDTH);
  assert.equal(next.h, HYBRID_MIN_HEIGHT);
  assert.equal(next.x, 340);
  assert.equal(next.y, 240);
});

test("clampHybridRect: enforces min size", () => {
  const next = clampHybridRect({ x: 1, y: 2, w: 10, h: 5 });
  assert.deepEqual(next, {
    x: 1,
    y: 2,
    w: HYBRID_MIN_WIDTH,
    h: HYBRID_MIN_HEIGHT,
  });
});

test("canResizeHybridElement: only known resizable types", () => {
  assert.equal(canResizeHybridElement("rect"), true);
  assert.equal(canResizeHybridElement("container"), true);
  assert.equal(canResizeHybridElement("text"), false);
  assert.equal(canResizeHybridElement("arrow"), false);
});
