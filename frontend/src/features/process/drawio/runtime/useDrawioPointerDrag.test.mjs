import test from "node:test";
import assert from "node:assert/strict";

import {
  bindPointerDragListeners,
  canStartDrawioDrag,
  computeDragCommitPayload,
  computeDraftOffsetFromPoint,
  shouldIgnoreDragMoveEvent,
  shouldIgnoreDragUpEvent,
} from "./useDrawioPointerDrag.js";

function createEventTargetSpy() {
  const calls = [];
  return {
    calls,
    addEventListener(type, _fn, capture = false) {
      calls.push({ op: "add", type, capture: capture === true });
    },
    removeEventListener(type, _fn, capture = false) {
      calls.push({ op: "remove", type, capture: capture === true });
    },
  };
}

test("pointer drag: canStartDrawioDrag allows start only when visible/renderable/interactive", () => {
  const canInteract = (id) => id === "shapeA";
  assert.equal(canStartDrawioDrag({
    visible: true,
    hasRenderable: true,
    elementIdRaw: "shapeA",
    canInteractWithElement: canInteract,
  }), true);
  assert.equal(canStartDrawioDrag({
    visible: false,
    hasRenderable: true,
    elementIdRaw: "shapeA",
    canInteractWithElement: canInteract,
  }), false);
  assert.equal(canStartDrawioDrag({
    visible: true,
    hasRenderable: true,
    elementIdRaw: "shapeB",
    canInteractWithElement: canInteract,
  }), false);
});

test("pointer drag: listener binding/unbinding is symmetric", () => {
  // Phase 1.3: reduced from 15 listeners (doc+root+win) to 5 (window-only).
  // setPointerCapture makes doc/root capture listeners redundant.
  const win = createEventTargetSpy();
  const noop = () => {};
  const unbind = bindPointerDragListeners({
    windowTarget: win,
    onMove: noop,
    onUp: noop,
    onMouseMove: noop,
    onMouseUp: noop,
  });
  assert.equal(win.calls.filter((row) => row.op === "add").length, 5);
  unbind();
  assert.equal(win.calls.filter((row) => row.op === "remove").length, 5);
});

test("pointer drag: move computes draft offset in diagram coordinates", () => {
  const draft = computeDraftOffsetFromPoint({
    dragStateRaw: {
      id: "shapeA",
      startX: 100,
      startY: 50,
      baseOffsetX: 10,
      baseOffsetY: -2,
    },
    pointRaw: { clientX: 120, clientY: 90 },
    screenToDiagram: (x, y) => ({ x: x / 2, y: y / 2 }),
  });
  assert.deepEqual(draft, {
    id: "shapeA",
    offset_x: -30,
    offset_y: -7,
  });
});

test("pointer drag: finish commit returns payload only when delta exists", () => {
  const none = computeDragCommitPayload({
    dragStateRaw: {
      id: "shapeA",
      startX: 100,
      startY: 70,
      startClientX: 200,
      startClientY: 140,
      baseOffsetX: 10,
      baseOffsetY: 20,
    },
    draftOffsetRaw: { offset_x: 10, offset_y: 20 },
    finalEventRaw: { clientX: 200, clientY: 140 },
    pendingPointRaw: null,
    screenToDiagram: (x, y) => ({ x: x / 2, y: y / 2 }),
    matrixScaleRaw: 2,
  });
  assert.equal(none, null);
  const moved = computeDragCommitPayload({
    dragStateRaw: {
      id: "shapeA",
      startX: 100,
      startY: 80,
      startClientX: 200,
      startClientY: 140,
      baseOffsetX: 10,
      baseOffsetY: 20,
    },
    draftOffsetRaw: { offset_x: 55, offset_y: 65 },
    finalEventRaw: { clientX: 280, clientY: 220 },
    pendingPointRaw: null,
    screenToDiagram: (x, y) => ({ x: x / 2, y: y / 2 }),
    matrixScaleRaw: 2,
  });
  assert.deepEqual(moved, {
    id: "shapeA",
    offsetX: 55,
    offsetY: 65,
  });
});

test("pointer drag: pointer/mouse dedupe guards suppress duplicate finish paths", () => {
  const moveReason = shouldIgnoreDragMoveEvent({
    activePointerIdRaw: 7,
    eventPointerIdRaw: NaN,
    eventTypeRaw: "mousemove",
    sawPointerMove: true,
  });
  assert.equal(moveReason, "compat_mouse_while_pointer_active");
  const upReason = shouldIgnoreDragUpEvent({
    activePointerIdRaw: 7,
    eventPointerIdRaw: NaN,
    eventTypeRaw: "mouseup",
    sawPointerMove: true,
  });
  assert.equal(upReason, "compat_mouseup_while_pointer_active");
});
