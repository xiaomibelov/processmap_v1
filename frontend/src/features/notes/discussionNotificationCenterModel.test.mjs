import assert from "node:assert/strict";
import test from "node:test";

import { buildDiscussionNotificationCenter } from "./discussionNotificationCenterModel.js";

const baseThread = {
  id: "thread_1",
  session_id: "session_1",
  project_id: "project_1",
  scope_type: "session",
  scope_ref: {},
  status: "open",
  created_by: "user_other",
  created_at: 100,
  updated_at: 130,
  requires_attention: false,
  attention_acknowledged_by_me: false,
  unread_count: 0,
  comments: [
    {
      id: "comment_1",
      author_user_id: "user_me",
      body: "First line",
      created_at: 100,
      updated_at: 100,
      mentions: [],
    },
  ],
};

test("builds mention notifications from active mention rows", () => {
  const center = buildDiscussionNotificationCenter({
    threads: [baseThread],
    mentions: [{
      id: "mention_1",
      session_id: "session_1",
      thread_id: "thread_1",
      comment_id: "comment_2",
      comment_body: "@me please check this",
      created_at: 150,
      acknowledged_at: 0,
    }],
    currentUserId: "user_me",
    sessionId: "session_1",
  });

  assert.equal(center.groups[0].key, "mentions");
  assert.equal(center.groups[0].count, 1);
  assert.equal(center.groups[0].items[0].type, "mention");
  assert.equal(center.groups[0].items[0].threadId, "thread_1");
  assert.equal(center.groups[0].items[0].commentId, "comment_2");
  assert.equal(center.totalCount, 1);
});

test("builds unread notifications only for participated threads", () => {
  const participated = {
    ...baseThread,
    id: "thread_participated",
    unread_count: 2,
    comments: [
      ...baseThread.comments,
      {
        id: "comment_2",
        author_user_id: "user_other",
        body: "New update",
        created_at: 160,
        updated_at: 160,
        mentions: [],
      },
    ],
  };
  const notParticipated = {
    ...baseThread,
    id: "thread_other",
    created_by: "user_other",
    unread_count: 1,
    comments: [{
      id: "comment_3",
      author_user_id: "user_other",
      body: "Other update",
      created_at: 170,
      updated_at: 170,
      mentions: [],
    }],
  };

  const center = buildDiscussionNotificationCenter({
    threads: [participated, notParticipated],
    mentions: [],
    currentUserId: "user_me",
    sessionId: "session_1",
  });

  const unread = center.groups.find((group) => group.key === "unread");
  assert.equal(unread.count, 1);
  assert.equal(unread.items[0].threadId, "thread_participated");
  assert.equal(unread.items[0].unreadCount, 2);
});

test("builds active attention notifications without acknowledged history", () => {
  const active = { ...baseThread, id: "thread_attention", requires_attention: true, attention_acknowledged_by_me: false };
  const acknowledged = { ...baseThread, id: "thread_ack", requires_attention: true, attention_acknowledged_by_me: true, attention_acknowledged_at: 200 };

  const center = buildDiscussionNotificationCenter({
    threads: [active, acknowledged],
    mentions: [],
    currentUserId: "user_me",
    sessionId: "session_1",
  });

  const attention = center.groups.find((group) => group.key === "attention");
  assert.equal(attention.count, 1);
  assert.equal(attention.items[0].type, "attention");
  assert.equal(attention.items[0].threadId, "thread_attention");
});

test("unique-thread badge count does not overcount a thread with multiple signals", () => {
  const thread = {
    ...baseThread,
    id: "thread_multi",
    requires_attention: true,
    unread_count: 1,
    comments: [
      ...baseThread.comments,
      {
        id: "comment_2",
        author_user_id: "user_other",
        body: "New mentioned update",
        created_at: 180,
        updated_at: 180,
        mentions: [{ mentioned_user_id: "user_me" }],
      },
    ],
  };
  const center = buildDiscussionNotificationCenter({
    threads: [thread],
    mentions: [{
      id: "mention_2",
      session_id: "session_1",
      thread_id: "thread_multi",
      comment_id: "comment_2",
      comment_body: "New mentioned update",
      created_at: 180,
      acknowledged_at: 0,
    }],
    currentUserId: "user_me",
    sessionId: "session_1",
  });

  assert.equal(center.signalCount, 3);
  assert.equal(center.totalCount, 1);
});

test("returns stable groups and empty state counts", () => {
  const center = buildDiscussionNotificationCenter({
    threads: [],
    mentions: [],
    currentUserId: "user_me",
    sessionId: "session_1",
  });

  assert.deepEqual(center.groups.map((group) => group.label), ["Упоминания", "Новые сообщения", "Требует внимания"]);
  assert.equal(center.totalCount, 0);
  assert.equal(center.signalCount, 0);
});

test("does not include mentions from another session in a session-scoped center", () => {
  const center = buildDiscussionNotificationCenter({
    threads: [baseThread],
    mentions: [{
      id: "mention_other",
      session_id: "session_other",
      thread_id: "thread_other",
      comment_id: "comment_other",
      comment_body: "@me elsewhere",
      created_at: 180,
      acknowledged_at: 0,
    }],
    currentUserId: "user_me",
    sessionId: "session_1",
  });

  assert.equal(center.totalCount, 0);
  assert.equal(center.groups[0].count, 0);
});
