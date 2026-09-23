// fix/cold-entry-version-tracker-init (F2): гейт первого ops-flush до
// инициализации casVersionTracker + запрет отправки base=null
// (server трактует отсутствующий base как client_base_version=0).
//
// Баг (audit/first-entry-save-error, stage, сессия 240167273b, 23.09):
// cold entry → GET session (server dsv=36) → GET /bpmn/versions?limit=1 →
// drag → первый flush POST /operations ушёл с client_base_version=0 при
// tracker_version=null / tracker_history=[] → 409 DIAGRAM_STATE_CONFLICT →
// баннер «Ошибка сохранения». Retry вручную через 3.3 с → 200.
//
// Источник сидирования (F5, fix/cold-entry-spa-tracker-seed): live
// diagram_state_version из GET /api/sessions/{id}/meta (тот же projection,
// что и deeplink-seed). Прежний источник versions-head структурно stale
// (dsv последней full-save ревизии) — см.
// createSaveOutbox.trackerInitSource.test.mjs (D2, 159 vs 164).
//
// Контракт фикса:
//   - flush с НЕинициализированным трекером не уходит в сеть: op остаётся в
//     буфере (journal-durable), трекер засиживается из live session-meta,
//     flush повторяется уже с валидным base;
//   - session-meta недоступна → отложенный bounded-retry с диагностикой,
//     НЕ отправка base=null;
//   - keepalive-flush при неинициализированном трекере пропускается (ops
//     переживут reload в journal, новый инстанс догонит сам);
//   - _executeTransport с baseVersion=null — ранний return с диагностикой,
//     сетевой вызов не выполняется (baseVersion=0 инициализированного
//     трекера — валиден для свежих сессий и НЕ блокируется);
//   - инициализированный трекер (multi-tab переключение / warm seeding) —
//     flush идёт сразу, meta/versions-запрос не делается.

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
import {
  __resetSaveDiagnosticsForTests,
  getSaveDiagnosticsTrail,
} from "../../../../session/saveDiagnosticsTrail.js";
import { __resetTelemetryForTests } from "../../../../../features/telemetry/telemetryClient.js";

if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

const drain = () => new Promise((resolve) => setImmediate(resolve));

function seqUuid() {
  let n = 0;
  return () => `op-${++n}`;
}

function makeApi({ metaResult } = {}) {
  const calls = [];
  const versionsCalls = [];
  const metaCalls = [];
  return {
    calls,
    versionsCalls,
    metaCalls,
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
    // versions-head для seeding больше не используется (F5) — шпион остаётся,
    // чтобы тесты могли ассертить versionsCalls === 0 (anti-regression).
    getBpmnVersions: async (sid, options) => {
      versionsCalls.push({ sid, options });
      return { ok: true, status: 200, versions: [] };
    },
    getSessionMeta: async (sid) => {
      metaCalls.push({ sid });
      return metaResult;
    },
  };
}

