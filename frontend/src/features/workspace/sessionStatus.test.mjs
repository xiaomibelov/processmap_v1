import test from "node:test";
import assert from "node:assert/strict";

import { normalizeManualSessionStatus, resolveSessionStatusFromDraft, getAllowedNextStatuses } from "./sessionStatus.js";

test("normalizeManualSessionStatus maps done/archive aliases", () => {
  assert.equal(normalizeManualSessionStatus("done"), "ready");
  assert.equal(normalizeManualSessionStatus("archive"), "archived");
  assert.equal(normalizeManualSessionStatus("inprogress"), "in_progress");
});

test("resolveSessionStatusFromDraft prefers interview.status", () => {
  const status = resolveSessionStatusFromDraft({
    status: "draft",
    interview: { status: "review" },
  });
  assert.equal(status, "review");
});

test("resolveSessionStatusFromDraft falls back to draft when missing", () => {
  assert.equal(resolveSessionStatusFromDraft({}, "draft"), "draft");
  assert.equal(resolveSessionStatusFromDraft(null, "draft"), "draft");
});

test("getAllowedNextStatuses mirrors backend transition matrix", () => {
  assert.deepEqual([...getAllowedNextStatuses("draft")].sort(), ["archived", "draft", "in_progress"]);
  assert.deepEqual([...getAllowedNextStatuses("in_progress")].sort(), ["archived", "draft", "in_progress", "ready", "review"]);
  assert.deepEqual([...getAllowedNextStatuses("review")].sort(), ["archived", "in_progress", "ready", "review"]);
  assert.deepEqual([...getAllowedNextStatuses("ready")].sort(), ["archived", "in_progress", "ready", "review"]);
  assert.deepEqual([...getAllowedNextStatuses("archived")].sort(), ["archived", "draft", "in_progress", "ready", "review"]);
});

test("getAllowedNextStatuses normalizes aliases", () => {
  assert.deepEqual([...getAllowedNextStatuses("done")].sort(), ["archived", "in_progress", "ready", "review"]);
  assert.deepEqual([...getAllowedNextStatuses("archive")].sort(), ["archived", "draft", "in_progress", "ready", "review"]);
});

test("getAllowedNextStatuses returns empty set for unknown statuses", () => {
  const allowed = getAllowedNextStatuses("unknown_status");
  assert.equal(allowed.size, 0);
});
