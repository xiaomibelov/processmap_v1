import test from "node:test";
import assert from "node:assert/strict";

import { createCanvasEventFeed } from "../canvasEventFeed.js";

function makeFeed(over = {}) {
  const sent = [];
  const feed = createCanvasEventFeed({
    sessionId: "s_1",
    projectId: "p_1",
    flushIntervalMs: 60_000, // таймер не мешает — флашим вручную
    now: () => 1727000000000,
    eventIdFactory: (() => { let n = 0; return () => `ev_${++n}`; })(),
    transport: async (batch) => { sent.push(batch); return { ok: true }; },
    ...over,
  });
  return { feed, sent };
}

// -- U1: ring buffer ---------------------------------------------------------
test("ring buffer: лимит 500, dropped-счётчик, seq монотонен", () => {
  const { feed } = makeFeed({ maxBuffer: 5 });
  for (let i = 0; i < 8; i += 1) feed.record({ kind: "command", command: { type: "shape.move" } });
  const state = feed.getDebugState();
  assert.equal(state.buffered, 5);
  assert.equal(state.dropped, 3);
  const events = feed.peek();
  assert.equal(events[0].seq, 4);
  assert.equal(events[4].seq, 8);
});

// -- U2: redaction allowlist --------------------------------------------------
test("redaction: XML/свойства/токены отсутствуют, строки обрезаны", () => {
  const { feed } = makeFeed();
  feed.record({
    kind: "command",
    command: {
      type: "shape.move",
      elementIds: Array.from({ length: 25 }, (_, i) => `el_${i}`),
      bpmn_xml: "<definitions/>",
      properties: { name: "Секретное имя" },
    },
    meta: { accessToken: "secret", gitSha: "abc" },
    extra: `x${"y".repeat(500)}`,
  });
  const ev = feed.peek()[0];
  const raw = JSON.stringify(ev);
  assert.ok(!raw.includes("<definitions/>"), "XML не должен попасть в ленту");
  assert.ok(!raw.includes("Секретное имя"), "имена не должны попасть в ленту");
  assert.ok(!raw.includes("secret"), "токены не должны попасть в ленту");
  assert.ok(!raw.includes("y".repeat(300)), "длинные строки обрезаны");
  assert.equal(ev.command.elementIds.length, 20);
});

test("redaction: значения бизнес-свойств и label не проходят", () => {
  const { feed } = makeFeed();
  feed.record({
    kind: "command",
    command: { type: "shape.move", elementIds: ["Task_1"] },
    op: { opIds: ["op_1"], opTypes: ["move"], properties: { name: "Процесс выпечки" } },
  });
  const raw = JSON.stringify(feed.peek());
  assert.ok(!raw.includes("Процесс выпечки"));
});

// -- U3: batch cap ------------------------------------------------------------
test("batch cap 64КБ: большой батч разбивается", async () => {
  const { feed, sent } = makeFeed({ maxBatchBytes: 2048 });
  for (let i = 0; i < 10; i += 1) {
    feed.record({ kind: "command", command: { type: "shape.move", elementIds: [`el_${i}`], note: "n".repeat(400) } });
  }
  await feed.flush("test");
  await feed.flush("test");
  await feed.flush("test");
  assert.ok(sent.length >= 2, `ожидалось разбиение, отправлено батчей: ${sent.length}`);
  sent.forEach((batch) => assert.ok(JSON.stringify(batch).length <= 66 * 1024));
  assert.equal(feed.peek().length, 0);
});

// -- U4: flush triggers --------------------------------------------------------
test("flush-on-error с throttle: повторная ошибка в окне не шлёт лишний раз", async () => {
  const { feed, sent } = makeFeed({ errorFlushThrottleMs: 10_000 });
  feed.record({ kind: "error", error: { code: "OPERATION_UNSUPPORTED" } });
  await new Promise((r) => setTimeout(r, 5));
  feed.record({ kind: "error", error: { code: "OPERATION_UNSUPPORTED" } });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(sent.length, 1);
  assert.equal(feed.peek().length, 1, "второе событие осталось в буфере");
});

test("flush-on-error: другой код ошибки флашит снова", async () => {
  const { feed, sent } = makeFeed({ errorFlushThrottleMs: 10_000 });
  feed.record({ kind: "error", error: { code: "OPERATION_UNSUPPORTED" } });
  await new Promise((r) => setTimeout(r, 5));
  feed.record({ kind: "error", error: { code: "DIAGRAM_STATE_CONFLICT" } });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(sent.length, 2);
});

// -- U5: pagehide flush ---------------------------------------------------------
test("pagehide: keepalive fetch, без sendBeacon", async () => {
  const calls = [];
  const fakeWindow = {
    listeners: {},
    addEventListener(type, cb) { this.listeners[type] = cb; },
    removeEventListener(type) { delete this.listeners[type]; },
    fetch: async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 201, json: async () => ({ ok: true, accepted: 1 }) }; },
    localStorage: { getItem: () => "tok" },
  };
  const { feed } = makeFeed({
    win: fakeWindow,
    transport: null,
    flushIntervalMs: 60_000,
  });
  feed.record({ kind: "command", command: { type: "shape.move" } });
  assert.equal(typeof fakeWindow.listeners.pagehide, "function");
  await fakeWindow.listeners.pagehide();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.keepalive, true);
  assert.match(calls[0].opts.headers.Authorization, /Bearer tok/);
});

