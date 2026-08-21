import assert from "node:assert/strict";
import test from "node:test";

import {
  applySnapshotRestorePutResult,
  buildSnapshotRestorePutOptions,
  shouldAttemptRequestedSessionRestore,
} from "./useSessionActivationOrchestration.js";
import {
  __resetForTests as __resetTrackerForTests,
  getVersion,
  setVersion,
} from "../lib/casVersionTracker.js";
import {
  __resetSaveDiagnosticsForTests,
  getSaveDiagnosticsTrail,
} from "../features/session/saveDiagnosticsTrail.js";

test("requested session restore runs only when a requested backend session still needs activation", () => {
  assert.equal(
    shouldAttemptRequestedSessionRestore({
      requestedSessionId: "sess_1",
      currentSessionId: "",
      activeSessionId: "",
      confirmedSessionId: "",
      urlSessionId: "sess_1",
      requestedExists: true,
      isLocalSessionId: () => false,
    }),
    true,
  );

  assert.equal(
    shouldAttemptRequestedSessionRestore({
      requestedSessionId: "sess_1",
      currentSessionId: "sess_1",
      activeSessionId: "sess_1",
      confirmedSessionId: "sess_1",
      urlSessionId: "sess_1",
      requestedExists: true,
      isLocalSessionId: () => false,
    }),
    false,
  );

  assert.equal(
    shouldAttemptRequestedSessionRestore({
      requestedSessionId: "local_1",
      currentSessionId: "",
      activeSessionId: "",
      confirmedSessionId: "",
      urlSessionId: "local_1",
      requestedExists: true,
      isLocalSessionId: (sid) => String(sid || "").startsWith("local_"),
    }),
    false,
  );
});

test("snapshot restore PUT options propagate diagram CAS base from fetched session state", () => {
  const options = buildSnapshotRestorePutOptions({
    sessionLike: {
      version: 41,
      bpmn_xml_version: 41,
      diagram_state_version: 133,
    },
    restoredSnapshot: {
      rev: 41,
    },
  });

  assert.deepEqual(options, {
    rev: 41,
    baseDiagramStateVersion: 133,
    sourceAction: "snapshot_restore",
  });
});

test("snapshot restore PUT options fall back to snapshot rev when session rev is missing", () => {
  const options = buildSnapshotRestorePutOptions({
    sessionLike: {
      diagramStateVersion: 9,
    },
    restoredSnapshot: {
      rev: 5,
    },
  });

  assert.deepEqual(options, {
    rev: 5,
    baseDiagramStateVersion: 9,
    sourceAction: "snapshot_restore",
  });
});

test("snapshot restore PUT success adopts server diagram_state_version into CAS tracker", () => {
  __resetTrackerForTests();
  __resetSaveDiagnosticsForTests();
  setVersion("sess_1", 202);

  const outcome = applySnapshotRestorePutResult({
    sessionId: "sess_1",
    putRes: { ok: true, status: 200, diagramStateVersion: 203 },
  });

  assert.deepEqual(outcome, { applied: true, reason: "ok", serverVersion: 203 });
  assert.equal(getVersion("sess_1"), 203);
  const types = getSaveDiagnosticsTrail().map((event) => event.type);
  assert.ok(types.includes("tracker_set"));
  assert.ok(types.includes("snapshot_restore_ok"));
});

test("snapshot restore PUT 409 adopts server base instead of surfacing a self-conflict", () => {
  __resetTrackerForTests();
  __resetSaveDiagnosticsForTests();
  setVersion("sess_1", 202);

  const outcome = applySnapshotRestorePutResult({
    sessionId: "sess_1",
    putRes: {
      ok: false,
      status: 409,
      error: "DIAGRAM_STATE_CONFLICT",
      data: {
        detail: {
          code: "DIAGRAM_STATE_CONFLICT",
          client_base_version: 202,
          server_current_version: 203,
        },
      },
    },
  });

  assert.deepEqual(outcome, { applied: true, reason: "conflict", serverVersion: 203 });
  assert.equal(getVersion("sess_1"), 203);
  const types = getSaveDiagnosticsTrail().map((event) => event.type);
  assert.ok(types.includes("snapshot_restore_conflict"));
});

test("snapshot restore PUT failure keeps tracker base intact", () => {
  __resetTrackerForTests();
  __resetSaveDiagnosticsForTests();
  setVersion("sess_1", 202);

  const outcome = applySnapshotRestorePutResult({
    sessionId: "sess_1",
    putRes: { ok: false, status: 0, error: "network_error" },
  });

  assert.equal(outcome.applied, false);
  assert.equal(outcome.reason, "error");
  assert.equal(getVersion("sess_1"), 202);
});
