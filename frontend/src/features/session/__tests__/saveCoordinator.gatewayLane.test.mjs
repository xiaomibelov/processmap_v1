import test from "node:test";
import assert from "node:assert/strict";

import { createSaveCoordinator } from "../saveCoordinator.js";

// ---------------------------------------------------------------------------
// Контур feature/mutation-gateway-c3 (срез S1): per-session mutation lane.
// Один in-flight diagram-truth mutation-запрос на сессию across pipelines
// (ops/rawXml/xml). Заменяет ad-hoc взаимные исключения (outbox busy-poll,
// fullSavePreserve sentinel, coordinator flushPromise triangulation).
//
// Ключевые контракты:
//  - lane сериализует mutation-пайплайны ОДНОЙ сессии между собой;
//  - разные сессии независимы;
//  - meta/analysis (mutationLane: false) lane не блокирует — это per-pipeline
//    очереди (disjoint-key семантика + C2 silent-rebase контракт);
//  - вложенный execute той же execution-chain (xml → rawXml) НЕ ждёт lane
//    (reentrancy по chain), иначе deadlock;
//  - armed conflict gate lane уважает: gate_block результат сохраняется;
//  - kill-switch fpc_gateway_lane (default ON, "0" → pass-through).
// ---------------------------------------------------------------------------

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

function registerBlockingPipeline(c, name, order, label = name) {
  let release;
  const started = new Promise((resolve) => { release = resolve; });
  c.registerPipeline(name, {
    debounceMs: 0,
    retryCount: 0,
    transport: async () => {
      order.push(`${label}:start`);
      await started;
      order.push(`${label}:end`);
      return { ok: true, status: 200 };
    },
    onSuccess: () => {},
    onError: () => {},
  });
  return { release, started };
}

test("gateway lane: mutation pipelines of one session serialize across pipeline names", async () => {
  const c = createSaveCoordinator();
  const order = [];
  const xml = registerBlockingPipeline(c, "xml", order);
  let opsStarted = false;
  c.registerPipeline("ops", {
    debounceMs: 0,
    retryCount: 0,
    transport: async () => {
      opsStarted = true;
      order.push("ops:start");
      return { ok: true, status: 200 };
    },
    onSuccess: () => {},
    onError: () => {},
  });

  const xmlPromise = c.execute("xml", { sessionId: "s1" });
  await tick();
  const opsPromise = c.execute("ops", { sessionId: "s1" });
  await tick();

  assert.equal(opsStarted, false, "ops must wait for the session lane held by xml");
  assert.deepEqual(order, ["xml:start"]);

  xml.release({ ok: true, status: 200 });
  await Promise.all([xmlPromise, opsPromise]);
  assert.deepEqual(order, ["xml:start", "xml:end", "ops:start"]);
});

test("gateway lane: different sessions stay independent", async () => {
  const c = createSaveCoordinator();
  const order = [];
  const xml = registerBlockingPipeline(c, "xml", order);
  c.registerPipeline("ops", {
    debounceMs: 0,
    retryCount: 0,
    transport: async () => {
      order.push("ops:start");
      return { ok: true, status: 200 };
    },
    onSuccess: () => {},
    onError: () => {},
  });

  const xmlPromise = c.execute("xml", { sessionId: "s1" });
  await tick();
  const opsPromise = c.execute("ops", { sessionId: "s2" });
  await tick();

  assert.deepEqual(order, ["xml:start", "ops:start"], "s2 ops must not wait for the s1 lane");

  xml.release({ ok: true, status: 200 });
  await Promise.all([xmlPromise, opsPromise]);
});

test("gateway lane: pipelines with mutationLane:false (meta/analysis) are not blocked", async () => {
  const c = createSaveCoordinator();
  const order = [];
  const xml = registerBlockingPipeline(c, "xml", order);
  c.registerPipeline("meta", {
    debounceMs: 0,
    retryCount: 0,
    mutationLane: false,
    transport: async () => {
      order.push("meta:start");
      return { ok: true, status: 200 };
    },
    onSuccess: () => {},
    onError: () => {},
  });

  const xmlPromise = c.execute("xml", { sessionId: "s1" });
  await tick();
  await c.execute("meta", { sessionId: "s1" });
  await tick();

  assert.deepEqual(order, ["xml:start", "meta:start"], "meta (disjoint keys) must bypass the lane");

  xml.release({ ok: true, status: 200 });
  await xmlPromise;
});