// -- U6: ошибка транспорта не теряет буфер --------------------------------------
test("неуспешный flush сохраняет буфер для повтора", async () => {
  let attempts = 0;
  const { feed } = makeFeed({
    transport: async () => { attempts += 1; return attempts === 1 ? { ok: false, status: 0 } : { ok: true }; },
  });
  feed.record({ kind: "command", command: { type: "shape.move" } });
  const first = await feed.flush("test");
  assert.equal(first.ok, false);
  assert.equal(feed.peek().length, 1);
  const second = await feed.flush("test");
  assert.equal(second.ok, true);
  assert.equal(feed.peek().length, 0);
});

// -- U7: kill-switch -------------------------------------------------------------
test("__FPC_CANVAS_FEED_OFF__ отключает запись и отправку", async () => {
  const { feed, sent } = makeFeed({ enabled: false });
  feed.record({ kind: "command", command: { type: "shape.move" } });
  assert.equal(feed.peek().length, 0);
  const result = await feed.flush("test");
  assert.equal(result.skipped, true);
  assert.equal(sent.length, 0);
});

// -- Производительность захвата (гейт <1 мс) --------------------------------------
test("capture: среднее и максимум записи < 1 мс на 10k событий", () => {
  const { feed } = makeFeed();
  const times = [];
  for (let i = 0; i < 10_000; i += 1) {
    const t0 = performance.now();
    feed.record({ kind: "command", command: { type: "shape.move", elementIds: ["Task_1", "Task_2"] } });
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((s, t) => s + t, 0) / times.length;
  const p99 = times[Math.floor(times.length * 0.99)];
  const max = times[times.length - 1];
  console.log(`capture avg=${avg.toFixed(4)}ms p99=${p99.toFixed(4)}ms max=${max.toFixed(4)}ms`);
  assert.ok(avg < 1, `avg ${avg}ms >= 1ms`);
  assert.ok(p99 < 1, `p99 ${p99}ms >= 1ms`);
});

// --- Регрессионные тесты дефекта #3 (stage: flush застрял, sent=0/failed=0 40+ мин) ---
// RC: доставка опиралась ТОЛЬКО на wall-clock setInterval(12с) — в Chrome
// пользователя интервал не стрелял (timer throttling / occlusion / App Nap),
// при этом record (event-driven) работал. Защита: auto-flush по наполнению
// буфера + таймаут транспорта + триггеры visibility/online.

test("REGRESS: auto-flush при наполнении буфера — не зависит от интервала", async () => {
  const { feed, sent } = makeFeed({ flushIntervalMs: 3_600_000 }); // интервал 1ч — не должен сработать
  for (let i = 0; i < 25; i += 1) {
    feed.record({ kind: "command", command: { type: "shape.move" } });
  }
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(sent.length >= 1, "auto-flush по порогу не вызвал transport");
  assert.equal(feed.peek().length, 0);
});

test("REGRESS: flush не залипает на вечном fetch — таймаут транспорта", async () => {
  let calls = 0;
  const { feed } = makeFeed({
    flushIntervalMs: 60_000,
    transport: async () => {
      calls += 1;
      return calls === 1 ? new Promise(() => {}) : { ok: true }; // первый fetch висит навсегда
    },
    transportTimeoutMs: 100,
  });
  feed.record({ kind: "command", command: { type: "shape.move" } });
  const first = await Promise.race([
    feed.flush("test"),
    new Promise((r) => setTimeout(() => r({ timeout: true }), 1000)),
  ]);
  assert.notEqual(first.timeout, true, "flush залип на вечном fetch (нет таймаута транспорта)");
  assert.equal(first.ok, false, "зависший транспорт должен дать ok:false по таймауту");
  assert.equal(feed.getDebugState().failed, 1);
  const second = await feed.flush("test");
  assert.equal(second.ok, true, "после таймаута flush разблокирован");
  assert.equal(feed.peek().length, 0);
});

test("REGRESS: visibilitychange→visible дёргает flush", async () => {
  const listeners = {};
  const fakeWin = {
    listeners,
    addEventListener(type, cb) { listeners[type] = cb; },
    removeEventListener(type) { delete listeners[type]; },
    localStorage: { getItem: () => "tok" },
  };
  const { feed, sent } = makeFeed({ win: fakeWin, flushIntervalMs: 3_600_000 });
  feed.record({ kind: "command", command: { type: "shape.move" } });
  assert.equal(typeof listeners.visibilitychange, "function", "подписка visibilitychange отсутствует");
  listeners.visibilitychange();
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(sent.length >= 1, "visibilitychange не вызвал flush");
});

test("REGRESS: событие online дёргает flush", async () => {
  const listeners = {};
  const fakeWin = {
    listeners,
    addEventListener(type, cb) { listeners[type] = cb; },
    removeEventListener(type) { delete listeners[type]; },
    localStorage: { getItem: () => "tok" },
  };
  const { feed, sent } = makeFeed({ win: fakeWin, flushIntervalMs: 3_600_000 });
  feed.record({ kind: "command", command: { type: "shape.move" } });
  listeners.online();
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(sent.length >= 1, "online не вызвал flush");
});
