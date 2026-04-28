import assert from "node:assert/strict";
import test from "node:test";

import {
  flushProcessStageBeforeLeave,
  shouldBypassLeaveFlushAfterRecentPublish,
} from "./processLeaveFlushController.js";

function createSteppedNow(start = 0, step = 500) {
  let value = start;
  return () => {
    value += step;
    return value;
  };
}

test("post-publish clean state bypasses leave flush and avoids false timeout", async () => {
  let flushCalls = 0;
  const result = await flushProcessStageBeforeLeave({
    requestedSessionId: "sid_publish",
    activeSessionId: "sid_publish",
    saveDirtyHint: false,
    hasXmlDraftChanges: false,
    lastSuccessfulPublish: {
      sessionId: "sid_publish",
      atMs: 10_000,
    },
    now: () => 12_000,
    flushFromActiveTab: async () => {
      flushCalls += 1;
      return { ok: true, pending: true, xml: "<xml />" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "recent_publish_no_local_changes");
  assert.equal(flushCalls, 0);
});

test("clean project navigation skips leave flush to avoid false remote update", async () => {
  let flushCalls = 0;
  const result = await flushProcessStageBeforeLeave({
    requestedSessionId: "sid_clean",
    activeSessionId: "sid_clean",
    saveDirtyHint: false,
    hasXmlDraftChanges: false,
    now: () => 120_000,
    flushFromActiveTab: async () => {
      flushCalls += 1;
      return { ok: true, pending: false, xml: "<xml />" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "clean_session_no_local_changes");
  assert.equal(flushCalls, 0);
});

test("real flush failure still blocks leave navigation", async () => {
  let flushCalls = 0;
  const result = await flushProcessStageBeforeLeave({
    requestedSessionId: "sid_error",
    activeSessionId: "sid_error",
    saveDirtyHint: true,
    hasXmlDraftChanges: true,
    lastSuccessfulPublish: {
      sessionId: "sid_error",
      atMs: 10_000,
    },
    now: createSteppedNow(0, 200),
    sleep: async () => {},
    flushFromActiveTab: async () => {
      flushCalls += 1;
      return { ok: false, error: "persist_failed" };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "persist_failed");
  assert.equal(flushCalls, 1);
});

test("dirty pending loop still times out and blocks leave", async () => {
  let flushCalls = 0;
  const result = await flushProcessStageBeforeLeave({
    requestedSessionId: "sid_pending",
    activeSessionId: "sid_pending",
    saveDirtyHint: true,
    hasXmlDraftChanges: true,
    now: createSteppedNow(0, 1_000),
    sleep: async () => {},
    maxWaitMs: 4_200,
    flushFromActiveTab: async () => {
      flushCalls += 1;
      return { ok: true, pending: true, xml: "<xml />" };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "flush_before_leave_pending_timeout");
  assert.ok(flushCalls >= 1);
});

test("bypass helper requires same session and fresh publish timestamp", () => {
  const fresh = shouldBypassLeaveFlushAfterRecentPublish({
    activeSessionId: "sid_1",
    saveDirtyHint: false,
    hasXmlDraftChanges: false,
    lastSuccessfulPublish: { sessionId: "sid_1", atMs: 10_000 },
    nowMs: 20_000,
    bypassWindowMs: 30_000,
  });
  const stale = shouldBypassLeaveFlushAfterRecentPublish({
    activeSessionId: "sid_1",
    saveDirtyHint: false,
    hasXmlDraftChanges: false,
    lastSuccessfulPublish: { sessionId: "sid_1", atMs: 10_000 },
    nowMs: 50_500,
    bypassWindowMs: 30_000,
  });
  const mismatch = shouldBypassLeaveFlushAfterRecentPublish({
    activeSessionId: "sid_1",
    saveDirtyHint: false,
    hasXmlDraftChanges: false,
    lastSuccessfulPublish: { sessionId: "sid_other", atMs: 10_000 },
    nowMs: 12_000,
    bypassWindowMs: 30_000,
  });

  assert.equal(fresh.skip, true);
  assert.equal(stale.skip, false);
  assert.equal(stale.reason, "publish_too_old");
  assert.equal(mismatch.skip, false);
  assert.equal(mismatch.reason, "publish_sid_mismatch");
});
