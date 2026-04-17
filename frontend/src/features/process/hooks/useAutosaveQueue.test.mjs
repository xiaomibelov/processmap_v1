import assert from "node:assert/strict";
import test from "node:test";

import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import useAutosaveQueue from "./useAutosaveQueue.js";

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    Event: globalThis.Event,
    Element: globalThis.Element,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    reactActEnv: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Event = dom.window.Event;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  const cleanup = async () => {
    await act(async () => {
      root.unmount();
    });
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.Event = previous.Event;
    globalThis.Element = previous.Element;
    globalThis.HTMLElement = previous.HTMLElement;
    globalThis.Node = previous.Node;
    globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.reactActEnv;
  };
  return { root, cleanup, window: dom.window };
}

function Harness({ options, expose }) {
  const value = useAutosaveQueue(options);
  useEffect(() => {
    expose(value);
  }, [value, expose]);
  return null;
}

async function renderHarness(root, options, expose) {
  await act(async () => {
    root.render(React.createElement(Harness, { options, expose }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 16));
  });
}

test("useAutosaveQueue flushes pending save on beforeunload when queue is still active", async () => {
  const { root, cleanup, window } = setupDom();
  const saveCalls = [];
  let latest = null;

  try {
    await renderHarness(root, {
      enabled: true,
      debounceMs: 1000,
      onSave: async (payload) => {
        saveCalls.push(payload);
        return true;
      },
    }, (value) => {
      latest = value;
    });

    await act(async () => {
      latest.schedule({ kind: "diagram.change", marker: "A1" });
    });
    assert.equal(latest.hasPending(), true);

    await act(async () => {
      window.dispatchEvent(new window.Event("beforeunload"));
      await new Promise((resolve) => setTimeout(resolve, 40));
    });

    assert.equal(saveCalls.length, 1);
    assert.deepEqual(saveCalls[0], { kind: "diagram.change", marker: "A1" });
  } finally {
    await cleanup();
  }
});

test("useAutosaveQueue cancel clears pending save so beforeunload does not flush stale mutation", async () => {
  const { root, cleanup, window } = setupDom();
  const saveCalls = [];
  let latest = null;

  try {
    await renderHarness(root, {
      enabled: true,
      debounceMs: 1000,
      onSave: async (payload) => {
        saveCalls.push(payload);
        return true;
      },
    }, (value) => {
      latest = value;
    });

    await act(async () => {
      latest.schedule({ kind: "diagram.change", marker: "A1_after_manual_save" });
    });
    assert.equal(latest.hasPending(), true);

    await act(async () => {
      latest.cancel();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    assert.equal(latest.hasPending(), false);

    await act(async () => {
      window.dispatchEvent(new window.Event("beforeunload"));
      await new Promise((resolve) => setTimeout(resolve, 40));
    });

    assert.equal(saveCalls.length, 0);
  } finally {
    await cleanup();
  }
});
