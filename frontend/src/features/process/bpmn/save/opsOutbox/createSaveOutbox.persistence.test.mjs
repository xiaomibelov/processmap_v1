import test from "node:test";
import assert from "node:assert/strict";

import { createSaveCoordinator } from "../../../../session/saveCoordinator.js";
import {
  setVersion as setTrackedDiagramStateVersion,
  __resetForTests as resetCasVersionTracker,
} from "../../../../../lib/casVersionTracker.js";
import { createOpsOutboxConfig } from "./opsOutboxConfig.js";
import { createSaveOutbox } from "./createSaveOutbox.js";

// ---------------------------------------------------------------------------
// Контур feature/async-save-pipeline-step2 (TESTS §1.2).
//  - pendingAck-детач (наследие п.1): отправленный список живёт отдельно от
//    буфера; ack снимает только детачнутые; undo/push во время полёта
//    мутаируют только буфер. Регрессия: push → flush(hang) → undo отправленной
//    op → push → ack → вторая op уходит следующим flush'ем.
//  - Version-based reconciliation manual full-save (наследие п.5):
//    ack.version >= base + sentCount ⇒ drain; иначе keep + re-flush.
//  - Journal: append на push, removeOps ровно acked opIds на ack (eviction
//    только после ack), hydrate восстанавливает буфер нового экземпляра.
//  - IDB-unavailable fallback: outbox работает без journal (как step1).
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

function stripInternal(op) {
  const wire = {};
  for (const [key, value] of Object.entries(op)) {
    if (key.startsWith("__")) continue;
    wire[key] = value;
  }
  return wire;
}

function makeFakeJournal() {
  const stored = new Map();
  return {
    stored,
    appendOps: async (sid, ops) => {
      for (const op of ops) stored.set(op.opId, stripInternal(op));
    },
    removeOps: async (opIds) => {
      for (const opId of opIds) stored.delete(opId);
    },
    hydrateBuffer: async () => [...stored.values()],
    putProposed: async () => {},
    listProposed: async () => [],
    resolveProposed: async () => {},
  };
}

function makeFakeSyncState() {
  const patches = [];
  return {
    patches,
    getSyncState: async () => null,
    patchSyncState: async (sid, patch) => { patches.push({ sid, patch }); },
  };
}

function makeOutbox(t, options = {}) {
  const coordinator = options.coordinator || createSaveCoordinator();
  const api = options.api || makeApi();
  const journal = options.journal ?? makeFakeJournal();
  const syncState = options.syncState ?? makeFakeSyncState();
  const statuses = [];
  const outbox = createSaveOutbox({
    sessionId: "s1",
    coordinator,
    api,
    uuid: seqUuid(),
    now: () => 1_000_000,
    jitterRandom: () => 0.5,
    requestFullSave: () => {},
    onStatus: (ev) => statuses.push(ev),
    loadServerXml: async () => ({ ok: true }),
    journal,
    syncStateStore: syncState,
    navigator: options.navigator,
    config: createOpsOutboxConfig(options.configOverrides || {}),
  });
  return { coordinator, api, outbox, statuses, journal, syncState, t };
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
});

