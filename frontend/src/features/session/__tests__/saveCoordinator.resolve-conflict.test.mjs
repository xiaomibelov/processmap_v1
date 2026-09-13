// Unit-тесты Ф3 (fix/save-latency-subprocess-async, L3): семантика
// resolveConflict в saveCoordinator.
//   refresh → adopt serverVersion в tracked-base (+ удаление конфликта; caller
//             перечитывает данные — уже делает);
//   cancel  → конфликт НЕ удаляется, gate продолжает блокировать следующий
//             save без транспорта → UI снова показывает модалку. Цикла 409 в
//             сети нет, т.к. base не испорчен (Ф1);
//   overwrite → без изменений (adopt serverVersion + удаление конфликта).
// До фикса cancel/refresh снимали gate, но base оставался stale → следующий
// save снова уходил в транспорт → 409 → модалка по кругу (PLAN v2 §2, L3).

import test from "node:test";
import assert from "node:assert/strict";

import { createSaveCoordinator } from "../saveCoordinator.js";
import {
  getVersion as getTrackedDiagramStateVersion,
  setVersion as setTrackedDiagramStateVersion,
  __resetForTests as resetCasVersionTracker,
} from "../../../lib/casVersionTracker.js";
import {
  __resetSaveDiagnosticsForTests,
} from "../saveDiagnosticsTrail.js";
import { __resetTelemetryForTests } from "../../telemetry/telemetryClient.js";

function armConflict(c, { sid = "s1", serverVersion = 9 } = {}) {
  let transportCalls = 0;
  c.registerPipeline("xml", {
    debounceMs: 0,
    retryCount: 0,
    transport: async () => {
      transportCalls += 1;
      return {
        ok: false,
        status: 409,
        error: "DIAGRAM_STATE_CONFLICT",
        data: { detail: { code: "DIAGRAM_STATE_CONFLICT", server_current_version: serverVersion } },
      };
    },
    getBaseVersion: (id) => getTrackedDiagramStateVersion(id),
    onSuccess: () => {},
    on409: () => {},
  });
  return () => transportCalls;
}

test.beforeEach(() => {
  resetCasVersionTracker();
  __resetSaveDiagnosticsForTests();
  __resetTelemetryForTests();
});

test("cancel → конфликт НЕ удаляется, gate блокирует следующий save без транспорта", async () => {
  const c = createSaveCoordinator();
  setTrackedDiagramStateVersion("s1", 7);
  const getTransportCalls = armConflict(c);

  await c.execute("xml", { sessionId: "s1" });
  assert.ok(c.getConflict("s1"), "gate вооружён после 409");

  const events = [];
  c.subscribe((event, data) => events.push({ event, data }));
  const resolved = c.resolveConflict("s1", "cancel");

  assert.equal(resolved.ok, true);
  assert.equal(resolved.action, "cancel");
  assert.equal(
    c.getConflict("s1") !== null,
    true,
    "cancel НЕ удаляет конфликт — модалка покажется снова",
  );
  assert.ok(
    events.some((entry) => entry.event === "conflict_resolved" && entry.data.action === "cancel"),
    "emit conflict_resolved как сейчас",
  );
  assert.equal(getTrackedDiagramStateVersion("s1"), 7, "base не тронут");

  // Следующий save — gate block без транспорта (цикла 409 в сети нет).
  const blocked = await c.execute("xml", { sessionId: "s1" });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 409);
  assert.equal(blocked.blockedByConflict, true);
  assert.equal(getTransportCalls(), 1, "transport не дёргается пока gate активен");
});

test("refresh → tracked base adopt'ит serverVersion, конфликт удалён", async () => {
  const c = createSaveCoordinator();
  setTrackedDiagramStateVersion("s1", 7);
  armConflict(c);

  await c.execute("xml", { sessionId: "s1" });
  const resolved = c.resolveConflict("s1", "refresh");

  assert.equal(resolved.ok, true);
  assert.equal(resolved.action, "refresh");
  assert.equal(resolved.serverVersion, 9);
  assert.equal(
    getTrackedDiagramStateVersion("s1"),
    9,
    "refresh приводит tracked base к serverVersion (caller перечитывает данные)",
  );
  assert.equal(c.getConflict("s1"), null, "gate снят после refresh");
});

test("refresh → следующий save уходит уже с adopt'ированным base", async () => {
  const c = createSaveCoordinator();
  setTrackedDiagramStateVersion("s1", 7);
  armConflict(c);
  await c.execute("xml", { sessionId: "s1" });
  c.resolveConflict("s1", "refresh");

  const sentBases = [];
  c.registerPipeline("xml", {
    debounceMs: 0,
    retryCount: 0,
    transport: async (_sid, payload) => {
      sentBases.push(payload.base_diagram_state_version);
      return { ok: true, status: 200, diagram_state_version: 10 };
    },
    getBaseVersion: (id) => getTrackedDiagramStateVersion(id),
    onSuccess: () => {},
  });

  const r = await c.execute("xml", { sessionId: "s1" });
  assert.equal(r.ok, true);
  assert.deepEqual(sentBases, [9], "save после refresh идёт с base=serverVersion");
});

test("refresh с serverVersion=null → gate снят, tracked base не тронут", async () => {
  const c = createSaveCoordinator();
  setTrackedDiagramStateVersion("s1", 7);
  c.registerPipeline("xml", {
    debounceMs: 0,
    retryCount: 0,
    transport: async () => ({
      ok: false,
      status: 409,
      error: "DIAGRAM_STATE_CONFLICT",
      data: { detail: { code: "DIAGRAM_STATE_CONFLICT" } },
    }),
    getBaseVersion: (id) => getTrackedDiagramStateVersion(id),
    on409: () => {},
  });

  await c.execute("xml", { sessionId: "s1" });
  const resolved = c.resolveConflict("s1", "refresh");

  assert.equal(resolved.ok, true);
  assert.equal(c.getConflict("s1"), null);
  assert.equal(getTrackedDiagramStateVersion("s1"), 7, "setVersion(null) не вызывается");
});

test("overwrite → adopt serverVersion и снятие gate (как раньше)", async () => {
  const c = createSaveCoordinator();
  setTrackedDiagramStateVersion("s1", 7);
  armConflict(c);

  await c.execute("xml", { sessionId: "s1" });
  const resolved = c.resolveConflict("s1", "overwrite");

  assert.equal(resolved.ok, true);
  assert.equal(resolved.action, "overwrite");
  assert.equal(getTrackedDiagramStateVersion("s1"), 9);
  assert.equal(c.getConflict("s1"), null);
});
