import test from "node:test";
import assert from "node:assert/strict";

import { saveCoordinator } from "./saveCoordinator.js";
import {
  isSaveXmlTruthGuardResponse,
  extractSaveErrorCode,
} from "./conflictModel.js";
import {
  __resetForTests as resetCasVersionTracker,
  getVersion as getTrackedVersion,
  setVersion as setTrackedVersion,
} from "../../lib/casVersionTracker.js";

const GUARD_409_BODY = {
  detail: {
    code: "DRAFT_GRAPH_READ_ONLY_XML_TRUTH",
    session_id: "sid_xml_guard",
    keys: ["nodes", "edges"],
    message: "nodes/edges are not persisted for BPMN-XML sessions; use PUT /api/sessions/{id}/bpmn",
  },
};

test.beforeEach(() => {
  saveCoordinator.clearSession();
  resetCasVersionTracker();
});

test("conflictModel: extractSaveErrorCode reads FastAPI detail.code shapes", () => {
  assert.equal(extractSaveErrorCode({ data: GUARD_409_BODY }), "DRAFT_GRAPH_READ_ONLY_XML_TRUTH");
  assert.equal(extractSaveErrorCode({ errorDetails: GUARD_409_BODY }), "DRAFT_GRAPH_READ_ONLY_XML_TRUTH");
  assert.equal(extractSaveErrorCode({ code: "diagram_state_conflict" }), "DIAGRAM_STATE_CONFLICT");
  assert.equal(extractSaveErrorCode({ status: 409, error: "plain" }), "");
});

test("conflictModel: guard 409 is NOT a CAS conflict; real conflict still is", async () => {
  const { isSaveConflictStatus } = await import("./conflictModel.js");
  assert.equal(isSaveXmlTruthGuardResponse({ ok: false, status: 409, data: GUARD_409_BODY }), true);
  assert.equal(isSaveXmlTruthGuardResponse({ ok: false, status: 409, data: { detail: { code: "DIAGRAM_STATE_CONFLICT" } } }), false);
  assert.equal(isSaveXmlTruthGuardResponse({ ok: false, status: 500, data: GUARD_409_BODY }), false);
  // статусная классификация не сломана: любой 409 по-прежнему «конфликт» по статусу…
  assert.equal(isSaveConflictStatus(409), true);
});

test("saveCoordinator: xml-truth guard 409 does NOT arm conflict gate and does NOT rollback tracked base", async () => {
  // моделируем состояние после успешного импорта: tracked-base = 1 (от PUT /bpmn)
  setTrackedVersion("sid_xml_guard", 1);

  saveCoordinator.registerPipeline("test_xml_guard", {
    transport: async () => ({
      ok: false,
      status: 409,
      error: GUARD_409_BODY.detail.message,
      data: GUARD_409_BODY,
    }),
    retryCount: 0,
  });

  const result = await saveCoordinator.execute("test_xml_guard", {
    sessionId: "sid_xml_guard",
    patchBody: { interview: { steps: [] } },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  // tracked-base НЕ откачен: версия от успешного PUT /bpmn остаётся валидной
  assert.equal(getTrackedVersion("sid_xml_guard"), 1);
  // conflict gate НЕ взведён
  assert.equal(saveCoordinator.getConflict("sid_xml_guard"), null);

  // следующий save (например, легитимный PUT /bpmn-пайплайн) доходит до транспорта
  let transportCalls = 0;
  saveCoordinator.registerPipeline("test_xml_guard_next", {
    transport: async () => {
      transportCalls += 1;
      return { ok: true, diagram_state_version: 2 };
    },
    retryCount: 0,
  });
  const next = await saveCoordinator.execute("test_xml_guard_next", { sessionId: "sid_xml_guard" });
  assert.equal(next.ok, true);
  assert.equal(transportCalls, 1, "transport must run — no conflict gate after guard 409");
});

test("saveCoordinator: real CAS 409 still arms conflict gate (regression)", async () => {
  saveCoordinator.registerPipeline("test_real_conflict", {
    transport: async () => ({
      ok: false,
      status: 409,
      error: "DIAGRAM_STATE_CONFLICT",
      data: { detail: { code: "DIAGRAM_STATE_CONFLICT", server_current_version: 7 } },
    }),
    retryCount: 0,
  });

  const result = await saveCoordinator.execute("test_real_conflict", { sessionId: "sid_real_conflict" });
  assert.equal(result.ok, false);
  assert.ok(saveCoordinator.getConflict("sid_real_conflict"), "conflict gate must be armed for real CAS 409");
});
