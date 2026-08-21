import test from "node:test";
import assert from "node:assert/strict";
import { createElementAt, getDefaultShapeSpec } from "../hybridPlace.js";

test("getDefaultShapeSpec returns expected defaults", () => {
  const rect = getDefaultShapeSpec("rect");
  const container = getDefaultShapeSpec("container");
  const text = getDefaultShapeSpec("text");

  assert.deepEqual({ w: rect.w, h: rect.h }, { w: 200, h: 70 });
  assert.deepEqual({ w: container.w, h: container.h }, { w: 320, h: 220 });
  assert.deepEqual({ w: text.w, h: text.h }, { w: 180, h: 36 });
});

test("createElementAt creates hybrid element in diagram coords", () => {
  const el = createElementAt("rect", { x: 300, y: 200 }, "L1");
  assert.ok(el?.id);
  assert.equal(el.type, "rect");
  assert.equal(el.layer_id, "L1");
  assert.equal(el.visible, true);
  assert.equal(Number.isFinite(el.x), true);
  assert.equal(Number.isFinite(el.y), true);
  assert.equal(el.w, 200);
  assert.equal(el.h, 70);
});
