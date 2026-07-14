import test from "node:test";
import assert from "node:assert/strict";

import {
  createSaveCoordinator,
  saveCoordinator,
} from "../saveCoordinator.js";

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

test("createSaveCoordinator is defined and exposes required API", () => {
  const c = createSaveCoordinator();
  assert.equal(typeof c.registerPipeline, "function");
  assert.equal(typeof c.execute, "function");
  assert.equal(typeof c.executeBatch, "function");
  assert.equal(typeof c.getStatus, "function");
  assert.equal(typeof c.getGlobalStatus, "function");
  assert.equal(typeof c.subscribe, "function");
  assert.equal(typeof c.unsubscribe, "function");
  assert.equal(typeof c.hasUnsavedChanges, "function");
});

test("saveCoordinator singleton is a coordinator instance", () => {
  assert.equal(typeof saveCoordinator.execute, "function");
});

test("execute calls transport with built payload and returns its result", async () => {
  const c = createSaveCoordinator();
  const calls = [];
  c.registerPipeline("ping", {
    transport: async (sessionId, payload) => {
      calls.push({ sessionId, payload });
      return { ok: true, status: 200, echoed: payload.value };
    },
    buildPayload: ({ value }) => ({ value: value * 2 }),
    onSuccess: () => {},
  });

  const result = await c.execute("ping", { sessionId: "s1", value: 3 });

  assert.equal(result.ok, true);
  assert.equal(result.echoed, 6);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].sessionId, "s1");
  assert.deepEqual(calls[0].payload, { value: 6 });
});

test("getBaseVersion adds base_diagram_state_version to payload", async () => {
  const c = createSaveCoordinator();
  const calls = [];
  c.registerPipeline("meta", {
    transport: async (sessionId, payload) => {
      calls.push(payload);
      return { ok: true, status: 200, session: { diagram_state_version: 5 } };
    },
    buildPayload: ({ patch }) => ({ ...patch }),
    getBaseVersion: () => 4,
    onSuccess: (res) => res,
  });

  await c.execute("meta", { sessionId: "s1", patch: { bpmn_meta: {} } });

  assert.equal(calls[0].base_diagram_state_version, 4);
});

test("queues concurrent saves for the same session", async () => {
  const c = createSaveCoordinator();
  const order = [];
  c.registerPipeline("slow", {
    debounceMs: 0,
    transport: async () => {
      order.push("start");
      await sleep(10);
      order.push("end");
      return { ok: true };
    },
    onSuccess: () => {},
  });

  const p1 = c.execute("slow", { sessionId: "s1" });
  const p2 = c.execute("slow", { sessionId: "s1" });
  await Promise.all([p1, p2]);

  assert.deepEqual(order, ["start", "end", "start", "end"]);
});

test("allows concurrent saves for different sessions", async () => {
  const c = createSaveCoordinator();
  const order = [];
  c.registerPipeline("slow", {
    transport: async () => {
      order.push("start");
      await sleep(10);
      order.push("end");
      return { ok: true };
    },
    onSuccess: () => {},
  });

  const p1 = c.execute("slow", { sessionId: "s1" });
  const p2 = c.execute("slow", { sessionId: "s2" });
  await Promise.all([p1, p2]);

  assert.equal(order.filter((x) => x === "start").length, 2);
  assert.equal(order.filter((x) => x === "end").length, 2);
});

test("debounce coalesces rapid calls into one execution", async () => {
  const c = createSaveCoordinator();
  const calls = [];
  c.registerPipeline("d", {
    debounceMs: 30,
    transport: async (sessionId, payload) => {
      calls.push(payload.value);
      return { ok: true, status: 200 };
    },
    onSuccess: () => {},
  });

  c.execute("d", { sessionId: "s1", value: 1 });
  c.execute("d", { sessionId: "s1", value: 2 });
  c.execute("d", { sessionId: "s1", value: 3 });

  await sleep(80);

  assert.deepEqual(calls, [3]);
});

