import test from "node:test";
import assert from "node:assert/strict";

import { resolveDrawioKeyboardAction } from "./useDrawioKeyboardActions.js";

test("keyboard: no action without selection or when not editable", () => {
  const noSelection = resolveDrawioKeyboardAction({
    keyRaw: "Delete",
    shiftKey: false,
    selectedIdRaw: "",
    editable: true,
    elementStateRaw: {},
  });
  assert.equal(noSelection.type, "none");
  const notEditable = resolveDrawioKeyboardAction({
    keyRaw: "Delete",
    shiftKey: false,
    selectedIdRaw: "shapeA",
    editable: false,
    elementStateRaw: {},
  });
  assert.equal(notEditable.type, "none");
});

test("keyboard: arrows produce move payload with gated step", () => {
  const normalStep = resolveDrawioKeyboardAction({
    keyRaw: "ArrowRight",
    shiftKey: false,
    selectedIdRaw: "shapeA",
    editable: true,
    elementStateRaw: { offset_x: 10, offset_y: 5 },
  });
  assert.equal(normalStep.type, "move");
  assert.deepEqual(normalStep.payload, { id: "shapeA", offsetX: 22, offsetY: 5 });
  const shiftStep = resolveDrawioKeyboardAction({
    keyRaw: "ArrowUp",
    shiftKey: true,
    selectedIdRaw: "shapeA",
    editable: true,
    elementStateRaw: { offset_x: 10, offset_y: 5 },
  });
  assert.equal(shiftStep.type, "move");
  assert.deepEqual(shiftStep.payload, { id: "shapeA", offsetX: 10, offsetY: -19 });
});

test("keyboard: delete/backspace produce delete action only for editable selection", () => {
  const del = resolveDrawioKeyboardAction({
    keyRaw: "Delete",
    shiftKey: false,
    selectedIdRaw: "shapeA",
    editable: true,
    elementStateRaw: {},
  });
  assert.equal(del.type, "delete");
  assert.equal(del.payload.id, "shapeA");
  const backspace = resolveDrawioKeyboardAction({
    keyRaw: "Backspace",
    shiftKey: false,
    selectedIdRaw: "shapeA",
    editable: true,
    elementStateRaw: {},
  });
  assert.equal(backspace.type, "delete");
});
