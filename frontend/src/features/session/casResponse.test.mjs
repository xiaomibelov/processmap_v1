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

// ---------------------------------------------------------------------------
// Контур fix/canvas-move-di-desync-409-tracker, срез S3 (модал 409).
// Единый reader changed_keys / client_base_version для ВСЕХ форм 409-detail
// (PUT /bpmn, PATCH /sessions, POST /operations; detail-вложенная и плоская
// data-форма; errorDetails). Матрица: 3 пайплайна × полный/частичный detail.
// ---------------------------------------------------------------------------

// Канонический detail backend (utils/session_helpers.py
// _diagram_state_conflict_payload): code, session_id, client_base_version,
// server_current_version, server_last_write{..., changed_keys}; для
// operations добавляется server_current_xml.
const FULL_DETAIL = {
  code: "DIAGRAM_STATE_CONFLICT",
  session_id: "s1",
  client_base_version: 7,
  server_current_version: 12,
  server_last_write: {
    actor_user_id: "u1",
    actor_label: "Оператор",
    client_id: "tab-1",
    at: 1720000000,
    changed_keys: ["bpmn_xml", "bpmn_meta"],
  },
};

test("S3: readConflictChangedKeys — все формы detail трёх пайплайнов", async () => {
  const { readConflictChangedKeys } = await import("./casResponse.js");
  // PUT /bpmn (FastAPI detail-вложенная)
  assert.deepEqual(
    readConflictChangedKeys({ status: 409, data: { detail: FULL_DETAIL } }),
    ["bpmn_xml", "bpmn_meta"],
  );
  // PATCH /sessions (meta: плоская data-форма без detail)
  assert.deepEqual(
    readConflictChangedKeys({ status: 409, data: { ...FULL_DETAIL } }),
    ["bpmn_xml", "bpmn_meta"],
  );
  // POST /operations (detail + server_current_xml)
  assert.deepEqual(
    readConflictChangedKeys({ status: 409, data: { detail: { ...FULL_DETAIL, server_current_xml: "<xml/>" } } }),
    ["bpmn_xml", "bpmn_meta"],
  );
  // errorDetails-форма
  assert.deepEqual(
    readConflictChangedKeys({ status: 409, errorDetails: { ...FULL_DETAIL } }),
    ["bpmn_xml", "bpmn_meta"],
  );
  // camel-варианты
  assert.deepEqual(
    readConflictChangedKeys({ data: { detail: { serverLastWrite: { changedKeys: ["nodes"] } } } }),
    ["nodes"],
  );
});

test("S3: readConflictChangedKeys — частичный/битый detail → [] без исключений", async () => {
  const { readConflictChangedKeys } = await import("./casResponse.js");
  assert.deepEqual(readConflictChangedKeys(null), []);
  assert.deepEqual(readConflictChangedKeys({}), []);
  // FastAPI detail-строка (частичный detail)
  assert.deepEqual(readConflictChangedKeys({ status: 409, data: { detail: "DIAGRAM_STATE_CONFLICT" } }), []);
  // server_last_write без changed_keys
  assert.deepEqual(
    readConflictChangedKeys({ data: { detail: { server_current_version: 3, server_last_write: { at: 1 } } } }),
    [],
  );
  // changed_keys не массив
  assert.deepEqual(
    readConflictChangedKeys({ data: { detail: { server_last_write: { changed_keys: "bpmn_xml" } } } }),
    [],
  );
});

test("S3: readConflictClientBaseVersion — все формы; легитимный null сохраняется", async () => {
  const { readConflictClientBaseVersion } = await import("./casResponse.js");
  assert.equal(readConflictClientBaseVersion({ data: { detail: FULL_DETAIL } }), 7);
  assert.equal(readConflictClientBaseVersion({ data: { ...FULL_DETAIL } }), 7);
  assert.equal(readConflictClientBaseVersion({ data: { detail: { clientBaseVersion: 8 } } }), 8);
  assert.equal(readConflictClientBaseVersion({ errorDetails: { client_base_version: 9 } }), 9);
  // BASE_VERSION_REQUIRED: сервер шлёт client_base_version = null — «?», дефолт не выдумываем
  assert.equal(
    readConflictClientBaseVersion({ data: { detail: { code: "DIAGRAM_STATE_BASE_VERSION_REQUIRED", client_base_version: null, server_current_version: 4 } } }),
    null,
  );
  assert.equal(readConflictClientBaseVersion({ data: { detail: "CONFLICT" } }), null);
  assert.equal(readConflictClientBaseVersion(null), null);
});
