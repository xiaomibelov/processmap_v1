import test from "node:test";
import assert from "node:assert/strict";

import { createSaveCoordinator } from "../../../../session/saveCoordinator.js";
import {
  getVersion as getTrackedDiagramStateVersion,
  setVersion as setTrackedDiagramStateVersion,
  __resetForTests as resetCasVersionTracker,
} from "../../../../../lib/casVersionTracker.js";
import { createOpsOutboxConfig } from "./opsOutboxConfig.js";
import {
  createSaveOutbox,
  installOpsOutboxPageFlush,
} from "./createSaveOutbox.js";

// ---------------------------------------------------------------------------
// Контур feature/async-save-pipeline-step1 (TESTS §1.2).
// SaveOutbox: subscribe → buffer → debounce 2.5s / threshold 50 ops → flush
// через saveCoordinator pipeline "ops". Ack clears buffer + один CAS bump.
// Keepalive-unload: fetch(..., {keepalive:true}) с Authorization (НЕ
// sendBeacon). Mutual exclusion с full-save. Двойной 409 → ops-degraded.
// ---------------------------------------------------------------------------

// E2E-инструментация живёт на window; в node-окружении даём минимальный shim.
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

// Координатор деферит транспорт в микротаски (per-pipeline promise queue) —
// после sync-tick таймеров даём event loop дойти до setImmediate.
const drain = () => new Promise((resolve) => setImmediate(resolve));

function makeOutbox(t, options = {}) {
  const coordinator = options.coordinator || createSaveCoordinator();
  const api = options.api || makeApi();
  const statuses = [];
  const fullSaveRequests = [];
  let nowValue = options.startNow ?? 1_000_000;
  const outbox = createSaveOutbox({
    sessionId: "s1",
    coordinator,
    api,
    uuid: seqUuid(),
    now: () => nowValue,
    // Детерминизм тайминг-тестов: r=0.5 → jitter-фактор ровно 1.0 (базовая
    // задержка без отклонения). Джиттер покрывается отдельным файлом
    // createSaveOutbox.retryJitter.test.mjs.
    jitterRandom: typeof options.jitterRandom === "function" ? options.jitterRandom : () => 0.5,
    requestFullSave: () => fullSaveRequests.push(Date.now()),
    onStatus: (ev) => statuses.push(ev),
    modeler: options.modeler || null,
    loadServerXml: options.loadServerXml || (async () => ({ ok: true })),
    applyOpsFn: options.applyOpsFn,
    config: createOpsOutboxConfig(options.configOverrides || {}),
  });
  return {
    coordinator,
    api,
    outbox,
    statuses,
    fullSaveRequests,
    tickNow: (ms) => { nowValue += ms; },
    destroy: () => outbox.destroy(),
    t,
  };
}

function pushRename(outbox, id = "Task_1", name = "Имя") {
  return outbox.pushCommand({
    command: "element.updateProperties",
    action: "execute",
    context: { element: { id }, properties: { name } },
  });
}

function pushMove(outbox, id, dx, dy) {
  return outbox.pushCommand({
    command: "shape.move",
    action: "execute",
    context: { shape: { id }, delta: { x: dx, y: dy } },
  });
}

test.beforeEach(() => {
  resetCasVersionTracker();
});

test("debounce: series of edits flushes exactly once after 2.5s quiet period", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const ctx = makeOutbox(t);
    setTrackedDiagramStateVersion("s1", 7);
    pushRename(ctx.outbox, "Task_1", "A");
    ctx.tickNow(100);
    pushMove(ctx.outbox, "Task_2", 5, 5);
    ctx.tickNow(100);
    pushRename(ctx.outbox, "Task_3", "B");
    assert.equal(ctx.api.calls.length, 0, "no flush before debounce expires");
    t.mock.timers.tick(2500);
    await drain();
    assert.equal(ctx.api.calls.length, 1, "exactly one flush after quiet period");
    assert.equal(ctx.api.calls[0].sid, "s1");
    assert.deepEqual(ctx.api.calls[0].body.operations.map((o) => o.type), [
      "element.updateProperties",
      "shape.move",
      "element.updateProperties",
    ]);
    assert.equal(ctx.api.calls[0].body.baseVersion, 7);
    ctx.destroy();
  } finally {
    t.mock.timers.reset();
  }
});

