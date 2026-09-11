import test from "node:test";
import assert from "node:assert/strict";

import { createSaveCoordinator } from "../saveCoordinator.js";

// Regression: the xml pipeline transport (coordinator flushSave → saveRaw)
// executes the rawXml pipeline from INSIDE the running xml transport. With a
// shared per-session queue the nested rawXml run chains behind the still
// pending xml run: xml waits for its transport, transport waits for rawXml,
// rawXml waits for xml — a cross-pipeline deadlock that surfaced as a
// transport timeout (10s/60s), a CAS rollback and a lost local edit.
test("nested execute from within a transport does not deadlock", async () => {
  const c = createSaveCoordinator();
  const order = [];
  c.registerPipeline("rawXml", {
    debounceMs: 0,
    transport: async () => {
      order.push("rawXml:start");
      return { ok: true, status: 200 };
    },
    onSuccess: () => {},
  });
  c.registerPipeline("xml", {
    debounceMs: 0,
    transportTimeoutMs: 200,
    transport: async (sessionId) => {
      order.push("xml:start");
      const nested = await c.execute("rawXml", { sessionId });
      order.push("xml:nested-done");
      return nested?.ok ? { ok: true, status: 200 } : { ok: false, status: 0, error: "nested failed" };
    },
    onSuccess: () => {},
    onError: () => {},
  });

  const result = await Promise.race([
    c.execute("xml", { sessionId: "s1" }),
    new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: "deadlock:queue" }), 5000)),
  ]);

  assert.notEqual(result.error, "deadlock:queue", "nested execute deadlocked the shared session queue");
  assert.equal(result.ok, true, `expected nested save to succeed, got ${JSON.stringify(result)}`);
  assert.deepEqual(order, ["xml:start", "rawXml:start", "xml:nested-done"]);
});

// Per-pipeline queues still serialize concurrent runs of the SAME pipeline
// for one session (single-writer per lane).
test("same-pipeline runs for one session stay serialized", async () => {
  const c = createSaveCoordinator();
  const order = [];
  c.registerPipeline("rawXml", {
    debounceMs: 0,
    transport: async () => {
      order.push("start");
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push("end");
      return { ok: true };
    },
    onSuccess: () => {},
  });

  await Promise.all([
    c.execute("rawXml", { sessionId: "s1" }),
    c.execute("rawXml", { sessionId: "s1" }),
  ]);

  assert.deepEqual(order, ["start", "end", "start", "end"]);
});
