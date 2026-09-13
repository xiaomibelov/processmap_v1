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

test.beforeEach(() => {
  resetCasVersionTracker();
  __resetSaveDiagnosticsForTests();
  __resetTelemetryForTests();
});

test("409 does NOT adopt server version into tracked base and arms conflict gate", async () => {
  const c = createSaveCoordinator();
  setTrackedDiagramStateVersion("s1", 7);
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
        data: { detail: { code: "DIAGRAM_STATE_CONFLICT", server_current_version: 9 } },
      };
    },
    getBaseVersion: (sid) => getTrackedDiagramStateVersion(sid),
  });

  const result = await c.execute("xml", { sessionId: "s1" });

  assert.equal(result.status, 409);
  // tracked-base НЕ подменяется серверной версией (P1)
  assert.equal(getTrackedDiagramStateVersion("s1"), 7);
  const conflict = c.getConflict("s1");
  assert.ok(conflict, "conflict gate must be armed");
  assert.equal(conflict.serverVersion, 9);
  assert.equal(conflict.pipeline, "xml");

  // следующий save заблокирован gate'ом и НЕ доходит до транспорта
  const blocked = await c.execute("xml", { sessionId: "s1" });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 409);
  assert.equal(blocked.blockedByConflict, true);
  assert.equal(transportCalls, 1, "transport must not be called while gate is active");
});

test("non-CAS 409 does not arm the diagram conflict gate", async () => {
  const c = createSaveCoordinator();
  let transportCalls = 0;
  c.registerPipeline("xml", {
    debounceMs: 0,
    retryCount: 0,
    transport: async () => {
      transportCalls += 1;
      return {
        ok: false,
        status: 409,
        data: { detail: { code: "SESSION_WRITE_CONFLICT" } },
      };
    },
  });

  const first = await c.execute("xml", { sessionId: "s_non_cas" });
  const second = await c.execute("xml", { sessionId: "s_non_cas" });

  assert.equal(first.status, 409);
  assert.equal(second.status, 409);
  assert.equal(c.getConflict("s_non_cas"), null);
  assert.equal(transportCalls, 2, "a non-CAS 409 must not pause later diagram saves");
});

test("matching authoritative XML reconciles an acknowledged conflict without arming gate", async () => {
  const c = createSaveCoordinator();
  setTrackedDiagramStateVersion("s_reconciled", 7);
  let reconciliations = 0;
  c.registerPipeline("rawXml", {
    debounceMs: 0,
    retryCount: 0,
    transport: async () => ({
      ok: false,
      status: 409,
      data: { detail: { code: "DIAGRAM_STATE_CONFLICT", server_current_version: 8 } },
    }),
    reconcileConflict: async (_response, _sid, builtPayload) => {
      reconciliations += 1;
      assert.equal(builtPayload.xml, "<bpmn:same/>");
      return { ok: true, status: 200, diagramStateVersion: 8, reconciled: true };
    },
    getBaseVersion: (sid) => getTrackedDiagramStateVersion(sid),
  });

  const result = await c.execute("rawXml", {
    sessionId: "s_reconciled",
    xml: "<bpmn:same/>",
  });

  assert.equal(result.ok, true);
  assert.equal(result.reconciled, true);
  assert.equal(reconciliations, 1);
  assert.equal(getTrackedDiagramStateVersion("s_reconciled"), 8);
  assert.equal(c.getConflict("s_reconciled"), null);
});

test("resolveConflict('overwrite') explicitly adopts server base and unblocks saves", async () => {
  const c = createSaveCoordinator();
  setTrackedDiagramStateVersion("s1", 7);
  const sentBases = [];
  let failOnce = true;
  c.registerPipeline("xml", {
    debounceMs: 0,
    retryCount: 0,
    transport: async (sessionId, payload) => {
      sentBases.push(payload.base_diagram_state_version);
      if (failOnce) {
        failOnce = false;
        return {
          ok: false,
          status: 409,
          error: "DIAGRAM_STATE_CONFLICT",
          data: { detail: { server_current_version: 9 } },
        };
      }
      return { ok: true, status: 200, diagramStateVersion: 10 };
    },
    getBaseVersion: (sid) => getTrackedDiagramStateVersion(sid),
  });

  await c.execute("xml", { sessionId: "s1" });
  assert.equal(getTrackedDiagramStateVersion("s1"), 7);

  const resolved = c.resolveConflict("s1", "overwrite");
  assert.equal(resolved.ok, true);
  assert.equal(resolved.serverVersion, 9);
  assert.equal(getTrackedDiagramStateVersion("s1"), 9);
  assert.equal(c.getConflict("s1"), null);

  const after = await c.execute("xml", { sessionId: "s1" });
  assert.equal(after.ok, true);
  assert.deepEqual(sentBases, [7, 9], "overwrite save must use the explicitly adopted server base");
});