test("no flush during silence", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const ctx = makeOutbox(t);
    t.mock.timers.tick(10_000);
    assert.equal(ctx.api.calls.length, 0);
    ctx.destroy();
  } finally {
    t.mock.timers.reset();
  }
});

test("threshold: 50 ops → immediate flush without waiting for debounce", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const ctx = makeOutbox(t);
    for (let i = 0; i < 49; i += 1) {
      pushRename(ctx.outbox, `Task_${i}`, `N${i}`);
    }
    assert.equal(ctx.api.calls.length, 0, "49 ops still within threshold");
    pushRename(ctx.outbox, "Task_49", "N49");
    await drain();
    assert.equal(ctx.api.calls.length, 1, "50th op triggers immediate flush");
    assert.equal(ctx.api.calls[0].body.operations.length, 50);
    ctx.destroy();
  } finally {
    t.mock.timers.reset();
  }
});

test("opId order is stable and uuids unique", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const ctx = makeOutbox(t);
    pushRename(ctx.outbox, "Task_1", "A");
    pushRename(ctx.outbox, "Task_2", "B");
    pushRename(ctx.outbox, "Task_3", "C");
    t.mock.timers.tick(2500);
    await drain();
    const ids = ctx.api.calls[0].body.operations.map((o) => o.opId);
    assert.deepEqual(ids, ["op-1", "op-2", "op-3"]);
    assert.equal(new Set(ids).size, 3);
    ctx.destroy();
  } finally {
    t.mock.timers.reset();
  }
});

test("200 ack: buffer cleared, casVersionTracker bumped exactly once, ops-saved status emitted", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const ctx = makeOutbox(t);
    setTrackedDiagramStateVersion("s1", 7);
    pushRename(ctx.outbox, "Task_1", "A");
    const flushPromise = ctx.outbox.flushNow({ reason: "test" });
    await flushPromise;
    assert.equal(ctx.api.calls.length, 1);
    assert.equal(getTrackedDiagramStateVersion("s1"), 8, "bumped exactly once by coordinator");
    assert.ok(ctx.statuses.some((s) => s.stage === "ops-saved"), "ops-saved status emitted");
    // буфер чист: повторный flush ничего не отправляет
    await ctx.outbox.flushNow({ reason: "test" });
    assert.equal(ctx.api.calls.length, 1);
    ctx.destroy();
  } finally {
    t.mock.timers.reset();
  }
});

test("retry after failure resends the same opIds (client idempotency)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let attempt = 0;
    const api = makeApi({
      postSessionOperations: async (sid, body) => {
        attempt += 1;
        if (attempt === 1) return { ok: false, status: 500, error: "server error" };
        return { ok: true, status: 200, version: 9, applied: body.operations.length, skipped: 0, diagramStateVersion: 9 };
      },
    });
    const ctx = makeOutbox(t, { api });
    setTrackedDiagramStateVersion("s1", 7);
    pushRename(ctx.outbox, "Task_1", "A");
    const flushPromise = ctx.outbox.flushNow({ reason: "test" });
    await drain();            // attempt 1 (500) прошёл, retry-sleep(1000) запланирован
    t.mock.timers.tick(1000); // backoff истёк → attempt 2
    await flushPromise;
    assert.equal(attempt, 2);
    assert.deepEqual(
      ctx.api.calls.map((c) => c.body.operations.map((o) => o.opId)),
      [["op-1"], ["op-1"]],
      "retry must reuse the same opIds",
    );
    ctx.destroy();
  } finally {
    t.mock.timers.reset();
  }
});

