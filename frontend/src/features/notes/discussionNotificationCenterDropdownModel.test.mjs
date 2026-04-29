import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAccountDiscussionNotificationGroups,
  filterDiscussionNotificationGroups,
} from "./discussionNotificationCenterDropdownModel.js";

test("returns useful empty state counts when there are no source-backed signals", () => {
  const center = buildAccountDiscussionNotificationGroups({
    mentionNotifications: [],
    sessionAggregates: new Map(),
    currentSession: { id: "sess_1", title: "Разогрев супа" },
    knownSessions: [{ id: "sess_1", name: "Разогрев супа" }],
  });

  assert.equal(center.rowCount, 0);
  assert.equal(center.badgeCount, 0);
  assert.deepEqual(center.groups, []);
});

test("groups mention notifications by session and keeps the comment snippet", () => {
  const center = buildAccountDiscussionNotificationGroups({
    mentionNotifications: [
      {
        id: "mention_1",
        session_id: "sess_1",
        project_id: "proj_1",
        thread_id: "thread_1",
        comment_id: "comment_1",
        comment_body: "Проверьте температуру подачи перед публикацией",
        created_by: "editor@example.com",
        created_at: 200,
      },
      {
        id: "mention_1",
        session_id: "sess_1",
        project_id: "proj_1",
        thread_id: "thread_1",
        comment_id: "comment_1",
        comment_body: "duplicate",
        created_at: 199,
      },
    ],
    currentProject: { id: "proj_1", title: "Борщ с говядиной" },
    knownSessions: [{ id: "sess_1", name: "Разогрев супа", project_id: "proj_1" }],
  });

  assert.equal(center.groups.length, 1);
  assert.equal(center.groups[0].sessionTitle, "Разогрев супа");
  assert.equal(center.groups[0].projectTitle, "Борщ с говядиной");
  assert.equal(center.groups[0].notificationType, "discussion");
  assert.equal(center.groups[0].rows.length, 1);
  assert.equal(center.groups[0].rows[0].type, "mention");
  assert.equal(center.groups[0].rows[0].notificationType, "discussion");
  assert.match(center.groups[0].rows[0].excerpt, /Проверьте температуру/);
  assert.equal(center.groups[0].rows[0].badges[0].label, "Упоминание");
});

test("builds backend feed rows with source-backed snippets and target metadata", () => {
  const center = buildAccountDiscussionNotificationGroups({
    noteNotifications: [
      {
        id: "sess_1:thread_1:comment_1",
        reason: "mention",
        session_id: "sess_1",
        session_title: "Разогрев супа",
        project_id: "proj_1",
        project_title: "Борщ с говядиной",
        thread_id: "thread_1",
        thread_title: "Проверить этап разогрева",
        mention_id: "mention_1",
        comment_id: "comment_1",
        snippet: "Посмотри, пожалуйста, температуру перед публикацией",
        author_display: "Иван",
        created_at: 200,
        last_comment_at: 210,
        unread_count: 3,
        mention_count: 1,
        requires_attention: true,
        attention_count: 1,
        target: {
          project_id: "proj_1",
          session_id: "sess_1",
          thread_id: "thread_1",
          comment_id: "comment_1",
        },
      },
    ],
  });

  assert.equal(center.rowCount, 1);
  assert.equal(center.mentionCount, 1);
  assert.equal(center.attentionCount, 1);
  assert.equal(center.unreadCount, 3);
  assert.equal(center.unviewedCount, 1);
  assert.equal(center.viewedCount, 0);
  assert.equal(center.badgeCount, 5);
  assert.equal(center.groups[0].sessionTitle, "Разогрев супа");
  assert.equal(center.groups[0].projectTitle, "Борщ с говядиной");
  const row = center.groups[0].rows[0];
  assert.equal(row.type, "feed");
  assert.equal(row.title, "Проверить этап разогрева");
  assert.match(row.excerpt, /Посмотри/);
  assert.deepEqual(row.badges.map((badge) => badge.label), ["Упоминание", "Внимание", "Новые 3"]);
  assert.equal(row.mention.id, "mention_1");
  assert.equal(row.target.thread_id, "thread_1");
  assert.equal(row.target.comment_id, "comment_1");
  assert.equal(row.canOpen, true);
  assert.equal(row.canMarkRead, true);
  assert.equal(row.canAcknowledgeMention, true);
  assert.equal(row.canAcknowledgeAttention, true);
  assert.equal(row.requiresAttentionActive, true);
  assert.equal(row.viewState, "unviewed");
});

test("backend unread-only feed rows do not invent message snippets", () => {
  const center = buildAccountDiscussionNotificationGroups({
    noteNotifications: [
      {
        id: "sess_1:thread_1",
        reason: "unread",
        session_id: "sess_1",
        session_title: "Разогрев супа",
        thread_id: "thread_1",
        thread_title: "Обсуждение",
        unread_count: 2,
      },
    ],
  });

  const row = center.groups[0].rows[0];
  assert.equal(row.type, "feed");
  assert.equal(row.excerpt, "");
  assert.deepEqual(row.badges.map((badge) => badge.label), ["Новые 2"]);
  assert.equal(row.canMarkRead, true);
  assert.equal(row.canAcknowledgeAttention, false);
  assert.equal(row.viewState, "unviewed");
});

