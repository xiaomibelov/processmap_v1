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
  assert.match(view.label, /^В сессии: .+ \+2$/);
});
