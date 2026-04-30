import test from "node:test";
import assert from "node:assert/strict";

import {
  enqueueSessionPatchCasWrite,
  readSessionPatchAckDiagramStateVersion,
  readSessionPatchConflictServerCurrentVersion,
  resetSessionPatchCasCoordinator,
  resolveSessionPatchBaseAtSendTime,
} from "./sessionPatchCasCoordinator.js";

test("session PATCH coordinator resolves latest base at send time for queued same-client writes", async () => {
  resetSessionPatchCasCoordinator();
  let contextVersion = 78;
  const sent = [];
  const remember = (version) => {
    contextVersion = Math.max(contextVersion, Number(version));
  };
  const apiPatchSession = async (sid, payload) => {
    sent.push({ sid, payload: { ...payload } });
    if (sent.length === 1) {
      remember(79);
      return { ok: true, session: { diagram_state_version: 79 } };
    }
    return { ok: true, session: { diagram_state_version: 80 } };
  };

  const first = enqueueSessionPatchCasWrite({
    sessionId: "sid_self",
    patch: { bpmn_meta: { version: 1 }, base_diagram_state_version: 78 },
    apiPatchSession,
    getBaseDiagramStateVersion: () => contextVersion,
    rememberDiagramStateVersion: remember,
  });
  const second = enqueueSessionPatchCasWrite({
    sessionId: "sid_self",
    patch: { interview: { steps: [] }, base_diagram_state_version: 78 },
    apiPatchSession,
    getBaseDiagramStateVersion: () => contextVersion,
    rememberDiagramStateVersion: remember,
  });

  await Promise.all([first, second]);

  assert.equal(sent.length, 2);
  assert.equal(sent[0].payload.base_diagram_state_version, 78);
  assert.equal(sent[1].payload.base_diagram_state_version, 79);
});

test("session PATCH coordinator updates context from 409 server-current but propagates failed response", async () => {
  resetSessionPatchCasCoordinator();
  let remembered = 0;
  const response = await enqueueSessionPatchCasWrite({
    sessionId: "sid_conflict",
    patch: { interview: {}, base_diagram_state_version: 78 },
    apiPatchSession: async () => ({
      ok: false,
      status: 409,
      error: "DIAGRAM_STATE_CONFLICT",
      data: { server_current_version: 79 },
    }),
    getBaseDiagramStateVersion: () => 78,
    rememberDiagramStateVersion: (version) => {
      remembered = Number(version);
    },
  });

  assert.equal(response.ok, false);
  assert.equal(response.status, 409);
  assert.equal(remembered, 79);
});

test("session PATCH base resolver prefers current context over stale fallback", () => {
  assert.equal(resolveSessionPatchBaseAtSendTime({
    getBaseDiagramStateVersion: () => 79,
    fallbackBaseDiagramStateVersion: 78,
  }), 79);
});

test("session PATCH response readers normalize ack and conflict versions", () => {
  assert.equal(readSessionPatchAckDiagramStateVersion({
    ok: true,
    session: { diagramStateVersion: "81" },
  }), 81);
  assert.equal(readSessionPatchConflictServerCurrentVersion({
    ok: false,
    errorDetails: { serverCurrentVersion: "82" },
  }), 82);
});
