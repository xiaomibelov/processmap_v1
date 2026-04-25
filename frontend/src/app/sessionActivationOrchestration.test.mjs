import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSnapshotRestorePutOptions,
  shouldAttemptRequestedSessionRestore,
} from "./useSessionActivationOrchestration.js";

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
  });
});
