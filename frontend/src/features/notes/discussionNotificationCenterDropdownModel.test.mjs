import assert from "node:assert/strict";
import test from "node:test";

import { buildAccountDiscussionNotificationGroups } from "./discussionNotificationCenterDropdownModel.js";

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
});

test("backend aggregate-only feed rows do not invent message snippets", () => {
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
