import test from "node:test";
import assert from "node:assert/strict";

import { SessionCache } from "../sessionCache.js";

function createCache(options) {
  return new SessionCache(options);
}

test("get/set roundtrip", () => {
  const cache = createCache();
  const data = { sessionId: "s1", xml: "<xml/>", session: { id: "s1" } };
  cache.set("s1", data);
  assert.deepEqual(cache.get("s1"), data);
});

test("get returns null for missing session", () => {
  const cache = createCache();
  assert.equal(cache.get("missing"), null);
});

test("isFresh respects TTL", async () => {
  const cache = createCache({ defaultTtlMs: 100 });
  cache.set("s1", { sessionId: "s1" });
  assert.equal(cache.isFresh("s1"), true);
  await new Promise((resolve) => { setTimeout(resolve, 150); });
  assert.equal(cache.isFresh("s1"), false);
  assert.equal(cache.get("s1"), null);
  assert.equal(cache.get("s1", { allowStale: true })?.sessionId, "s1");
});

test("update merges data and notifies subscribers", () => {
  const cache = createCache();
  cache.set("s1", { sessionId: "s1", xml: "old" });
  const events = [];
  cache.subscribe("s1", (e) => events.push(e));
  cache.update("s1", { xml: "new" });
  assert.equal(cache.get("s1").xml, "new");
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "update");
  assert.equal(events[0].updates.xml, "new");
});

test("invalidate marks entry stale but keeps data", () => {
  const cache = createCache();
  cache.set("s1", { sessionId: "s1" });
  cache.invalidate("s1");
  assert.equal(cache.has("s1"), true);
  assert.equal(cache.get("s1"), null);
  assert.equal(cache.get("s1", { allowStale: true })?.sessionId, "s1");
});

test("delete removes entry and notifies", () => {
  const cache = createCache();
  cache.set("s1", { sessionId: "s1" });
  const events = [];
  cache.subscribe("s1", (e) => events.push(e));
  cache.delete("s1");
  assert.equal(cache.get("s1"), null);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "delete");
});

test("LRU eviction removes least recently accessed", async () => {
  const cache = createCache({ maxSize: 3, defaultTtlMs: 60000 });
  cache.set("a", { sessionId: "a" });
  await new Promise((r) => setTimeout(r, 10));
  cache.set("b", { sessionId: "b" });
  await new Promise((r) => setTimeout(r, 10));
  cache.set("c", { sessionId: "c" });
  await new Promise((r) => setTimeout(r, 10));
  cache.get("a"); // touch a
  await new Promise((r) => setTimeout(r, 10));
  cache.set("d", { sessionId: "d" }); // evicts b
  assert.equal(cache.has("a"), true);
  assert.equal(cache.has("b"), false);
  assert.equal(cache.has("c"), true);
  assert.equal(cache.has("d"), true);
});

test("global subscribers receive all events", () => {
  const cache = createCache();
  const events = [];
  cache.subscribe(null, (e) => events.push(e));
  cache.set("s1", { sessionId: "s1" });
  cache.update("s1", { xml: "x" });
  assert.equal(events.length, 2);
});

test("prune respects custom limit", () => {
  const cache = createCache({ maxSize: 5 });
  cache.set("a", { sessionId: "a" });
  cache.set("b", { sessionId: "b" });
  cache.set("c", { sessionId: "c" });
  cache.prune(2);
  assert.equal(cache.size(), 2);
});

test("clear removes everything", () => {
  const cache = createCache();
  cache.set("s1", { sessionId: "s1" });
  cache.set("s2", { sessionId: "s2" });
  cache.clear();
  assert.equal(cache.size(), 0);
});