test("resolveConflict('refresh') adopts server base and lifts gate (Ф3)", async () => {
  const c = createSaveCoordinator();
  setTrackedDiagramStateVersion("s1", 7);
  c.registerPipeline("xml", {
    debounceMs: 0,
    retryCount: 0,
    transport: async () => ({
      ok: false,
      status: 409,
      error: "DIAGRAM_STATE_CONFLICT",
      data: { detail: { server_current_version: 9 } },
    }),
    getBaseVersion: (sid) => getTrackedDiagramStateVersion(sid),
  });

  await c.execute("xml", { sessionId: "s1" });
  const resolved = c.resolveConflict("s1", "refresh");
  assert.equal(resolved.ok, true);
  assert.equal(
    getTrackedDiagramStateVersion("s1"),
    9,
    "refresh must adopt server version into tracked base (Ф3/L3)",
  );
  assert.equal(c.getConflict("s1"), null);
});

test("clearSession clears the conflict gate", async () => {
  const c = createSaveCoordinator();
  setTrackedDiagramStateVersion("s1", 7);
  c.registerPipeline("xml", {
    debounceMs: 0,
    retryCount: 0,
    transport: async () => ({
      ok: false,
      status: 409,
      error: "DIAGRAM_STATE_CONFLICT",
      data: { detail: { server_current_version: 9 } },
    }),
  });

  await c.execute("xml", { sessionId: "s1" });
  assert.ok(c.getConflict("s1"));
  c.clearSession("s1");
  assert.equal(c.getConflict("s1"), null);
});

test("409 arms conflict gate, records diagnostics trail and auto-reports to telemetry", async () => {
  const sent = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    sent.push({ url: String(url), body: JSON.parse(String(options?.body || "{}")) });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  try {
    const c = createSaveCoordinator();
    setTrackedDiagramStateVersion("s1", 7);
    c.registerPipeline("xml", {
      debounceMs: 0,
      retryCount: 0,
      transport: async () => ({
        ok: false,
        status: 409,
        error: "DIAGRAM_STATE_CONFLICT",
        data: {
          detail: {
            code: "DIAGRAM_STATE_CONFLICT",
            server_current_version: 9,
            server_last_write: { actor_label: "u@x.ru", changed_keys: ["bpmn_xml"] },
          },
        },
      }),
      getBaseVersion: (sid) => getTrackedDiagramStateVersion(sid),
    });

    await c.execute("xml", { sessionId: "s1" });
    // дождаться fire-and-forget авто-репорта
    await new Promise((resolve) => setTimeout(resolve, 10));

    const types = getSaveDiagnosticsTrail().map((entry) => entry.type);
    assert.ok(types.includes("pipeline_start"), "trail must contain pipeline_start");
    assert.ok(types.includes("pipeline_conflict"), "trail must contain pipeline_conflict");

    assert.equal(sent.length, 1, "conflict must be auto-reported to telemetry");
    const event = sent[0].body;
    assert.equal(event.event_type, "save_conflict");
    assert.equal(event.severity, "warn");
    assert.equal(event.context_json.pipeline, "xml");
    assert.equal(event.context_json.client_base_version, 7);
    assert.equal(event.context_json.server_current_version, 9);
    assert.equal(event.context_json.actor_label, "u@x.ru");
    assert.equal(event.context_json.user_reported, false);
    assert.ok(Array.isArray(event.context_json.trail));

    // повторный save блокируется gate'ом и тоже попадает в трейл
    await c.execute("xml", { sessionId: "s1" });
    const typesAfter = getSaveDiagnosticsTrail().map((entry) => entry.type);
    assert.ok(typesAfter.includes("gate_block"), "trail must contain gate_block");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
