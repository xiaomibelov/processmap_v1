import assert from "node:assert/strict";
import test from "node:test";

import { createDebouncer, SEARCH_DEBOUNCE_MS } from "./debounceModel.js";

function fakeTimers() {
  const scheduled = new Map();
  let seq = 0;
  return {
    setTimeout: (fn, ms) => {
      seq += 1;
      scheduled.set(seq, { fn, ms });
      return seq;
    },
    clearTimeout: (id) => {
      scheduled.delete(id);
    },
    flush: () => {
      const due = Array.from(scheduled.values());
      scheduled.clear();
      due.forEach(({ fn }) => fn());
    },
    pendingCount: () => scheduled.size,
    lastDelay: () => Array.from(scheduled.values()).at(-1)?.ms ?? null,
  };
}

test("createDebouncer: fires once with the last value after the delay", () => {
  const timers = fakeTimers();
  const calls = [];
  const debouncer = createDebouncer((value) => calls.push(value), 300, timers);
  debouncer.push("a");
  debouncer.push("ab");
  debouncer.push("abc");
  assert.equal(timers.pendingCount(), 1);
  assert.equal(timers.lastDelay(), 300);
  timers.flush();
  assert.deepEqual(calls, ["abc"]);
  assert.equal(debouncer.isPending(), false);
});

test("createDebouncer: isPending reflects scheduled state and cancel drops the call", () => {
  const timers = fakeTimers();
  const calls = [];
  const debouncer = createDebouncer((value) => calls.push(value), 300, timers);
  assert.equal(debouncer.isPending(), false);
  debouncer.push("x");
  assert.equal(debouncer.isPending(), true);
  debouncer.cancel();
  assert.equal(debouncer.isPending(), false);
  timers.flush();
  assert.deepEqual(calls, []);
});

test("createDebouncer: raw values pass through untouched (no trimming)", () => {
  const timers = fakeTimers();
  const calls = [];
  const debouncer = createDebouncer((value) => calls.push(value), 100, timers);
  debouncer.push("  spaced  ");
  timers.flush();
  assert.deepEqual(calls, ["  spaced  "]);
});

test("createDebouncer: SEARCH_DEBOUNCE_MS is 300 and invalid delay falls back", () => {
  assert.equal(SEARCH_DEBOUNCE_MS, 300);
  const timers = fakeTimers();
  const debouncer = createDebouncer(() => {}, Number.NaN, timers);
  debouncer.push("q");
  assert.equal(timers.lastDelay(), 300);
});
