import test from "node:test";
import assert from "node:assert/strict";

import { createOpsRemoteApply } from "./opsRemoteApply.js";

// ---------------------------------------------------------------------------
// Контур feature/async-save-pipeline-step2 (TESTS §1.5, UI.md §4).
// ops_committed-consumer: фильтры (own actor / opId-дубль / stale version),
// remote apply с __pmOpSource:"remote" (echo suppression), LWW-детект →
// «предложенные изменения» (proposed store), full:true / fuzzy-fail →
// консервативный fetch+rebase, seenServerVersion = event.version (tracker +
// crossTab publish через adopt), затем flushNow.
// ---------------------------------------------------------------------------

function makeDeps(overrides = {}) {
  const calls = [];
  const proposed = [];
  const pending = overrides.pending ? [...overrides.pending] : [];
  const applyLog = [];
  const deps = {
    sessionId: "s1",
    ownClientId: "me",
    journal: {
      getAllBySession: async () => overrides.journalOps || [],
      putProposed: async (record) => { proposed.push(record); calls.push(`proposed:${record.elementId}`); },
      listProposed: async () => [],
      resolveProposed: async () => {},
    },
    getSeenServerVersion: () => (overrides.seen ?? 7),
    getModeler: () => ({ get: () => null }),
    getPendingOps: () => pending.map((op) => ({ ...op })),
    removePendingOps: (opIds) => {
      calls.push(`remove:${[...opIds].join(",")}`);
      const removed = [];
      for (let i = pending.length - 1; i >= 0; i -= 1) {
        if (opIds.includes(pending[i].opId)) {
          removed.unshift(pending[i]);
          pending.splice(i, 1);
        }
      }
      return removed.map((op) => ({ ...op }));
    },
    applyRemoteOps: overrides.applyRemoteOps || (async (ops) => {
      applyLog.push(ops.map((op) => op.opId));
      calls.push(`apply:${ops.length}`);
      return { ok: true, applied: ops.length, failed: 0, results: ops.map((op) => ({ opId: op.opId, ok: true })) };
    }),
    replayPendingOps: async (ops) => {
      calls.push(`replay:${ops.map((op) => op.opId).join(",")}`);
      return { ok: true, applied: ops.length, failed: 0, results: [] };
    },
    fetchServerXml: async () => { calls.push("fetch"); return { ok: true, xml: "<server-xml/>" }; },
    rebaseOnServerXml: async (xml, ops) => {
      calls.push(`rebase:${xml}:${ops.length}`);
      return { ok: true };
    },
    flushNow: async (options) => { calls.push(`flush:${options?.reason}`); },
    adoptServerVersion: (version) => { calls.push(`adopt:${version}`); },
    onProposed: (records) => { calls.push(`notify:${records.length}`); },
    now: () => 500,
    uuid: (() => { let n = 0; return () => `pp-${++n}`; })(),
    log: () => {},
    ...overrides.deps,
  };
  return { deps, calls, proposed, pending, applyLog };
}

function event(overrides = {}) {
  return {
    type: "ops_committed",
    data: {
      session_id: "s1",
      version: 9,
      operations: [{ opId: "r1", type: "element.updateProperties", elementId: "Task_1", properties: { name: "Чужое" } }],
      actor_client_id: "other",
      full: false,
      at: 123,
      ...overrides,
    },
  };
}

test("own event (actor_client_id === ownClientId) → ignored, no apply/flush", async () => {
  const { deps, calls } = makeDeps();
  const consumer = createOpsRemoteApply(deps);
  const result = await consumer.handleEvent(event({ actor_client_id: "me" }));
  assert.equal(result.ignored, "own");
  assert.ok(!calls.includes("apply:1"));
  assert.ok(!calls.some((c) => c.startsWith("flush")));
});

test("all opIds already in journal (own echo without actor match) → ignored", async () => {
  const { deps, calls } = makeDeps({ journalOps: [{ opId: "r1", sessionId: "s1" }] });
  const consumer = createOpsRemoteApply(deps);
  const result = await consumer.handleEvent(event());
  assert.equal(result.ignored, "own-op-echo");
  assert.ok(!calls.some((c) => c.startsWith("apply")));
});

test("stale version (<= seenServerVersion) → ignored", async () => {
  const { deps, calls } = makeDeps({ seen: 9 });
  const consumer = createOpsRemoteApply(deps);
  const result = await consumer.handleEvent(event({ version: 9 }));
  assert.equal(result.ignored, "stale");
  assert.ok(!calls.some((c) => c.startsWith("apply")));
});

test("event for another session → ignored", async () => {
  const { deps } = makeDeps();
  const consumer = createOpsRemoteApply(deps);
  const result = await consumer.handleEvent(event({ session_id: "s2" }));
  assert.equal(result.ignored, "foreign-session");
});

