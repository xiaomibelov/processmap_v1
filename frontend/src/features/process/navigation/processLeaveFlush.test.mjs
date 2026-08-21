import assert from "node:assert/strict";
import test from "node:test";

import {
  attachProcessStageFlushBeforeLeaveListener,
  requestProcessStageFlushBeforeLeave,
} from "./processLeaveFlush.js";

function createWindowMock() {
  const bus = new EventTarget();
  const CustomEventImpl = typeof CustomEvent === "function"
    ? CustomEvent
    : class CustomEventPolyfill extends Event {
      constructor(type, init = {}) {
        super(type, init);
        this.detail = init.detail;
      }
    };
  return {
    addEventListener: (...args) => bus.addEventListener(...args),
    removeEventListener: (...args) => bus.removeEventListener(...args),
    dispatchEvent: (...args) => bus.dispatchEvent(...args),
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (...args) => clearTimeout(...args),
    CustomEvent: CustomEventImpl,
  };
}

test("requestProcessStageFlushBeforeLeave resolves with listener response", async () => {
  const prevWindow = globalThis.window;
  const mockWindow = createWindowMock();
  const prevCustomEvent = globalThis.CustomEvent;
  globalThis.window = mockWindow;
  globalThis.CustomEvent = mockWindow.CustomEvent;
  const detach = attachProcessStageFlushBeforeLeaveListener(async ({ sessionId, reason }) => ({
    ok: true,
    sessionId,
    reason,
  }));
  try {
    const result = await requestProcessStageFlushBeforeLeave({
      sessionId: "sid_1",
      reason: "unit_test",
      timeoutMs: 1200,
    });
    assert.equal(result.ok, true);
    assert.equal(result.sessionId, "sid_1");
    assert.equal(result.reason, "unit_test");
  } finally {
    detach();
    globalThis.window = prevWindow;
    globalThis.CustomEvent = prevCustomEvent;
  }
});

test("requestProcessStageFlushBeforeLeave returns timeout without active listener", async () => {
  const prevWindow = globalThis.window;
  const mockWindow = createWindowMock();
  const prevCustomEvent = globalThis.CustomEvent;
  globalThis.window = mockWindow;
  globalThis.CustomEvent = mockWindow.CustomEvent;
  try {
    const result = await requestProcessStageFlushBeforeLeave({
      sessionId: "sid_2",
      reason: "timeout_case",
      timeoutMs: 320,
    });
    assert.equal(result.ok, false);
    assert.equal(result.timeout, true);
  } finally {
    globalThis.window = prevWindow;
    globalThis.CustomEvent = prevCustomEvent;
  }
});
