import test from "node:test";
import assert from "node:assert/strict";

import { normalizeManualSessionStatus, resolveSessionStatusFromDraft } from "./sessionStatus.js";

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
