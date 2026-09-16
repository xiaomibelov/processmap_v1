import test from "node:test";
import assert from "node:assert/strict";

import { createMockIdb } from "./mockIdb.mjs";
import {
  OUTBOX_DB_NAME,
  OUTBOX_DB_VERSION,
  openOutboxDb,
  idbGet,
  idbPut,
  idbDelete,
  idbGetAllByIndex,
  createWriteQueue,
} from "./idb.js";

// ---------------------------------------------------------------------------
// Контур feature/async-save-pipeline-step2 (TESTS §1.1). idb.js — тонкий
// helper над сырым IndexedDB: openOutboxDb с upgrade-ветвлением v1→v2
// (proposed-стор), CRUD-хелперы по store/index, микро-очередь записей.
// Мок IDB — in-memory, без новых депов (mockIdb.mjs).
// ---------------------------------------------------------------------------

async function openFreshDb() {
  const idb = createMockIdb();
  const db = await openOutboxDb({ idb });
  assert.ok(db, "db opens against mock IDB");
  return { idb, db };
}

test("schema v1+v2: operations (keyPath opId, bySession/bySessionTs), syncState, proposed (bySession)", async () => {
  const { db } = await openFreshDb();
  assert.equal(db.name, OUTBOX_DB_NAME);
  assert.equal(db.version, OUTBOX_DB_VERSION);
  assert.ok(db.objectStoreNames.contains("operations"));
  assert.ok(db.objectStoreNames.contains("syncState"));
  assert.ok(db.objectStoreNames.contains("proposed"), "v2 adds proposed store");
  const txOk = db.transaction("operations", "readonly");
  const store = txOk.objectStore("operations");
  assert.equal(store.keyPath, "opId");
  assert.ok(store.index("bySession"), "bySession index exists");
  assert.ok(store.index("bySessionTs"), "bySessionTs compound index exists");
  const proposedTx = db.transaction("proposed", "readonly");
  assert.equal(proposedTx.objectStore("proposed").keyPath, "proposedId");
  assert.ok(proposedTx.objectStore("proposed").index("bySession"));
});

test("open without idb available resolves null (fallback signal, no throw)", async () => {
  const db = await openOutboxDb({ idb: null });
  assert.equal(db, null);
});

test("put/get/delete round-trip by keyPath", async () => {
  const { db } = await openFreshDb();
  await idbPut(db, "syncState", { sessionId: "s1", lastServerVersion: 7, lastLocalVersion: 3, updatedAt: 111 });
  const record = await idbGet(db, "syncState", "s1");
  assert.deepEqual(record, { sessionId: "s1", lastServerVersion: 7, lastLocalVersion: 3, updatedAt: 111 });
  await idbDelete(db, "syncState", "s1");
  assert.equal(await idbGet(db, "syncState", "s1"), undefined, "deleted record is gone");
});

test("getAllByIndex bySession filters; hydrate order sorted by [sessionId, ts]", async () => {
  const { db } = await openFreshDb();
  const ops = [
    { opId: "op-1", sessionId: "s1", ts: 30, payload: { n: 3 } },
    { opId: "op-2", sessionId: "s2", ts: 10, payload: { n: 1 } },
    { opId: "op-3", sessionId: "s1", ts: 10, payload: { n: 1 } },
    { opId: "op-4", sessionId: "s1", ts: 20, payload: { n: 2 } },
  ];
  for (const op of ops) await idbPut(db, "operations", op);
  const s1 = await idbGetAllByIndex(db, "operations", "bySession", "s1");
  assert.equal(s1.length, 3);
  const ordered = [...s1].sort((a, b) => a.ts - b.ts).map((o) => o.opId);
  assert.deepEqual(ordered, ["op-3", "op-4", "op-1"], "hydrate order is by [sessionId, ts]");
  const s2 = await idbGetAllByIndex(db, "operations", "bySession", "s2");
  assert.deepEqual(s2.map((o) => o.opId), ["op-2"]);
  const none = await idbGetAllByIndex(db, "operations", "bySession", "ghost");
  assert.deepEqual(none, []);
});

test("broken store access resolves safe defaults instead of throwing", async () => {
  const { db } = await openFreshDb();
  const fakeDb = {
    transaction() {
      throw new Error("boom");
    },
  };
  assert.equal(await idbGet(fakeDb, "operations", "x"), undefined);
  assert.deepEqual(await idbGetAllByIndex(fakeDb, "operations", "bySession", "x"), []);
  await idbPut(fakeDb, "operations", { opId: "x" });
  await idbDelete(fakeDb, "operations", "x");
});

test("write queue preserves order of chained writes", async () => {
  const { db } = await openFreshDb();
  const queue = createWriteQueue();
  const order = [];
  const jobs = ["op-a", "op-b", "op-c"].map((opId, i) => queue.enqueue(async () => {
    order.push(`start-${opId}`);
    await new Promise((resolve) => setTimeout(resolve, 3 - i)); // обратные задержки: порядок только от очереди
    await idbPut(db, "operations", { opId, sessionId: "s1", ts: i + 1, payload: {} });
    order.push(`end-${opId}`);
  }));
  await Promise.all(jobs);
  assert.deepEqual(order, [
    "start-op-a", "end-op-a",
    "start-op-b", "end-op-b",
    "start-op-c", "end-op-c",
  ], "writes run sequentially in enqueue order even with out-of-order completion");
  const all = await idbGetAllByIndex(db, "operations", "bySession", "s1");
  assert.deepEqual(all.map((o) => o.opId).sort(), ["op-a", "op-b", "op-c"]);
});
