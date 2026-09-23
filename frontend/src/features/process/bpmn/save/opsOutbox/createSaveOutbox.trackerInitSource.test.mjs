// fix/cold-entry-spa-tracker-seed (F5): источник F2-fallback сидирования
// трекера — live session dsv (apiGetSessionMeta, тот же projection, что и
// deeplink-seed), НЕ versions-head (dsv последней full-save ревизии).
//
// Баг (audit/cold-entry-arrows-lost-after-f2, D2, stage 23.09, сессия
// 2ce96a6631): SPA cold entry → трекер не засиден (D1) → F2-fallback сидит из
// GET /bpmn/versions?limit=1 head = dsv последней full-save ревизии (159),
// отстающей от live dsv (164) на meta/ops-бампы → гейт isValidForSession
// проверяет валидность, не свежесть → первый flush со stale-nonzero-base →
// гарантированный 409 DIAGRAM_STATE_CONFLICT → баннер.
//
// Контракт фикса:
//   - ensureTrackerInitialized дёргает getSessionMeta (injected api) и сидит
//     трекер из diagram_state_version живой сессии;
//   - versions-head (getBpmnVersions) для seeding НЕ используется;
//   - meta недоступна → postpone + диагностика (прежний контракт F2);
//   - no-downgrade: meta вернула версию <= tracked (гонка с entry-seed) —
//     трекер не понижается, flush идёт с tracked;
//   - инициализированный трекер → meta не дёргается (прежний контракт F2).

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

const STALE_HEAD_DSV = 159;
const LIVE_DSV = 164;

function makeApi({ metaResult, headResult } = {}) {
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
    getBpmnVersions: async (sid, options) => {
      versionsCalls.push({ sid, options });
      return headResult;
    },
    getSessionMeta: async (sid) => {
      metaCalls.push({ sid });
      return typeof metaResult === "function" ? metaResult(sid) : metaResult;
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

test.beforeEach(() => {
  resetCasVersionTracker();
  __resetSaveDiagnosticsForTests();
  __resetTelemetryForTests();
});

test("D2-репродукция: versions-head stale (159), live meta (164) → первый flush base=live 164", async () => {
  const sid = "s_d2_repro";
  assert.equal(getTrackedDiagramStateVersion(sid), null, "трекер не засиден (cold entry)");
  const coordinator = createSaveCoordinator();
  const api = makeApi({
    // head = dsv последней full-save ревизии — структурно stale (класс D2)
    headResult: { ok: true, status: 200, versions: [{ id: "v58", diagram_state_version: STALE_HEAD_DSV }] },
    // live session projection — canonical dsv (как у deeplink-seed)
    metaResult: { ok: true, status: 200, session_id: sid, diagram_state_version: LIVE_DSV },
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

  assert.equal(api.versionsCalls.length, 0, "versions-head для seeding НЕ используется (класс D2 закрыт)");
  assert.equal(api.metaCalls.length, 1, "live session-meta запрошена для seeding");
  assert.equal(api.calls.length, 1, "ровно один ops-flush ушёл в сеть");
  assert.equal(
    api.calls[0].body.baseVersion,
    LIVE_DSV,
    `base обязан быть live dsv=${LIVE_DSV}, got ${api.calls[0].body.baseVersion}`,
  );
  assert.ok(
    diagTypes().includes("ops_tracker_initialized_from_session_meta"),
    "диагностика seeding из session-meta записана",
  );
  outbox.destroy();
});

test("meta недоступна → postpone с диагностикой, base=null не уходит", async () => {
  const sid = "s_meta_down";
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

  assert.equal(api.calls.length, 0, "transport НЕ дёргался");
  assert.equal(outbox.getState().bufferedCount, 1, "op осталась в буфере (journal-durable)");
  assert.ok(
    diagTypes().includes("ops_flush_postponed_tracker_uninitialized"),
    "диагностика postpone записана",
  );

  setTrackedDiagramStateVersion(sid, LIVE_DSV);
  await outbox.flushNow({ reason: "manual" });
  await drain();
  await drain();

  assert.equal(api.calls.length, 1, "flush дошёл после инициализации трекера");
  assert.equal(api.calls[0].body.baseVersion, LIVE_DSV);
  outbox.destroy();
});

test("no-downgrade: meta вернула stale при гонке с entry-seed → трекер не понижается", async () => {
  const sid = "s_race";
  const coordinator = createSaveCoordinator();
  let resolveMeta;
  const api = makeApi({
    metaResult: () => new Promise((resolve) => {
      resolveMeta = resolve;
    }),
  });
  const outbox = makeOutbox({ sid, api, coordinator });

  outbox.pushCommand({
    command: "shape.move",
    action: "execute",
    context: { shape: { id: "Task_3" }, delta: { x: 1, y: 1 } },
  });
  await drain();
  const flushPromise = outbox.flushNow({ reason: "drag-end" });
  await drain();
  // Пока meta в полёте, entry-seed (F4) засидил трекер свежей версией
  setTrackedDiagramStateVersion(sid, LIVE_DSV);
  resolveMeta({ ok: true, status: 200, session_id: sid, diagram_state_version: STALE_HEAD_DSV });
  await flushPromise;
  await drain();
  await drain();

  assert.equal(
    getTrackedDiagramStateVersion(sid) >= LIVE_DSV,
    true,
    `трекер не downgrade'ится (got ${getTrackedDiagramStateVersion(sid)})`,
  );
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].body.baseVersion >= LIVE_DSV, true, "flush ушёл со свежим base");
  outbox.destroy();
});

test("регресс F2: инициализированный трекер → flush сразу, meta не дёргается", async () => {
  const sid = "s_warm";
  setTrackedDiagramStateVersion(sid, LIVE_DSV);
  const coordinator = createSaveCoordinator();
  const api = makeApi({ metaResult: { ok: true, status: 200, diagram_state_version: 999 } });
  const outbox = makeOutbox({ sid, api, coordinator });

  outbox.pushCommand({
    command: "shape.move",
    action: "execute",
    context: { shape: { id: "Task_4" }, delta: { x: 1, y: 1 } },
  });
  await drain();
  await outbox.flushNow({ reason: "drag-end" });
  await drain();

  assert.equal(api.metaCalls.length, 0, "meta НЕ запрашивается при живом трекере");
  assert.equal(api.versionsCalls.length, 0, "versions-head НЕ запрашивается при живом трекере");
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].body.baseVersion, LIVE_DSV);
  outbox.destroy();
});
