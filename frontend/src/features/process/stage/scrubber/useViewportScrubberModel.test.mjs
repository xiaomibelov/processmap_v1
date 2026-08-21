import assert from "node:assert/strict";
import test from "node:test";
import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import {
  buildViewportScrubberViewState,
  resolveViewportScrubberKeyboardTargetX,
} from "./useViewportScrubberModel.js";
import useViewportScrubberModel from "./useViewportScrubberModel.js";

test("buildViewportScrubberViewState computes thumb geometry from snapshot + track width", () => {
  const state = buildViewportScrubberViewState(
    {
      viewbox: {
        x: 200,
        width: 300,
        inner: {
          x: 100,
          width: 1300,
        },
      },
    },
    {
      trackWidth: 500,
      minThumbWidthPx: 30,
    },
  );

  assert.equal(state.canScroll, true);
  assert.equal(Number(state.thumbWidthPercent.toFixed(3)), Number(((300 / 1300) * 100).toFixed(3)));
  assert.equal(Number(state.thumbLeftPercent.toFixed(3)), Number((((200 - 100) / (1300 - 300)) * (1 - (300 / 1300)) * 100).toFixed(3)));
});

test("buildViewportScrubberViewState keeps full-width thumb when content fits viewport", () => {
  const state = buildViewportScrubberViewState(
    {
      viewbox: {
        x: 0,
        width: 640,
        inner: {
          x: 0,
          width: 640,
        },
      },
    },
    {
      trackWidth: 480,
      minThumbWidthPx: 40,
    },
  );

  assert.equal(state.canScroll, false);
  assert.equal(state.thumbLeftPercent, 0);
  assert.equal(state.thumbWidthPercent, 100);
  assert.equal(state.range.travelWidth, 0);
});

test("buildViewportScrubberViewState applies min thumb px guard when visible fraction is tiny", () => {
  const state = buildViewportScrubberViewState(
    {
      viewbox: {
        x: 0,
        width: 80,
        inner: {
          x: 0,
          width: 2200,
        },
      },
    },
    {
      trackWidth: 320,
      minThumbWidthPx: 36,
    },
  );

  assert.equal(state.canScroll, true);
  assert.equal(Number(state.thumbWidthPercent.toFixed(4)), Number(((36 / 320) * 100).toFixed(4)));
});

test("resolveViewportScrubberKeyboardTargetX moves by bounded step for arrow keys", () => {
  const range = {
    canScroll: true,
    contentMinX: 100,
    maxViewboxX: 900,
    viewboxWidth: 320,
  };

  assert.equal(
    resolveViewportScrubberKeyboardTargetX(range, 300, "ArrowLeft"),
    261.6,
  );
  assert.equal(
    resolveViewportScrubberKeyboardTargetX(range, 300, "ArrowRight"),
    338.4,
  );
});

test("resolveViewportScrubberKeyboardTargetX handles Home/End and clamps boundaries", () => {
  const range = {
    canScroll: true,
    contentMinX: 50,
    maxViewboxX: 450,
    viewboxWidth: 200,
  };

  assert.equal(resolveViewportScrubberKeyboardTargetX(range, 280, "Home"), 50);
  assert.equal(resolveViewportScrubberKeyboardTargetX(range, 280, "End"), 450);
  assert.equal(resolveViewportScrubberKeyboardTargetX(range, 55, "ArrowLeft"), 50);
  assert.equal(resolveViewportScrubberKeyboardTargetX(range, 449, "ArrowRight"), 450);
});

test("resolveViewportScrubberKeyboardTargetX ignores unsupported keys and non-scrollable state", () => {
  const range = {
    canScroll: false,
    contentMinX: 0,
    maxViewboxX: 100,
    viewboxWidth: 80,
  };

  assert.equal(resolveViewportScrubberKeyboardTargetX(range, 20, "ArrowRight"), null);
  assert.equal(
    resolveViewportScrubberKeyboardTargetX({ ...range, canScroll: true }, 20, "PageDown"),
    null,
  );
});

function createSnapshot({ x = 0, width = 1084, innerX = 0, innerWidth = 1084 } = {}) {
  return {
    viewbox: {
      x,
      y: 0,
      width,
      height: 640,
      inner: {
        x: innerX,
        y: 0,
        width: innerWidth,
        height: 640,
      },
      outer: {
        width,
        height: 640,
      },
    },
  };
}

