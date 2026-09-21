import test from "node:test";
import assert from "node:assert/strict";

import { captureCommandContextSafely } from "./commandContextCapture.js";

// ---------------------------------------------------------------------------
// Контур fix/canvas-nan-di-stuck-drag, P0-4: исключение в
// snapshotCommandContext / enrichPositionalSnapshot не должно рвать каскад
// commandStack.changed → notifyChange → mapper/outbox. Ошибка enrichment'а
// фиксируется в диагностическом трейле, каскад продолжается с пустым
// снапшотом (маппер fail-closed → needsFullSave).
// ---------------------------------------------------------------------------

test("P0-4: здоровый путь — снапшот + enrichment возвращаются", () => {
  const snapshot = { element: { id: "Task_1" } };
  const calls = [];
  const result = captureCommandContextSafely({
    command: "shape.move",
    contextSource: { shape: { id: "Task_1" } },
    snapshot: () => snapshot,
    enrich: (command, ctx, snap) => calls.push([command, ctx, snap]),
    record: () => {},
  });
  assert.equal(result, snapshot);
  assert.equal(calls.length, 1);
});

test("P0-4: snapshotCommandContext бросает → null + диагностика, каскад не рвётся", () => {
  const records = [];
  const result = captureCommandContextSafely({
    command: "shape.move",
    contextSource: {},
    snapshot: () => {
      throw new TypeError("cyclic structure");
    },
    enrich: () => {
      throw new Error("must not be called");
    },
    record: (type, details) => records.push({ type, details }),
  });
  assert.equal(result, null);
  assert.equal(records.length, 1);
  assert.equal(records[0].type, "command_context_enrichment_failed");
  assert.equal(records[0].details.command, "shape.move");
  assert.ok(String(records[0].details.msg).includes("cyclic"));
});

test("P0-4: enrichPositionalSnapshot бросает → снапшот сохраняется + диагностика", () => {
  const snapshot = { element: { id: "Task_1" } };
  const records = [];
  const result = captureCommandContextSafely({
    command: "shape.resize",
    contextSource: {},
    snapshot: () => snapshot,
    enrich: () => {
      throw new RangeError("non-finite waypoint");
    },
    record: (type, details) => records.push({ type, details }),
  });
  assert.equal(result, snapshot);
  assert.equal(records.length, 1);
  assert.equal(records[0].type, "command_context_enrichment_failed");
});

test("P0-4: падающий record не рвёт каскад", () => {
  const result = captureCommandContextSafely({
    command: "shape.move",
    contextSource: {},
    snapshot: () => {
      throw new Error("boom");
    },
    enrich: () => {},
    record: () => {
      throw new Error("diagnostics down");
    },
  });
  assert.equal(result, null);
});