test("backend viewed feed rows with zero active badges are retained and openable", () => {
  const center = buildAccountDiscussionNotificationGroups({
    noteNotifications: [
      {
        id: "viewed",
        reason: "activity",
        session_id: "sess_1",
        session_title: "Разогрев супа",
        project_id: "proj_1",
        project_title: "Борщ с говядиной",
        thread_id: "thread_viewed",
        thread_title: "Просмотренная тема",
        comment_id: "comment_seen",
        snippet: "Историческое сообщение остаётся в ленте",
        author_display: "Иван",
        last_comment_at: 220,
        mention_count: 0,
        attention_count: 0,
        unread_count: 0,
        requires_attention: true,
      },
    ],
  });

  assert.equal(center.rowCount, 1);
  assert.equal(center.badgeCount, 0);
  assert.equal(center.viewedCount, 1);
  assert.equal(center.unviewedCount, 0);
  assert.equal(center.attentionCount, 0);
  const row = center.groups[0].rows[0];
  assert.equal(row.threadId, "thread_viewed");
  assert.equal(row.viewState, "viewed");
  assert.equal(row.requiresAttentionActive, false);
  assert.equal(row.canOpen, true);
  assert.equal(row.canMarkRead, false);
  assert.equal(row.canAcknowledgeAttention, false);
  assert.deepEqual(row.badges.map((badge) => badge.label), ["Просмотрено"]);
});

test("builds aggregate-only rows from counts without inventing message snippets", () => {
  const center = buildAccountDiscussionNotificationGroups({
    sessionAggregates: new Map([
      ["sess_1", {
        open_notes_count: 4,
        attention_discussions_count: 2,
        personal_discussions_count: 1,
      }],
    ]),
    currentSession: { id: "sess_1", title: "Разогрев супа" },
    currentProject: { id: "proj_1", title: "Борщ с говядиной" },
    knownSessions: [{ id: "sess_1", name: "Разогрев супа", project_id: "proj_1" }],
  });

  const row = center.groups[0].rows[0];
  assert.equal(row.type, "aggregate");
  assert.equal(row.notificationType, "discussion");
  assert.equal(row.title, "Есть обсуждения, требующие внимания");
  assert.equal(row.excerpt, "Открытые обсуждения: 4");
  assert.deepEqual(row.badges.map((badge) => badge.label), ["Внимание 2", "Мои 1", "Открыто 4"]);
  assert.equal(center.badgeCount, 3);
  assert.equal(row.canOpen, true);
  assert.equal(row.canMarkRead, false);
  assert.equal(row.canAcknowledgeAttention, false);
});

test("filters notification groups by all, unviewed, viewed, and attention", () => {
  const center = buildAccountDiscussionNotificationGroups({
    noteNotifications: [
      {
        id: "mention",
        reason: "mention",
        session_id: "sess_1",
        thread_id: "thread_mention",
        mention_id: "mention_1",
        comment_id: "comment_1",
        mention_count: 1,
        snippet: "mention",
      },
      {
        id: "unread",
        reason: "unread",
        session_id: "sess_1",
        thread_id: "thread_unread",
        unread_count: 2,
      },
      {
        id: "attention",
        reason: "attention",
        session_id: "sess_2",
        thread_id: "thread_attention",
        attention_count: 1,
        requires_attention: true,
      },
      {
        id: "viewed",
        reason: "activity",
        session_id: "sess_3",
        thread_id: "thread_viewed",
        unread_count: 0,
        mention_count: 0,
        attention_count: 0,
        snippet: "viewed",
      },
    ],
  });

  assert.equal(filterDiscussionNotificationGroups(center, "all").rowCount, 4);
  assert.deepEqual(
    filterDiscussionNotificationGroups(center, "unviewed").groups.flatMap((group) => group.rows.map((row) => row.threadId)),
    ["thread_mention", "thread_unread"],
  );
  assert.deepEqual(
    filterDiscussionNotificationGroups(center, "viewed").groups.flatMap((group) => group.rows.map((row) => row.threadId)),
    ["thread_viewed"],
  );
  assert.deepEqual(
    filterDiscussionNotificationGroups(center, "attention").groups.flatMap((group) => group.rows.map((row) => row.threadId)),
    ["thread_attention"],
  );
});

test("sorts mention rows before aggregate rows for the same session", () => {
  const center = buildAccountDiscussionNotificationGroups({
    mentionNotifications: [{
      id: "mention_1",
      session_id: "sess_1",
      thread_id: "thread_1",
      comment_id: "comment_1",
      comment_body: "Нужна проверка",
      created_at: 100,
    }],
    sessionAggregates: { sess_1: { open_notes_count: 2, attention_discussions_count: 1 } },
    knownSessions: [{ id: "sess_1", name: "Разогрев супа" }],
  });

  assert.deepEqual(center.groups[0].rows.map((row) => row.type), ["mention", "aggregate"]);
});
