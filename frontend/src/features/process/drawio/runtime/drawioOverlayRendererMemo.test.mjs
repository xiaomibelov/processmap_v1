import test from "node:test";
import assert from "node:assert/strict";

import {
  areDrawioOverlayRendererPropsEqual,
  arraysStructuralEqual,
} from "./drawioOverlayRendererMemo.js";

function createBaseProps() {
  const noop = () => {};
  return {
    visible: true,
    drawioMode: "edit",
    drawioActiveTool: "select",
    drawioMeta: {
      opacity: 1,
      transform: { x: 0, y: 0 },
      active_tool: "select",
      svg_cache: "<svg/>",
      drawio_layers_v1: [{ id: "layer-1", visible: true, locked: false }],
      drawio_elements_v1: [{ id: "element-1", layer_id: "layer-1", offset_x: 0, offset_y: 0 }],
    },
    screenToDiagram: noop,
    overlayMatrixRef: { current: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } },
    subscribeOverlayMatrix: noop,
    getOverlayMatrix: noop,
    onCommitMove: noop,
    onCommitResize: noop,
    onCommitTextResize: noop,
    onCommitText: noop,
    onCreateElement: noop,
    onDeleteElement: noop,
    onSelectionChange: noop,
  };
}

test("arraysStructuralEqual returns true for structurally equal arrays with different refs", () => {
  const a = [{ id: "a", x: 1 }, { id: "b", y: 2 }];
  const b = [{ id: "a", x: 1 }, { id: "b", y: 2 }];
  assert.equal(arraysStructuralEqual(a, b), true);
});

test("areDrawioOverlayRendererPropsEqual ignores overlayMatrix prop changes by design", () => {
  const prev = createBaseProps();
  const next = {
    ...prev,
    overlayMatrix: { a: 2, b: 0, c: 0, d: 2, e: 10, f: 10 },
  };
  assert.equal(areDrawioOverlayRendererPropsEqual(prev, next), true);
});

test("areDrawioOverlayRendererPropsEqual detects drawio element structure changes", () => {
  const prev = createBaseProps();
  const next = {
    ...prev,
    drawioMeta: {
      ...prev.drawioMeta,
      drawio_elements_v1: [
        ...prev.drawioMeta.drawio_elements_v1,
        { id: "element-2", layer_id: "layer-1", offset_x: 0, offset_y: 0 },
      ],
    },
  };
  assert.equal(areDrawioOverlayRendererPropsEqual(prev, next), false);
});

test("areDrawioOverlayRendererPropsEqual ignores non-render fields in drawio rows", () => {
  const prev = createBaseProps();
  const next = {
    ...prev,
    drawioMeta: {
      ...prev.drawioMeta,
      drawio_elements_v1: [{ ...prev.drawioMeta.drawio_elements_v1[0], anchor_v1: { x: 10, y: 20 } }],
      drawio_layers_v1: [{ ...prev.drawioMeta.drawio_layers_v1[0], label: "Layer A" }],
    },
  };
  assert.equal(areDrawioOverlayRendererPropsEqual(prev, next), true);
});
