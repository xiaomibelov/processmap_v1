import assert from "node:assert/strict";
import test from "node:test";

import { buildOverlayGeometry } from "./overlayLayoutModel.js";

const TASK = { id: "T", x: 100, y: 120, width: 140, height: 80 };

test("task geometry: above by default, centered, width = node width", () => {
  const geo = buildOverlayGeometry({ element: TASK, isConnection: false, canvasZoom: 1 });
  assert.equal(geo.placement, "above");
  assert.equal(geo.topOffset, -20);
  assert.equal(geo.anchorLeft, 70);
  assert.equal(geo.width, 140);
});

test("task geometry: width floor keeps narrow nodes readable", () => {
  const geo = buildOverlayGeometry({ element: { ...TASK, width: 60 }, isConnection: false, canvasZoom: 1 });
  assert.equal(geo.width, 76);
});

test("task geometry: width follows on-screen node width at zoom", () => {
  const geo = buildOverlayGeometry({ element: TASK, isConnection: false, canvasZoom: 2 });
  assert.equal(geo.width, 280);
  assert.equal(geo.anchorLeft, 70);
  assert.equal(geo.placement, "above");
});

test("task geometry: below when node top is within the chip reserve of canvas top", () => {
  const geo = buildOverlayGeometry({ element: { ...TASK, y: 10 }, isConnection: false, canvasZoom: 1 });
  assert.equal(geo.placement, "below");
  assert.equal(geo.topOffset, 100);
});

test("task geometry: viewportTopLimit triggers below when node top is inside the 20px gap", () => {
  const geo = buildOverlayGeometry({ element: { ...TASK, y: 15 }, isConnection: false, canvasZoom: 1, viewportTopLimit: 0 });
  assert.equal(geo.placement, "below");
  const above = buildOverlayGeometry({ element: TASK, isConnection: false, canvasZoom: 1, viewportTopLimit: 0 });
  assert.equal(above.placement, "above");
});

test("task geometry: preferBelow forces below placement", () => {
  const geo = buildOverlayGeometry({ element: TASK, isConnection: false, canvasZoom: 1, preferBelow: true });
  assert.equal(geo.placement, "below");
  assert.equal(geo.topOffset, 100);
});

test("task geometry: fallback without bounds stays above", () => {
  const geo = buildOverlayGeometry({ element: null, isConnection: false, canvasZoom: 1 });
  assert.equal(geo.placement, "above");
  assert.equal(geo.topOffset, -20);
});
