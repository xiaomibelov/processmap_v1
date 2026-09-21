import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const EventBusModule = require("diagram-js/lib/core/EventBus");
const EventBus = EventBusModule.default || EventBusModule;

import {
  shouldSuppressEventBusError,
  installEventBusErrorGuard,
} from "./eventBusErrorGuard.js";

// ---------------------------------------------------------------------------
// Контур fix/canvas-nan-di-stuck-drag, P0-1 (root cause RC2 аудита
// canvas-drag-stuck-after-1008): NaN-waypoints в DI → render-listener бросает
// (например TypeError "setTranslate non-finite") → diagram-js EventBus
// логирует "unhandled error in event listener" и RE-THROW'ит (listener'ов
// 'error' в app нет) → Dragging.end умирает до cleanup() → .djs-dragging
// висит (stuck LMB, только Esc).
// Guard: non-finite класс исключений → handled (return false) + запись в
// диагностический трейл; ВСЁ остальное — rethrow сохраняется (не глушим).
// ---------------------------------------------------------------------------

function nonFiniteError() {
  return new TypeError("Failed to execute 'setTranslate' on 'SVGTransform': non-finite value");
}

test("shouldSuppressEventBusError: non-finite класс распознаётся", () => {
  assert.equal(shouldSuppressEventBusError(nonFiniteError()), true);
  assert.equal(shouldSuppressEventBusError(new TypeError("Expected number, got NaN")), true);
  assert.equal(shouldSuppressEventBusError(new Error("waypoint x is Infinity")), true);
  assert.equal(shouldSuppressEventBusError(new RangeError("Invalid array length: NaN")), true);
});

test("shouldSuppressEventBusError: прочие ошибки НЕ подавляются", () => {
  assert.equal(shouldSuppressEventBusError(new Error("boom")), false);
  assert.equal(shouldSuppressEventBusError(new TypeError("undefined is not a function")), false);
  assert.equal(shouldSuppressEventBusError(null), false);
  assert.equal(shouldSuppressEventBusError(undefined), false);
  assert.equal(shouldSuppressEventBusError({}), false);
});

test("guard: non-finite ошибка listener'а не пробрасывается из fire, диагностика записана", () => {
  const eventBus = new EventBus();
  const records = [];
  const unbind = installEventBusErrorGuard(eventBus, {
    record: (type, details) => records.push({ type, details }),
  });
  eventBus.on("shape.changed", () => {
    throw nonFiniteError();
  });
  assert.doesNotThrow(() => {
    eventBus.fire("shape.changed", { element: { id: "Task_1" } });
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].type, "canvas_nonfinite_render_error");
  assert.ok(String(records[0].details.msg).includes("non-finite"));
  unbind();
});

test("guard: прочая ошибка listener'а по-прежнему rethrow'ится (не глушим всё подряд)", () => {
  const eventBus = new EventBus();
  const records = [];
  const unbind = installEventBusErrorGuard(eventBus, {
    record: (type, details) => records.push({ type, details }),
  });
  eventBus.on("shape.changed", () => {
    throw new Error("boom");
  });
  assert.throws(
    () => eventBus.fire("shape.changed", { element: { id: "Task_1" } }),
    /boom/,
  );
  assert.equal(records.length, 0);
  unbind();
});

test("guard: unbind снимает подавление — non-finite снова rethrow'ится", () => {
  const eventBus = new EventBus();
  const unbind = installEventBusErrorGuard(eventBus, { record: () => {} });
  eventBus.on("shape.changed", () => {
    throw nonFiniteError();
  });
  unbind();
  assert.throws(() => eventBus.fire("shape.changed", {}));
});