test("visibilitychange=hidden → immediate flush; beforeunload → keepalive fetch", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const ctx = makeOutbox(t);
    setTrackedDiagramStateVersion("s1", 7);
    pushRename(ctx.outbox, "Task_1", "A");

    const docHandlers = {};
    const winHandlers = {};
    const fakeDoc = {
      visibilityState: "hidden",
      addEventListener: (name, cb) => { docHandlers[name] = cb; },
      removeEventListener: (name, cb) => { if (docHandlers[name] === cb) delete docHandlers[name]; },
    };
    const fakeWin = {
      addEventListener: (name, cb) => { winHandlers[name] = cb; },
      removeEventListener: (name, cb) => { if (winHandlers[name] === cb) delete winHandlers[name]; },
    };
    const uninstall = installOpsOutboxPageFlush(ctx.outbox, { doc: fakeDoc, win: fakeWin });

    docHandlers.visibilitychange();
    await drain();
    assert.equal(ctx.api.calls.length, 1, "visibility flush goes through coordinator transport");
    assert.notEqual(ctx.api.calls[0].opts?.keepalive, true, "visibility flush is a normal awaited flush");

    pushRename(ctx.outbox, "Task_2", "C");
    winHandlers.beforeunload();
    assert.equal(ctx.api.calls.length, 2, "beforeunload triggers a flush");
    assert.equal(ctx.api.calls[1].opts?.keepalive, true, "beforeunload uses keepalive fetch, not sendBeacon");

    uninstall();
    assert.equal(Object.keys(docHandlers).length, 0);
    assert.equal(Object.keys(winHandlers).length, 0);
    ctx.destroy();
  } finally {
    t.mock.timers.reset();
  }
});

test("keepalive flush sends Authorization header (regression against sendBeacon)", async () => {
  const savedFetch = globalThis.fetch;
  const fetched = [];
  globalThis.fetch = async (url, init) => {
    fetched.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ version: 9, applied: 1, skipped: 0 }) };
  };
  try {
    const { setAccessToken } = await import("../../../../../lib/apiCore.js");
    setAccessToken("tok-keepalive-123");
    // РЕАЛЬНЫЙ api-клиент (без инъекции fake-api): keepalive-путь идёт через
    // apiPostSessionOperations → fetch(keepalive) с Authorization.
    const coordinator = createSaveCoordinator();
    const outbox = createSaveOutbox({
      sessionId: "s1",
      coordinator,
      uuid: seqUuid(),
      requestFullSave: () => {},
      config: createOpsOutboxConfig({}),
    });
    setTrackedDiagramStateVersion("s1", 7);
    pushRename(outbox, "Task_1", "A");
    await outbox.flushNow({ reason: "unload", keepalive: true });
    assert.equal(fetched.length, 1);
    assert.equal(fetched[0].init.method, "POST");
    assert.equal(fetched[0].init.keepalive, true, "keepalive flag must be set");
    const rawHeaders = fetched[0].init.headers instanceof Headers
      ? Object.fromEntries(fetched[0].init.headers.entries())
      : fetched[0].init.headers;
    const headers = Object.fromEntries(Object.entries(rawHeaders).map(([k, v]) => [k.toLowerCase(), v]));
    assert.equal(headers.authorization, "Bearer tok-keepalive-123", "Authorization header present");
    assert.match(fetched[0].url, /\/api\/sessions\/s1\/operations$/);
    setAccessToken("");
    outbox.destroy();
  } finally {
    globalThis.fetch = savedFetch;
  }
});

test("mutual exclusion: ops flush waits while full-save (xml pipeline) is in flight", async () => {
  const coordinator = createSaveCoordinator();
  let resolveXml;
  const xmlStarted = new Promise((resolve) => { resolveXml = resolve; });
  coordinator.registerPipeline("xml", {
    debounceMs: 0,
    retryCount: 0,
    // Full-save завершается ОТКАЗОМ: ack не приходит → буфер ops НЕ сбрасывается
    // (success xml/rawXml покрывает локальные ops) → после освобождения busy
    // ops-flush обязан отправить накопленное.
    transport: async () => {
      await xmlStarted;
      return { ok: false, status: 500, error: "full-save failed" };
    },
    getBaseVersion: (sid) => getTrackedDiagramStateVersion(sid),
  });
  setTrackedDiagramStateVersion("s1", 7);
  const xmlPromise = coordinator.execute("xml", { sessionId: "s1" });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(coordinator.getStatus("xml").state, "busy");

  const ctx = makeOutbox(null, {
    coordinator,
    configOverrides: { fullSaveBusyPollMs: 20 },
  });
  pushRename(ctx.outbox, "Task_1", "A");
  void ctx.outbox.flushNow({ reason: "test" });
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(ctx.api.calls.length, 0, "ops transport must not run while full-save is busy");

  resolveXml({ ok: false, status: 500, error: "full-save failed" });
  await xmlPromise;
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(ctx.api.calls.length, 1, "ops flush proceeds after full-save lane frees");
  ctx.destroy();
});

