import assert from "node:assert/strict";
import test from "node:test";

import {
  decideRemoteSessionSyncAction,
  deriveUnsafeLocalSessionSyncReason,
  hasUnsafeLocalSessionState,
} from "./liveSessionSyncV1.js";

test("unsafe local reason marks save-in-flight separately from dirty draft", () => {
  assert.equal(
    deriveUnsafeLocalSessionSyncReason({
      isManualSaveBusy: true,
      save: { isDirty: true, isSaving: false },
    }),
    "saving",
  );
  assert.equal(
    deriveUnsafeLocalSessionSyncReason({
      save: { isDirty: true, isSaving: false },
    }),
    "dirty",
  );
  assert.equal(
    deriveUnsafeLocalSessionSyncReason({
      save: { isDirty: false, isSaving: false },
      isManualSaveBusy: false,
    }),
    "",
  );
});

test("unsafe local bool stays backward-compatible", () => {
  assert.equal(
    hasUnsafeLocalSessionState({
      save: { isDirty: true, isSaving: false },
      isManualSaveBusy: false,
    }),
    true,
  );
  assert.equal(
    hasUnsafeLocalSessionState({
      save: { isDirty: false, isSaving: false },
      isManualSaveBusy: false,
    }),
    false,
  );
});

test("same-window saving token mismatch is deferred instead of stale", () => {
  assert.equal(
    decideRemoteSessionSyncAction({
      localVersionToken: "11.4.1000",
      remoteVersionToken: "12.5.1001",
      acknowledgedRemoteVersionToken: "11.4.1000",
      unsafeLocal: true,
      unsafeLocalReason: "saving",
    }),
    "defer",
  );
});

test("dirty local draft still marks stale for remote mismatch", () => {
  assert.equal(
    decideRemoteSessionSyncAction({
      localVersionToken: "11.4.1000",
      remoteVersionToken: "12.5.1001",
      acknowledgedRemoteVersionToken: "11.4.1000",
      unsafeLocal: true,
      unsafeLocalReason: "dirty",
    }),
    "mark_stale",
  );
});

test("post-save dirty grace defers single-window dirty mismatch", () => {
  assert.equal(
    decideRemoteSessionSyncAction({
      localVersionToken: "11.4.1000",
      remoteVersionToken: "12.5.1001",
      acknowledgedRemoteVersionToken: "11.4.1000",
      unsafeLocal: true,
      unsafeLocalReason: "dirty",
      postSaveDirtyGraceActive: true,
    }),
    "defer",
  );
});

test("remote mismatch auto-applies when local state is safe", () => {
  assert.equal(
    decideRemoteSessionSyncAction({
      localVersionToken: "11.4.1000",
      remoteVersionToken: "12.5.1001",
      acknowledgedRemoteVersionToken: "",
      unsafeLocal: false,
      unsafeLocalReason: "",
    }),
    "auto_apply",
  );
});

test("token equality and ack token still noop regardless of unsafe reason", () => {
  assert.equal(
    decideRemoteSessionSyncAction({
      localVersionToken: "12.5.1001",
      remoteVersionToken: "12.5.1001",
      acknowledgedRemoteVersionToken: "",
      unsafeLocal: true,
      unsafeLocalReason: "saving",
    }),
    "noop",
  );
  assert.equal(
    decideRemoteSessionSyncAction({
      localVersionToken: "11.4.1000",
      remoteVersionToken: "12.5.1001",
      acknowledgedRemoteVersionToken: "12.5.1001",
      unsafeLocal: true,
      unsafeLocalReason: "dirty",
    }),
    "noop",
  );
});

test("legacy unsafeLocal callers without reason still mark stale", () => {
  assert.equal(
    decideRemoteSessionSyncAction({
      localVersionToken: "11.4.1000",
      remoteVersionToken: "12.5.1001",
      acknowledgedRemoteVersionToken: "",
      unsafeLocal: true,
    }),
    "mark_stale",
  );
});