test("remote apply: incoming ops applied, remaining pending replayed, version adopted, flush", async () => {
  const { deps, calls } = makeDeps({
    pending: [{ opId: "op-1", type: "shape.move", elementId: "Task_2", delta: { x: 1, y: 1 } }],
  });
  const consumer = createOpsRemoteApply(deps);
  const result = await consumer.handleEvent(event());
  assert.equal(result.applied, "remote-ops");
  assert.deepEqual(
    calls.filter((c) => c.startsWith("apply:")),
    ["apply:1"],
    "incoming ops applied to live model",
  );
  assert.deepEqual(calls.filter((c) => c.startsWith("replay:")), ["replay:op-1"], "remaining pending rebased over updated model");
  assert.ok(calls.includes("adopt:9"), "seenServerVersion = event.version");
  assert.ok(calls.includes("flush:remote"), "flushNow after convergence step");
});

test("LWW detect: incoming op on pending elementId → loser pending op moves to proposed, winner applied", async () => {
  const pending = [
    { opId: "op-1", type: "element.updateProperties", elementId: "Task_1", properties: { name: "Моё" } },
    { opId: "op-2", type: "shape.move", elementId: "Task_2", delta: { x: 5, y: 0 } },
  ];
  const { deps, calls, proposed } = makeDeps({ pending });
  const consumer = createOpsRemoteApply(deps);
  const result = await consumer.handleEvent(event());
  assert.equal(result.applied, "remote-ops");
  assert.equal(result.lwwCount, 1);
  assert.deepEqual(calls.filter((c) => c.startsWith("remove:")), ["remove:op-1"], "losing pending op extracted from buffer");
  assert.equal(proposed.length, 1, "loser moved to proposed store");
  assert.equal(proposed[0].elementId, "Task_1");
  assert.equal(proposed[0].opType, "element.updateProperties");
  assert.equal(proposed[0].conflictVersion, 9);
  assert.equal(proposed[0].sessionId, "s1");
  assert.ok(calls.includes("notify:1"), "panel/toast notified");
  // Победившая чужая op применена, проигравшая наша НЕ replay'ится.
  assert.deepEqual(calls.filter((c) => c.startsWith("replay:")), ["replay:op-2"], "only non-conflicting pending rebased");
  assert.ok(calls.includes("flush:remote"));
});

test("full:true → fetch + rebase pending over server XML, no direct apply", async () => {
  const { deps, calls } = makeDeps({
    pending: [{ opId: "op-1", type: "shape.move", elementId: "Task_2", delta: { x: 1, y: 1 } }],
  });
  const consumer = createOpsRemoteApply(deps);
  const result = await consumer.handleEvent(event({ full: true, operations: [] }));
  assert.equal(result.applied, "full-rebase");
  assert.ok(!calls.some((c) => c.startsWith("apply:")), "no direct apply on full event");
  assert.deepEqual(calls.filter((c) => c.startsWith("rebase:")), ["rebase:<server-xml/>:1"]);
  assert.ok(calls.includes("adopt:9"));
  assert.ok(calls.includes("flush:remote"));
});

test("fuzzy-fail apply → conservative fetch+rebase (same path as full)", async () => {
  const { deps, calls } = makeDeps({
    pending: [{ opId: "op-1", type: "shape.move", elementId: "Task_2", delta: { x: 1, y: 1 } }],
    applyRemoteOps: async () => ({
      ok: false,
      applied: 0,
      failed: 1,
      results: [{ opId: "r1", ok: false, fuzzyMiss: true }],
    }),
  });
  const consumer = createOpsRemoteApply(deps);
  const result = await consumer.handleEvent(event());
  assert.equal(result.applied, "full-rebase");
  assert.deepEqual(calls.filter((c) => c.startsWith("rebase:")), ["rebase:<server-xml/>:1"]);
  assert.ok(calls.includes("adopt:9"));
});

test("modeler not ready → event not applied and version NOT adopted (no silent loss)", async () => {
  const { deps, calls } = makeDeps({
    deps: {
      getModeler: () => null,
      applyRemoteOps: async () => ({ ok: false, error: "modeler_not_ready" }),
      rebaseOnServerXml: async () => ({ ok: false, error: "modeler_not_ready" }),
    },
  });
  const consumer = createOpsRemoteApply(deps);
  const result = await consumer.handleEvent(event());
  assert.equal(result.applied, false);
  assert.ok(!calls.some((c) => c.startsWith("adopt")), "version not adopted — remote delta not lost");
});

test("rebase failure is surfaced (ok:false) so wiring can degrade conservatively", async () => {
  const { deps } = makeDeps({
    deps: { rebaseOnServerXml: async () => ({ ok: false, error: "reload-failed" }) },
  });
  const consumer = createOpsRemoteApply(deps);
  const result = await consumer.handleEvent(event({ full: true, operations: [] }));
  assert.equal(result.applied, "full-rebase");
  assert.equal(result.rebaseOk, false);
});
