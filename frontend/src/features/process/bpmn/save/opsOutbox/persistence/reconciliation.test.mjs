import test from "node:test";
import assert from "node:assert/strict";

import { resolveOnEntry } from "./reconciliation.js";

// ---------------------------------------------------------------------------
// Контур feature/async-save-pipeline-step2 (TESTS §1.4). Политика «кто новее»
// при входе в сессию (PLAN §5). Четыре ветки + гидрация pending-буфера из
// journal перед ветвлением.
// ---------------------------------------------------------------------------

function makeDeps(overrides = {}) {
  const calls = [];
  const pending = overrides.pending || [];
  const journal = {
    hydrateBuffer: async (sessionId) => {
      calls.push(`hydrate:${sessionId}`);
      return pending;
    },
  };
  const syncState = {
    getSyncState: async (sessionId) => {
      calls.push(`syncState:${sessionId}`);
      return overrides.local !== undefined ? overrides.local : null;
    },
  };
  const deps = {
    sessionId: "s1",
    serverVersion: 5,
    journal,
    syncState,
    hydrate: async (ops) => { calls.push(`hydrateApply:${ops.length}`); },
    fetchServerXml: async () => { calls.push("fetch"); return "<xml server/>"; },
    rebase: async (xml, ops) => { calls.push(`rebase:${xml}:${ops.length}`); return { ok: true }; },
    flush: async () => { calls.push("flush"); },
    log: (event) => { calls.push(`log:${event}`); },
    ...overrides.deps,
  };
  return { deps, calls };
}

test("branch 1 (clean): no local syncState, no pending → noop, no fetch/flush", async () => {
  const { deps, calls } = makeDeps({ pending: [] });
  const result = await resolveOnEntry(deps);
  assert.equal(result.branch, "clean");
  assert.ok(!calls.includes("flush"), "clean entry does not flush");
  assert.ok(!calls.includes("fetch"), "clean entry does not fetch");
  assert.deepEqual(calls.filter((c) => c.startsWith("hydrateApply")), [], "nothing to hydrate");
});

test("branch 1 (clean): local version equals server version and no pending → noop", async () => {
  const { deps, calls } = makeDeps({ local: { sessionId: "s1", lastServerVersion: 5 }, pending: [] });
  const result = await resolveOnEntry(deps);
  assert.equal(result.branch, "clean");
  assert.ok(!calls.includes("flush"));
  assert.ok(!calls.includes("fetch"));
});

test("branch 2 (catch-up deltas): serverVersion === lastServerVersion with pending → hydrate + flush, no fetch", async () => {
  const pending = [{ opId: "op-1" }, { opId: "op-2" }];
  const { deps, calls } = makeDeps({ local: { sessionId: "s1", lastServerVersion: 5 }, pending });
  const result = await resolveOnEntry(deps);
  assert.equal(result.branch, "catch-up-deltas");
  assert.equal(result.pendingCount, 2);
  assert.ok(calls.includes("hydrateApply:2"), "pending ops hydrated into buffer");
  assert.ok(calls.includes("flush"), "catch-up goes out via normal flush");
  assert.ok(!calls.includes("fetch"), "no fetch when server has not moved");
  // гидрация — до flush (TESTS §1.4)
  assert.ok(calls.indexOf("hydrateApply:2") < calls.indexOf("flush"), "hydration precedes flush");
});

test("branch 3 (fetch+rebase): serverVersion > lastServerVersion → fetch + rebase pending + flush", async () => {
  const pending = [{ opId: "op-1" }];
  const { deps, calls } = makeDeps({
    local: { sessionId: "s1", lastServerVersion: 5 },
    pending,
    deps: { serverVersion: 8 },
  });
  const result = await resolveOnEntry(deps);
  assert.equal(result.branch, "fetch-rebase");
  assert.ok(calls.includes("fetch"));
  assert.ok(calls.includes("rebase:<xml server/>:1"), "pending ops rebased on top of server xml");
  assert.ok(calls.includes("flush"));
  assert.ok(calls.indexOf("hydrateApply:1") < calls.indexOf("rebase:<xml server/>:1"), "hydration precedes rebase");
});

test("branch 4 (conservative): serverVersion < lastServerVersion → full fetch+rebase + telemetry log", async () => {
  const pending = [{ opId: "op-1" }];
  const { deps, calls } = makeDeps({
    local: { sessionId: "s1", lastServerVersion: 9 },
    pending,
    deps: { serverVersion: 4 },
  });
  const result = await resolveOnEntry(deps);
  assert.equal(result.branch, "conservative-fetch");
  assert.ok(calls.includes("fetch"));
  assert.ok(calls.includes("rebase:<xml server/>:1"));
  assert.ok(calls.includes("flush"));
  assert.ok(calls.some((c) => c.startsWith("log:")), "impossible-version case is logged for telemetry");
});

test("missing local syncState but pending ops exist → treated as catch-up (flush deltas, no blind fetch)", async () => {
  const { deps, calls } = makeDeps({ local: null, pending: [{ opId: "op-1" }] });
  const result = await resolveOnEntry(deps);
  assert.equal(result.branch, "catch-up-deltas");
  assert.ok(calls.includes("flush"));
  assert.ok(!calls.includes("fetch"));
});

test("rebase failure is surfaced (not swallowed) so caller can degrade conservatively", async () => {
  const { deps } = makeDeps({
    local: { sessionId: "s1", lastServerVersion: 5 },
    pending: [{ opId: "op-1" }],
    deps: {
      serverVersion: 8,
      rebase: async () => ({ ok: false, error: "modeler_not_ready" }),
      flush: async () => { throw new Error("must not flush after failed rebase"); },
    },
  });
  const result = await resolveOnEntry(deps);
  assert.equal(result.branch, "fetch-rebase");
  assert.equal(result.rebaseOk, false);
});