test("non-whitelisted command → needsFullSave, full-save path requested, no ops transport", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const ctx = makeOutbox(t);
    ctx.outbox.pushCommand({ command: "spaceTool", action: "execute", context: {} });
    await ctx.outbox.flushNow({ reason: "test" });
    assert.equal(ctx.api.calls.length, 0, "ops transport not used for needsFullSave");
    assert.equal(ctx.fullSaveRequests.length, 1, "full-save fallback requested");
    ctx.destroy();
  } finally {
    t.mock.timers.reset();
  }
});

test("full-save success (xml pipeline ack) clears pending ops buffer", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const ctx = makeOutbox(t);
    pushRename(ctx.outbox, "Task_1", "A");
    pushRename(ctx.outbox, "Task_2", "B");
    ctx.coordinator.emit("success", { pipeline: "xml", sessionId: "s1", response: {} });
    await ctx.outbox.flushNow({ reason: "test" });
    assert.equal(ctx.api.calls.length, 0, "server state after full save covers local ops");
    ctx.destroy();
  } finally {
    t.mock.timers.reset();
  }
});

test("undo of a buffered op removes it; flush sends nothing", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const ctx = makeOutbox(t);
    pushRename(ctx.outbox, "Task_1", "A");
    ctx.outbox.pushCommand({
      command: "element.updateProperties",
      action: "undo",
      context: { element: { id: "Task_1" }, properties: { name: "A" }, oldProperties: { name: "" } },
    });
    await ctx.outbox.flushNow({ reason: "test" });
    assert.equal(ctx.api.calls.length, 0, "undone buffered op must not be sent");
    ctx.destroy();
  } finally {
    t.mock.timers.reset();
  }
});

test("undo of an acked op produces a compensating op in the next flush", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const ctx = makeOutbox(t);
    setTrackedDiagramStateVersion("s1", 7);
    pushRename(ctx.outbox, "Task_1", "Новое");
    await ctx.outbox.flushNow({ reason: "test" });
    assert.equal(ctx.api.calls.length, 1);

    ctx.outbox.pushCommand({
      command: "element.updateProperties",
      action: "undo",
      context: {
        element: { id: "Task_1" },
        properties: { name: "Новое" },
        oldProperties: { name: "Старое" },
      },
    });
    await ctx.outbox.flushNow({ reason: "test" });
    assert.equal(ctx.api.calls.length, 2);
    const comp = ctx.api.calls[1].body.operations[0];
    assert.equal(comp.type, "element.updateProperties");
    assert.deepEqual(comp.properties, { name: "Старое" }, "compensating op restores old value");
    ctx.destroy();
  } finally {
    t.mock.timers.reset();
  }
});

test("coalesce: drag storm of shape.move within 400ms window → 1 keep-last op; gap opens new op", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const ctx = makeOutbox(t);
    pushMove(ctx.outbox, "Task_1", 5, 0);
    ctx.tickNow(100);
    pushMove(ctx.outbox, "Task_1", 10, 0);
    ctx.tickNow(100);
    pushMove(ctx.outbox, "Task_1", 20, 0);
    ctx.tickNow(100);
    pushMove(ctx.outbox, "Task_1", 30, 0);
    t.mock.timers.tick(2500);
    await drain();
    assert.equal(ctx.api.calls.length, 1);
    assert.equal(ctx.api.calls[0].body.operations.length, 1, "drag storm coalesced to one op");
    assert.deepEqual(ctx.api.calls[0].body.operations[0].delta, { x: 30, y: 0 }, "keep-last wins");

    // окно якорится на первой op burst'а: 400ms с первой, не с последней
    pushMove(ctx.outbox, "Task_1", 1, 0);      // t0
    ctx.tickNow(390);                            // ещё внутри окна? новая серия — окно снова 400
    pushMove(ctx.outbox, "Task_1", 2, 0);        // +390 ≤ 400 → coalesce
    ctx.tickNow(50);                             // +440 от t0 > 400 → новая op
    pushMove(ctx.outbox, "Task_1", 3, 0);
    t.mock.timers.tick(2500);
    await drain();
    assert.equal(ctx.api.calls.length, 2);
    assert.equal(ctx.api.calls[1].body.operations.length, 2, "second burst: one coalesced + one fresh");
    ctx.destroy();
  } finally {
    t.mock.timers.reset();
  }
});

