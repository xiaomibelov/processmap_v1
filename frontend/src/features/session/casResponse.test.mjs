import test from "node:test";
import assert from "node:assert/strict";

import {
  readAckDiagramStateVersion,
  readConflictServerCurrentVersion,
  resolveBaseVersionAtSendTime,
  applyAckToTracker,
} from "./casResponse.js";

import {
  setVersion as setTrackedDiagramStateVersion,
  getVersion,
  clearSession as clearTrackedSession,
  __resetForTests as resetCasTracker,
} from "../../lib/casVersionTracker.js";

test("casResponse: readAckDiagramStateVersion reads flat snake/camel", () => {
  assert.equal(readAckDiagramStateVersion({ diagram_state_version: 42 }), 42);
  assert.equal(readAckDiagramStateVersion({ diagramStateVersion: 43 }), 43);
});

test("casResponse: readAckDiagramStateVersion reads session-nested and data-nested", () => {
  assert.equal(readAckDiagramStateVersion({ session: { diagram_state_version: 44 } }), 44);
  assert.equal(readAckDiagramStateVersion({ session: { diagramStateVersion: 45 } }), 45);
  assert.equal(readAckDiagramStateVersion({ data: { diagram_state_version: 46 } }), 46);
});

test("casResponse: readAckDiagramStateVersion returns null for missing/invalid", () => {
  assert.equal(readAckDiagramStateVersion(null), null);
  assert.equal(readAckDiagramStateVersion({}), null);
  assert.equal(readAckDiagramStateVersion({ diagram_state_version: -1 }), null);
  assert.equal(readAckDiagramStateVersion({ diagram_state_version: "abc" }), null);
});

test("casResponse: readConflictServerCurrentVersion covers all known shapes", () => {
  // flat snake/camel (saveCoordinator chain)
  assert.equal(readConflictServerCurrentVersion({ server_current_version: 7 }), 7);
  assert.equal(readConflictServerCurrentVersion({ serverCurrentVersion: 8 }), 8);
  // data-nested (sessionPatchCasCoordinator chain: data without detail)
  assert.equal(readConflictServerCurrentVersion({ data: { server_current_version: 9 } }), 9);
  assert.equal(readConflictServerCurrentVersion({ data: { serverCurrentVersion: 10 } }), 10);
  // data.detail nested (FastAPI HTTPException detail)
  assert.equal(readConflictServerCurrentVersion({ data: { detail: { server_current_version: 11 } } }), 11);
  // errorDetails / details
  assert.equal(readConflictServerCurrentVersion({ errorDetails: { server_current_version: 12 } }), 12);
  assert.equal(readConflictServerCurrentVersion({ details: { serverCurrentVersion: 13 } }), 13);
  assert.equal(readConflictServerCurrentVersion({}), null);
});

test("casResponse: resolveBaseVersionAtSendTime prefers tracker over getter and payload", () => {
  resetCasTracker();
  setTrackedDiagramStateVersion("sess_t1", 41);
  const base = resolveBaseVersionAtSendTime({
    sessionId: "sess_t1",
    getBaseDiagramStateVersion: () => 40,
    payload: { baseDiagramStateVersion: 39, base_diagram_state_version: 38 },
  });
  assert.equal(base, 41);
  clearTrackedSession("sess_t1");
});

test("casResponse: resolveBaseVersionAtSendTime falls back to getter, then payload", () => {
  resetCasTracker();
  const fromGetter = resolveBaseVersionAtSendTime({
    sessionId: "sess_t2",
    getBaseDiagramStateVersion: () => 40,
    payload: { baseDiagramStateVersion: 39 },
  });
  assert.equal(fromGetter, 40);
  const fromPayloadCamel = resolveBaseVersionAtSendTime({
    sessionId: "sess_t3",
    payload: { baseDiagramStateVersion: 39 },
  });
  assert.equal(fromPayloadCamel, 39);
  const fromPayloadSnake = resolveBaseVersionAtSendTime({
    sessionId: "sess_t4",
    payload: { base_diagram_state_version: 38 },
  });
  assert.equal(fromPayloadSnake, 38);
  const none = resolveBaseVersionAtSendTime({ sessionId: "sess_t5", payload: {} });
  assert.equal(none, null);
});

test("casResponse: applyAckToTracker sets tracker from ack and returns version", () => {
  resetCasTracker();
  const applied = applyAckToTracker("sess_ack", { ok: true, diagram_state_version: 42 });
  assert.equal(applied, 42);
  assert.equal(getVersion("sess_ack"), 42);
  const camel = applyAckToTracker("sess_ack2", { session: { diagramStateVersion: 7 } });
  assert.equal(camel, 7);
  assert.equal(getVersion("sess_ack2"), 7);
  const skipped = applyAckToTracker("sess_ack3", { ok: false, status: 409 });
  assert.equal(skipped, null);
  assert.equal(getVersion("sess_ack3"), null);
  resetCasTracker();
});
