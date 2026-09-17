import test from "node:test";
import assert from "node:assert/strict";

import { createSaveCoordinator } from "../../../../session/saveCoordinator.js";
import {
  setVersion as setTrackedDiagramStateVersion,
  __resetForTests as resetCasVersionTracker,
} from "../../../../../lib/casVersionTracker.js";
import { OPS_OUTBOX_CONFIG, createOpsOutboxConfig } from "./opsOutboxConfig.js";
import { createSaveOutbox } from "./createSaveOutbox.js";

// ---------------------------------------------------------------------------
// Hardening fix/post-step1-load-regression (mission item 4):
//  1) retry-backoff pipeline "ops" с джиттером ±30% и капом 8s — против
//     синхронизации retry-шторма вкладок при деградации сети/сервера;
//  2) keepalive-flush (уход со страницы) с AbortController-таймаутом
//     keepaliveAbortMs — зависший keepalive-запрос не держит браузерное
//     соединение неограниченно (connection-pool starvation класса H3).
// Джиттер инжектируется через опцию factory jitterRandom (по аналогии
// с now/uuid) — тесты детерминированы.
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

function makeOutbox(t, options = {}) {
  const coordinator = options.coordinator || createSaveCoordinator();
  const api = options.api || makeApi();
  let nowValue = options.startNow ?? 1_000_000;
  const outbox = createSaveOutbox({
    sessionId: options.sessionId || "s1",
    coordinator,
    api,
    uuid: seqUuid(),
    now: () => nowValue,
    // Детерминизм соседних тайминг-тестов: r=0.5 → jitter-фактор ровно 1.0
    // (базовая задержка без отклонения). Тесты джиттера ниже передают свой.
    jitterRandom: typeof options.jitterRandom === "function" ? options.jitterRandom : () => 0.5,
    requestFullSave: () => {},
    config: createOpsOutboxConfig(options.configOverrides || {}),
  });
  return { coordinator, api, outbox, t };
}

function pushRename(outbox, id = "Task_1", name = "Имя") {
  return outbox.pushCommand({
    command: "element.updateProperties",
    action: "execute",
    context: { element: { id }, properties: { name } },
  });
}

// Постоянный рандом джиттера: фактор = 1 + (2r - 1) * retryJitterRatio.
const jitterFactor = (r, ratio = 0.3) => 1 + (2 * r - 1) * ratio;

test.beforeEach(() => {
  resetCasVersionTracker();
  globalThis.window.__PM_OPS_FLUSHED__ = { count: 0, traces: [] };
});

test("config contract: retryDelayMs 1000 / maxRetryDelayMs 8000 / retryJitterRatio 0.3 / keepaliveAbortMs 5000", () => {
  assert.equal(OPS_OUTBOX_CONFIG.retryDelayMs, 1000, "base backoff 1s");
  assert.equal(OPS_OUTBOX_CONFIG.maxRetryDelayMs, 8000, "backoff cap 8s (был 4s)");
  assert.equal(OPS_OUTBOX_CONFIG.retryJitterRatio, 0.3, "jitter ±30%");
  assert.equal(OPS_OUTBOX_CONFIG.keepaliveAbortMs, 5000, "keepalive abort timeout 5s");
});