test("mouseup commit freezes pending move op (no coalescing across drag end)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const ctx = makeOutbox(t);
    pushMove(ctx.outbox, "Task_1", 5, 0);
    ctx.tickNow(100);
    pushMove(ctx.outbox, "Task_1", 10, 0);
    ctx.outbox.commitDrag();                     // mouseup — freeze
    ctx.tickNow(100);                            // всё ещё внутри 400ms окна
    pushMove(ctx.outbox, "Task_1", 99, 0);       // новый drag → НЕ сливается с замороженной op
    t.mock.timers.tick(2500);
    await drain();
    assert.equal(ctx.api.calls.length, 1);
    assert.equal(ctx.api.calls[0].body.operations.length, 2, "committed op and new drag are separate");
    ctx.destroy();
  } finally {
    t.mock.timers.reset();
  }
});

test("409 → rebase: adopt server version, replay pending ops, ops resent with same opIds", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const replayed = [];
    let attempt = 0;
    const api = makeApi({
      postSessionOperations: async (sid, body, opts) => {
        attempt += 1;
        if (attempt === 1) {
          return {
            ok: false,
            status: 409,
            error: "DIAGRAM_STATE_CONFLICT",
            data: { detail: { code: "DIAGRAM_STATE_CONFLICT", server_current_version: 9, server_current_xml: "<xml/>" } },
          };
        }
        return { ok: true, status: 200, version: 10, applied: body.operations.length, skipped: 0, diagramStateVersion: 10 };
      },
    });
    const applyOpsFn = async (modeler, ops) => {
      replayed.push(ops);
      return { ok: true, applied: ops.length, failed: 0, results: ops.map((o) => ({ opId: o.opId, ok: true })) };
    };
    const ctx = makeOutbox(t, { api, applyOpsFn });
    setTrackedDiagramStateVersion("s1", 7);
    pushRename(ctx.outbox, "Task_1", "A");
    const first = ctx.outbox.flushNow({ reason: "test" });
    await first;
    assert.equal(getTrackedDiagramStateVersion("s1"), 9, "server version adopted on 409");
    assert.ok(ctx.statuses.some((s) => s.stage === "ops-rebase"));
    assert.equal(replayed.length, 1, "pending ops replayed through applyOps path");
    await drain();
    t.mock.timers.tick(2500);
    await drain();
    assert.equal(attempt, 2, "ops resent after rebase");
    assert.deepEqual(ctx.api.calls[1].body.operations.map((o) => o.opId), ["op-1"], "same opId after rebase");
    assert.equal(ctx.api.calls[1].body.baseVersion, 9, "resent with adopted base");
    ctx.destroy();
  } finally {
    t.mock.timers.reset();
  }
});

test("replay echo during rebase: replay-flagged command restores op with same opId, no duplicate", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const api = makeApi({
      postSessionOperations: async () => ({
        ok: false,
        status: 409,
        error: "DIAGRAM_STATE_CONFLICT",
        data: { detail: { code: "DIAGRAM_STATE_CONFLICT", server_current_version: 9, server_current_xml: "<xml/>" } },
      }),
    });
    const ctx = makeOutbox(t, { api, applyOpsFn: async () => ({ ok: true, applied: 1, failed: 0, results: [] }) });
    setTrackedDiagramStateVersion("s1", 7);
    pushRename(ctx.outbox, "Task_1", "A");
    await ctx.outbox.flushNow({ reason: "test" });
    // replay-команда вернулась из applyOps с флагами эхо-подавления
    ctx.outbox.pushCommand({
      command: "element.updateProperties",
      action: "execute",
      context: {
        element: { id: "Task_1" },
        properties: { name: "A" },
        __pmOpId: "op-1",
        __pmOpSource: "replay",
      },
    });
    const state = ctx.outbox.getState();
    assert.equal(state.bufferedCount, 1, "single op in buffer after echo");
    assert.equal(state.stage === "rebasing" || state.stage === "buffering" || state.stage === "idle", true);
    ctx.destroy();
  } finally {
    t.mock.timers.reset();
  }
});

