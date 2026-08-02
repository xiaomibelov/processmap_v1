import test from "node:test";
import assert from "node:assert/strict";

import {
  enqueueSessionPatchCasWrite,
  readSessionPatchAckDiagramStateVersion,
  readSessionPatchConflictServerCurrentVersion,
  resetSessionPatchCasCoordinator,
  resolveSessionPatchBaseAtSendTime,
} from "./sessionPatchCasCoordinator.js";
import { saveCoordinator } from "../../../session/saveCoordinator.js";
import { __resetForTests as resetCasVersionTracker, getVersion as getTrackedVersion } from "../../../../lib/casVersionTracker.js";

test.beforeEach(() => {
  resetSessionPatchCasCoordinator();
  resetCasVersionTracker();
});

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

test("session PATCH coordinator bumps tracked version on successful ack", async () => {
  const response = await enqueueSessionPatchCasWrite({
    sessionId: "sid_ack",
    patch: { bpmn_meta: { version: 1 }, base_diagram_state_version: 10 },
    apiPatchSession: async () => ({
      ok: true,
      session: { diagram_state_version: 11 },
    }),
  });

  assert.equal(response.ok, true);
  assert.equal(getTrackedVersion("sid_ack"), 11);
});

test("session PATCH coordinator does NOT adopt tracked base on 409; conflict gate blocks next write", async () => {
  let remembered = null;
  let patchCalls = 0;
  const response = await enqueueSessionPatchCasWrite({
    sessionId: "sid_conflict_track",
    patch: { interview: {}, base_diagram_state_version: 10 },
    apiPatchSession: async () => {
      patchCalls += 1;
      return {
        ok: false,
        status: 409,
        error: "DIAGRAM_STATE_CONFLICT",
        data: { server_current_version: 12 },
      };
    },
    rememberDiagramStateVersion: (version) => {
      remembered = version;
    },
  });

  assert.equal(response.ok, false);
  assert.equal(response.status, 409);
  // внешнее состояние получает серверную версию (для конфликт-UI)
  assert.equal(remembered, 12);
  // P1: tracked-base НЕ подменяется молча серверной версией
  assert.equal(getTrackedVersion("sid_conflict_track"), null);
  assert.ok(saveCoordinator.getConflict("sid_conflict_track"), "conflict gate must be armed");

  // следующий save заблокирован gate'ом и не доходит до транспорта
  const blocked = await enqueueSessionPatchCasWrite({
    sessionId: "sid_conflict_track",
    patch: { interview: {}, base_diagram_state_version: 10 },
    apiPatchSession: async () => {
      patchCalls += 1;
      return { ok: true, session: { diagram_state_version: 13 } };
    },
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.blockedByConflict, true);
  assert.equal(patchCalls, 1, "transport must not run while conflict gate is active");

  // явное решение пользователя: overwrite принимает серверную базу
  const resolved = saveCoordinator.resolveConflict("sid_conflict_track", "overwrite");
  assert.equal(resolved.ok, true);
  assert.equal(getTrackedVersion("sid_conflict_track"), 12);
});
