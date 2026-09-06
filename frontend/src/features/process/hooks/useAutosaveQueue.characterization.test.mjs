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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("characterization: burst of schedules inside debounce window coalesces into one save with the latest payload", async () => {
  const { root, cleanup } = setupDom();
  const saveCalls = [];
  let latest = null;

  try {
    await renderHarness(root, {
      enabled: true,
      debounceMs: 40,
      onSave: async (payload) => {
        saveCalls.push(payload);
        return true;
      },
    }, (value) => {
      latest = value;
    });

    await act(async () => {
      latest.schedule({ kind: "diagram.change", marker: "A" });
      await sleep(5);
      latest.schedule({ kind: "diagram.change", marker: "B" });
      await sleep(5);
      latest.schedule({ kind: "diagram.change", marker: "C" });
    });
    await act(async () => {
      await sleep(160);
    });

    assert.equal(saveCalls.length, 1);
    assert.deepEqual(saveCalls[0], { kind: "diagram.change", marker: "C" });
  } finally {
    await cleanup();
  }
});

test("characterization: sequential saves outside the debounce window keep arrival order", async () => {
  const { root, cleanup } = setupDom();
  const saveCalls = [];
  let latest = null;

  try {
    await renderHarness(root, {
      enabled: true,
      debounceMs: 25,
      onSave: async (payload) => {
        saveCalls.push(payload);
        return true;
      },
    }, (value) => {
      latest = value;
    });

    await act(async () => {
      latest.schedule({ kind: "diagram.change", marker: "A" });
    });
    await act(async () => {
      await sleep(120);
    });
    await act(async () => {
      latest.schedule({ kind: "diagram.change", marker: "B" });
    });
    await act(async () => {
      await sleep(120);
    });

    assert.deepEqual(saveCalls.map((item) => item.marker), ["A", "B"]);
  } finally {
    await cleanup();
  }
});

test("keep-latest replay: a schedule whose debounce fires during an in-flight save is persisted after that save completes", async () => {
  const { root, cleanup } = setupDom();
  const saveCalls = [];
  let releaseFirstSave = null;
  let latest = null;

  try {
    await renderHarness(root, {
      enabled: true,
      debounceMs: 25,
      onSave: async (payload) => {
        saveCalls.push(payload);
        if (payload.marker === "A") {
          await new Promise((resolve) => {
            releaseFirstSave = resolve;
          });
        }
        return true;
      },
    }, (value) => {
      latest = value;
    });

    await act(async () => {
      latest.schedule({ kind: "diagram.change", marker: "A" });
    });
    await act(async () => {
      await sleep(70);
    });
    assert.deepEqual(saveCalls.map((item) => item.marker), ["A"]);

    // B is scheduled while A is still in flight; its debounce timer expires during the flight.
    await act(async () => {
      latest.schedule({ kind: "diagram.change", marker: "B" });
    });
    await act(async () => {
      await sleep(80);
    });
    assert.equal(saveCalls.length, 1);

    await act(async () => {
      releaseFirstSave();
      await sleep(160);
    });

    assert.deepEqual(
      saveCalls.map((item) => item.marker),
      ["A", "B"],
      "latest pending payload must be replayed once the in-flight save completes",
    );
  } finally {
    if (releaseFirstSave) releaseFirstSave();
    await cleanup();
  }
});
