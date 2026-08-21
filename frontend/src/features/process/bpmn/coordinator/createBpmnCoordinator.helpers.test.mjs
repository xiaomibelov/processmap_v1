import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifySaveTrigger,
  isStaleConflictFailure,
  fnv1aHex,
  normalizeErrorCode,
  asNumber,
  readStaleConflictChangedKeys,
} from "./createBpmnCoordinator.helpers.js";

describe("createBpmnCoordinator.helpers", () => {
  it("asNumber coerces finite numbers and falls back", () => {
    assert.equal(asNumber(5, 0), 5);
    assert.equal(asNumber("3.5", 0), 3.5);
    assert.equal(asNumber(NaN, 99), 99);
    assert.equal(asNumber(undefined, -1), -1);
    assert.equal(asNumber(null, 7), 0);
    assert.equal(asNumber("", 42), 0);
  });

  it("classifySaveTrigger maps reasons to trigger classes", () => {
    assert.equal(classifySaveTrigger("autosave"), "autosave");
    assert.equal(classifySaveTrigger("manual_save"), "manual_save");
    assert.equal(classifySaveTrigger("beforeunload"), "beforeunload_reload_flush");
    assert.equal(classifySaveTrigger("pagehide"), "beforeunload_reload_flush");
    assert.equal(classifySaveTrigger("visibility_hidden"), "beforeunload_reload_flush");
    assert.equal(classifySaveTrigger("reload"), "hydration_reload");
    assert.equal(classifySaveTrigger("pending_replay"), "pending_replay");
    assert.equal(classifySaveTrigger("foo"), "other");
    assert.equal(classifySaveTrigger("foo", { fromPending: true }), "pending_replay");
  });

  it("isStaleConflictFailure detects 409, errorCode and details.code", () => {
    assert.equal(isStaleConflictFailure({ status: 409 }), true);
    assert.equal(isStaleConflictFailure({ errorCode: "diagram_state_conflict" }), true);
    assert.equal(
      isStaleConflictFailure({ errorDetails: { code: "DIAGRAM_STATE_CONFLICT" } }),
      true,
    );
    assert.equal(isStaleConflictFailure({ status: 200 }), false);
    assert.equal(isStaleConflictFailure({ errorCode: "OTHER" }), false);
    assert.equal(isStaleConflictFailure(null), false);
  });

  it("fnv1aHex returns deterministic 8-char hex", () => {
    assert.equal(fnv1aHex("").length, 8);
    assert.match(fnv1aHex(""), /^[0-9a-f]{8}$/);
    assert.equal(fnv1aHex("hello"), fnv1aHex("hello"));
    assert.notEqual(fnv1aHex("hello"), fnv1aHex("world"));
  });

  it("normalizeErrorCode upper-cases and trims", () => {
    assert.equal(normalizeErrorCode("  diagram_state_conflict  "), "DIAGRAM_STATE_CONFLICT");
    assert.equal(normalizeErrorCode("HTTP_409"), "HTTP_409");
  });

  it("readStaleConflictChangedKeys normalizes snake/camel keys", () => {
    assert.deepEqual(
      readStaleConflictChangedKeys({
        server_last_write: { changed_keys: ["a", " b", "", null] },
      }),
      ["a", "b"],
    );
    assert.deepEqual(
      readStaleConflictChangedKeys({
        serverLastWrite: { changedKeys: ["x"] },
      }),
      ["x"],
    );
    assert.deepEqual(readStaleConflictChangedKeys({}), []);
  });
});
