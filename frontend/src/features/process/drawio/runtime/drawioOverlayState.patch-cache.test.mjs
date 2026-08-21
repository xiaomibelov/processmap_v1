import test from "node:test";
import assert from "node:assert/strict";

import {
  applyDrawioLayerRenderState,
  clearSvgPatchCache,
} from "./drawioOverlayState.js";

const metaBase = {
  enabled: true,
  drawio_layers_v1: [{ id: "DL1", visible: true, locked: false, opacity: 1 }],
  drawio_elements_v1: [{ id: "shape1", layer_id: "DL1", visible: true, locked: false, deleted: false, opacity: 1 }],
};

const body = [
  "<g id=\"shape1\"><rect id=\"shape1_inner\" x=\"0\" y=\"0\" width=\"10\" height=\"10\"/></g>",
  "<rect id=\"Activity_123\" x=\"0\" y=\"0\" width=\"10\" height=\"10\"/>",
].join("");

function withReplaceSpy(fn) {
  const original = String.prototype.replace;
  let calls = 0;
  String.prototype.replace = function replaceSpy(pattern, replacer) {
    calls += 1;
    return original.call(this, pattern, replacer);
  };
  try {
    return fn(() => calls);
  } finally {
    String.prototype.replace = original;
  }
}

test("applyDrawioLayerRenderState caches identical inputs", () => {
  clearSvgPatchCache();
  withReplaceSpy((getCalls) => {
    applyDrawioLayerRenderState(body, metaBase, "", null);
    const afterFirst = getCalls();
    applyDrawioLayerRenderState(body, metaBase, "", null);
    const afterSecond = getCalls();
    assert.equal(afterSecond, afterFirst, "second render should not invoke String.replace");
  });
});

test("applyDrawioLayerRenderState recomputes when meta changes", () => {
  clearSvgPatchCache();
  withReplaceSpy((getCalls) => {
    const visible = applyDrawioLayerRenderState(body, metaBase, "", null);
    const afterFirst = getCalls();
    const hiddenMeta = {
      ...metaBase,
      drawio_elements_v1: [{ id: "shape1", layer_id: "DL1", visible: false, locked: false, deleted: false, opacity: 1 }],
    };
    const hidden = applyDrawioLayerRenderState(body, hiddenMeta, "", null);
    const afterSecond = getCalls();
    assert.ok(afterSecond > afterFirst, "different meta should invoke String.replace");
    assert.match(visible, /data-drawio-el-id="shape1"/);
    assert.match(hidden, /display:none/);
  });
});

test("clearSvgPatchCache drops cached entries", () => {
  clearSvgPatchCache();
  withReplaceSpy((getCalls) => {
    applyDrawioLayerRenderState(body, metaBase, "", null);
    const afterFirst = getCalls();
    clearSvgPatchCache();
    applyDrawioLayerRenderState(body, metaBase, "", null);
    const afterSecond = getCalls();
    assert.ok(afterSecond > afterFirst, "after clear the render should recompute");
  });
});
