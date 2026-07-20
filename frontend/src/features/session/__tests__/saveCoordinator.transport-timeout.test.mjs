import test from "node:test";
import assert from "node:assert/strict";

import { createSaveCoordinator } from "../saveCoordinator.js";

function installTimerSpy() {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const active = new Set();
  let clearedCount = 0;

  globalThis.setTimeout = (callback, delay, ...args) => {
    const realHandle = originalSetTimeout(() => {
      active.delete(wrapper);
      callback(...args);
    }, delay);
    const wrapper = {
      _real: realHandle,
      unref() {
        if (typeof realHandle.unref === "function") realHandle.unref();
        return this;
      },
    };
    active.add(wrapper);
    return wrapper;
  };

  globalThis.clearTimeout = (handle) => {
    if (active.has(handle)) {
      active.delete(handle);
      clearedCount += 1;
    }
    return originalClearTimeout(handle?._real ?? handle);
  };

  return {
    activeCount: () => active.size,
    clearedCount: () => clearedCount,
    restore: () => {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    },
  };
}

test("fast transport clears its timeout timer instead of leaking it", async () => {
  const timers = installTimerSpy();
  try {
    const c = createSaveCoordinator();
    c.registerPipeline("fast", {
      debounceMs: 0,
      transportTimeoutMs: 1000,
      transport: async () => ({ ok: true, status: 200 }),
      onSuccess: () => {},
    });

    const result = await c.execute("fast", { sessionId: "s1" });

    assert.equal(result.ok, true);
    assert.ok(timers.clearedCount() >= 1, "timeout timer should be cleared after transport wins");
    assert.equal(timers.activeCount(), 0, "no active transport timers should leak");
  } finally {
    timers.restore();
  }
});
