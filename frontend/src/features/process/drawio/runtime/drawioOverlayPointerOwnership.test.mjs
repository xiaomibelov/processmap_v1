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

test("drawio overlay pointer ownership: blank-space svg hit surface is disabled outside create mode", () => {
  assert.equal(resolveDrawioOverlaySvgPointerEvents(true), "auto");
  assert.equal(resolveDrawioOverlaySvgPointerEvents(false), "none");
});
