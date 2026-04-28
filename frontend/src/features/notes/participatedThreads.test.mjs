import assert from "node:assert/strict";
import test from "node:test";

import {
  countParticipatedThreads,
  isThreadParticipatedByCurrentUser,
} from "./participatedThreads.js";

test("participation includes threads created by current user", () => {
  assert.equal(isThreadParticipatedByCurrentUser({ created_by: "user_me", comments: [] }, "user_me"), true);
});

test("participation includes threads with current user comments", () => {
  assert.equal(isThreadParticipatedByCurrentUser({
    created_by: "user_other",
    comments: [{ author_user_id: "user_me", body: "reply" }],
  }, "user_me"), true);
});

test("participation includes threads mentioning current user", () => {
  assert.equal(isThreadParticipatedByCurrentUser({
    created_by: "user_other",
    comments: [{
      author_user_id: "user_other",
      mentions: [{ mentioned_user_id: "user_me" }],
    }],
  }, "user_me"), true);
});

test("participation excludes unrelated and attention-only threads", () => {
  assert.equal(isThreadParticipatedByCurrentUser({
    created_by: "user_other",
    requires_attention: true,
    status: "open",
    priority: "high",
    comments: [{ author_user_id: "user_other", mentions: [] }],
  }, "user_me"), false);
});

test("participation count uses the same current-user rule", () => {
  const threads = [
    { id: "created", created_by: "user_me", comments: [] },
    { id: "commented", created_by: "user_other", comments: [{ author_user_id: "user_me" }] },
    { id: "mentioned", created_by: "user_other", comments: [{ mentions: [{ mentioned_user_id: "user_me" }] }] },
    { id: "other", created_by: "user_other", comments: [{ author_user_id: "user_other" }] },
  ];
  assert.equal(countParticipatedThreads(threads, "user_me"), 3);
});

test("missing current user is safe and yields no participation", () => {
  assert.equal(isThreadParticipatedByCurrentUser({ created_by: "user_me" }, ""), false);
  assert.equal(countParticipatedThreads([{ created_by: "user_me" }], ""), 0);
});