test("double 409 → ops-degraded, full-save fallback requested", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const api = makeApi({
      postSessionOperations: async () => ({
        ok: false,
        status: 409,
        error: "DIAGRAM_STATE_CONFLICT",
        data: { detail: { code: "DIAGRAM_STATE_CONFLICT", server_current_version: 9, server_current_xml: "<xml/>" } },
      }),
    });
    const ctx = makeOutbox(t, { api, applyOpsFn: async () => ({ ok: true, applied: 1, failed: 0, results: [] }) });
    setTrackedDiagramStateVersion("s1", 7);
    pushRename(ctx.outbox, "Task_1", "A");
    await ctx.outbox.flushNow({ reason: "test" });
    await drain();
    t.mock.timers.tick(2500);
    await drain();
    t.mock.timers.tick(2500);
    await drain();
    const state = ctx.outbox.getState();
    assert.equal(state.stage, "degraded");
    assert.ok(ctx.statuses.some((s) => s.stage === "ops-degraded"));
    assert.ok(ctx.fullSaveRequests.length >= 1, "full-save fallback requested after double 409");
    ctx.destroy();
  } finally {
    t.mock.timers.reset();
  }
});

test("422 OPERATION_UNSUPPORTED → ops-degraded after bounded coordinator retries", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const api = makeApi({
      postSessionOperations: async () => ({ ok: false, status: 422, error: "OPERATION_UNSUPPORTED", code: "OPERATION_UNSUPPORTED" }),
    });
    const ctx = makeOutbox(t, { api });
    setTrackedDiagramStateVersion("s1", 7);
    pushRename(ctx.outbox, "Task_1", "A");
    const flushPromise = ctx.outbox.flushNow({ reason: "test" });
    await drain();
    // sync-tick не запускает микротаски: backoff-цепочка (1s/2s/4s) требует
    // итеративных циклов tick+drain.
    for (let i = 0; i < 6; i += 1) {
      t.mock.timers.tick(1500);
      await drain();
    }
    // saveCoordinator ретраит любой не-conflict отказ ровно retryCount раз
    // (контракт соседних пайплайнов не меняем): 1 попытка + 3 ретрая.
    assert.equal(ctx.api.calls.length, 4, "bounded retries (1 + retryCount), no storm beyond");
    assert.equal(ctx.outbox.getState().stage, "degraded");
    assert.ok(ctx.fullSaveRequests.length >= 1);
    await flushPromise;
    ctx.destroy();
  } finally {
    t.mock.timers.reset();
  }
});

test("fuzzy miss during rebase replay → needsFullSave → degraded + full-save requested", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const api = makeApi({
      postSessionOperations: async () => ({
        ok: false,
        status: 409,
        error: "DIAGRAM_STATE_CONFLICT",
        data: { detail: { code: "DIAGRAM_STATE_CONFLICT", server_current_version: 9, server_current_xml: "<xml/>" } },
      }),
    });
    const applyOpsFn = async () => ({
      ok: false,
      applied: 0,
      failed: 1,
      results: [{ opId: "op-1", ok: false, error: "element_not_found", fuzzyMiss: true }],
    });
    const ctx = makeOutbox(t, { api, applyOpsFn });
    setTrackedDiagramStateVersion("s1", 7);
    pushRename(ctx.outbox, "Task_1", "A");
    await ctx.outbox.flushNow({ reason: "test" });
    await new Promise((r) => setImmediate(r));
    assert.equal(ctx.outbox.getState().stage, "degraded");
    assert.ok(ctx.fullSaveRequests.length >= 1);
    ctx.destroy();
  } finally {
    t.mock.timers.reset();
  }
});

