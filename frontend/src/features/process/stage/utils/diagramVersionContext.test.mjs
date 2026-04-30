import test from "node:test";
import assert from "node:assert/strict";
import {
  isDiagramVersionSessionMatch,
  rememberMonotonicDiagramStateVersion,
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

test("same-session stale draft cannot lower remembered diagram version", () => {
  const next = rememberMonotonicDiagramStateVersion({
    activeSessionId: "sid_active",
    storedSessionId: "sid_active",
    storedVersion: 25,
    incomingSessionId: "sid_active",
    incomingVersion: 24,
  });

  assert.equal(next.accepted, true);
  assert.equal(next.sessionId, "sid_active");
  assert.equal(next.version, 25);
});

test("same-session higher accepted server version updates remembered diagram version", () => {
  const next = rememberMonotonicDiagramStateVersion({
    activeSessionId: "sid_active",
    storedSessionId: "sid_active",
    storedVersion: 24,
    incomingSessionId: "sid_active",
    incomingVersion: 25,
  });

  assert.equal(next.accepted, true);
  assert.equal(next.sessionId, "sid_active");
  assert.equal(next.version, 25);
});

test("same-session equal diagram version remains stable", () => {
  const next = rememberMonotonicDiagramStateVersion({
    activeSessionId: "sid_active",
    storedSessionId: "sid_active",
    storedVersion: 25,
    incomingSessionId: "sid_active",
    incomingVersion: 25,
  });

  assert.equal(next.accepted, true);
  assert.equal(next.sessionId, "sid_active");
  assert.equal(next.version, 25);
});

test("missing remembered version accepts first same-session version", () => {
  const next = rememberMonotonicDiagramStateVersion({
    activeSessionId: "sid_active",
    storedSessionId: "sid_active",
    storedVersion: null,
    incomingSessionId: "sid_active",
    incomingVersion: 23,
  });

  assert.equal(next.accepted, true);
  assert.equal(next.sessionId, "sid_active");
  assert.equal(next.version, 23);
});

test("session switch resets remembered version even when numerically lower", () => {
  const next = rememberMonotonicDiagramStateVersion({
    activeSessionId: "sid_next",
    storedSessionId: "sid_prev",
    storedVersion: 25,
    incomingSessionId: "sid_next",
    incomingVersion: 2,
  });

  assert.equal(next.accepted, true);
  assert.equal(next.sessionId, "sid_next");
  assert.equal(next.version, 2);
});

test("invalid same-session versions are ignored safely", () => {
  const next = rememberMonotonicDiagramStateVersion({
    activeSessionId: "sid_active",
    storedSessionId: "sid_active",
    storedVersion: 25,
    incomingSessionId: "sid_active",
    incomingVersion: "not-a-version",
  });

  assert.equal(next.accepted, false);
  assert.equal(next.sessionId, "sid_active");
  assert.equal(next.version, 25);
});

test("null and empty same-session versions are ignored safely", () => {
  for (const incomingVersion of [null, undefined, ""]) {
    const next = rememberMonotonicDiagramStateVersion({
      activeSessionId: "sid_active",
      storedSessionId: "sid_active",
      storedVersion: 25,
      incomingSessionId: "sid_active",
      incomingVersion,
    });

    assert.equal(next.accepted, false);
    assert.equal(next.sessionId, "sid_active");
    assert.equal(next.version, 25);
  }
});
