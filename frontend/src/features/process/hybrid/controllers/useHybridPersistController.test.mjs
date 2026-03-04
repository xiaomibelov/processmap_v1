import test from "node:test";
import assert from "node:assert/strict";
import {
  makePendingHybridDraft,
  reduceHybridPersistState,
} from "./persistRetryMachine.js";

test("save 423 -> LOCK_BUSY and pending draft", () => {
  const draft = makePendingHybridDraft({ schema_version: "2.0", elements: [{ id: "E1" }] }, { reason: "hybrid_v2_text_commit" });
  const state = reduceHybridPersistState(
    { lastError: null, pendingDraft: null },
    { ok: false, status: 423, error: "Session is busy" },
    draft,
    { maxAutoRetries: 2, retryAttempt: 0 },
  );
  assert.equal(state.lastError, "LOCK_BUSY");
  assert.equal(Boolean(state.pendingDraft), true);
  assert.equal(state.pendingDraft.reason, "hybrid_v2_text_commit");
  assert.equal(state.shouldAutoRetry, true);
});

test("retry success clears pending draft and error", () => {
  const prev = {
    lastError: "LOCK_BUSY",
    pendingDraft: makePendingHybridDraft({ schema_version: "2.0", elements: [{ id: "E2" }] }, { reason: "hybrid_v2_drag_end" }),
  };
  const state = reduceHybridPersistState(
    prev,
    { ok: true, status: 200 },
    prev.pendingDraft,
    { maxAutoRetries: 2, retryAttempt: 1 },
  );
  assert.equal(state.lastError, null);
  assert.equal(state.pendingDraft, null);
  assert.equal(state.shouldAutoRetry, false);
});

test("retry exceeds auto attempts keeps pending LOCK_BUSY", () => {
  const prev = {
    lastError: "LOCK_BUSY",
    pendingDraft: makePendingHybridDraft({ schema_version: "2.0", elements: [{ id: "E3" }] }, { reason: "hybrid_v2_resize_end" }),
  };
  const state = reduceHybridPersistState(
    prev,
    { ok: false, status: 409, error: "lock busy" },
    prev.pendingDraft,
    { maxAutoRetries: 2, retryAttempt: 2 },
  );
  assert.equal(state.lastError, "LOCK_BUSY");
  assert.equal(Boolean(state.pendingDraft), true);
  assert.equal(state.shouldAutoRetry, false);
});
