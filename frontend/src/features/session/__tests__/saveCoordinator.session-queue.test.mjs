import test from "node:test";
import assert from "node:assert/strict";

import { saveCoordinator } from "../saveCoordinator.js";
import { __resetForTests as resetCasVersionTracker } from "../../../lib/casVersionTracker.js";

test.beforeEach(() => {
  saveCoordinator.clearSession();
  resetCasVersionTracker();
});

function makeDeferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

test("saveCoordinator: pipelines of the SAME session run sequentially (single-writer queue)", async () => {
  const gate = makeDeferred();
  let inFlight = 0;
  let maxInFlight = 0;
  const order = [];

  saveCoordinator.registerPipeline("test_q_meta", {
    transport: async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      order.push("meta:start");
      await gate.promise;
      inFlight -= 1;
      order.push("meta:end");
      return { ok: true, diagram_state_version: 1 };
    },
    retryCount: 0,
    debounceMs: 0,
  });
  saveCoordinator.registerPipeline("test_q_xml", {
    transport: async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      order.push("xml:start");
      inFlight -= 1;
      order.push("xml:end");
      return { ok: true, diagram_state_version: 2 };
    },
    retryCount: 0,
    debounceMs: 0,
  });

  const p1 = saveCoordinator.execute("test_q_meta", { sessionId: "sid_queue" });
  const p2 = saveCoordinator.execute("test_q_xml", { sessionId: "sid_queue" });

  // Даём event loop тикнуть: xml НЕ должен стартовать, пока meta в полёте.
  await new Promise((res) => setTimeout(res, 25));
  assert.deepEqual(order, ["meta:start"], "second pipeline started before first finished");
  gate.resolve();
  await Promise.all([p1, p2]);

  assert.equal(maxInFlight, 1, "parallel in-flight saves detected for one session");
  assert.deepEqual(order, ["meta:start", "meta:end", "xml:start", "xml:end"]);
});

test("saveCoordinator: DIFFERENT sessions still run in parallel", async () => {
  const gateA = makeDeferred();
  const started = [];

  saveCoordinator.registerPipeline("test_q_par", {
    transport: async (sessionId) => {
      started.push(sessionId);
      await gateA.promise;
      return { ok: true, diagram_state_version: 1 };
    },
    retryCount: 0,
    debounceMs: 0,
  });

  const p1 = saveCoordinator.execute("test_q_par", { sessionId: "sid_par_a" });
  const p2 = saveCoordinator.execute("test_q_par", { sessionId: "sid_par_b" });

  await new Promise((res) => setTimeout(res, 25));
  assert.deepEqual(started.sort(), ["sid_par_a", "sid_par_b"], "different sessions must not block each other");
  gateA.resolve();
  await Promise.all([p1, p2]);
});