test("pendingAck detach regression: push → flush(hang) → undo sent op → push → ack → second op flushed", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let call = 0;
    let ackResolve = null;
    const firstAck = new Promise((resolve) => { ackResolve = resolve; });
    const api = makeApi({
      postSessionOperations: async (sid, body) => {
        call += 1;
        if (call === 1) return firstAck; // висит до ручного ack
        return { ok: true, status: 200, version: 9, applied: body.operations.length, skipped: 0, diagramStateVersion: 9 };
      },
    });
    const ctx = makeOutbox(t, { api, configOverrides: { flushDebounceMs: 25 } });
    try {
      setTrackedDiagramStateVersion("s1", 7);
      pushRename(ctx.outbox, "Task_1", "A");
      const flushing = ctx.outbox.flushNow({ reason: "test" });
      await drain();
      assert.equal(call, 1, "first flush dispatched");

      // undo отправленной (ещё не acked) op во время полёта
      ctx.outbox.pushCommand({
        command: "element.updateProperties",
        action: "undo",
        context: { element: { id: "Task_1" }, properties: { name: "A" }, oldProperties: { name: "" } },
      });
      pushRename(ctx.outbox, "Task_2", "B");

      ackResolve({ ok: true, status: 200, version: 8, applied: 1, skipped: 0, diagramStateVersion: 8 });
      await flushing;
      t.mock.timers.tick(60);
      await drain();

      assert.equal(call, 2, "ops after the undone sent op must go in the next flush");
      const secondBatch = ctx.api.calls[1].body.operations;
      assert.ok(
        secondBatch.some((o) => o.elementId === "Task_2"),
        "op pushed during flight survives ack (undo of sent op must not wipe it)",
      );
    } finally {
      ackResolve({ ok: true, status: 200, version: 8, applied: 1, skipped: 0, diagramStateVersion: 8 });
      ctx.outbox.destroy();
    }
  } finally {
    t.mock.timers.reset();
  }
});

test("manual full-save ack: version >= base+sentCount → buffer drained", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let call = 0;
    let ackResolve = null;
    const firstAck = new Promise((resolve) => { ackResolve = resolve; });
    const api = makeApi({
      postSessionOperations: async (sid, body) => {
        call += 1;
        if (call === 1) return firstAck;
        return { ok: true, status: 200, version: 9, applied: body.operations.length, skipped: 0, diagramStateVersion: 9 };
      },
    });
    const ctx = makeOutbox(t, { api, configOverrides: { flushDebounceMs: 25 } });
    try {
      setTrackedDiagramStateVersion("s1", 7);
      pushRename(ctx.outbox, "Task_1", "A");
      const flushing = ctx.outbox.flushNow({ reason: "test" });
      await drain();

      // Ручной full-save ack: сервер на version 8 = base(7) + sentCount(1) —
      // сервер видел ops-батч → буфер снимается.
      ctx.coordinator.emit("success", {
        pipeline: "xml",
        sessionId: "s1",
        response: { ok: true, diagramStateVersion: 8 },
      });
      ackResolve({ ok: true, status: 200, version: 8, applied: 1, skipped: 0, diagramStateVersion: 8 });
      await flushing;
      t.mock.timers.tick(60);
      await drain();
      assert.equal(call, 1, "drained buffer — nothing re-flushed");
      assert.deepEqual([...ctx.journal.stored.keys()], [], "journal evicted after ack");
    } finally {
      ackResolve({ ok: true, status: 200, version: 8, applied: 1, skipped: 0, diagramStateVersion: 8 });
      ctx.outbox.destroy();
    }
  } finally {
    t.mock.timers.reset();
  }
});

test("manual full-save ack: version < base+sentCount → ops kept and re-flushed with same opId", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let call = 0;
    let ackResolve = null;
    const firstAck = new Promise((resolve) => { ackResolve = resolve; });
    const api = makeApi({
      postSessionOperations: async (sid, body) => {
        call += 1;
        if (call === 1) return firstAck;
        return { ok: true, status: 200, version: 9, applied: body.operations.length, skipped: 0, diagramStateVersion: 9 };
      },
    });
    const ctx = makeOutbox(t, { api, configOverrides: { flushDebounceMs: 25 } });
    try {
      setTrackedDiagramStateVersion("s1", 7);
      pushRename(ctx.outbox, "Task_1", "A");
      const flushing = ctx.outbox.flushNow({ reason: "test" });
      await drain();

      // Full-save ack НЕ подтверждает, что сервер видел ops-батч (7 < 7+1) —
      // ops остаются и уходят следующим flush (идемпотентность opId).
      ctx.coordinator.emit("success", {
        pipeline: "xml",
        sessionId: "s1",
        response: { ok: true, diagramStateVersion: 7 },
      });
      await drain();
      ackResolve({ ok: true, status: 200, version: 7, applied: 0, skipped: 1, diagramStateVersion: 7 });
      await flushing;
      t.mock.timers.tick(60);
      await drain();
      assert.equal(call, 2, "kept ops re-flushed");
      assert.deepEqual(
        ctx.api.calls[1].body.operations.map((o) => o.opId),
        ["op-1"],
        "same opId on re-flush (server idempotency)",
      );
    } finally {
      ackResolve({ ok: true, status: 200, version: 7, applied: 0, skipped: 1, diagramStateVersion: 7 });
      ctx.outbox.destroy();
    }
  } finally {
    t.mock.timers.reset();
  }
});