test("__PM_OPS_FLUSHED__ trace hook increments on every ops flush", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const ctx = makeOutbox(t);
    setTrackedDiagramStateVersion("s1", 7);
    pushRename(ctx.outbox, "Task_1", "A");
    await ctx.outbox.flushNow({ reason: "test" });
    const flushed = globalThis.window?.__PM_OPS_FLUSHED__;
    assert.ok(flushed, "trace hook exists on window");
    assert.ok(flushed.count >= 1);
    assert.ok(Array.isArray(flushed.traces));
    assert.equal(flushed.traces[flushed.traces.length - 1].reason, "test");
    ctx.destroy();
  } finally {
    t.mock.timers.reset();
  }
});

test("source field: default user; ops sent with source preserved in body", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const ctx = makeOutbox(t);
    setTrackedDiagramStateVersion("s1", 7);
    ctx.outbox.pushCommand({
      command: "shape.move",
      action: "execute",
      source: "agent",
      context: { shape: { id: "Task_1" }, delta: { x: 1, y: 1 } },
    });
    pushRename(ctx.outbox, "Task_2", "B");
    t.mock.timers.tick(2500);
    await drain();
    const sources = ctx.api.calls[0].body.operations.map((o) => o.source);
    assert.deepEqual(sources, ["agent", "user"]);
    ctx.destroy();
  } finally {
    t.mock.timers.reset();
  }
});

// ---------------------------------------------------------------------------
// Dedup-контракт mutation-lifecycle scheduling (UI.md §2): scheduling path
// (useDiagramMutationLifecycle.queueDiagramMutation) спрашивает
// outbox.shouldSkipFullSave(command) — полностью ли команда захвачена ops.
// True → полное автосохранение для этой мутации НЕ планируется; ops pipeline
// владеет persistence. False → full-save путь работает как раньше.
// ---------------------------------------------------------------------------

test("dedup: whitelisted command captured as op → shouldSkipFullSave(command) === true", (t) => {
  const ctx = makeOutbox(t);
  try {
    const mapped = pushRename(ctx.outbox, "Task_1", "A");
    assert.equal(mapped.needsFullSave, false);
    assert.equal(typeof ctx.outbox.shouldSkipFullSave, "function");
    assert.equal(ctx.outbox.shouldSkipFullSave("element.updateProperties"), true);
  } finally {
    ctx.destroy();
  }
});

test("dedup: unknown/missing command is never skippable (xml.edit, fallback emits)", (t) => {
  const ctx = makeOutbox(t);
  try {
    pushRename(ctx.outbox, "Task_1", "A");
    assert.equal(ctx.outbox.shouldSkipFullSave("xml.edit"), false, "command mismatch → not skippable");
    assert.equal(ctx.outbox.shouldSkipFullSave(""), false, "empty command → not skippable");
    assert.equal(ctx.outbox.shouldSkipFullSave(), false, "missing command → not skippable");
    assert.equal(ctx.outbox.shouldSkipFullSave("shape.move"), false, "stale other-command capture → not skippable");
  } finally {
    ctx.destroy();
  }
});

test("dedup: non-whitelisted command sets needsFullSave → nothing is skippable until full-save ack", (t) => {
  const ctx = makeOutbox(t);
  try {
    pushRename(ctx.outbox, "Task_1", "A");
    assert.equal(ctx.outbox.shouldSkipFullSave("element.updateProperties"), true);
    ctx.outbox.pushCommand({ command: "spaceTool", action: "execute", context: {} });
    assert.equal(ctx.outbox.getState().needsFullSave, true);
    assert.equal(ctx.outbox.shouldSkipFullSave("element.updateProperties"), false, "needsFullSave gates even captured commands");
    assert.equal(ctx.outbox.shouldSkipFullSave("spaceTool"), false);
    // Full-save ack (coordinator "success" xml) снимает флаг — буфер тоже
    // очищен, поэтому ранее захваченная команда больше не skippable.
    ctx.coordinator.emit?.("success", { sessionId: "s1", pipeline: "xml" });
    assert.equal(ctx.outbox.getState().needsFullSave, false);
    assert.equal(ctx.outbox.shouldSkipFullSave("element.updateProperties"), false, "acked state — no pending captured edits");
    // Свежая whitelisted-команда после ack снова skippable.
    pushRename(ctx.outbox, "Task_2", "B");
    assert.equal(ctx.outbox.shouldSkipFullSave("element.updateProperties"), true);
  } finally {
    ctx.destroy();
  }
});

