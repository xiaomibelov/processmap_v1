import test from "node:test";
import assert from "node:assert/strict";

import {
  getSessionPresenceClientId,
  normalizeSessionPresenceUsers,
  presenceEditingBadgeText,
} from "./presenceModel.js";

// ---------------------------------------------------------------------------
// Контур feature/async-save-pipeline-step2 (TESTS §1.6, UI.md §7): soft-lock
// pure-модель — editingElementId в normalize active_users + badge-текст
// «{name} редактирует этот элемент». Dep-free (react не нужен).
// ---------------------------------------------------------------------------

test("normalizeSessionPresenceUsers carries editingElementId through", () => {
  const users = normalizeSessionPresenceUsers([
    { user_id: "user_a", display_name: "Анна", last_seen_at: 100, editing_element_id: "Task_1" },
    { user_id: "user_b", display_name: "Борис", last_seen_at: 100, editingElementId: "Task_2" },
    { user_id: "user_c", display_name: "Вера", last_seen_at: 100 },
  ]);
  assert.equal(users[0].editingElementId, "Task_1");
  assert.equal(users[1].editingElementId, "Task_2", "camelCase alias accepted");
  assert.equal(users[2].editingElementId, null, "absence normalizes to null (single wire contract)");
});

test("presenceEditingBadgeText: «{name} редактирует этот элемент», пусто без editingElementId", () => {
  assert.equal(
    presenceEditingBadgeText({ label: "Анна", editingElementId: "Task_1" }),
    "Анна редактирует этот элемент",
  );
  assert.equal(presenceEditingBadgeText({ label: "Анна", editingElementId: "" }), "");
  assert.equal(presenceEditingBadgeText(null), "");
  assert.equal(presenceEditingBadgeText({ editingElementId: "Task_1" }), "Пользователь редактирует этот элемент");
});

test("presence client id is stable per tab storage", () => {
  const data = new Map();
  const fakeStorage = {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
  };
  const first = getSessionPresenceClientId(fakeStorage);
  assert.ok(first);
  assert.equal(getSessionPresenceClientId(fakeStorage), first);
});
