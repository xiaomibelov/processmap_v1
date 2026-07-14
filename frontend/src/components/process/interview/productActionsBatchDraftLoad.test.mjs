import test from "node:test";
import assert from "node:assert/strict";

import { startProductActionsBatchDraftLoad } from "./productActionsBatchDraftLoad.js";

test("batch-draft load applies the draft when not cancelled", async () => {
  const applied = [];
  const handle = startProductActionsBatchDraftLoad("session-1", {
    load: async () => ({ ok: true, draft: { stepA: { rows: [] } } }),
    apply: (draft) => applied.push(draft),
  });
  await handle.done;
  assert.deepEqual(applied, [{ stepA: { rows: [] } }]);
});

test("batch-draft load discards the draft when cancelled before resolve (unmount)", async () => {
  const applied = [];
  let resolveLoad;
  const pending = new Promise((resolve) => {
    resolveLoad = resolve;
  });
  const handle = startProductActionsBatchDraftLoad("session-1", {
    load: () => pending,
    apply: (draft) => applied.push(draft),
  });
  // Simulate unmount while the request is still in flight.
  handle.cancel();
  resolveLoad({ ok: true, draft: { stepA: { rows: [] } } });
  await handle.done;
  assert.deepEqual(applied, [], "stale draft must NOT be applied after cancel");
});

test("batch-draft load drops the stale session draft on a fast session switch", async () => {
  const applied = [];
  const resolvers = {};
  const load = (sid) =>
    new Promise((resolve) => {
      resolvers[sid] = resolve;
    });
  const first = startProductActionsBatchDraftLoad("session-1", {
    load,
    apply: (draft) => applied.push(["session-1", draft]),
  });
  const second = startProductActionsBatchDraftLoad("session-2", {
    load,
    apply: (draft) => applied.push(["session-2", draft]),
  });
  // Session switched away from session-1 before its load resolved.
  first.cancel();
  resolvers["session-1"]({ ok: true, draft: { from: "session-1" } });
  resolvers["session-2"]({ ok: true, draft: { from: "session-2" } });
  await Promise.all([first.done, second.done]);
  assert.deepEqual(applied, [["session-2", { from: "session-2" }]]);
});

test("batch-draft load silently ignores load errors and never applies", async () => {
  const applied = [];
  const handle = startProductActionsBatchDraftLoad("session-1", {
    load: async () => {
      throw new Error("network down");
    },
    apply: (draft) => applied.push(draft),
  });
  // Must resolve (not reject) so callers can await without a try/catch.
  await handle.done;
  assert.deepEqual(applied, []);
});

test("batch-draft load ignores non-ok or draft-less results", async () => {
  const applied = [];
  const notOk = startProductActionsBatchDraftLoad("session-1", {
    load: async () => ({ ok: false, draft: null }),
    apply: (draft) => applied.push(draft),
  });
  const noDraft = startProductActionsBatchDraftLoad("session-1", {
    load: async () => ({ ok: true, draft: null }),
    apply: (draft) => applied.push(draft),
  });
  await Promise.all([notOk.done, noDraft.done]);
  assert.deepEqual(applied, []);
});
