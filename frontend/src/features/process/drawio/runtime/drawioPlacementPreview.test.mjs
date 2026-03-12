import test from "node:test";
import assert from "node:assert/strict";

import { buildDrawioPlacementPreviewSpec } from "./drawioPlacementPreview.js";

test("drawio placement preview: rect tool produces stable preview geometry", () => {
  const spec = buildDrawioPlacementPreviewSpec("rect", { x: 300, y: 180 });
  assert.deepEqual(spec, {
    toolId: "rect",
    shape: "rect",
    x: 240,
    y: 150,
    width: 120,
    height: 60,
    rx: 8,
    fill: "rgba(59,130,246,0.10)",
    stroke: "#2563eb",
  });
});

test("drawio placement preview: text tool stays width-only and wrapping-safe", () => {
  const spec = buildDrawioPlacementPreviewSpec("text", { x: 360, y: 220 });
  assert.equal(spec.toolId, "text");
  assert.equal(spec.shape, "text");
  assert.equal(spec.width, 120);
  assert.equal(spec.height, 30);
  assert.equal(spec.text, "Text");
});
