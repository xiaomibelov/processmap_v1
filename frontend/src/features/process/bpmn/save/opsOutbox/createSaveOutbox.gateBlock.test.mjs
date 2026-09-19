// fix/self-conflict-silent-rebase (R3): stranded op после gate_block.
// Баг (A1-live): op, попавшая в буфер во время armed conflict gate,
// получала от coordinator.execute результат gate-block (blockedByConflict)
// НЕ исключением — flushNow оставлял inFlight=true навсегда, pendingAck не
// возвращался в буфер, op не ретраилась после resolveConflict.
//
// Контракт фикса:
//   - gate-block → inFlight сбрасывается, pendingAck возвращается в буфер;
//   - op автоматически флашится ПОСЛЕ conflict_resolved (база ре-резолвится
//     из tracker at-send-time — механизм уже есть в pipeline ops);
//   - syncState.lastServerVersion обновляется на adopt после rebase.

import test from "node:test";
import assert from "node:assert/strict";

import { createSaveCoordinator } from "../../../../session/saveCoordinator.js";
import {
  getVersion as getTrackedDiagramStateVersion,
  setVersion as setTrackedDiagramStateVersion,
  __resetForTests as resetCasVersionTracker,
} from "../../../../../lib/casVersionTracker.js";
import { createOpsOutboxConfig } from "./opsOutboxConfig.js";
import { createSaveOutbox } from "./createSaveOutbox.js";
import { __resetSaveDiagnosticsForTests } from "../../../../session/saveDiagnosticsTrail.js";
import { __resetTelemetryForTests } from "../../../../../features/telemetry/telemetryClient.js";

if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

const drain = () => new Promise((resolve) => setImmediate(resolve));

function seqUuid() {
  let n = 0;
  return () => `op-${++n}`;
}

function makeApi() {
  const calls = [];
  return {
    calls,
    postSessionOperations: async (sid, body, opts) => {
      calls.push({ sid, body, opts });
      return {
        ok: true,
        status: 200,
        version: body.baseVersion + 1,
        applied: body.operations.length,
        skipped: 0,
        diagramStateVersion: body.baseVersion + 1,
      };
    },
  };
}

/** Вооружает conflict gate на сессии через pipeline "xml". */
async function armGate(coordinator, sid, serverVersion = 9) {
  coordinator.registerPipeline("xml", {
    debounceMs: 0,
    retryCount: 0,
    transport: async () => ({
      ok: false,
      status: 409,
      error: "DIAGRAM_STATE_CONFLICT",
      data: { detail: { code: "DIAGRAM_STATE_CONFLICT", server_current_version: serverVersion } },
    }),
    getBaseVersion: (id) => getTrackedDiagramStateVersion(id),
    onSuccess: () => {},
    on409: () => {},
  });
  await coordinator.execute("xml", { sessionId: sid });
}

test.beforeEach(() => {
  resetCasVersionTracker();
  __resetSaveDiagnosticsForTests();
  __resetTelemetryForTests();
});

test("gate-block: op не stranded — после conflict_resolved буфер флашится", async () => {
  const sid = "s_gate_1";
  setTrackedDiagramStateVersion(sid, 7);
  const coordinator = createSaveCoordinator();
  await armGate(coordinator, sid, 9);
  assert.ok(coordinator.getConflict(sid), "gate armed");

  const api = makeApi();
  const syncPatches = [];
  const syncStateStore = {
    patchSyncState: async (sessionId, patch) => {
      syncPatches.push({ sessionId, patch });
    },
  };
  const outbox = createSaveOutbox({
    sessionId: sid,
    coordinator,
    api,
    uuid: seqUuid(),
    now: () => 1_000_000,
    jitterRandom: () => 0.5,
    requestFullSave: () => {},
    onStatus: () => {},
    modeler: null,
    loadServerXml: async () => ({ ok: true }),
    syncStateStore,
    config: createOpsOutboxConfig({ flushDebounceMs: 1 }),
  });

  // Op во время gate_block.
  outbox.pushCommand({
    command: "element.updateProperties",
    action: "execute",
    context: { element: { id: "Task_1" }, properties: { name: "Новое имя" } },
  });
  await drain();
  await drain();

  assert.equal(api.calls.length, 0, "transport не дёргался под gate");
  assert.equal(outbox.getState().bufferedCount, 1, "op осталась в буфере (не потеряна)");
  assert.equal(outbox.getState().inFlight, false, "inFlight сброшен — outbox не stranded");

  // Разрешение конфликта → op должна уйти автоматически.
  coordinator.resolveConflict(sid, "refresh");
  await drain();
  await drain();
  await new Promise((resolve) => setTimeout(resolve, 10));
  await drain();

  assert.equal(api.calls.length, 1, "op флашится после conflict_resolved");
  assert.equal(api.calls[0].body.operations.length, 1);
  assert.ok(
    Number.isFinite(Number(api.calls[0].body.baseVersion)),
    `baseVersion ре-резолвлен из tracker, got ${api.calls[0].body.baseVersion}`,
  );
  assert.equal(outbox.getState().bufferedCount, 0, "буфер дренирован");

  const serverPatch = syncPatches.find((entry) => entry.patch?.lastServerVersion !== undefined);
  assert.ok(serverPatch, "syncState.patchSyncState вызван с lastServerVersion");
  assert.equal(Number(serverPatch.patch.lastServerVersion), 10, "lastServerVersion актуален после ack");
  outbox.destroy();
});

test("под gate второй pushCommand не уводит outbox в зависший inFlight", async () => {
  const sid = "s_gate_2";
  setTrackedDiagramStateVersion(sid, 7);
  const coordinator = createSaveCoordinator();
  await armGate(coordinator, sid, 9);

  const api = makeApi();
  const outbox = createSaveOutbox({
    sessionId: sid,
    coordinator,
    api,
    uuid: seqUuid(),
    now: () => 1_000_000,
    jitterRandom: () => 0.5,
    requestFullSave: () => {},
    onStatus: () => {},
    modeler: null,
    loadServerXml: async () => ({ ok: true }),
    config: createOpsOutboxConfig({ flushDebounceMs: 1 }),
  });

  outbox.pushCommand({
    command: "shape.move",
    action: "execute",
    context: { shape: { id: "Task_2" }, delta: { x: 10, y: 5 } },
  });
  await drain();
  outbox.pushCommand({
    command: "element.updateProperties",
    action: "execute",
    context: { element: { id: "Task_3" }, properties: { name: "x" } },
  });
  await drain();
  await drain();

  const state = outbox.getState();
  assert.equal(state.inFlight, false);
  assert.equal(state.bufferedCount, 2);

  coordinator.resolveConflict(sid, "refresh");
  await new Promise((resolve) => setTimeout(resolve, 10));
  await drain();
  assert.equal(api.calls.length, 1, "обе ops ушли одним батчем после resolve");
  assert.equal(api.calls[0].body.operations.length, 2);
  outbox.destroy();
});