test("retry with exponential backoff up to retryCount attempts", async () => {
  const c = createSaveCoordinator();
  const starts = [];
  let attempts = 0;
  c.registerPipeline("flaky", {
    retryCount: 2,
    retryDelayMs: 5,
    transport: async () => {
      starts.push(Date.now());
      attempts += 1;
      if (attempts < 3) {
        return { ok: false, status: 500, error: "boom" };
      }
      return { ok: true, status: 200 };
    },
    onSuccess: () => {},
    onError: () => {},
  });

  const result = await c.execute("flaky", { sessionId: "s1" });

  assert.equal(result.ok, true);
  assert.equal(attempts, 3);
  assert.equal(starts.length, 3);
  const gaps = [starts[1] - starts[0], starts[2] - starts[1]];
  assert.ok(gaps[0] >= 4 && gaps[0] <= 40, `gap0=${gaps[0]}`);
  assert.ok(gaps[1] >= 8 && gaps[1] <= 60, `gap1=${gaps[1]}`);
});

test("409 conflict stops retry and calls on409", async () => {
  const c = createSaveCoordinator();
  let attempts = 0;
  const on409Calls = [];
  c.registerPipeline("conf", {
    retryCount: 3,
    retryDelayMs: 5,
    transport: async () => {
      attempts += 1;
      return { ok: false, status: 409, error: "conflict" };
    },
    onSuccess: () => {},
    on409: (response, sessionId) => {
      on409Calls.push({ response, sessionId });
    },
    onError: () => {},
  });

  const result = await c.execute("conf", { sessionId: "s1" });

  assert.equal(attempts, 1);
  assert.equal(result.status, 409);
  assert.equal(on409Calls.length, 1);
  assert.equal(on409Calls[0].sessionId, "s1");
});

test("emits status, success, error and conflict events", async () => {
  const c = createSaveCoordinator();
  const events = [];
  c.subscribe((event, data) => events.push({ event, data }));
  c.registerPipeline("ev", {
    retryCount: 1,
    retryDelayMs: 5,
    transport: async (sessionId, payload) => {
      if (payload.failOnce) {
        return { ok: false, status: 500 };
      }
      if (payload.conflict) {
        return { ok: false, status: 409 };
      }
      return { ok: true, status: 200 };
    },
    onSuccess: () => {},
    on409: () => {},
    onError: () => {},
  });

  await c.execute("ev", { sessionId: "s1", failOnce: true });
  await c.execute("ev", { sessionId: "s1", conflict: true });
  await c.execute("ev", { sessionId: "s1" });

  const statusEvents = events.filter((e) => e.event === "status");
  assert.ok(statusEvents.length >= 6, JSON.stringify(events));
  assert.ok(events.some((e) => e.event === "error" && e.data.sessionId === "s1"));
  assert.ok(events.some((e) => e.event === "conflict" && e.data.sessionId === "s1"));
  assert.ok(events.some((e) => e.event === "success" && e.data.sessionId === "s1"));
});

test("executeBatch runs pipelines sequentially", async () => {
  const c = createSaveCoordinator();
  const order = [];
  c.registerPipeline("a", {
    transport: async (sessionId, payload) => {
      order.push(`a:${payload.value}`);
      await sleep(5);
      return { ok: true, status: 200 };
    },
    onSuccess: () => {},
  });
  c.registerPipeline("b", {
    transport: async (sessionId, payload) => {
      order.push(`b:${payload.value}`);
      await sleep(5);
      return { ok: true, status: 200 };
    },
    onSuccess: () => {},
  });

  await c.executeBatch(["a", "b"], {
    a: { sessionId: "s1", value: 1 },
    b: { sessionId: "s1", value: 2 },
  });

  assert.deepEqual(order, ["a:1", "b:2"]);
});

test("hasUnsavedChanges reflects pending debounce and running queue", async () => {
  const c = createSaveCoordinator();
  c.registerPipeline("delayed", {
    debounceMs: 100,
    transport: async () => {
      await sleep(10);
      return { ok: true };
    },
    onSuccess: () => {},
  });

  assert.equal(c.hasUnsavedChanges(), false);
  c.execute("delayed", { sessionId: "s1" });
  assert.equal(c.hasUnsavedChanges(), true);
  await sleep(130);
  assert.equal(c.hasUnsavedChanges(), false);
});

test("unsubscribe removes listener", async () => {
  const c = createSaveCoordinator();
  const events = [];
  const handler = (event, data) => events.push({ event, data });
  c.subscribe(handler);
  c.registerPipeline("x", {
    transport: async () => ({ ok: true }),
    onSuccess: () => {},
  });
  c.unsubscribe(handler);
  await c.execute("x", { sessionId: "s1" });
  assert.equal(events.length, 0);
});
