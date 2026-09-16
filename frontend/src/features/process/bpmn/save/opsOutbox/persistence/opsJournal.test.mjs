import test from "node:test";
import assert from "node:assert/strict";

import { createMockIdb } from "./mockIdb.mjs";
import { openOutboxDb } from "./idb.js";
import { createOpsJournal } from "./opsJournal.js";

// ---------------------------------------------------------------------------
// Контур feature/async-save-pipeline-step2 (TESTS §1.1). opsJournal:
// appendOps (put по opId, payload без __*-служебных полей), removeOps,
// hydrateBuffer по [sessionId, ts]; proposed-store: putProposed /
// listProposed / resolveProposed. IDB недоступен → noop fallback.
// ---------------------------------------------------------------------------

function makeJournal() {
  const idb = createMockIdb();
  const journal = createOpsJournal({ idb });
  return { idb, journal };
}

function op(opId, extra = {}) {
  return {
    opId,
    type: "element.updateProperties",
    elementId: "Task_1",
    key: "element.updateProperties::Task_1",
    __ts: 100,
    __committed: true,
    ...extra,
  };
}

test("appendOps stores wire payload (no __* fields) under opId; hydrateBuffer restores in ts order", async () => {
  const { idb, journal } = makeJournal();
  await journal.appendOps("s1", [
    op("op-2", { __ts: 200 }),
    op("op-1", { __ts: 100 }),
  ]);
  await journal.appendOps("s1", [op("op-3", { __ts: 300 })]);
  await journal.appendOps("other-session", [op("op-9", { __ts: 50 })]);

  const db = await openOutboxDb({ idb });
  const raw = db.__store("operations").__dump();
  assert.equal(raw.length, 4, "ops from other sessions are stored too (3×s1 + 1×other)");
  const stored = raw.find((r) => r.opId === "op-1");
  assert.equal(stored.sessionId, "s1");
  assert.equal(stored.ts, 100);
  assert.equal(JSON.stringify(stored.payload).includes("__"), false, "no __* service fields persisted");
  assert.equal(stored.payload.opId, "op-1");
  assert.equal(stored.payload.type, "element.updateProperties");

  const hydrated = await journal.hydrateBuffer("s1");
  assert.deepEqual(hydrated.map((o) => o.opId), ["op-1", "op-2", "op-3"], "hydrate sorted by ts");
  assert.deepEqual(await journal.hydrateBuffer("ghost"), []);
});

test("appendOps is idempotent per opId (re-put overwrites, hydrate dedups)", async () => {
  const { journal } = makeJournal();
  await journal.appendOps("s1", [op("op-1", { __ts: 100, properties: { name: "A" } })]);
  await journal.appendOps("s1", [op("op-1", { __ts: 100, properties: { name: "B" } })]);
  const hydrated = await journal.hydrateBuffer("s1");
  assert.equal(hydrated.length, 1);
  assert.deepEqual(hydrated[0].properties, { name: "B" }, "last append wins (coalesce update path)");
});

test("removeOps deletes exactly the given opIds", async () => {
  const { journal } = makeJournal();
  await journal.appendOps("s1", [op("op-1"), op("op-2"), op("op-3")]);
  await journal.removeOps(["op-1", "op-3", "ghost"]);
  const hydrated = await journal.hydrateBuffer("s1");
  assert.deepEqual(hydrated.map((o) => o.opId), ["op-2"]);
});

test("getAllBySession returns stored records for consumers", async () => {
  const { journal } = makeJournal();
  await journal.appendOps("s1", [op("op-1")]);
  const all = await journal.getAllBySession("s1");
  assert.equal(all.length, 1);
  assert.equal(all[0].sessionId, "s1");
});

test("proposed store: putProposed / listProposed (bySession) / resolveProposed", async () => {
  const { journal } = makeJournal();
  const record = {
    proposedId: "pp-1",
    sessionId: "s1",
    elementId: "Task_1",
    opType: "element.updateProperties",
    payload: { properties: { name: "Моё" } },
    conflictVersion: 12,
    createdAt: 500,
  };
  await journal.putProposed(record);
  await journal.putProposed({ ...record, proposedId: "pp-2", elementId: "Task_2" });
  await journal.putProposed({ ...record, proposedId: "pp-9", sessionId: "s2" });

  const listed = await journal.listProposed("s1");
  assert.deepEqual(listed.map((p) => p.proposedId).sort(), ["pp-1", "pp-2"]);
  assert.deepEqual(await journal.listProposed("ghost"), []);

  await journal.resolveProposed("pp-1");
  assert.deepEqual((await journal.listProposed("s1")).map((p) => p.proposedId), ["pp-2"]);
  await journal.resolveProposed("ghost"); // не падает на отсутствующей записи
});

test("IDB unavailable → noop fallback: ops are dropped, hydrate returns [], no throw", async () => {
  const journal = createOpsJournal({ idb: null });
  await journal.appendOps("s1", [op("op-1")]);
  await journal.removeOps(["op-1"]);
  await journal.putProposed({ proposedId: "pp-1", sessionId: "s1" });
  assert.deepEqual(await journal.hydrateBuffer("s1"), []);
  assert.deepEqual(await journal.listProposed("s1"), []);
});