test("gateway lane: nested execute of the same chain does not deadlock (xml → rawXml)", async () => {
  const c = createSaveCoordinator();
  const order = [];
  c.registerPipeline("rawXml", {
    debounceMs: 0,
    retryCount: 0,
    transport: async () => {
      order.push("rawXml:start");
      return { ok: true, status: 200 };
    },
    onSuccess: () => {},
    onError: () => {},
  });
  c.registerPipeline("xml", {
    debounceMs: 0,
    retryCount: 0,
    transportTimeoutMs: 500,
    // Вложенный execute — строго по явному токену chain (см. saveCoordinator.nested-execute).
    transport: async (sessionId, _payload, _signal, laneContext) => {
      order.push("xml:start");
      const nested = await c.execute("rawXml", { sessionId, mutationLaneContext: laneContext });
      order.push("xml:nested-done");
      return nested?.ok ? { ok: true, status: 200 } : { ok: false, status: 0, error: "nested failed" };
    },
    onSuccess: () => {},
    onError: () => {},
  });

  const result = await Promise.race([
    c.execute("xml", { sessionId: "s1" }),
    new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: "deadlock:lane" }), 4000)),
  ]);

  assert.notEqual(result.error, "deadlock:lane", "lane must be reentrant for the same execution chain");
  assert.equal(result.ok, true, `expected nested save to succeed, got ${JSON.stringify(result)}`);
  assert.deepEqual(order, ["xml:start", "rawXml:start", "xml:nested-done"]);
});

test("gateway lane: armed conflict gate is respected (gate_block without transport)", async () => {
  const c = createSaveCoordinator();
  const xmlCalls = [];
  const opsCalls = [];
  // Первый ops-прогон возвращает 409 → conflict gate armed.
  c.registerPipeline("ops", {
    debounceMs: 0,
    retryCount: 0,
    transport: async () => {
      opsCalls.push(1);
      return {
        ok: false,
        status: 409,
        error: "DIAGRAM_STATE_CONFLICT",
        server_current_version: 42,
      };
    },
    onSuccess: () => {},
    onError: () => {},
  });
  const blockedXml = registerBlockingPipeline(c, "xml", xmlCalls, "xml");

  // 1) 409 → gate armed.
  const opsResult = await c.execute("ops", { sessionId: "s1" });
  assert.equal(opsResult.blockedByConflict, undefined);
  assert.equal(opsResult.status, 409);
  assert.ok(c.getConflict("s1"), "conflict gate must be armed after 409");

  // 2) xml execute вооружённый gate отсекает ДО lane/transport —
  //    результат gate_block и lane остаётся свободной для других сессий.
  const gated = await c.execute("xml", { sessionId: "s1" });
  assert.equal(gated.blockedByConflict, true, "gate_block result must be preserved under the lane");
  assert.equal(xmlCalls.length, 0, "gated save must not reach the transport");

  blockedXml.release({ ok: true, status: 200 });
});

test("gateway lane: kill-switch fpc_gateway_lane=0 restores pass-through concurrency", async () => {
  const prevWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: () => "0" } };
  try {
    const c = createSaveCoordinator();
    const order = [];
    const xml = registerBlockingPipeline(c, "xml", order);
    c.registerPipeline("ops", {
      debounceMs: 0,
      retryCount: 0,
      transport: async () => {
        order.push("ops:start");
        return { ok: true, status: 200 };
      },
      onSuccess: () => {},
      onError: () => {},
    });

    const xmlPromise = c.execute("xml", { sessionId: "s1" });
    await tick();
    const opsPromise = c.execute("ops", { sessionId: "s1" });
    await tick();

    assert.deepEqual(order, ["xml:start", "ops:start"], "flag OFF = lane pass-through (old concurrency)");

    xml.release({ ok: true, status: 200 });
    await Promise.all([xmlPromise, opsPromise]);
  } finally {
    if (prevWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = prevWindow;
    }
  }
});
