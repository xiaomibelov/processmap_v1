// Unit-тесты Ф1 (fix/save-latency-subprocess-async, L1): rollback-дисциплина
// в saveCoordinator._runPipeline. Откат tracked-base разрешён ТОЛЬКО если в
// этом прогоне был bump (успешный commit); на 409 — запрещён полностью.
// До фикса любой сетевой сбой откатывал последнюю УСПЕШНУЮ версию из history
// ([7,8] → [7]) → следующий save уходил со stale base → гарантированный
// self-409 (см. PLAN v2 §2, L1).

import test from "node:test";
import assert from "node:assert/strict";

import { createSaveCoordinator } from "../saveCoordinator.js";
import {
  getVersion as getTrackedDiagramStateVersion,
  setVersion as setTrackedDiagramStateVersion,
  setVersionDiagnosticRecorder,
  __resetForTests as resetCasVersionTracker,
} from "../../../lib/casVersionTracker.js";
import {
  __resetSaveDiagnosticsForTests,
} from "../saveDiagnosticsTrail.js";
import { __resetTelemetryForTests } from "../../telemetry/telemetryClient.js";

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

test.beforeEach(() => {
  resetCasVersionTracker();
  __resetSaveDiagnosticsForTests();
  __resetTelemetryForTests();
  setVersionDiagnosticRecorder(null);
});

test.afterEach(() => {
  setVersionDiagnosticRecorder(null);
});

test("успех (bump 7→8) → network error → следующий save уходит с base=8", async () => {
  const c = createSaveCoordinator();
  setTrackedDiagramStateVersion("s1", 7);
  const sentBases = [];
  let call = 0;
  c.registerPipeline("xml", {
    debounceMs: 0,
    retryCount: 0,
    transport: async (_sid, payload) => {
      call += 1;
      sentBases.push(payload.base_diagram_state_version);
      if (call === 1) {
        return { ok: true, status: 200, diagram_state_version: 8 };
      }
      if (call === 2) {
        throw new Error("network down");
      }
      return { ok: true, status: 200, diagram_state_version: 9 };
    },
    getBaseVersion: (sid) => getTrackedDiagramStateVersion(sid),
    onSuccess: () => {},
    onError: () => {},
  });

  const r1 = await c.execute("xml", { sessionId: "s1" });
  assert.equal(r1.ok, true);
  assert.equal(getTrackedDiagramStateVersion("s1"), 8);

  const r2 = await c.execute("xml", { sessionId: "s1" });
  assert.equal(r2.ok, false, "network error должен остаться failure");
  // L1: физически успешный коммит (8) не откатывается сетевым сбоем следующего save.
  assert.equal(
    getTrackedDiagramStateVersion("s1"),
    8,
    "tracked base не должен откатываться после error без bump в этом прогоне",
  );

  const r3 = await c.execute("xml", { sessionId: "s1" });
  assert.equal(r3.ok, true);
  assert.deepEqual(
    sentBases,
    [7, 8, 8],
    "после сбоя следующий save обязан уйти с base=8 (до фикса уходил с 7 → self-409)",
  );
});

test("timeout после успеха → tracked base неизменен", async () => {
  const c = createSaveCoordinator();
  setTrackedDiagramStateVersion("s1", 7);
  let call = 0;
  c.registerPipeline("xml", {
    debounceMs: 0,
    retryCount: 0,
    transportTimeoutMs: 40,
    transport: async () => {
      call += 1;
      if (call === 1) {
        return { ok: true, status: 200, diagram_state_version: 8 };
      }
      await sleep(10000);
      return { ok: true, status: 200, diagram_state_version: 9 };
    },
    getBaseVersion: (sid) => getTrackedDiagramStateVersion(sid),
    onSuccess: () => {},
    onError: () => {},
  });

  const r1 = await c.execute("xml", { sessionId: "s1" });
  assert.equal(r1.ok, true);
  assert.equal(getTrackedDiagramStateVersion("s1"), 8);

  const r2 = await c.execute("xml", { sessionId: "s1" });
  assert.equal(r2.ok, false);
  assert.ok(String(r2.error).includes("timeout"));
  assert.equal(
    getTrackedDiagramStateVersion("s1"),
    8,
    "timeout не должен откатывать последнюю успешную версию",
  );
});