test("backoff progression 1s → 2s → 4s with jittered bounds (deterministic jitterRandom)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const rolls = [0, 1, 0.5]; // факторы 0.7 / 1.3 / 1.0 → 700 / 2600 / 4000
    let attempt = 0;
    const api = makeApi({
      postSessionOperations: async () => {
        attempt += 1;
        return { ok: false, status: 500, error: "boom" };
      },
    });
    const ctx = makeOutbox(t, { api, jitterRandom: () => rolls.shift() ?? 0.5 });
    setTrackedDiagramStateVersion("s1", 7);
    pushRename(ctx.outbox, "Task_1", "A");

    const flushPromise = ctx.outbox.flushNow({ reason: "test" });
    await drain();
    assert.equal(attempt, 1, "initial attempt dispatched");

    // retry 1: base 1000, r=0 → 700 ∈ [700, 1300]
    t.mock.timers.tick(699);
    await drain();
    assert.equal(attempt, 1, "retry 1 not before jittered delay");
    t.mock.timers.tick(1);
    await drain();
    assert.equal(attempt, 2, "retry 1 fired at exactly jittered 700ms");

    // retry 2: base 2000, r=1 → 2600 ∈ [1400, 2600]
    t.mock.timers.tick(2599);
    await drain();
    assert.equal(attempt, 2, "retry 2 not before jittered delay");
    t.mock.timers.tick(1);
    await drain();
    assert.equal(attempt, 3, "retry 2 fired at exactly jittered 2600ms");

    // retry 3: base 4000, r=0.5 → 4000 ∈ [2800, 5200]
    t.mock.timers.tick(3999);
    await drain();
    assert.equal(attempt, 3, "retry 3 not before jittered delay");
    t.mock.timers.tick(1);
    await drain();
    assert.equal(attempt, 4, "retry 3 fired at exactly jittered 4000ms");

    await flushPromise;
    assert.equal(attempt, 4, "bounded: 1 попытка + retryCount=3, дальше — деградация");
    t.mock.timers.tick(60_000);
    await drain();
    assert.equal(attempt, 4, "no unbounded retry after retries exhausted");
    ctx.outbox.destroy();
  } finally {
    t.mock.timers.reset();
  }
});

test("backoff cap: base delay capped at maxRetryDelayMs 8000 (jittered ≤ cap*1.3)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    // Прямая регистрация probe-пайплайна: retryCount 5, чтобы дойти до капа
    // (ops pipeline регистрирует retryCount=3 — кап 8s недостижим внутри него).
    const coordinator = createSaveCoordinator();
    let attempt = 0;
    coordinator.registerPipeline("probe", {
      debounceMs: 0,
      retryCount: 5,
      retryDelayMs: 1000,
      maxRetryDelayMs: 8000,
      retryJitterRatio: 0.3,
      retryJitterRandom: () => 1, // worst case: фактор 1.3
      transport: async () => {
        attempt += 1;
        return { ok: false, status: 500, error: "boom" };
      },
    });
    const run = coordinator.execute("probe", { sessionId: "cap" });
    await drain();
    assert.equal(attempt, 1);

    // 1s*1.3 → 2s*1.3 → 4s*1.3 → cap 8s*1.3 → cap 8s*1.3 (база НЕ растёт до 16s)
    const expected = [1300, 2600, 5200, 10_400, 10_400];
    for (let k = 0; k < expected.length; k += 1) {
      t.mock.timers.tick(expected[k] - 1);
      await drain();
      assert.equal(attempt, k + 1, `retry ${k + 1} not before ${expected[k]}ms`);
      t.mock.timers.tick(1);
      await drain();
      assert.equal(attempt, k + 2, `retry ${k + 1} fired at ${expected[k]}ms`);
    }
    await run;
    assert.equal(attempt, 6, "bounded: 1 + 5 retries");
    assert.ok(
      expected[3] <= 8000 * 1.3 && expected[4] <= 8000 * 1.3,
      "jittered delay at cap never exceeds maxRetryDelayMs*1.3",
    );
  } finally {
    t.mock.timers.reset();
  }
});

