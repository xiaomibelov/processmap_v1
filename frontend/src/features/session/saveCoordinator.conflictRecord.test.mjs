import test from "node:test";
import assert from "node:assert/strict";

import { saveCoordinator } from "./saveCoordinator.js";
import {
  __resetForTests as resetCasVersionTracker,
  setVersion as setTrackedVersion,
} from "../../lib/casVersionTracker.js";

// ---------------------------------------------------------------------------
// Контур fix/canvas-move-di-desync-409-tracker, срез S3 (модал 409).
// Conflict-запись координатора (источник hybrid-нотиса и репорт-снапшота)
// обязана нести changed_keys и client_base_version из 409-detail всех форм —
// иначе модал показывает «?» и пустой список изменённых ключей.
// ---------------------------------------------------------------------------

const DETAIL_409 = {
  code: "DIAGRAM_STATE_CONFLICT",
  session_id: "sid_s3",
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

test.beforeEach(() => {
  saveCoordinator.clearSession("sid_s3");
  saveCoordinator.clearSession();
  resetCasVersionTracker();
});

test("S3: conflict-запись координатора несёт changedKeys + clientBaseVersion из detail (форма PUT /bpmn)", async () => {
  setTrackedVersion("sid_s3", 7);
  saveCoordinator.registerPipeline("test_s3_bpmn", {
    transport: async () => ({ ok: false, status: 409, data: { detail: DETAIL_409 } }),
    buildPayload: (payload) => payload,
    getBaseVersion: () => 7,
    applyBaseVersion: (payload, baseVersion) => { payload.base_diagram_state_version = baseVersion; },
    debounceMs: 0,
    retryCount: 0,
  });
  await saveCoordinator.execute("test_s3_bpmn", { sessionId: "sid_s3", value: 1 });
  const conflict = saveCoordinator.getConflict("sid_s3");
  assert.ok(conflict, "conflict gate armed");
  assert.equal(conflict.serverVersion, 12);
  assert.equal(conflict.clientBaseVersion, 7, "clientBase = base на момент отправки (трекер)");
  assert.deepEqual(conflict.changedKeys, ["bpmn_xml", "bpmn_meta"], "changed_keys из detail обязан дойти до записи");
});

test("S3: conflict-запись — плоская data-форма (meta PATCH) тоже даёт changedKeys", async () => {
  setTrackedVersion("sid_s3", 7);
  saveCoordinator.registerPipeline("test_s3_meta", {
    transport: async () => ({ ok: false, status: 409, data: { ...DETAIL_409 } }),
    buildPayload: (payload) => payload,
    getBaseVersion: () => 7,
    applyBaseVersion: (payload, baseVersion) => { payload.base_diagram_state_version = baseVersion; },
    debounceMs: 0,
    retryCount: 0,
  });
  await saveCoordinator.execute("test_s3_meta", { sessionId: "sid_s3", value: 1 });
  const conflict = saveCoordinator.getConflict("sid_s3");
  assert.equal(conflict.serverVersion, 12);
  assert.deepEqual(conflict.changedKeys, ["bpmn_xml", "bpmn_meta"]);
});

test("S3: частичный detail (строка) — changedKeys = [], версии null, без исключений", async () => {
  saveCoordinator.registerPipeline("test_s3_partial", {
    transport: async () => ({ ok: false, status: 409, data: { detail: "DIAGRAM_STATE_CONFLICT" } }),
    buildPayload: (payload) => payload,
    getBaseVersion: () => null,
    applyBaseVersion: () => {},
    debounceMs: 0,
    retryCount: 0,
  });
  await saveCoordinator.execute("test_s3_partial", { sessionId: "sid_s3", value: 1 });
  const conflict = saveCoordinator.getConflict("sid_s3");
  assert.ok(conflict, "gate armed даже при частичном detail");
  assert.equal(conflict.serverVersion, null, "«?» только при реальном отсутствии данных");
  assert.deepEqual(conflict.changedKeys, []);
});
