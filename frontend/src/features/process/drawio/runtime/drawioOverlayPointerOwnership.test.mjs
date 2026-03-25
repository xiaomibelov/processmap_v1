import test from "node:test";
import assert from "node:assert/strict";

import {
  isDrawioCreatePlacementActive,
  resolveDrawioOverlaySvgPointerEvents,
} from "./drawioOverlayPointerOwnership.js";

test("drawio overlay pointer ownership: only explicit create tools arm placement surface", () => {
  assert.equal(isDrawioCreatePlacementActive({
    visible: true,
    effectiveMode: "edit",
    runtimeTool: "rect",
  }), true);
  assert.equal(isDrawioCreatePlacementActive({
    visible: true,
    effectiveMode: "edit",
    runtimeTool: "text",
  }), true);
  assert.equal(isDrawioCreatePlacementActive({
    visible: true,
    effectiveMode: "edit",
    runtimeTool: "select",
  }), false);
  assert.equal(isDrawioCreatePlacementActive({
    visible: true,
    effectiveMode: "view",
    runtimeTool: "rect",
  }), false);
});

test("drawio overlay pointer ownership: svg hit surface stays interactive in edit mode", () => {
  assert.equal(resolveDrawioOverlaySvgPointerEvents({
    createPlacementActive: true,
    hasRenderable: true,
    effectiveMode: "edit",
  }), "auto");
  assert.equal(resolveDrawioOverlaySvgPointerEvents({
    createPlacementActive: false,
    hasRenderable: true,
    effectiveMode: "edit",
  }), "auto");
  assert.equal(resolveDrawioOverlaySvgPointerEvents({
    createPlacementActive: false,
    hasRenderable: true,
    effectiveMode: "view",
  }), "none");
});
