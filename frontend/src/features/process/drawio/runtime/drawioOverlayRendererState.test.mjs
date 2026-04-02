import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDrawioRenderStateSignature,
  composeOverlayMatrix,
} from "./drawioOverlayRendererState.js";

test("composeOverlayMatrix composes matrix translation with drawio transform offset", () => {
  const result = composeOverlayMatrix(
    { a: 2, b: 0, c: 0, d: 3, e: 10, f: 20 },
    4,
    -1,
  );
  assert.deepEqual(result, {
    a: 2,
    b: 0,
    c: 0,
    d: 3,
    e: 18,
    f: 17,
  });
});

test("buildDrawioRenderStateSignature changes when body or drawio element render-state changes", () => {
  const layerMap = new Map([
    ["layer-1", { visible: true, locked: false, opacity: 1 }],
  ]);
  const elementMap = new Map([
    ["element-1", {
      layer_id: "layer-1",
      visible: true,
      locked: false,
      deleted: false,
      opacity: 0.9,
      offset_x: 12,
      offset_y: -7,
    }],
  ]);
  const base = buildDrawioRenderStateSignature("body-a", "edit", false, layerMap, elementMap);
  const same = buildDrawioRenderStateSignature("body-a", "edit", false, layerMap, elementMap);
  const changedBody = buildDrawioRenderStateSignature("body-b", "edit", false, layerMap, elementMap);
  const changedElement = buildDrawioRenderStateSignature(
    "body-a",
    "edit",
    false,
    layerMap,
    new Map([
      ["element-1", {
        layer_id: "layer-1",
        visible: true,
        locked: false,
        deleted: false,
        opacity: 0.9,
        offset_x: 12,
        offset_y: -8,
      }],
    ]),
  );
  assert.equal(base, same);
  assert.notEqual(base, changedBody);
  assert.notEqual(base, changedElement);
});
