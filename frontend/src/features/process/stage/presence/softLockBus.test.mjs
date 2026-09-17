import test from "node:test";
import assert from "node:assert/strict";

import {
  computeSoftLockTargets,
  setSoftLockTargets,
  getSoftLockTargets,
  subscribeSoftLockTargets,
} from "./softLockBus.js";

// ---------------------------------------------------------------------------
// Контур feature/async-save-pipeline-step2 (TESTS §1.6, UI.md §7): soft-lock
// targets — акторы с editingElementId (не себя) → бейдж «{name} редактирует
// этот элемент» на элементе канваса. Advisory-only.
// ---------------------------------------------------------------------------

test("computeSoftLockTargets: actors with editingElementId become badge targets", () => {
  const targets = computeSoftLockTargets([
    { userId: "u1", label: "Анна", editingElementId: "Task_1" },
    { userId: "u2", label: "Борис", editingElementId: "Task_2" },
    { userId: "u3", label: "Вера", editingElementId: "" },
  ]);
  assert.deepEqual(targets.map((t) => t.elementId), ["Task_1", "Task_2"]);
  assert.equal(targets[0].badge, "Анна редактирует этот элемент");
});

test("computeSoftLockTargets: self (isCurrentUser) and duplicate elements are skipped", () => {
  const targets = computeSoftLockTargets([
    { userId: "me", label: "Я", editingElementId: "Task_1", isCurrentUser: true },
    { userId: "u1", label: "Анна", editingElementId: "Task_1" },
    { userId: "u2", label: "Борис", editingElementId: "Task_1" },
  ]);
  assert.equal(targets.length, 1, "self skipped, one badge per element");
  assert.equal(targets[0].label, "Анна");
});

test("softLockBus: publish/subscribe round-trip, unsubscribe stops notifications", () => {
  const seen = [];
  const unsubscribe = subscribeSoftLockTargets((next) => seen.push(next));
  setSoftLockTargets([{ elementId: "Task_1", label: "Анна", badge: "Анна редактирует этот элемент" }]);
  assert.equal(getSoftLockTargets().length, 1);
  assert.equal(seen.length, 1);
  unsubscribe();
  setSoftLockTargets([]);
  assert.equal(seen.length, 1, "no notification after unsubscribe");
  assert.deepEqual(getSoftLockTargets(), []);
});
