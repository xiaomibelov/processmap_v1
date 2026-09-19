// Ф2 (fix/self-conflict-silent-rebase): hook trySilentRebase в 409-ветке
// saveCoordinator. Контракт:
//   - hook вызывается ПЕРЕД conflict gate; вернул {ok:true} → completeSuccess
//     (tracked-base адоптит серверную версию), gate НЕ взводится, модала нет;
//   - вернул null/false → существующее поведение (gate → модал);
//   - один silent retry на конфликт — бюджет на стороне hook (план F2);
//   - сомнение (пустые/неизвестные changed_keys) → hook возвращает null
//     (классификатор conflictSilentRebase → "unknown") → модал.

import test from "node:test";
import assert from "node:assert/strict";

import { createSaveCoordinator } from "../saveCoordinator.js";
import {
  getVersion as getTrackedDiagramStateVersion,
  setVersion as setTrackedDiagramStateVersion,
  __resetForTests as resetCasVersionTracker,
} from "../../../lib/casVersionTracker.js";
import { __resetSaveDiagnosticsForTests } from "../saveDiagnosticsTrail.js";
import { __resetTelemetryForTests } from "../../telemetry/telemetryClient.js";

function conflictResponse({ serverVersion = 9, changedKeys = ["interview"], clientId = "meta-cid" } = {}) {
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

function registerXmlPipeline(c, { transport, trySilentRebase }) {
  c.registerPipeline("xml", {
    debounceMs: 0,
    retryCount: 0,
    transport,
    getBaseVersion: (id) => getTrackedDiagramStateVersion(id),
    onSuccess: () => {},
    on409: () => {},
    ...(trySilentRebase ? { trySilentRebase } : {}),
  });
}

test.beforeEach(() => {
  resetCasVersionTracker();
  __resetSaveDiagnosticsForTests();
  __resetTelemetryForTests();
});

test("409 + hook вернул {ok:true} → gate НЕ armed, completeSuccess, base adopt'ит серверную версию", async () => {
  const c = createSaveCoordinator();
  setTrackedDiagramStateVersion("s1", 7);
  let hookCalls = 0;
  registerXmlPipeline(c, {
    transport: async () => conflictResponse({ serverVersion: 9 }),
    trySilentRebase: async (result, sid, builtPayload) => {
      hookCalls += 1;
      assert.equal(sid, "s1");
      assert.equal(result.status, 409);
      return { ok: true, status: 200, diagramStateVersion: 9, reconciled: "silent-rebase" };
    },
  });

  const r = await c.execute("xml", { sessionId: "s1" });
  assert.equal(r.ok, true, "silent rebase → success");
  assert.equal(c.getConflict("s1"), null, "conflict gate НЕ взводится");
  assert.equal(getTrackedDiagramStateVersion("s1"), 9, "tracked-base == серверная версия");
  assert.equal(hookCalls, 1);
});

test("409 + hook вернул null → старое поведение: gate armed + эмит conflict", async () => {
  const c = createSaveCoordinator();
  setTrackedDiagramStateVersion("s1", 7);
  const events = [];
  c.subscribe((event, data) => events.push({ event, data }));
  registerXmlPipeline(c, {
    transport: async () => conflictResponse({ changedKeys: ["bpmn_xml"] }),
    trySilentRebase: async () => null,
  });

  const r = await c.execute("xml", { sessionId: "s1" });
  assert.equal(r.ok, false);
  assert.ok(c.getConflict("s1"), "gate armed при overlap");
  assert.ok(events.some((e) => e.event === "conflict"), "эмит conflict для модала");
  assert.equal(getTrackedDiagramStateVersion("s1"), 7, "base не тронут (Ф1)");
});

test("409 без hook → поведение не изменилось (gate armed)", async () => {
  const c = createSaveCoordinator();
  setTrackedDiagramStateVersion("s1", 7);
  registerXmlPipeline(c, {
    transport: async () => conflictResponse({}),
  });

  const r = await c.execute("xml", { sessionId: "s1" });
  assert.equal(r.ok, false);
  assert.ok(c.getConflict("s1"));
});

test("hook бросает → gate armed (ошибка hook не маскируется в success)", async () => {
  const c = createSaveCoordinator();
  setTrackedDiagramStateVersion("s1", 7);
  registerXmlPipeline(c, {
    transport: async () => conflictResponse({}),
    trySilentRebase: async () => {
      throw new Error("boom");
    },
  });

  const r = await c.execute("xml", { sessionId: "s1" });
  assert.equal(r.ok, false);
  assert.ok(c.getConflict("s1"));
});

test("silent rebase не проходит для не-409 результатов (hook не вызывается на 200)", async () => {
  const c = createSaveCoordinator();
  setTrackedDiagramStateVersion("s1", 7);
  let hookCalls = 0;
  registerXmlPipeline(c, {
    transport: async () => ({ ok: true, status: 200, diagram_state_version: 8 }),
    trySilentRebase: async () => {
      hookCalls += 1;
      return { ok: true };
    },
  });

  const r = await c.execute("xml", { sessionId: "s1" });
  assert.equal(r.ok, true);
  assert.equal(hookCalls, 0);
  assert.equal(getTrackedDiagramStateVersion("s1"), 8);
});