test("journal: appendOps on push; eviction only after ack (removeOps = exactly acked opIds)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let call = 0;
    let ackResolve = null;
    const firstAck = new Promise((resolve) => { ackResolve = resolve; });
    const api = makeApi({
      postSessionOperations: async (sid, body) => {
        call += 1;
        if (call === 1) return firstAck;
        return { ok: true, status: 200, version: 9, applied: body.operations.length, skipped: 0, diagramStateVersion: 9 };
      },
    });
    const ctx = makeOutbox(t, { api, configOverrides: { flushDebounceMs: 25 } });
    try {
      setTrackedDiagramStateVersion("s1", 7);
      pushRename(ctx.outbox, "Task_1", "A");
      pushRename(ctx.outbox, "Task_2", "B");
      await drain();
      assert.deepEqual([...ctx.journal.stored.keys()].sort(), ["op-1", "op-2"], "both ops appended to journal on push");

      const flushing = ctx.outbox.flushNow({ reason: "test" });
      await drain();
      assert.deepEqual([...ctx.journal.stored.keys()].sort(), ["op-1", "op-2"], "dispatch does NOT evict (eviction only after ack)");

      ackResolve({ ok: true, status: 200, version: 8, applied: 2, skipped: 0, diagramStateVersion: 8 });
      await flushing;
      t.mock.timers.tick(60);
      await drain();
      assert.deepEqual([...ctx.journal.stored.keys()], [], "acked opIds removed from journal");
      assert.ok(
        ctx.syncState.patches.some((p) => p.patch.lastServerVersion === 8),
        "syncState.lastServerVersion patched on ack",
      );
    } finally {
      ackResolve({ ok: true, status: 200, version: 8, applied: 2, skipped: 0, diagramStateVersion: 8 });
      ctx.outbox.destroy();
    }
  } finally {
    t.mock.timers.reset();
  }
});

test("hydrate: new outbox instance with the same journal restores buffer and flushes restored ops", async (t) => {
  const journal = makeFakeJournal();
  const apiA = makeApi();
  const outboxA = createSaveOutbox({
    sessionId: "s1",
    coordinator: createSaveCoordinator(),
    api: apiA,
    uuid: seqUuid(),
    now: () => 1_000_000,
    jitterRandom: () => 0.5,
    requestFullSave: () => {},
    journal,
    syncStateStore: makeFakeSyncState(),
    config: createOpsOutboxConfig({}),
  });
  setTrackedDiagramStateVersion("s1", 7);
  pushRename(outboxA, "Task_1", "A");
  pushRename(outboxA, "Task_2", "B");
  await drain();
  outboxA.destroy();

  // «reload»: новый экземпляр outbox на том же journal
  const apiB = makeApi();
  const outboxB = createSaveOutbox({
    sessionId: "s1",
    coordinator: createSaveCoordinator(),
    api: apiB,
    uuid: seqUuid(),
    now: () => 1_000_000,
    jitterRandom: () => 0.5,
    requestFullSave: () => {},
    journal,
    syncStateStore: makeFakeSyncState(),
    config: createOpsOutboxConfig({}),
  });
  await outboxB.flushNow({ reason: "reconcile" });
  assert.equal(apiB.calls.length, 1, "restored buffer flushed");
  assert.deepEqual(
    apiB.calls[0].body.operations.map((o) => o.elementId),
    ["Task_1", "Task_2"],
    "both ops restored from journal in order",
  );
  outboxB.destroy();
});

