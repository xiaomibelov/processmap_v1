import test from "node:test";
import assert from "node:assert/strict";

import { createMockIdb } from "./mockIdb.mjs";
import { createSyncStateStore } from "./syncStateStore.js";

// ---------------------------------------------------------------------------
// Контур feature/async-save-pipeline-step2 (TESTS §1.1). syncStateStore:
// getSyncState (отсутствующая запись → null, не throw), patchSyncState
// (merge + updatedAt). IDB недоступен → get всегда null, patch noop.
// ---------------------------------------------------------------------------

test("getSyncState returns null for missing record (no throw)", async () => {
  const store = createSyncStateStore({ idb: createMockIdb() });
  assert.equal(await store.getSyncState("ghost"), null);
});

test("patchSyncState creates and merges records", async () => {
  const store = createSyncStateStore({ idb: createMockIdb() });
  await store.patchSyncState("s1", { lastServerVersion: 7 });
  let state = await store.getSyncState("s1");
  assert.equal(state.lastServerVersion, 7);
  assert.equal(state.lastLocalVersion, 0);
  assert.ok(Number(state.updatedAt) > 0, "updatedAt stamped");

  await store.patchSyncState("s1", { lastLocalVersion: 3, lastServerVersion: 9 });
  state = await store.getSyncState("s1");
  assert.equal(state.lastServerVersion, 9, "patch overwrites");
  assert.equal(state.lastLocalVersion, 3, "patch merges");
});

test("IDB unavailable → getSyncState null, patchSyncState noop", async () => {
  const store = createSyncStateStore({ idb: null });
  assert.equal(await store.getSyncState("s1"), null);
  await store.patchSyncState("s1", { lastServerVersion: 5 });
  assert.equal(await store.getSyncState("s1"), null);
});