test("storm: 10 independent tabs with failing transport stay bounded and jitter-decorrelated", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const TAB_COUNT = 10;
    const RETRY_COUNT = 3; // контракт registerOpsPipeline
    const chains = [];
    for (let j = 0; j < TAB_COUNT; j += 1) {
      const r = j / (TAB_COUNT - 1); // 0..1 → фактор 0.7..1.3, разный по вкладкам
      const coordinator = createSaveCoordinator();
      const api = makeApi({
        postSessionOperations: async () => ({ ok: false, status: 500, error: "boom" }),
      });
      const outbox = createSaveOutbox({
        sessionId: `tab-${j}`,
        coordinator,
        api,
        uuid: seqUuid(),
        now: () => 1_000_000,
        jitterRandom: () => r,
        requestFullSave: () => {},
        config: createOpsOutboxConfig({}),
      });
      setTrackedDiagramStateVersion(`tab-${j}`, 7);
      pushRename(outbox, `Task_${j}`, "A");
      chains.push({ r, api, outbox, virtualLog: [] });
    }

    const flushes = chains.map((c) => c.outbox.flushNow({ reason: "test" }));
    await drain();
    let vt = 0;
    const step = 25;
    const mark = () => {
      for (const c of chains) {
        while (c.virtualLog.length < c.api.calls.length) c.virtualLog.push(vt);
      }
    };
    mark(); // attempt 1 — все вкладки в t=0
    while (chains.some((c) => c.api.calls.length < RETRY_COUNT + 1) && vt < 20_000) {
      t.mock.timers.tick(step);
      vt += step;
      await drain();
      mark();
    }

    for (const c of chains) {
      assert.equal(c.api.calls.length, RETRY_COUNT + 1, "per-tab attempts bounded by 1 + retryCount");
      assert.equal(c.virtualLog.length, RETRY_COUNT + 1);
      const bases = [1000, 2000, 4000];
      for (let k = 1; k <= RETRY_COUNT; k += 1) {
        const interval = c.virtualLog[k] - c.virtualLog[k - 1];
        const lo = bases[k - 1] * 0.7 - step;
        const hi = bases[k - 1] * 1.3 + step;
        assert.ok(
          interval >= lo && interval <= hi,
          `tab jitter: interval ${interval}ms within [${lo}, ${hi}]ms (base ${bases[k - 1]}ms)`,
        );
        assert.ok(
          interval <= OPS_OUTBOX_CONFIG.maxRetryDelayMs * 1.3 + step,
          "interval never exceeds maxRetryDelayMs*1.3",
        );
        const exact = Math.round(bases[k - 1] * jitterFactor(c.r));
        assert.ok(
          Math.abs(interval - exact) <= step,
          `deterministic jitter: interval ${interval}ms ≈ expected ${exact}ms (r=${c.r})`,
        );
      }
    }
    const total = chains.reduce((sum, c) => sum + c.api.calls.length, 0);
    assert.equal(total, TAB_COUNT * (RETRY_COUNT + 1), "total attempts bounded by tabs × (1 + retryCount)");
    assert.ok(total <= TAB_COUNT * (RETRY_COUNT + 1));

    // Никакой вкладка не продолжает стрелять после исчерпания ретраев.
    t.mock.timers.tick(30_000);
    await drain();
    for (const c of chains) {
      assert.equal(c.api.calls.length, RETRY_COUNT + 1, "no unbounded retry storm");
    }
    await Promise.all(flushes);
    for (const c of chains) c.outbox.destroy();
  } finally {
    t.mock.timers.reset();
  }
});

