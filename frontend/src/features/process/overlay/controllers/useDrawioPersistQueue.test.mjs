import test from "node:test";
import assert from "node:assert/strict";

import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import { act } from "react";
import React from "react";

import useDrawioPersistQueue from "./useDrawioPersistQueue.js";

function installThenSpy() {
  const originalThen = Promise.prototype.then;
  let count = 0;
  Promise.prototype.then = function thenSpy(onFulfilled, onRejected) {
    count += 1;
    return originalThen.call(this, onFulfilled, onRejected);
  };
  return {
    count: () => count,
    restore: () => {
      Promise.prototype.then = originalThen;
    },
  };
}

function renderHook(factory) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>");
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  const container = document.getElementById("root");
  const resultRef = { current: null };
  function TestComponent() {
    resultRef.current = factory();
    return null;
  }
  const root = createRoot(container);
  act(() => root.render(React.createElement(TestComponent)));
  return {
    result: resultRef,
    cleanup: () => {
      act(() => root.unmount());
      dom.window.close();
    },
  };
}

test("persist queue is bounded and does not grow an unbounded promise chain", async () => {
  const spy = installThenSpy();
  const persistDrawioMeta = async (meta, options) => ({ ok: true, meta, source: options?.source });

  const { result, cleanup } = renderHook(() => useDrawioPersistQueue({
    normalizeDrawioMeta: (m) => m,
    persistDrawioMeta,
  }));

  try {
    const baselineThenCalls = spy.count();

    // Synchronous burst: enqueue many persists without awaiting.
    const promises = [];
    for (let i = 0; i < 50; i += 1) {
      promises.push(result.current.persistDrawioMetaOrdered({ v: i }, { source: "burst" }));
    }

    const deltaThenCalls = spy.count() - baselineThenCalls;

    // Ensure all enqueued persists eventually resolve.
    await Promise.all(promises);

    assert.ok(deltaThenCalls < 10, `promise chain should be bounded, but .then calls grew by ${deltaThenCalls}`);
  } finally {
    cleanup();
    spy.restore();
  }
});
