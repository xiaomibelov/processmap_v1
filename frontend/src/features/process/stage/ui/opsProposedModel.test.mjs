import test from "node:test";
import assert from "node:assert/strict";

import { buildOpsProposedView } from "./opsProposedModel.js";

// ---------------------------------------------------------------------------
// Контур feature/async-save-pipeline-step2 (TESTS §1.6, UI.md §5): панель
// «предложенные изменения» — view-модель. Пустое состояние → панель скрыта.
// ---------------------------------------------------------------------------

function record(overrides = {}) {
  return {
    proposedId: "pp-1",
    sessionId: "s1",
    elementId: "Task_1",
    opType: "element.updateProperties",
    payload: { type: "element.updateProperties", elementId: "Task_1", properties: { name: "Моё" } },
    conflictVersion: 9,
    createdAt: 100,
    ...overrides,
  };
}

test("non-empty proposed records → visible panel with ordered items", () => {
  const view = buildOpsProposedView([
    record({ proposedId: "pp-2", elementId: "Task_2", createdAt: 200 }),
    record(),
  ]);
  assert.equal(view.visible, true);
  assert.equal(view.count, 2);
  assert.deepEqual(view.items.map((i) => i.proposedId), ["pp-1", "pp-2"], "sorted by createdAt");
  assert.equal(view.items[0].title, "Task_1 · element.updateProperties");
});

test("empty list (or missing records) → panel hidden", () => {
  assert.equal(buildOpsProposedView([]).visible, false);
  assert.equal(buildOpsProposedView(null).visible, false);
  assert.deepEqual(buildOpsProposedView([{ elementId: "Task_1" }]).items, [], "records without proposedId dropped");
});

test("badge counter equals record count (toolbar chip)", () => {
  const view = buildOpsProposedView([record(), record({ proposedId: "pp-2" }), record({ proposedId: "pp-3" })]);
  assert.equal(view.count, 3);
});
