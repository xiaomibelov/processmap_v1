// Unit-тесты Ф2 (fix/save-latency-subprocess-async, L2): reconcileTimeout в
// saveCoordinator._runPipeline. Transport-timeout и network error (throw из
// транспорта → status 0) трактовались как «запись не прошла», хотя сервер
// мог уже закоммитить. Хук reconcileTimeout вызывается ровно один раз на
// прогон (без ретраев), до failure-path; {ok:true} → success через
// completeSuccess (adopt dsv, pipeline_success, ноль ошибок наружу).

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
  getSaveDiagnosticsTrail,
} from "../saveDiagnosticsTrail.js";
import { __resetTelemetryForTests } from "../../telemetry/telemetryClient.js";

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

test.beforeEach(() => {
  resetCasVersionTracker();
  __resetSaveDiagnosticsForTests();
  __resetTelemetryForTests();
});

function registerHangingPipeline(c, overrides = {}) {
  const stats = { hookCalls: 0, onErrorCalls: 0, on409Calls: 0, events: [] };
  c.subscribe((event) => stats.events.push(event));
  const { reconcileTimeout, ...rest } = overrides;
  c.registerPipeline("xml", {
    debounceMs: 0,
    retryCount: 0,
    transportTimeoutMs: 40,
    transport: async () => {
      await sleep(10000);
      return { ok: true, status: 200, diagram_state_version: 99 };
    },
    getBaseVersion: (sid) => getTrackedDiagramStateVersion(sid),
    onSuccess: () => {},
    onError: () => {
      stats.onErrorCalls += 1;
    },
    on409: () => {
      stats.on409Calls += 1;
    },
    ...rest,
    ...(typeof reconcileTimeout === "function"
      ? {
          reconcileTimeout: async (...args) => {
            stats.hookCalls += 1;
            return reconcileTimeout(...args);
          },
        }
      : {}),
  });
  return stats;
}

test("timeout + reconcile match → success, tracked adopt, 0 ошибок наружу", async () => {
  const c = createSaveCoordinator();
  setTrackedDiagramStateVersion("s1", 7);
  const stats = registerHangingPipeline(c, {
    reconcileTimeout: async (_err, sid, builtPayload, payload) => {
      assert.equal(sid, "s1");
      assert.equal(builtPayload.base_diagram_state_version, 7);
      assert.equal(payload.sessionId, "s1");
      return { ok: true, status: 200, diagramStateVersion: 9, storedRev: 3 };
    },
  });

  const r = await c.execute("xml", { sessionId: "s1" });

  assert.equal(r.ok, true);
  assert.equal(r.reconciled, true);
  assert.equal(r.diagramStateVersion, 9);
  assert.equal(getTrackedDiagramStateVersion("s1"), 9, "tracked base adopt'ит серверную версию");
  assert.equal(stats.hookCalls, 1);
  assert.equal(stats.onErrorCalls, 0, "reconcile-success не вызывает onError");
  assert.equal(stats.on409Calls, 0, "reconcile-success не вызывает on409");
  assert.ok(stats.events.includes("success"), "emit success");
  assert.ok(!stats.events.includes("error"), "не emit error");
  assert.ok(!stats.events.includes("conflict"), "не emit conflict");
  const trail = getSaveDiagnosticsTrail().map((entry) => entry.type);
  assert.ok(trail.includes("pipeline_success"), "trail: pipeline_success с reconciled-флагом");
});

test("timeout + reconcile mismatch → прежний failure, tracked base не тронут", async () => {
  const c = createSaveCoordinator();
  setTrackedDiagramStateVersion("s1", 7);
  const stats = registerHangingPipeline(c, {
    reconcileTimeout: async () => null,
  });

  const r = await c.execute("xml", { sessionId: "s1" });

  assert.equal(r.ok, false);
  assert.ok(String(r.error).includes("timeout"));
  assert.equal(getTrackedDiagramStateVersion("s1"), 7, "Ф1: failure без rollback base");
  assert.equal(stats.hookCalls, 1);
  assert.equal(stats.onErrorCalls, 1, "failure вызывает onError");
  assert.ok(stats.events.includes("error"));
  assert.ok(!stats.events.includes("success"));
});

