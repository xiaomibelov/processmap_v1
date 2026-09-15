import test from "node:test";
import assert from "node:assert/strict";

import {
  applyChunks,
  createDebouncedDiff,
  planMarkerChunks,
} from "./bpmnVersionDiffPerf.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("createDebouncedDiff calls compute once after delay", async () => {
  let calls = 0;
  const debounced = createDebouncedDiff(() => {
    calls += 1;
    return "result";
  }, { delayMs: 30 });

  let received = null;
  debounced.schedule(["a", "b"], (err, result) => {
    assert.equal(err, null);
    received = result;
  });
  assert.equal(calls, 0, "compute must not run synchronously");
  await sleep(60);
  assert.equal(calls, 1);
  assert.equal(received, "result");
});

test("createDebouncedDiff re-schedule resets the timer", async () => {
  let calls = 0;
  const debounced = createDebouncedDiff(() => {
    calls += 1;
  }, { delayMs: 50 });

  debounced.schedule(["a"], () => {});
  await sleep(30);
  debounced.schedule(["b"], () => {});
  await sleep(30);
  assert.equal(calls, 0, "first timer must be cancelled by re-schedule");
  await sleep(40);
  assert.equal(calls, 1, "only the last schedule fires");
});

test("createDebouncedDiff cancel prevents the pending call", async () => {
  let calls = 0;
  const debounced = createDebouncedDiff(() => {
    calls += 1;
  }, { delayMs: 20 });
  debounced.schedule(["a"], () => {});
  debounced.cancel();
  await sleep(50);
  assert.equal(calls, 0);
});

test("createDebouncedDiff default delay is 300 ms", async () => {
  let calls = 0;
  const debounced = createDebouncedDiff(() => {
    calls += 1;
  });
  debounced.schedule(["a"], () => {});
  await sleep(150);
  assert.equal(calls, 0);
  await sleep(250);
  assert.equal(calls, 1);
});

test("createDebouncedDiff passes the pair to compute", async () => {
  const seen = [];
  const debounced = createDebouncedDiff((pair) => {
    seen.push(pair);
    return { ok: true };
  }, { delayMs: 10 });
  debounced.schedule({ a: 1, b: 2 }, () => {});
  await sleep(40);
  assert.deepEqual(seen, [{ a: 1, b: 2 }]);
});

test("planMarkerChunks returns a single chunk when ids fit the threshold", () => {
  const ids = Array.from({ length: 100 }, (_, i) => `id-${i}`);
  const chunks = planMarkerChunks(ids);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].length, 100);
});

test("planMarkerChunks splits 101 ids into 50/50/1 with defaults", () => {
  const ids = Array.from({ length: 101 }, (_, i) => `id-${i}`);
  const chunks = planMarkerChunks(ids);
  assert.deepEqual(chunks.map((c) => c.length), [50, 50, 1]);
});

test("planMarkerChunks honours custom chunkSize and threshold", () => {
  const ids = Array.from({ length: 60 }, (_, i) => `id-${i}`);
  const chunks = planMarkerChunks(ids, { chunkSize: 50, threshold: 50 });
  assert.deepEqual(chunks.map((c) => c.length), [50, 10]);
});

test("planMarkerChunks returns empty array for empty ids", () => {
  assert.deepEqual(planMarkerChunks([]), []);
});

test("planMarkerChunks does not alias the input array", () => {
  const ids = ["a", "b"];
  const chunks = planMarkerChunks(ids, { threshold: 1, chunkSize: 1 });
  assert.equal(chunks.length, 2);
  chunks[0][0] = "mutated";
  assert.equal(ids[0], "a");
});

test("applyChunks drains all chunks through the injected scheduler", () => {
  const pending = [];
  const fakeScheduler = (cb) => pending.push(cb);

  const applied = [];
  const chunks = planMarkerChunks(Array.from({ length: 120 }, (_, i) => i), {
    chunkSize: 50,
    threshold: 100,
  });
  const cancel = applyChunks(chunks, (chunk, index) => {
    applied.push({ chunk: chunk.slice(), index });
  }, fakeScheduler);

  let guard = 0;
  while (pending.length && guard < 20) {
    const cb = pending.shift();
    cb();
    guard += 1;
  }

  assert.equal(applied.length, 3);
  assert.deepEqual(applied.map((a) => a.chunk.length), [50, 50, 20]);
  assert.deepEqual(applied.map((a) => a.index), [0, 1, 2]);
  assert.equal(pending.length, 0, "no extra frame scheduled after the last chunk");
  assert.equal(typeof cancel, "function");
});

test("applyChunks cancel stops remaining chunks", () => {
  const pending = [];
  const fakeScheduler = (cb) => pending.push(cb);
  const applied = [];
  const chunks = [[1], [2], [3]];
  const cancel = applyChunks(chunks, (chunk) => applied.push(chunk[0]), fakeScheduler);

  pending.shift()();
  cancel();
  while (pending.length) pending.shift()();

  assert.deepEqual(applied, [1]);
});

test("applyChunks works with empty chunks", () => {
  const pending = [];
  const fakeScheduler = (cb) => pending.push(cb);
  const applied = [];
  applyChunks([], (chunk) => applied.push(chunk), fakeScheduler);
  assert.deepEqual(applied, []);
  assert.equal(pending.length, 0);
});
