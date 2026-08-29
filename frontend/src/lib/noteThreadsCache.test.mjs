import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetForTests,
  clearNoteThreadsCache,
  fetchNoteThreads,
  getCachedNoteThreads,
  invalidateNoteThreads,
  noteThreadsCacheKey,
  seedNoteThreads,
  subscribeNoteThreads,
} from "./noteThreadsCache.js";

test.beforeEach(() => {
  __resetForTests();
});

function makeTransport(items, delayMs = 0) {
  let callCount = 0;
  const transport = async () => {
    callCount += 1;
    if (delayMs > 0) await new Promise((resolve) => { setTimeout(resolve, delayMs); });
    return { ok: true, status: 200, items };
  };
  transport.callCount = () => callCount;
  return transport;
}

test("cache key combines sessionId, scopeType and elementId", () => {
  assert.equal(noteThreadsCacheKey("s1", "diagram_element", "e1"), "s1|diagram_element|e1");
  assert.equal(noteThreadsCacheKey("s1", "", ""), "s1||");
  assert.equal(noteThreadsCacheKey("s1", "diagram_element", ""), "s1|diagram_element|");
});

test("fetchNoteThreads returns cached data without network call", async () => {
  const transport = makeTransport([{ id: "t1", updated_at: 1 }]);
  const first = await fetchNoteThreads("s1", "diagram_element", "e1", { transport });
  assert.equal(first.items.length, 1);
  assert.equal(transport.callCount(), 1);

  const second = await fetchNoteThreads("s1", "diagram_element", "e1", { transport });
  assert.equal(second.items.length, 1);
  assert.equal(transport.callCount(), 1); // cache hit
});

test("in-flight deduplication: 10 parallel calls produce 1 request", async () => {
  const transport = makeTransport([{ id: "t1", updated_at: 1 }], 20);
  const promises = Array.from({ length: 10 }, () =>
    fetchNoteThreads("s1", "diagram_element", "e1", { transport }));
  const results = await Promise.all(promises);
  assert.equal(results.every((r) => r.ok && r.items.length === 1), true);
  assert.equal(transport.callCount(), 1);
});

test("force refetch bypasses cache", async () => {
  const transport = makeTransport([{ id: "t1", updated_at: 1 }]);
  await fetchNoteThreads("s1", "diagram_element", "e1", { transport });
  await fetchNoteThreads("s1", "diagram_element", "e1", { transport, force: true });
  assert.equal(transport.callCount(), 2);
});

test("TTL expires cached entry", async () => {
  const transport = makeTransport([{ id: "t1", updated_at: 1 }]);
  await fetchNoteThreads("s1", "diagram_element", "e1", { transport, ttlMs: 5 });
  await new Promise((resolve) => { setTimeout(resolve, 10); });
  await fetchNoteThreads("s1", "diagram_element", "e1", { transport });
  assert.equal(transport.callCount(), 2);
});

test("invalidateNoteThreads clears cache and refetch fetches again", async () => {
  const transport = makeTransport([{ id: "t1", updated_at: 1 }]);
  await fetchNoteThreads("s1", "diagram_element", "e1", { transport });
  invalidateNoteThreads("s1", "diagram_element", "e1");
  assert.equal(getCachedNoteThreads("s1", "diagram_element", "e1"), null);
  await fetchNoteThreads("s1", "diagram_element", "e1", { transport });
  assert.equal(transport.callCount(), 2);
});

test("invalidate by event dispatches notifies subscribers", async () => {
  globalThis.window = globalThis.window || {};
  globalThis.window._listeners = {};
  globalThis.window.dispatchEvent = (event) => {
    const listeners = globalThis.window._listeners[event.type];
    if (listeners) listeners.forEach((l) => l(event));
  };
  globalThis.window.addEventListener = (type, listener) => {
    if (!globalThis.window._listeners[type]) globalThis.window._listeners[type] = [];
    globalThis.window._listeners[type].push(listener);
  };
  globalThis.window.removeEventListener = () => {};

  const transport = makeTransport([{ id: "t1", updated_at: 1 }]);
  let notified = 0;
  const unsub = subscribeNoteThreads("s1", "diagram_element", "e1", () => {
    notified += 1;
  });

  await fetchNoteThreads("s1", "diagram_element", "e1", { transport });
  assert.equal(notified, 0);

  globalThis.window.dispatchEvent(new CustomEvent("processmap:element-note-threads-changed", {
    detail: { sessionId: "s1" },
  }));

  assert.equal(notified > 0, true);
  unsub();
});

test("seedNoteThreads populates cache", () => {
  seedNoteThreads("s1", "diagram_element", "e1", [{ id: "t1", updated_at: 1 }]);
  const cached = getCachedNoteThreads("s1", "diagram_element", "e1");
  assert.equal(cached.length, 1);
  assert.equal(cached[0].id, "t1");
});