function makeOutbox({ sid, api, coordinator }) {
  return createSaveOutbox({
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
}

function diagTypes() {
  return getSaveDiagnosticsTrail().map((event) => String(event?.type || ""));
}

const SERVER_DSV = 36;

test.beforeEach(() => {
  resetCasVersionTracker();
  __resetSaveDiagnosticsForTests();
  __resetTelemetryForTests();
});

test("cold entry: первый flush ждёт инициализации трекера и уходит с base=server dsv", async () => {
  const sid = "s_cold_1";
  // Трекер НЕ засиджен — воспроизведение инцидента (cold entry, seeding-путь
  // не сработал до первой правки).
  assert.equal(getTrackedDiagramStateVersion(sid), null);
  const coordinator = createSaveCoordinator();
  const api = makeApi({
    metaResult: {
      ok: true,
      status: 200,
      session_id: sid,
      diagram_state_version: SERVER_DSV,
    },
  });
  const outbox = makeOutbox({ sid, api, coordinator });

  outbox.pushCommand({
    command: "shape.move",
    action: "execute",
    context: { shape: { id: "Task_1" }, delta: { x: -200, y: 10 } },
  });
  await drain();
  await outbox.flushNow({ reason: "drag-end" });
  await drain();
  await drain();

  assert.equal(api.metaCalls.length, 1, "live session-meta запрошена для seeding трекера");
  assert.equal(api.versionsCalls.length, 0, "versions-head для seeding не используется (F5)");
  assert.equal(api.calls.length, 1, "ровно один ops-flush ушёл в сеть");
  assert.equal(
    api.calls[0].body.baseVersion,
    SERVER_DSV,
    `base обязан быть server dsv=${SERVER_DSV}, got ${api.calls[0].body.baseVersion}`,
  );
  assert.equal(outbox.getState().bufferedCount, 0, "буфер дренирован");
  assert.equal(getTrackedDiagramStateVersion(sid), SERVER_DSV + 1, "трекер adopt'ит ack-версию");
  outbox.destroy();
});

test("base=null не уходит в сеть: session-meta недоступна → postpone, буфер pending", async () => {
  const sid = "s_cold_2";
  const coordinator = createSaveCoordinator();
  const api = makeApi({ metaResult: { ok: false, status: 0, error: "network-down" } });
  const outbox = makeOutbox({ sid, api, coordinator });

  outbox.pushCommand({
    command: "shape.move",
    action: "execute",
    context: { shape: { id: "Task_2" }, delta: { x: 5, y: 5 } },
  });
  await drain();
  await outbox.flushNow({ reason: "drag-end" });
  await drain();

  assert.equal(api.calls.length, 0, "transport НЕ дёргался — base=null не уходит на сервер");
  assert.equal(outbox.getState().bufferedCount, 1, "op осталась в буфере (journal-durable)");
  assert.ok(
    diagTypes().includes("ops_flush_postponed_tracker_uninitialized"),
    "диагностика postpone записана",
  );

  // Self-heal: трекер засидился извне (например, versions-проекция другого
  // слоя) → ручной retry уходит с валидным base.
  setTrackedDiagramStateVersion(sid, SERVER_DSV);
  await outbox.flushNow({ reason: "manual" });
  await drain();
  await drain();

  assert.equal(api.calls.length, 1, "flush дошёл после инициализации трекера");
  assert.equal(api.calls[0].body.baseVersion, SERVER_DSV);
  assert.equal(outbox.getState().bufferedCount, 0);
  outbox.destroy();
});

test("multi-tab регресс: инициализированный трекер → flush сразу, versions не запрашиваются", async () => {
  const sid = "s_warm_1";
  // Warm вход: activation-гидратация (openSession/apiGetSession) уже засидила
  // трекер свежим server dsv.
  setTrackedDiagramStateVersion(sid, SERVER_DSV);
  const coordinator = createSaveCoordinator();
  const api = makeApi();
  const outbox = makeOutbox({ sid, api, coordinator });

  outbox.pushCommand({
    command: "shape.move",
    action: "execute",
    context: { shape: { id: "Task_3" }, delta: { x: 1, y: 1 } },
  });
  await drain();
  await outbox.flushNow({ reason: "drag-end" });
  await drain();

  assert.equal(api.versionsCalls.length, 0, "versions-head НЕ запрашивается при живом трекере");
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].body.baseVersion, SERVER_DSV);
  outbox.destroy();
});

test("keepalive-flush при неинициализированном трекере пропускается (ops переживут reload в journal)", async () => {
  const sid = "s_cold_3";
  const coordinator = createSaveCoordinator();
  const api = makeApi({ metaResult: { ok: false, status: 0, error: "network-down" } });
  const outbox = makeOutbox({ sid, api, coordinator });

  outbox.pushCommand({
    command: "shape.move",
    action: "execute",
    context: { shape: { id: "Task_4" }, delta: { x: 2, y: 2 } },
  });
  await outbox.flushNow({ reason: "unload", keepalive: true });
  await drain();
  await drain();

  assert.equal(api.calls.length, 0, "keepalive с base=null не уходит — гарантированный 409 на сервере");
  assert.ok(
    diagTypes().includes("ops_keepalive_flush_skipped_tracker_uninitialized"),
    "диагностика keepalive-skip записана",
  );
  assert.equal(outbox.getState().bufferedCount, 1, "op осталась в буфере/journal");
  outbox.destroy();
});

test("_executeTransport: baseVersion=null — ранний return без сети; baseVersion=0 — проходит", async () => {
  const sid = "s_guard_1";
  const coordinator = createSaveCoordinator();
  const api = makeApi();
  const outbox = makeOutbox({ sid, api, coordinator });

  const blocked = await outbox._executeTransport({ baseVersion: null, operations: [] });
  assert.equal(blocked.ok, false, "null-base заблокирован");
  assert.equal(api.calls.length, 0, "сетевой вызов не выполнен");
  assert.ok(
    diagTypes().includes("ops_transport_blocked_missing_base"),
    "диагностика блокировки записана",
  );

  const zeroBase = await outbox._executeTransport({ baseVersion: 0, operations: [] });
  assert.equal(zeroBase.ok, true, "base=0 инициализированного трекера (свежая сессия) валиден");
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].body.baseVersion, 0);
  outbox.destroy();
});
