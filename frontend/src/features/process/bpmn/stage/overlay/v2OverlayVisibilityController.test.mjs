import assert from "node:assert/strict";
import test from "node:test";

import { shouldRenderV2Overlay, hasLegacyPropertyOverlay } from "./v2OverlayVisibilityController.js";

function fakeInst(overlays) {
  return {
    get: (name) => {
      if (name !== "overlays") return null;
      return {
        get: ({ element }) => overlays[element] || [],
      };
    },
  };
}

test("shouldRenderV2Overlay: false when global toggle off", () => {
  const result = shouldRenderV2Overlay({
    elementId: "T1",
    globalEnabled: false,
    elementState: { width: 100, height: 80 },
    content: { properties: [{ name: "p", value: "v" }] },
  });
  assert.equal(result, false);
});

test("shouldRenderV2Overlay: false for tiny non-sequence element", () => {
  const result = shouldRenderV2Overlay({
    elementId: "T1",
    globalEnabled: true,
    elementState: { width: 10, height: 10 },
    content: { properties: [{ name: "p", value: "v" }] },
  });
  assert.equal(result, false);
});

test("shouldRenderV2Overlay: true for sequence flow regardless of size", () => {
  const result = shouldRenderV2Overlay({
    elementId: "F1",
    globalEnabled: true,
    elementState: { isSequenceFlow: true, width: 0, height: 0 },
    content: { properties: [{ name: "p", value: "v" }] },
  });
  assert.equal(result, true);
});

test("shouldRenderV2Overlay: false when legacy overlay present", () => {
  const inst = fakeInst({
    T1: [{ html: { classList: { contains: (cls) => cls === "fpcPropertyOverlay" } } }],
  });
  const result = shouldRenderV2Overlay({
    elementId: "T1",
    globalEnabled: true,
    elementState: { width: 100, height: 80, hasLegacyOverlay: hasLegacyPropertyOverlay(inst, "T1") },
    content: { properties: [{ name: "p", value: "v" }] },
  });
  assert.equal(result, false);
});

test("shouldRenderV2Overlay: false when no content and no title", () => {
  const result = shouldRenderV2Overlay({
    elementId: "T1",
    globalEnabled: true,
    elementState: { width: 100, height: 80 },
    content: { properties: [] },
  });
  assert.equal(result, false);
});

test("shouldRenderV2Overlay: true for name-only card when global enabled", () => {
  const result = shouldRenderV2Overlay({
    elementId: "T1",
    globalEnabled: true,
    elementState: { width: 100, height: 80 },
    content: { title: "Task name", properties: [] },
  });
  assert.equal(result, true);
});
