import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDiscussionNotificationBuckets,
  buildDiscussionNotificationItem,
  discussionNotificationState,
} from "./discussionNotificationModel.js";

const baseThread = {
  id: "thread_1",
  session_id: "sess_1",
  project_id: "proj_1",
  scope_type: "diagram_element",
  scope_ref: { element_id: "Task_1", element_name: "Проверить шаг" },
  status: "open",
  requires_attention: true,
  attention_acknowledged_by_me: false,
  attention_acknowledged_at: 0,
  created_at: 100,
  updated_at: 110,
  resolved_at: 0,
  comments: [
    { id: "comment_1", body: "Нужно проверить температуру", created_at: 100, updated_at: 100 },
    { id: "comment_2", body: "Последнее уточнение", created_at: 120, updated_at: 120 },
  ],
};

test("discussion notification item follows the bounded entity contract", () => {
  const item = buildDiscussionNotificationItem(baseThread);

  assert.deepEqual(item, {
    id: "discussion_attention:thread_1",
    type: "discussion_attention",
    title: "Нужно проверить температуру",
    sourceLabel: "Проверить шаг",
    threadId: "thread_1",
    sessionId: "sess_1",
    projectId: "proj_1",
    scopeType: "diagram_element",
    targetElementId: "Task_1",
    commentId: "comment_2",
    createdAt: 100000,
    updatedAt: 120000,
    acknowledgedAt: 0,
    resolvedAt: 0,
    state: "active",
  });
});

test("active and history state derive only from thread attention truth", () => {
  assert.equal(discussionNotificationState(baseThread), "active");
  assert.equal(discussionNotificationState({ ...baseThread, attention_acknowledged_by_me: true, attention_acknowledged_at: 130 }), "history");
  assert.equal(discussionNotificationState({ ...baseThread, status: "resolved", resolved_at: 140 }), "history");
  assert.equal(discussionNotificationState({ ...baseThread, requires_attention: false }), "");
});

test("notification buckets cap active and recent history independently", () => {
  const threads = Array.from({ length: 25 }, (_, index) => ({
    ...baseThread,
    id: `active_${index}`,
    updated_at: 100 + index,
  })).concat(Array.from({ length: 25 }, (_, index) => ({
    ...baseThread,
    id: `history_${index}`,
    updated_at: 200 + index,
    attention_acknowledged_by_me: true,
    attention_acknowledged_at: 300 + index,
  })));

  const buckets = buildDiscussionNotificationBuckets(threads);

  assert.equal(buckets.active.length, 20);
  assert.equal(buckets.history.length, 20);
  assert.equal(buckets.activeTotal, 25);
  assert.equal(buckets.historyTotal, 25);
  assert.equal(buckets.active[0].threadId, "active_24");
  assert.equal(buckets.history[0].threadId, "history_24");
});