test("keepalive flush: hung transport aborted after keepaliveAbortMs, trace ops_flush_keepalive_aborted, no retry", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const api = {
      postSessionOperations: (sid, body, opts) => new Promise((resolve, reject) => {
        api.calls.push({ sid, body, opts });
        opts?.signal?.addEventListener?.("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      }),
    };
    api.calls = [];
    // debounce выносим за пределы mock-окна: тест измеряет только keepalive-путь.
    const ctx = makeOutbox(t, { api, configOverrides: { flushDebounceMs: 3_600_000 } });
    setTrackedDiagramStateVersion("s1", 7);
    pushRename(ctx.outbox, "Task_1", "A");

    const flushPromise = ctx.outbox.flushNow({ reason: "unload", keepalive: true });
    await drain();
    assert.equal(api.calls.length, 1, "keepalive dispatched exactly once");
    assert.equal(api.calls[0].opts.keepalive, true);
    assert.equal(api.calls[0].opts.signal?.aborted, false, "signal not aborted before timeout");

    t.mock.timers.tick(4999);
    await drain();
    assert.equal(api.calls[0].opts.signal?.aborted, false, "not aborted before keepaliveAbortMs");
    assert.equal(api.calls.length, 1);

    t.mock.timers.tick(1);
    await drain();
    assert.equal(api.calls[0].opts.signal?.aborted, true, "signal aborted at keepaliveAbortMs=5000");
    await flushPromise;
    assert.equal(api.calls.length, 1, "no retry of aborted keepalive (best-effort semantics)");

    const traces = globalThis.window.__PM_OPS_FLUSHED__.traces;
    const aborted = traces.filter((e) => e.event === "ops_flush_keepalive_aborted");
    assert.equal(aborted.length, 1, "exactly one ops_flush_keepalive_aborted trace");
    assert.equal(aborted[0].keepalive, true);
    assert.equal(aborted[0].opCount, 1);

    // Abort-таймер погашен: дальнейший ход времени — тишина.
    t.mock.timers.tick(60_000);
    await drain();
    assert.equal(api.calls.length, 1);
    assert.equal(
      globalThis.window.__PM_OPS_FLUSHED__.traces.filter((e) => e.event === "ops_flush_keepalive_aborted").length,
      1,
    );
    ctx.outbox.destroy();
  } finally {
    t.mock.timers.reset();
  }
});

test("regression: successful keepalive flush is not aborted; normal flush path unaffected", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    // debounce выносим за пределы mock-окна: tick(120_000) не должен порождать
    // лишний debounce-flush между keepalive и ручным flush.
    const ctx = makeOutbox(t, { configOverrides: { flushDebounceMs: 3_600_000 } });
    setTrackedDiagramStateVersion("s1", 7);
    pushRename(ctx.outbox, "Task_1", "A");
    await ctx.outbox.flushNow({ reason: "unload", keepalive: true });
    assert.equal(ctx.api.calls.length, 1);
    assert.equal(ctx.api.calls[0].opts.keepalive, true);
    const keepaliveSignal = ctx.api.calls[0].opts.signal;
    assert.ok(keepaliveSignal, "keepalive flush now carries an AbortSignal");
    t.mock.timers.tick(120_000);
    await drain();
    assert.notEqual(keepaliveSignal.aborted, true, "successful keepalive not aborted after timeout window");

    // Обычный (не keepalive) flush идёт прежним путём через координатор.
    pushRename(ctx.outbox, "Task_2", "B");
    await ctx.outbox.flushNow({ reason: "test" });
    assert.equal(ctx.api.calls.length, 2);
    assert.notEqual(ctx.api.calls[1].opts.keepalive, true, "normal flush is not keepalive");
    assert.equal(getOpsAbortedTraceCount(), 0, "no keepalive-abort traces on the happy path");
    ctx.outbox.destroy();
  } finally {
    t.mock.timers.reset();
  }
});

function getOpsAbortedTraceCount() {
  const traces = globalThis.window?.__PM_OPS_FLUSHED__?.traces || [];
  return traces.filter((e) => e.event === "ops_flush_keepalive_aborted").length;
}

// ---------------------------------------------------------------------------
// Контур feature/async-save-pipeline-step2 (TESTS §1.2, UI.md §3):
// параметризация backoff координатора не меняет поведение pipeline "xml"/"meta" —
// регрессия: дефолты 1s→2s→4s cap 4s БЕЗ джиттера, retryCount 3.
// ---------------------------------------------------------------------------

test("regression: xml pipeline backoff defaults unchanged (exact 1s→2s→4s→cap4s, no jitter)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const coordinator = createSaveCoordinator();
    let attempt = 0;
    coordinator.registerPipeline("xml", {
      debounceMs: 0,
      // только defaults: retryDelayMs 1000 / maxRetryDelayMs 4000 /
      // retryJitterRatio 0 / retryCount 3 — как у xml/meta до контура.
      transport: async () => {
        attempt += 1;
        return { ok: false, status: 500, error: "boom" };
      },
      getBaseVersion: () => 7,
    });
    const run = coordinator.execute("xml", { sessionId: "xml-s1" });
    await drain();
    assert.equal(attempt, 1);

    // Джиттер отсутствует: попытки строго на 1000 / 2000 / 4000.
    const exactDelays = [1000, 2000, 4000];
    for (let k = 0; k < exactDelays.length; k += 1) {
      t.mock.timers.tick(exactDelays[k] - 1);
      await drain();
      assert.equal(attempt, k + 1, `retry ${k + 1} not before exact ${exactDelays[k]}ms (no jitter)`);
      t.mock.timers.tick(1);
      await drain();
      assert.equal(attempt, k + 2, `retry ${k + 1} fired at exact ${exactDelays[k]}ms`);
    }
    await run;
    assert.equal(attempt, 4, "bounded: 1 + retryCount(3)");

    // Кап 4s: дальнейший ход времени не порождает новых попыток.
    t.mock.timers.tick(120_000);
    await drain();
    assert.equal(attempt, 4, "no unbounded retry on xml pipeline");
  } finally {
    t.mock.timers.reset();
  }
});
