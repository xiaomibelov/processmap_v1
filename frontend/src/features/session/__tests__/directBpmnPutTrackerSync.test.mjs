// Guard-тест P0 (fix/canvas-editing-stability): прямые PUT /bpmn синкают
// casVersionTracker. Тест-регрессия — sync на main уже есть
// (app/useSessionActivationOrchestration.js applySnapshotRestorePutResult),
// контур его не меняет, но цепочка «direct PUT → tracker» — критичная для
// отсутствия self-409, фиксируем явно.

import test from "node:test";
import assert from "node:assert/strict";

import { applySnapshotRestorePutResult } from "../../../app/useSessionActivationOrchestration.js";
import {
  __resetForTests as resetCasVersionTracker,
  getVersion as getTrackedDiagramStateVersion,
  setVersion as setTrackedDiagramStateVersion,
} from "../../../lib/casVersionTracker.js";

test.beforeEach(() => {
  resetCasVersionTracker();
});

test("direct PUT /bpmn ack syncs tracker to the acked diagram_state_version", () => {
  const sid = "sid_direct_put_ack";
  setTrackedDiagramStateVersion(sid, 1);

  const result = applySnapshotRestorePutResult({
    sessionId: sid,
    putRes: { ok: true, diagramStateVersion: 5 },
  });

  assert.equal(result.applied, true, JSON.stringify(result));
  assert.equal(result.serverVersion, 5);
  assert.equal(getTrackedDiagramStateVersion(sid), 5,
    "tracker must adopt the acked version of a direct PUT /bpmn");
});

test("direct PUT /bpmn 409 syncs tracker to server_current_version (self-write adopt)", () => {
  const sid = "sid_direct_put_conflict";
  setTrackedDiagramStateVersion(sid, 1);

  const result = applySnapshotRestorePutResult({
    sessionId: sid,
    putRes: {
      ok: false,
      status: 409,
      data: { detail: { code: "DIAGRAM_STATE_CONFLICT", server_current_version: 7 } },
    },
  });

  assert.equal(result.applied, true, JSON.stringify(result));
  assert.equal(result.reason, "conflict");
  assert.equal(getTrackedDiagramStateVersion(sid), 7,
    "tracker must adopt server version from a direct PUT 409");
});

test("direct PUT /bpmn error does not move the tracker", () => {
  const sid = "sid_direct_put_error";
  setTrackedDiagramStateVersion(sid, 3);

  const result = applySnapshotRestorePutResult({
    sessionId: sid,
    putRes: { ok: false, status: 500, error: "boom" },
  });

  assert.equal(result.applied, false);
  assert.equal(result.reason, "error");
  assert.equal(getTrackedDiagramStateVersion(sid), 3);
});