test("IDB unavailable fallback: outbox without journal works (step1 semantics, no throw)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const api = makeApi();
    // journal/syncStateStore не переданы — node-окружение без indexedDB →
    // noop-fallback адаптер.
    const outbox = createSaveOutbox({
      sessionId: "s1",
      coordinator: createSaveCoordinator(),
      api,
      uuid: seqUuid(),
      now: () => 1_000_000,
      jitterRandom: () => 0.5,
      requestFullSave: () => {},
      config: createOpsOutboxConfig({}),
    });
    setTrackedDiagramStateVersion("s1", 7);
    pushRename(outbox, "Task_1", "A");
    await outbox.flushNow({ reason: "test" });
    assert.equal(api.calls.length, 1, "flush works without IDB");
    assert.equal(outbox.getState().bufferedCount, 0);
    outbox.destroy();
  } finally {
    t.mock.timers.reset();
  }
});

// ---------------------------------------------------------------------------
// Контур feature/async-save-pipeline-step2 (TESTS §1.5): примитивы outbox для
// multi-user consumer'а — getPendingOps / removePendingOps (LWW-проигравшие
// уходят в proposed через consumer) / requeueOps («предложенные» возвращаются
// в буфер НОВЫМ opId → обычный flush).
// ---------------------------------------------------------------------------

test("getPendingOps returns wire ops of the current buffer", async () => {
  const journal = makeFakeJournal();
  const ctx = makeOutbox(null, { journal });
  setTrackedDiagramStateVersion("s1", 7);
  pushRename(ctx.outbox, "Task_1", "A");
  pushRename(ctx.outbox, "Task_2", "B");
  const pending = ctx.outbox.getPendingOps();
  assert.deepEqual(pending.map((o) => o.opId), ["op-1", "op-2"]);
  assert.equal(JSON.stringify(pending).includes("__ts"), false, "no __* service fields");
  ctx.outbox.destroy();
});

test("removePendingOps extracts exactly the given opIds from buffer and journal", async () => {
  const journal = makeFakeJournal();
  const ctx = makeOutbox(null, { journal });
  setTrackedDiagramStateVersion("s1", 7);
  pushRename(ctx.outbox, "Task_1", "A");
  pushRename(ctx.outbox, "Task_2", "B");
  pushRename(ctx.outbox, "Task_3", "C");
  const removed = ctx.outbox.removePendingOps(["op-1", "op-3"]);
  assert.deepEqual(removed.map((o) => o.elementId), ["Task_1", "Task_3"]);
  assert.deepEqual(ctx.outbox.getPendingOps().map((o) => o.opId), ["op-2"], "buffer keeps the rest");
  assert.deepEqual([...journal.stored.keys()], ["op-2"], "journal evicted the extracted opIds");
  ctx.outbox.destroy();
});

test("requeueOps re-enters ops as NEW opIds and schedules a flush", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const journal = makeFakeJournal();
    const api = makeApi();
    const ctx = makeOutbox(t, { journal, api, configOverrides: { flushDebounceMs: 25 } });
    setTrackedDiagramStateVersion("s1", 7);
    const requeued = ctx.outbox.requeueOps([
      { type: "element.updateProperties", elementId: "Task_1", properties: { name: "Моё" } },
    ]);
    assert.equal(requeued, 1);
    const pending = ctx.outbox.getPendingOps();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].opId, "op-1", "fresh opId assigned by outbox uuid");
    assert.equal(pending[0].type, "element.updateProperties");
    assert.deepEqual([...journal.stored.keys()], ["op-1"], "requeued op appended to journal");
    t.mock.timers.tick(25);
    await drain();
    assert.equal(api.calls.length, 1, "requeued op goes out via the normal flush");
    assert.equal(api.calls[0].body.operations[0].properties.name, "Моё");
    ctx.outbox.destroy();
  } finally {
    t.mock.timers.reset();
  }
});