test("dedup: replay command is skippable only while pending ops cover the state", (t) => {
  const ctx = makeOutbox(t);
  try {
    assert.equal(
      ctx.outbox.pushCommand({ command: "shape.move", action: "execute", context: { __pmOpSource: "replay" } }).replay,
      true,
    );
    assert.equal(ctx.outbox.shouldSkipFullSave("shape.move"), false, "replay with empty buffer — nothing captured");
    pushMove(ctx.outbox, "Task_1", 3, 3);
    assert.equal(
      ctx.outbox.pushCommand({ command: "shape.move", action: "execute", context: { __pmOpSource: "replay" } }).replay,
      true,
    );
    assert.equal(ctx.outbox.shouldSkipFullSave("shape.move"), true, "replay with pending op — state covered by buffer");
  } finally {
    ctx.destroy();
  }
});

// ---------------------------------------------------------------------------
// Регрессии по ревью (REVIEW_REPORT.md, 2026-09-15):
//  - BLOCKER-2 (ack-wipe): op, дописанная в буфер во время полёта flush'а,
//    ack'ом не стирается — уходит следующим flush'ем.
//  - MAJOR-1 (undo coalesced-op): undo op, в которую слито несколько команд,
//    не вырезает молча всю слитую delta — консервативный needsFullSave.
// ---------------------------------------------------------------------------

test("BLOCKER-2: op pushed during in-flight flush survives ack and goes in the next flush", async (t) => {
  let call = 0;
  let ackResolve = null;
  const firstAck = new Promise((resolve) => { ackResolve = resolve; });
  const api = makeApi({
    postSessionOperations: async () => {
      call += 1;
      if (call === 1) {
        // Первый flush висит до ручного ack — окно для push во время полёта.
        return firstAck;
      }
      return { ok: true, status: 200, version: 9, applied: 1, skipped: 0, diagramStateVersion: 9 };
    },
  });
  const ctx = makeOutbox(t, { api, configOverrides: { flushDebounceMs: 25 } });
  setTrackedDiagramStateVersion("s1", 7);
  pushRename(ctx.outbox, "Task_1", "A");
  const flushing = ctx.outbox.flushNow({ reason: "test" });
  await drain();
  assert.equal(call, 1, "first flush dispatched");
  pushRename(ctx.outbox, "Task_2", "B");
  ackResolve({ ok: true, status: 200, version: 8, applied: 1, skipped: 0, diagramStateVersion: 8 });
  await flushing;
  await drain();
  await new Promise((r) => setTimeout(r, 80));
  await drain();
  assert.equal(call, 2, "second op flushed after ack");
  assert.equal(ctx.api.calls[1].body.operations.length, 1, "only the during-flight op remains");
  assert.equal(ctx.api.calls[1].body.operations[0].elementId, "Task_2");
  ctx.destroy();
});

test("MAJOR-1: undo of a coalesced op (merged drag deltas) falls back to full save", async (t) => {
  const ctx = makeOutbox(t, { configOverrides: { coalesceMs: 400, flushDebounceMs: 25 } });
  setTrackedDiagramStateVersion("s1", 7);
  pushMove(ctx.outbox, "Task_1", 10, 0);
  ctx.tickNow(100);
  pushMove(ctx.outbox, "Task_1", 20, 0);
  // Откат только второй команды: слитая op держит keep-last delta (A→C),
  // промежуточное состояние (B) не восстановить — полный save обязан отработать.
  ctx.outbox.pushCommand({
    command: "shape.move",
    action: "undo",
    context: { shape: { id: "Task_1" }, delta: { x: 20, y: 0 } },
  });
  await ctx.outbox.flushNow({ reason: "test" });
  await drain();
  await new Promise((r) => setTimeout(r, 80));
  await drain();
  assert.equal(ctx.api.calls.length, 0, "no ops sent — merged delta is unrecoverable");
  assert.ok(ctx.fullSaveRequests.length >= 1, "honest full-save fallback requested");
  ctx.destroy();
});
