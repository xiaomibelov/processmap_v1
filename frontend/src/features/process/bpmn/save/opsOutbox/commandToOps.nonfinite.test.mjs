import test from "node:test";
import assert from "node:assert/strict";

import { mapCommandToOps } from "./commandToOps.js";

// ---------------------------------------------------------------------------
// Контур fix/canvas-nan-di-stuck-drag, P0-2 (mapper-часть): bounds() молча
// коэрцил NaN→0 (`Number(b.x) || 0`) — на сервер уезжали нулевые bounds при
// нефинитных исходных. Fail-closed паритет с point()/waypoints() (#982):
// нефинитный компонент bounds → null → needsFullSave. Отсутствующие
// компоненты (legacy partial bounds) по-прежнему дополняются нулями.
// ---------------------------------------------------------------------------

function el(id, extra = {}) {
  return { id, type: "bpmn:Task", businessObject: { $type: "bpmn:Task" }, ...extra };
}

test("P0-2: shape.resize с NaN в newBounds → needsFullSave (не коэрцит в 0)", () => {
  const out = mapCommandToOps({
    command: "shape.resize",
    action: "execute",
    context: {
      shape: el("Task_1"),
      newBounds: { x: NaN, y: 200, width: 200, height: 100 },
      oldBounds: { x: 100, y: 200, width: 120, height: 80 },
    },
  });
  assert.equal(out.needsFullSave, true);
  assert.equal(out.ops.length, 0);
});

test("P0-2: shape.resize с Infinity в newBounds → needsFullSave", () => {
  const out = mapCommandToOps({
    command: "shape.resize",
    action: "execute",
    context: {
      shape: el("Task_1"),
      newBounds: { x: 100, y: Infinity, width: 200, height: 100 },
      oldBounds: { x: 100, y: 200, width: 120, height: 80 },
    },
  });
  assert.equal(out.needsFullSave, true);
});

test("P0-2: undo shape.resize с NaN в oldBounds → needsFullSave", () => {
  const out = mapCommandToOps({
    command: "shape.resize",
    action: "undo",
    context: {
      shape: el("Task_1"),
      newBounds: { x: 100, y: 200, width: 200, height: 100 },
      oldBounds: { x: "nan", y: 200, width: 120, height: 80 },
    },
  });
  assert.equal(out.needsFullSave, true);
});

test("P0-2: label.move (element.updateDi bounds) с NaN → needsFullSave", () => {
  const out = mapCommandToOps({
    command: "label.move",
    action: "execute",
    context: {
      label: el("Task_1_label", { labelTarget: el("Task_1") }),
      newBounds: { x: NaN, y: 10, width: 40, height: 20 },
    },
  });
  assert.equal(out.needsFullSave, true);
});

test("P0-2: partial bounds (без width/height) — legacy-коэрция в 0 сохраняется", () => {
  const out = mapCommandToOps({
    command: "shape.resize",
    action: "execute",
    context: {
      shape: el("Task_1"),
      newBounds: { x: 100, y: 200 },
      oldBounds: { x: 100, y: 200, width: 120, height: 80 },
    },
  });
  assert.equal(out.needsFullSave, false);
  assert.deepEqual(out.ops[0].bounds, { x: 100, y: 200, width: 0, height: 0 });
});
