import test from "node:test";
import assert from "node:assert/strict";

import {
  countOpenReviewComments,
  flattenReviewCommentsFromNotes,
  normalizeReviewStatus,
  withAddedReviewComment,
  withReviewCommentStatus,
} from "./reviewWorkflowV1.js";

test("normalizeReviewStatus keeps bounded v1 states", () => {
  assert.equal(normalizeReviewStatus("review"), "in_review");
  assert.equal(normalizeReviewStatus("ready"), "approved");
  assert.equal(normalizeReviewStatus("changes_requested"), "changes_requested");
  assert.equal(normalizeReviewStatus("unknown"), "draft");
});

test("withAddedReviewComment appends anchored review comment to notes map", () => {
  const next = withAddedReviewComment({}, {
    session_id: "s1",
    anchor_type: "node",
    anchor_id: "Task_1",
    anchor_label: "Task A",
    body: "Проверьте это место",
    author_user_id: "u1",
    author_label: "reviewer@local",
    status: "open",
  });
  const flat = flattenReviewCommentsFromNotes(next, { sessionId: "s1" });
  assert.equal(flat.length, 1);
  assert.equal(flat[0].anchor_id, "Task_1");
  assert.equal(flat[0].anchor_type, "node");
  assert.equal(flat[0].status, "open");
  assert.equal(flat[0].author_user_id, "u1");
});

test("withReviewCommentStatus resolves and reopens comment", () => {
  const seeded = withAddedReviewComment({}, {
    session_id: "s1",
    anchor_type: "sequence_flow",
    anchor_id: "Flow_1",
    body: "Добавить условие",
    author_label: "qa@local",
  });
  const comment = flattenReviewCommentsFromNotes(seeded, { sessionId: "s1" })[0];
  assert.ok(comment?.id);

  const resolvedMap = withReviewCommentStatus(seeded, {
    comment_id: comment.id,
    status: "resolved",
    actor_user_id: "owner_1",
    actor_label: "owner@local",
  });
  const resolved = flattenReviewCommentsFromNotes(resolvedMap, { sessionId: "s1" })[0];
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.resolved_by_user_id, "owner_1");
  assert.equal(countOpenReviewComments(resolvedMap, { sessionId: "s1" }), 0);

  const reopenedMap = withReviewCommentStatus(resolvedMap, {
    comment_id: comment.id,
    status: "open",
    actor_user_id: "owner_1",
    actor_label: "owner@local",
  });
  const reopened = flattenReviewCommentsFromNotes(reopenedMap, { sessionId: "s1" })[0];
  assert.equal(reopened.status, "open");
  assert.equal(countOpenReviewComments(reopenedMap, { sessionId: "s1" }), 1);
});

