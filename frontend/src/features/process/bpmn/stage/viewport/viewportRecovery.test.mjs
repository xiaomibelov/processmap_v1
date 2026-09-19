import assert from "node:assert/strict";
import test from "node:test";

import { ensureVisibleOnInstance, recoverByReimport } from "./viewportRecovery.js";

function ref(initial) {
  return { current: initial };
}

function createInstance() {
  return {
    get(name) {
      if (name === "canvas") return { _container: {} };
      return null;
    },
  };
}

test("ensureVisibleOnInstance stale-guard skips stale epoch", async () => {
  const inst = createInstance();
  const staleReasons = [];
  const ctx = {
    refs: {
      activeSessionRef: ref("sid_1"),
      ensureEpochRef: ref(2),
      runtimeTokenRef: ref(7),
      ensureVisiblePromiseRef: ref(null),
      ensureVisibleCycleRef: ref(0),
      modelerRef: ref(inst),
      viewerRef: ref(null),
    },
    values: {
      sessionId: "sid_1",
      view: "diagram",
    },
    callbacks: {
      getInstanceMeta: () => ({ id: 10, containerKey: "container_1" }),
      logEnsureTrace: () => {},
      logStaleGuard: (reason) => staleReasons.push(String(reason || "")),
      getRecoveryXmlCandidate: () => "",
    },
    helpers: {},
  };

  const result = await ensureVisibleOnInstance(ctx, inst, { expectedEpoch: 1 });
  assert.equal(result?.ok, false);
  assert.equal(result?.reason, "skip_stale");
  assert.equal(result?.step, 0);
  assert.ok(staleReasons.includes("epoch_mismatch"));
});

test("ensureVisibleOnInstance dedups in-flight promise", async () => {
  const inst = createInstance();
  let waitCalls = 0;
  let resolveLayout;
  const layoutPromise = new Promise((resolve) => {
    resolveLayout = resolve;
  });

  const ctx = {
    refs: {
      activeSessionRef: ref("sid_1"),
      ensureEpochRef: ref(1),
      runtimeTokenRef: ref(3),
      ensureVisiblePromiseRef: ref(null),
      ensureVisibleCycleRef: ref(0),
      modelerRef: ref(inst),
      viewerRef: ref(null),
    },
    values: {
      sessionId: "sid_1",
      view: "diagram",
    },
    callbacks: {
      getInstanceMeta: () => ({ id: 10, containerKey: "container_1" }),
      logEnsureTrace: () => {},
      logStaleGuard: () => {},
      getRecoveryXmlCandidate: () => "",
      suppressViewboxEvents: () => {},
    },
    helpers: {
      probeCanvas: () => ({ invisible: true }),
      waitForNonZeroRect: async () => {
        waitCalls += 1;
        return await layoutPromise;
      },
    },
  };

  const p1 = ensureVisibleOnInstance(ctx, inst, { reason: "dedup_test" });
  const p2 = ensureVisibleOnInstance(ctx, inst, { reason: "dedup_test" });
  resolveLayout({ ok: false });

  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(waitCalls, 1);
  assert.equal(r1?.ok, false);
  assert.equal(r1?.reason, "layout_not_ready");
  assert.deepEqual(r2, r1);
});

test("recoverByReimport restores overlays after re-import (F1, audit H3)", async () => {
  const inst = createInstance();
  const restoreCalls = [];
  const ctx = {
    refs: {
      activeSessionRef: ref("sid_1"),
      runtimeTokenRef: ref(3),
      ensureVisibleCycleRef: ref(0),
      modelerRef: ref(inst),
      viewerRef: ref(null),
      modelerReadyRef: ref(false),
      lastModelerXmlHashRef: ref(""),
    },
    values: {
      sessionId: "sid_1",
    },
    callbacks: {
      ensureModelerRuntime: () => ({
        load: async () => ({ ok: true, token: 4 }),
        getStatus: () => ({ ready: true, defs: true, token: 4 }),
      }),
      suppressViewboxEvents: () => {},
      fnv1aHex: () => "hash",
      applyTaskTypeDecor: () => {},
      applyLinkEventDecor: () => {},
      applyHappyFlowDecor: () => {},
      applyRobotMetaDecor: () => {},
      applyBottleneckDecor: () => {},
      applyInterviewDecor: () => {},
      applyUserNotesDecor: () => {},
      applyStepTimeDecor: () => {},
      restoreOverlaysAfterReimport: (i, kind) => restoreCalls.push([i === inst ? "inst" : "other", kind]),
    },
    helpers: {},
  };

  const ok = await recoverByReimport(ctx, inst, { xmlText: "<xml/>", reason: "recover2_test" });
  assert.equal(ok, true);
  assert.deepEqual(restoreCalls, [["inst", "editor"]]);
});
