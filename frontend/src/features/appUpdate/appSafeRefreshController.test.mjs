import assert from "node:assert/strict";
import test from "node:test";

import {
  __resetAppSafeRefreshForTests,
  getCurrentAppRefreshRisk,
  registerAppSafeRefreshHandler,
  runSafeRefreshBeforeReload,
  subscribeAppSafeRefresh,
} from "./appSafeRefreshController.js";

test("safe refresh allows reload when no ProcessStage handler is active", async () => {
  __resetAppSafeRefreshForTests();

  assert.deepEqual(getCurrentAppRefreshRisk(), { status: "clean", message: "" });
  assert.deepEqual(await runSafeRefreshBeforeReload(), { ok: true, status: "clean", message: "" });
});

test("safe refresh allows clean handler without flushing", async () => {
  __resetAppSafeRefreshForTests();
  let flushCalls = 0;
  registerAppSafeRefreshHandler({
    getRisk: () => ({ status: "clean" }),
    flush: async () => {
      flushCalls += 1;
      return { ok: true, status: "saved" };
    },
  });

  assert.equal((await runSafeRefreshBeforeReload()).ok, true);
  assert.equal(flushCalls, 0);
});

test("safe refresh flushes dirty handler and forwards app update reason", async () => {
  __resetAppSafeRefreshForTests();
  let seenReason = "";
  registerAppSafeRefreshHandler({
    getRisk: () => ({ status: "dirty" }),
    flush: async ({ reason }) => {
      seenReason = reason;
      return { ok: true, status: "saved" };
    },
  });

  assert.deepEqual(await runSafeRefreshBeforeReload(), { ok: true, status: "saved", message: "" });
  assert.equal(seenReason, "app_update_refresh");
});

test("safe refresh treats clean skip as reloadable", async () => {
  __resetAppSafeRefreshForTests();
  registerAppSafeRefreshHandler({
    getRisk: () => ({ status: "dirty" }),
    flush: async () => ({ ok: true, skipped: true }),
  });

  assert.deepEqual(await runSafeRefreshBeforeReload(), { ok: true, status: "clean", message: "" });
});

test("safe refresh blocks failure, conflict, and timeout results", async () => {
  __resetAppSafeRefreshForTests();
  registerAppSafeRefreshHandler({
    getRisk: () => ({ status: "dirty" }),
    flush: async () => ({ ok: false, status: "conflict", message: "conflict" }),
  });
  assert.deepEqual(await runSafeRefreshBeforeReload(), { ok: false, status: "conflict", message: "conflict" });

  __resetAppSafeRefreshForTests();
  registerAppSafeRefreshHandler({
    getRisk: () => ({ status: "dirty" }),
    flush: async () => ({ ok: false, status: "timeout", error: "slow" }),
  });
  assert.deepEqual(await runSafeRefreshBeforeReload(), { ok: false, status: "timeout", message: "slow" });

  __resetAppSafeRefreshForTests();
  registerAppSafeRefreshHandler({
    getRisk: () => ({ status: "failed", message: "failed" }),
    flush: async () => ({ ok: true, status: "saved" }),
  });
  assert.deepEqual(await runSafeRefreshBeforeReload(), { ok: false, status: "failed", message: "failed" });
});

test("safe refresh subscriptions fire on register and unregister", () => {
  __resetAppSafeRefreshForTests();
  let calls = 0;
  const unsubscribe = subscribeAppSafeRefresh(() => {
    calls += 1;
  });
  const unregister = registerAppSafeRefreshHandler({
    getRisk: () => ({ status: "clean" }),
    flush: async () => ({ ok: true, status: "clean" }),
  });

  assert.equal(calls, 1);
  unregister();
  assert.equal(calls, 2);
  unsubscribe();
});
