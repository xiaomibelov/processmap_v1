import test from "node:test";
import assert from "node:assert/strict";

import { buildSessionPresenceView } from "./sessionPresenceModel.js";

test("session presence view is hidden when only current user is active", () => {
  const nowMs = Date.now();
  const actors = [{
    userId: "user_me",
    label: "Я",
    lastSeenAt: nowMs,
  }];
  const view = buildSessionPresenceView({
    actorsRaw: actors,
    currentUserIdRaw: "user_me",
    nowMs,
  });
  assert.equal(view.visible, false);
  assert.equal(view.count, 0);
});

test("session presence view shows other active users and prunes stale actors by ttl", () => {
  const nowMs = Date.now();
  const staleAt = nowMs - 999999;
  const actors = [
    { userId: "user_me", label: "Я", lastSeenAt: nowMs },
    { userId: "user_anna", label: "Анна", lastSeenAt: nowMs - 5000 },
    { userId: "user_old", label: "Старый", lastSeenAt: staleAt },
  ];

  const view = buildSessionPresenceView({
    actorsRaw: actors,
    currentUserIdRaw: "user_me",
    nowMs,
    ttlMs: 60000,
  });
  assert.equal(view.visible, true);
  assert.equal(view.count, 1);
  assert.match(view.label, /Анна/);
  assert.equal(view.iconLabel, "А");
  assert.equal(/Старый/.test(view.title), false);
});

test("session presence default ttl is sixty seconds", () => {
  const nowMs = Date.now();
  const view = buildSessionPresenceView({
    actorsRaw: [
      { userId: "user_me", label: "Я", lastSeenAt: nowMs },
      { userId: "user_recent", label: "Анна", lastSeenAt: nowMs - 59000 },
      { userId: "user_stale", label: "Старый", lastSeenAt: nowMs - 61000 },
    ],
    currentUserIdRaw: "user_me",
    nowMs,
  });

  assert.equal(view.visible, true);
  assert.equal(view.count, 1);
  assert.equal(view.label, "Анна");
  assert.equal(/Старый/.test(view.title), false);
});

test("session presence view compresses many active users", () => {
  const nowMs = Date.now();
  const view = buildSessionPresenceView({
    actorsRaw: [
      { userId: "user_me", label: "Я", lastSeenAt: nowMs },
      { userId: "user_a", label: "Иван", lastSeenAt: nowMs },
      { userId: "user_b", label: "Анна", lastSeenAt: nowMs },
      { userId: "user_c", label: "Мария", lastSeenAt: nowMs },
    ],
    currentUserIdRaw: "user_me",
    nowMs,
  });

  assert.equal(view.visible, true);
  assert.equal(view.count, 3);
  assert.equal(view.label, "Иван +2");
  assert.equal(view.iconLabel, "И");
});

// ---------------------------------------------------------------------------
// Контур feature/async-save-pipeline-step2 (TESTS §1.6, UI.md §7): soft-lock
// маркер в presence-панели — актор с editingElementId отмечается в title.
// ---------------------------------------------------------------------------

test("presence view title marks actors editing an element (soft-lock marker)", () => {
  const view = buildSessionPresenceView({
    actorsRaw: [
      { user_id: "user_me", display_name: "Я", last_seen_at: Date.now(), editing_element_id: "Task_1" },
      { user_id: "user_a", display_name: "Анна", last_seen_at: Date.now(), editing_element_id: "Task_2" },
      { user_id: "user_b", display_name: "Борис", last_seen_at: Date.now() },
    ],
    currentUserIdRaw: "user_me",
    nowMs: Date.now(),
  });
  assert.equal(view.visible, true);
  assert.match(view.title, /Анна \(Task_2\)/, "foreign editing actor marked in panel title");
  assert.ok(!view.title.includes("Task_1"), "own editing element not marked (self skipped)");
});

test("presence view title without editing actors stays legacy", () => {
  const view = buildSessionPresenceView({
    actorsRaw: [{ user_id: "user_a", display_name: "Анна", last_seen_at: Date.now() }],
    currentUserIdRaw: "user_me",
    nowMs: Date.now(),
  });
  assert.equal(view.title, "Активны сейчас: Анна");
});
