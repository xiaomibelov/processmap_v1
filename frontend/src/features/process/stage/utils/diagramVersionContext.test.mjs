import test from "node:test";
import assert from "node:assert/strict";
import {
  isDiagramVersionSessionMatch,
  resolveDiagramBaseVersionForActiveSession,
} from "./diagramVersionContext.js";

test("late response from previous session is rejected for version-context update", () => {
  assert.equal(isDiagramVersionSessionMatch("sid_active", "sid_old"), false);
});

test("stale numeric base from non-active sid is not readable for save", () => {
  const base = resolveDiagramBaseVersionForActiveSession({
    activeSessionId: "sid_active",
    storedSessionId: "sid_old",
    storedVersion: 17,
  });
  assert.equal(base, null);
});

test("accepted write for active session keeps version context readable", () => {
  const base = resolveDiagramBaseVersionForActiveSession({
    activeSessionId: "sid_active",
    storedSessionId: "sid_active",
    storedVersion: 18,
  });
  assert.equal(base, 18);
});

test("sid mismatch invalidates base even when numeric version exists", () => {
  const base = resolveDiagramBaseVersionForActiveSession({
    activeSessionId: "sid_next",
    storedSessionId: "sid_prev",
    storedVersion: 999,
  });
  assert.equal(base, null);
});