test("409 → tracked base неизменен до resolveConflict (rollback запрещён)", async () => {
  const c = createSaveCoordinator();
  setTrackedDiagramStateVersion("s1", 7);
  let call = 0;
  c.registerPipeline("xml", {
    debounceMs: 0,
    retryCount: 0,
    transport: async () => {
      call += 1;
      if (call === 1) {
        return { ok: true, status: 200, diagram_state_version: 8 };
      }
      return {
        ok: false,
        status: 409,
        error: "DIAGRAM_STATE_CONFLICT",
        data: { detail: { code: "DIAGRAM_STATE_CONFLICT", server_current_version: 12 } },
      };
    },
    getBaseVersion: (sid) => getTrackedDiagramStateVersion(sid),
    onSuccess: () => {},
    on409: () => {},
  });

  const r1 = await c.execute("xml", { sessionId: "s1" });
  assert.equal(r1.ok, true);
  assert.equal(getTrackedDiagramStateVersion("s1"), 8);

  const r2 = await c.execute("xml", { sessionId: "s1" });
  assert.equal(r2.status, 409);
  assert.equal(
    getTrackedDiagramStateVersion("s1"),
    8,
    "409 не должен откатывать tracked base (base меняется только через resolveConflict)",
  );
  assert.ok(c.getConflict("s1"), "conflict gate вооружён");
  assert.equal(c.getConflict("s1").serverVersion, 12);
});

test("error ДО первого успеха → поведение как на main (base сохраняется)", async () => {
  const c = createSaveCoordinator();
  setTrackedDiagramStateVersion("s1", 7);
  c.registerPipeline("xml", {
    debounceMs: 0,
    retryCount: 0,
    transport: async () => {
      throw new Error("network down");
    },
    getBaseVersion: (sid) => getTrackedDiagramStateVersion(sid),
    onError: () => {},
  });

  const r1 = await c.execute("xml", { sessionId: "s1" });
  assert.equal(r1.ok, false);
  assert.equal(r1.status, 0);
  // history из одного элемента: observable-поведение идентично main —
  // base остаётся 7 (rollback на main — no-op, версия не выше реальности).
  assert.equal(getTrackedDiagramStateVersion("s1"), 7);
  // save после сбоя уходит с тем же base (никакой версии не потеряно).
  c.registerPipeline("xml", {
    debounceMs: 0,
    retryCount: 0,
    transport: async (_sid, payload) => {
      assert.equal(payload.base_diagram_state_version, 7);
      return { ok: true, status: 200, diagram_state_version: 8 };
    },
    getBaseVersion: (sid) => getTrackedDiagramStateVersion(sid),
    onSuccess: () => {},
  });
  const r2 = await c.execute("xml", { sessionId: "s1" });
  assert.equal(r2.ok, true);
  assert.equal(getTrackedDiagramStateVersion("s1"), 8);
});

test("error после успеха → rollback НЕ вызывается (bumpedInRun gate)", async () => {
  const c = createSaveCoordinator();
  setTrackedDiagramStateVersion("s1", 7);
  const diagnostics = [];
  setVersionDiagnosticRecorder((type, details) => {
    diagnostics.push({ type, details });
  });
  let call = 0;
  c.registerPipeline("xml", {
    debounceMs: 0,
    retryCount: 0,
    transport: async () => {
      call += 1;
      if (call === 1) {
        return { ok: true, status: 200, diagram_state_version: 8 };
      }
      throw new Error("network down");
    },
    getBaseVersion: (sid) => getTrackedDiagramStateVersion(sid),
    onSuccess: () => {},
    onError: () => {},
  });

  await c.execute("xml", { sessionId: "s1" });
  diagnostics.length = 0;
  await c.execute("xml", { sessionId: "s1" });

  assert.equal(
    diagnostics.some((entry) => entry.type === "tracker_rollback"),
    false,
    "после успешного bump в этом прогоне rollback не вызывается",
  );
});
