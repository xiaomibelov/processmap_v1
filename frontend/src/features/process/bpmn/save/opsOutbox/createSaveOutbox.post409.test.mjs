import test from "node:test";
import assert from "node:assert/strict";

import { createSaveCoordinator } from "../../../../session/saveCoordinator.js";
import {
  getVersion as getTrackedDiagramStateVersion,
  setVersion as setTrackedDiagramStateVersion,
  __resetForTests as resetCasVersionTracker,
} from "../../../../../lib/casVersionTracker.js";
import {
  getSaveDiagnosticsTrail,
  __resetSaveDiagnosticsForTests,
} from "../../../../../features/session/saveDiagnosticsTrail.js";
import { createOpsOutboxConfig } from "./opsOutboxConfig.js";
import { createSaveOutbox } from "./createSaveOutbox.js";

// ---------------------------------------------------------------------------
// Контур fix/post-409-reconcile-hardening (RC: self-conflict-silent-rebase,
// stage-сессия 71cbe45d53, base=1659). Аудитный симптом: op ретраится с тем
// же base, клиент не перебазируется на серверную версию из ответа 409.
//
// Живой stage-прогон (2026-09-23, read-only) подтвердил формат 409:
//   POST /api/sessions/{id}/operations → 409
//   {"detail": {"code": "DIAGRAM_STATE_CONFLICT",
//     "client_base_version": …, "server_current_version": 1659,
//     "server_last_write": {…}, "server_current_xml": "<полный XML>"}}
// `server_current_xml` backend добавляет best-effort
// (_legacy_main._conflict_with_current_xml): при недоступном storage.load
// поле отсутствует, а `server_current_version` — всегда.
//
// Эти тесты фиксируют контракт: версия из 409-ответа используется для
// перебазирования ожидающих ops даже при отсутствии server_current_xml.
// ---------------------------------------------------------------------------

if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

function makeApi(impl = {}) {
  const calls = [];
  return {
    calls,
    postSessionOperations: async (sid, body, opts) => {
      calls.push({ sid, body, opts });
      if (typeof impl.postSessionOperations === "function") {
        return impl.postSessionOperations(sid, body, opts);
      }
      return { ok: true, status: 200, version: 8, applied: body.operations.length, skipped: 0, diagramStateVersion: 8 };
    },
  };
}

function seqUuid() {
  let n = 0;
  return () => `op-${++n}`;
}

const drain = () => new Promise((resolve) => setImmediate(resolve));

function makeOutbox(options = {}) {
  const coordinator = options.coordinator || createSaveCoordinator();
  const api = options.api || makeApi();
  const statuses = [];
  let nowValue = 1_000_000;
  const outbox = createSaveOutbox({
    sessionId: "s1",
    coordinator,
    api,
    uuid: seqUuid(),
    now: () => nowValue,
    jitterRandom: () => 0.5,
    requestFullSave: () => {},
    onStatus: (ev) => statuses.push(ev),
    modeler: options.modeler || null,
    loadServerXml: options.loadServerXml || (async () => ({ ok: true })),
    applyOpsFn: options.applyOpsFn,
    journal: options.journal,
    syncStateStore: options.syncStateStore,
    config: createOpsOutboxConfig(options.configOverrides || {}),
  });
  return { coordinator, api, outbox, statuses };
}

function pushRename(outbox, id = "Task_1", name = "Имя") {
  return outbox.pushCommand({
    command: "element.updateProperties",
    action: "execute",
    context: { element: { id }, properties: { name } },
  });
}

test.beforeEach(() => {
  resetCasVersionTracker();
  __resetSaveDiagnosticsForTests();
});

test("R1: 409 с server_current_version, но БЕЗ server_current_xml → перебазировка и успех (а не stranded-конфликт)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let attempt = 0;
    const api = makeApi({
      postSessionOperations: async (sid, body) => {
        attempt += 1;
        if (attempt === 1) {
          // Аудитные числа: клиентская base 1659, сервер ушёл на 1660.
          // server_current_xml в ответе НЕТ (best-effort ветка бэка).
          return {
            ok: false,
            status: 409,
            error: "DIAGRAM_STATE_CONFLICT",
            data: {
              detail: {
                code: "DIAGRAM_STATE_CONFLICT",
                session_id: "s1",
                client_base_version: 1659,
                server_current_version: 1660,
                server_last_write: { changed_keys: ["interview"] },
              },
            },
          };
        }
        return { ok: true, status: 200, version: 1661, applied: body.operations.length, skipped: 0, diagramStateVersion: 1661 };
      },
    });
    const replayed = [];
    const ctx = makeOutbox({
      api,
      applyOpsFn: async (_modeler, ops) => {
        replayed.push(ops);
        return { ok: true, applied: ops.length, failed: 0, results: ops.map((o) => ({ opId: o.opId, ok: true })) };
      },
    });
    setTrackedDiagramStateVersion("s1", 1659);
    pushRename(ctx.outbox, "Task_1", "A");

    await ctx.outbox.flushNow({ reason: "test" });
    await drain();
    t.mock.timers.tick(2500);
    await drain();

    assert.equal(attempt, 2, "повторный flush после перебазирования (а не stranded за гейтом)");
    assert.deepEqual(
      ctx.api.calls.map((c) => c.body.baseVersion),
      [1659, 1660],
      "второй POST уходит с base = server_current_version из 409",
    );
    assert.equal(getTrackedDiagramStateVersion("s1"), 1661, "ack-версия adopt'ится");
    assert.notEqual(ctx.outbox.getState().stage, "conflict", "conflict gate не остаётся armed");
    assert.ok(!ctx.coordinator.getConflict("s1"), "gate снят после перебазирования");
    assert.equal(replayed.length, 0, "клиентский replay без server_current_xml НЕ выполняется (двойное применение delta-op)");
    assert.equal(ctx.outbox.getState().bufferedCount, 0, "буфер освобождён ack'ом");
    ctx.outbox.destroy();
  } finally {
    t.mock.timers.reset();
  }
});

test("R2: 409 БЕЗ версии и БЕЗ xml → прежнее поведение (conflictStop) + diagnostics-запись ops_409_missing_server_version", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let attempt = 0;
    const api = makeApi({
      postSessionOperations: async () => {
        attempt += 1;
        return {
          ok: false,
          status: 409,
          error: "DIAGRAM_STATE_CONFLICT",
          // Частичный 409: ни версии, ни XML — не выдумываем версию,
          // фиксируем в diagnostics и оставляем текущее поведение.
          data: { detail: { code: "DIAGRAM_STATE_CONFLICT", session_id: "s1" } },
        };
      },
    });
    const ctx = makeOutbox({ api });
    setTrackedDiagramStateVersion("s1", 1659);
    pushRename(ctx.outbox, "Task_1", "A");

    await ctx.outbox.flushNow({ reason: "test" });
    await drain();

    assert.equal(attempt, 1, "без версии в 409 retry не предпринимается");
    assert.equal(ctx.outbox.getState().stage, "conflict", "прежний conflictStop (rebase-no-server-xml)");
    assert.ok(ctx.coordinator.getConflict("s1"), "gate armed — честный модал");
    assert.equal(getTrackedDiagramStateVersion("s1"), 1659, "tracked-base не подменяется без версии");
    const trail = getSaveDiagnosticsTrail();
    assert.ok(
      trail.some((entry) => entry.type === "ops_409_missing_server_version" && entry.sid === "s1"),
      "diagnostics-запись ops_409_missing_server_version присутствует",
    );
    ctx.outbox.destroy();
  } finally {
    t.mock.timers.reset();
  }
});
