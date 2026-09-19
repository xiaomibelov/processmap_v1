// fix/self-conflict-silent-rebase: pipeline-уровень silent self-rebase
// meta (session PATCH). Сценарий A1-live: meta-PATCH (interview) получает 409,
// потому что параллельный full-PUT поднял версию; серверные changed_keys
// ["bpmn_xml"] disjoint с локальными interview-ключами → ОДИН retry PATCH с
// base=serverVersion, без модала. Overlap/сомнение → модал (gate armed).

import test from "node:test";
import assert from "node:assert/strict";

import {
  enqueueSessionPatchCasWrite,
  resetSessionPatchCasCoordinator,
} from "./sessionPatchCasCoordinator.js";
import { saveCoordinator } from "../../../session/saveCoordinator.js";
import {
  __resetForTests as resetCasVersionTracker,
  getVersion as getTrackedVersion,
  setVersion as setTrackedVersion,
} from "../../../../lib/casVersionTracker.js";
import { __resetSaveDiagnosticsForTests } from "../../../session/saveDiagnosticsTrail.js";
import { __resetTelemetryForTests } from "../../../telemetry/telemetryClient.js";

test.beforeEach(() => {
  resetSessionPatchCasCoordinator();
  resetCasVersionTracker();
  __resetSaveDiagnosticsForTests();
  __resetTelemetryForTests();
});

function conflict409({ serverVersion = 79, changedKeys = ["bpmn_xml"], clientId = "raw-cid" } = {}) {
  return {
    ok: false,
    status: 409,
    error: "DIAGRAM_STATE_CONFLICT",
    data: {
      detail: {
        code: "DIAGRAM_STATE_CONFLICT",
        server_current_version: serverVersion,
        server_last_write: {
          actor_user_id: "u1",
          actor_label: "User One",
          client_id: clientId,
          at: 1789779940,
          changed_keys: changedKeys,
        },
      },
    },
  };
}

test("meta-PATCH 409 disjoint (сервер писал bpmn_xml) → silent retry с base=server, модала нет", async () => {
  setTrackedVersion("sid_meta_1", 78);
  const sent = [];
  const apiPatchSession = async (sid, payload) => {
    sent.push({ sid, payload: { ...payload } });
    if (sent.length === 1) return conflict409({ serverVersion: 79 });
    return { ok: true, session: { diagram_state_version: 79 } };
  };

  const result = await enqueueSessionPatchCasWrite({
    sessionId: "sid_meta_1",
    patch: { interview: { answers: { q1: "a1" } }, base_diagram_state_version: 78 },
    apiPatchSession,
    getBaseDiagramStateVersion: () => getTrackedVersion("sid_meta_1"),
    rememberDiagramStateVersion: () => {},
  });

  assert.equal(result.ok, true, "silent rebase → success, модала нет");
  assert.equal(saveCoordinator.getConflict("sid_meta_1"), null, "gate не armed");
  assert.equal(sent.length, 2, "исходный PATCH + ровно один silent retry");
  assert.equal(sent[0].payload.base_diagram_state_version, 78);
  assert.equal(sent[1].payload.base_diagram_state_version, 79, "retry с базой из 409-снапшота");
  assert.equal(sent[1].payload.interview.answers.q1, "a1", "payload не потерян");
});

test("meta-PATCH 409 overlap (сервер тоже писал interview) → gate armed (модал)", async () => {
  setTrackedVersion("sid_meta_2", 78);
  const sent = [];
  const apiPatchSession = async (sid, payload) => {
    sent.push(payload);
    return conflict409({ serverVersion: 79, changedKeys: ["interview"] });
  };

  const result = await enqueueSessionPatchCasWrite({
    sessionId: "sid_meta_2",
    patch: { interview: { answers: {} }, base_diagram_state_version: 78 },
    apiPatchSession,
    getBaseDiagramStateVersion: () => getTrackedVersion("sid_meta_2"),
    rememberDiagramStateVersion: () => {},
  });

  assert.equal(result.ok, false);
  assert.ok(saveCoordinator.getConflict("sid_meta_2"), "gate armed → модал");
  assert.equal(sent.length, 1, "silent retry запрещён при overlap");
});

test("meta-PATCH 409 с пустыми changed_keys → gate armed (сомнение → модал)", async () => {
  setTrackedVersion("sid_meta_3", 78);
  const sent = [];
  const apiPatchSession = async (sid, payload) => {
    sent.push(payload);
    return conflict409({ serverVersion: 79, changedKeys: [] });
  };

  const result = await enqueueSessionPatchCasWrite({
    sessionId: "sid_meta_3",
    patch: { interview: { answers: {} }, base_diagram_state_version: 78 },
    apiPatchSession,
    getBaseDiagramStateVersion: () => getTrackedVersion("sid_meta_3"),
    rememberDiagramStateVersion: () => {},
  });

  assert.equal(result.ok, false);
  assert.ok(saveCoordinator.getConflict("sid_meta_3"));
  assert.equal(sent.length, 1);
});

test("meta-PATCH 409 bpmn_meta ambiguity → gate armed", async () => {
  setTrackedVersion("sid_meta_4", 78);
  const sent = [];
  const apiPatchSession = async (sid, payload) => {
    sent.push(payload);
    return conflict409({ serverVersion: 79, changedKeys: ["bpmn_meta"] });
  };

  const result = await enqueueSessionPatchCasWrite({
    sessionId: "sid_meta_4",
    patch: { bpmn_meta: { version: 2 }, base_diagram_state_version: 78 },
    apiPatchSession,
    getBaseDiagramStateVersion: () => getTrackedVersion("sid_meta_4"),
    rememberDiagramStateVersion: () => {},
  });

  assert.equal(result.ok, false);
  assert.ok(saveCoordinator.getConflict("sid_meta_4"));
  assert.equal(sent.length, 1);
});