test("network error (throw, не-timeout) + reconcile match → success", async () => {
  const c = createSaveCoordinator();
  setTrackedDiagramStateVersion("s1", 7);
  const stats = { hookCalls: 0, onErrorCalls: 0, on409Calls: 0, events: [] };
  c.subscribe((event) => stats.events.push(event));
  c.registerPipeline("xml", {
    debounceMs: 0,
    retryCount: 0,
    transport: async () => {
      throw new TypeError("fetch failed");
    },
    reconcileTimeout: async () => {
      stats.hookCalls += 1;
      return { ok: true, status: 200, diagramStateVersion: 8 };
    },
    getBaseVersion: (sid) => getTrackedDiagramStateVersion(sid),
    onSuccess: () => {},
    onError: () => {
      stats.onErrorCalls += 1;
    },
    on409: () => {
      stats.on409Calls += 1;
    },
  });

  const r = await c.execute("xml", { sessionId: "s1" });

  assert.equal(r.ok, true);
  assert.equal(r.reconciled, true);
  assert.equal(getTrackedDiagramStateVersion("s1"), 8);
  assert.equal(stats.hookCalls, 1);
  assert.equal(stats.onErrorCalls, 0);
  assert.equal(stats.on409Calls, 0);
});

test("hook бросает → failure; при ретраях hook вызывается ровно один раз", async () => {
  const c = createSaveCoordinator();
  setTrackedDiagramStateVersion("s1", 7);
  let attempts = 0;
  const stats = { hookCalls: 0, onErrorCalls: 0 };
  c.registerPipeline("xml", {
    debounceMs: 0,
    retryCount: 2,
    retryDelayMs: 5,
    transport: async () => {
      attempts += 1;
      throw new TypeError("fetch failed");
    },
    reconcileTimeout: async () => {
      stats.hookCalls += 1;
      throw new Error("meta unavailable");
    },
    getBaseVersion: (sid) => getTrackedDiagramStateVersion(sid),
    onSuccess: () => {},
    onError: () => {
      stats.onErrorCalls += 1;
    },
  });

  const r = await c.execute("xml", { sessionId: "s1" });

  assert.equal(r.ok, false);
  assert.equal(attempts, 3, "транспорт ретраится как раньше");
  assert.equal(stats.hookCalls, 1, "hook — ровно один раз на прогон, без ретраев");
  assert.equal(getTrackedDiagramStateVersion("s1"), 7, "base не тронут");
  assert.equal(stats.onErrorCalls, 1);
});

test("returned status-0 без throw (локальная ошибка) → hook НЕ вызывается", async () => {
  const c = createSaveCoordinator();
  setTrackedDiagramStateVersion("s1", 7);
  let hookCalls = 0;
  c.registerPipeline("xml", {
    debounceMs: 0,
    retryCount: 0,
    transport: async () => ({ ok: false, status: 0, error: "apiPutBpmnXml unavailable" }),
    reconcileTimeout: async () => {
      hookCalls += 1;
      return { ok: true, status: 200, diagramStateVersion: 9 };
    },
    getBaseVersion: (sid) => getTrackedDiagramStateVersion(sid),
    onError: () => {},
  });

  const r = await c.execute("xml", { sessionId: "s1" });

  assert.equal(r.ok, false);
  assert.equal(hookCalls, 0, "локальная status-0 ошибка не является network error — reconcile не нужен");
});

test("409 → hook reconcileTimeout не вызывается (409 обрабатывает reconcileConflict)", async () => {
  const c = createSaveCoordinator();
  setTrackedDiagramStateVersion("s1", 7);
  let hookCalls = 0;
  c.registerPipeline("xml", {
    debounceMs: 0,
    retryCount: 0,
    transport: async () => ({
      ok: false,
      status: 409,
      error: "DIAGRAM_STATE_CONFLICT",
      data: { detail: { code: "DIAGRAM_STATE_CONFLICT", server_current_version: 9 } },
    }),
    reconcileTimeout: async () => {
      hookCalls += 1;
      return { ok: true, status: 200, diagramStateVersion: 9 };
    },
    getBaseVersion: (sid) => getTrackedDiagramStateVersion(sid),
    onSuccess: () => {},
    on409: () => {},
  });

  const r = await c.execute("xml", { sessionId: "s1" });

  assert.equal(r.status, 409);
  assert.equal(hookCalls, 0);
  assert.ok(c.getConflict("s1"));
});