function createCanvasApiDriver(initialSnapshot) {
  let snapshot = initialSnapshot;
  const listeners = new Set();
  const setViewboxXCalls = [];

  return {
    api: {
      getViewportSnapshot: () => snapshot,
      getViewbox: () => snapshot.viewbox,
      onViewboxChanged: (listener) => {
        if (typeof listener !== "function") return () => {};
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      setViewboxX: (nextX) => {
        const value = Number(nextX);
        if (!Number.isFinite(value)) return false;
        setViewboxXCalls.push(value);
        snapshot = createSnapshot({
          x: value,
          width: snapshot.viewbox.width,
          innerX: snapshot.viewbox.inner.x,
          innerWidth: snapshot.viewbox.inner.width,
        });
        listeners.forEach((listener) => listener({ snapshot }));
        return true;
      },
    },
    setSnapshot: (nextSnapshot) => {
      snapshot = nextSnapshot;
    },
    emitViewboxChanged: () => {
      listeners.forEach((listener) => listener({ snapshot }));
    },
    getSetViewboxXCalls: () => [...setViewboxXCalls],
  };
}

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    Element: globalThis.Element,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent,
    KeyboardEvent: globalThis.KeyboardEvent,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    reactActEnv: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.Event = dom.window.Event;
  globalThis.MouseEvent = dom.window.MouseEvent;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
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
    globalThis.Element = previous.Element;
    globalThis.HTMLElement = previous.HTMLElement;
    globalThis.Node = previous.Node;
    globalThis.Event = previous.Event;
    globalThis.MouseEvent = previous.MouseEvent;
    globalThis.KeyboardEvent = previous.KeyboardEvent;
    globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.reactActEnv;
  };

  return { root, container, cleanup };
}

async function flush(ms = 40) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

function ScrubberHarness({ hookProps, expose }) {
  const model = useViewportScrubberModel(hookProps);
  useEffect(() => {
    expose(model);
  }, [expose, model]);

  if (model.canScroll !== true) return null;
  return React.createElement(
    "div",
    {
      "data-testid": "track",
      ref: model.setTrackRef,
    },
    React.createElement("button", {
      type: "button",
      "data-testid": "thumb",
      "data-scrubber-thumb": "true",
      ref: model.setThumbRef,
      onKeyDown: model.onThumbKeyDown,
      style: model.thumbStyle,
    }),
  );
}

async function renderHarness(root, props) {
  await act(async () => {
    root.render(React.createElement(ScrubberHarness, props));
  });
  await flush();
}

function applyTrackRect(trackEl, { left = 100, top = 8, width = 400, height = 12 } = {}) {
  trackEl.getBoundingClientRect = () => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  });
}

function dispatchPointerEvent(target, type, { button = 0, clientX = 0, clientY = 0 } = {}) {
  const win = target?.window === target ? target : (target?.ownerDocument?.defaultView || globalThis.window);
  const event = new win.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button,
    clientX,
    clientY,
  });
  target.dispatchEvent(event);
}

test("regression: pointer handlers rebind when scrubber mounts after initial auto-collapsed render", async () => {
  const { root, container, cleanup } = setupDom();
  const collapsedSnapshot = createSnapshot({
    x: 0,
    width: 1084,
    innerX: 0,
    innerWidth: 1084,
  });
  const scrollableSnapshot = createSnapshot({
    x: 0,
    width: 1084,
    innerX: 115,
    innerWidth: 4027,
  });
  const driver = createCanvasApiDriver(collapsedSnapshot);
  let latestModel = null;

  try {
    await renderHarness(root, {
      hookProps: {
        active: true,
        canvasApi: driver.api,
      },
      expose: (nextModel) => {
        latestModel = nextModel;
      },
    });

    assert.equal(latestModel?.canScroll, false);
    assert.equal(container.querySelector("[data-testid='track']"), null);
    assert.equal(driver.getSetViewboxXCalls().length, 0);

    driver.setSnapshot(scrollableSnapshot);
    await act(async () => {
      driver.emitViewboxChanged();
    });
    await flush();

    const trackEl = container.querySelector("[data-testid='track']");
    const thumbEl = container.querySelector("[data-testid='thumb']");
    assert.equal(latestModel?.canScroll, true);
    assert.ok(trackEl instanceof Element);
    assert.ok(thumbEl instanceof Element);

    applyTrackRect(trackEl, { left: 100, width: 400, height: 12 });

    const clickCallsBefore = driver.getSetViewboxXCalls().length;
    await act(async () => {
      dispatchPointerEvent(trackEl, "pointerdown", { button: 0, clientX: 340, clientY: 12 });
    });
    await flush();
    const clickCallsAfter = driver.getSetViewboxXCalls();
    assert.ok(clickCallsAfter.length > clickCallsBefore);
    assert.notEqual(clickCallsAfter[clickCallsAfter.length - 1], 0);

    const dragCallsBefore = clickCallsAfter.length;
    await act(async () => {
      dispatchPointerEvent(thumbEl, "pointerdown", { button: 0, clientX: 180, clientY: 12 });
      dispatchPointerEvent(window, "pointermove", { button: 0, clientX: 320, clientY: 12 });
      dispatchPointerEvent(window, "pointerup", { button: 0, clientX: 320, clientY: 12 });
    });
    await flush();
    const dragCallsAfter = driver.getSetViewboxXCalls();
    assert.ok(dragCallsAfter.length > dragCallsBefore);
    assert.ok(dragCallsAfter[dragCallsAfter.length - 1] > clickCallsAfter[clickCallsAfter.length - 1]);
  } finally {
    await cleanup();
  }
});
