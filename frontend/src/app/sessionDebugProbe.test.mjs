import assert from "node:assert/strict";
import test from "node:test";

import { buildSessionDebugProbeSnapshot } from "./sessionDebugProbe.js";

test("buildSessionDebugProbeSnapshot exposes normalized read-only route, activation, shell, and stage session state", () => {
  const snapshot = buildSessionDebugProbeSnapshot({
    routeSelection: { projectId: " proj_1 ", sessionId: " sess_1 " },
    requestedSessionId: " sess_1 ",
    activeSessionId: " sess_1 ",
    confirmedSessionId: " sess_1 ",
    activationState: {
      phase: " restoring_session ",
      projectId: " proj_1 ",
      sessionId: " sess_1 ",
      source: " url_restore ",
      error: "",
    },
    shellSessionId: " sess_1 ",
    shellTransitionReason: " preserve_during_same_session_restore ",
    shellResetInfo: {
      reason: " preserve_during_same_session_restore ",
      prevShellSessionId: " sess_1 ",
      nextShellSessionId: " sess_1 ",
      at: 123,
    },
    processStageSessionId: " sess_1 ",
  });

  assert.deepEqual(snapshot, {
    route: {
      projectId: "proj_1",
      sessionId: "sess_1",
    },
    restoreMemory: {
      requestedSessionId: "sess_1",
      activeSessionId: "sess_1",
      confirmedSessionId: "sess_1",
    },
    activationState: {
      phase: "restoring_session",
      projectId: "proj_1",
      sessionId: "sess_1",
      source: "url_restore",
      error: "",
    },
    shell: {
      shellSessionId: "sess_1",
      transitionKind: "preserve_during_same_session_restore",
      resetInfo: {
        reason: "preserve_during_same_session_restore",
        prevShellSessionId: "sess_1",
        nextShellSessionId: "sess_1",
        at: 123,
      },
    },
    processStage: {
      sessionId: "sess_1",
    },
  });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.route), true);
  assert.equal(Object.isFrozen(snapshot.activationState), true);
  assert.equal(Object.isFrozen(snapshot.shell), true);
});
