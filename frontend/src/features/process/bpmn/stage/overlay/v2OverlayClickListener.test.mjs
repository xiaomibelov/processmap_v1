import assert from "node:assert/strict";
import test from "node:test";

import {
  setV2OverlayClickHandler,
  uninstallV2OverlayClickListener,
} from "./overlayLifecycleManager.js";

// Minimal document stub capturing registered listeners (pure-node; jsdom is
// unavailable in this repo's test env).
function withDocumentStub(fn) {
  const original = globalThis.document;
  const listeners = [];
  globalThis.document = {
    addEventListener(type, handler, options) {
      listeners.push({ type, handler, options });
    },
    removeEventListener(type, handler) {
      const idx = listeners.findIndex((l) => l.type === type && l.handler === handler);
      if (idx >= 0) listeners.splice(idx, 1);
    },
  };
  const get = (type, capture) => listeners.find(
    (l) => l.type === type && (capture === undefined || Boolean(l.options) === capture),
  );
  try {
    return fn(get, listeners);
  } finally {
    setV2OverlayClickHandler(null);
    uninstallV2OverlayClickListener();
    if (original === undefined) delete globalThis.document;
    else globalThis.document = original;
  }
}

function makeEvent(hostOrNull) {
  const calls = { preventDefault: 0, stopPropagation: 0 };
  const event = {
    target: {
      closest(selector) {
        if (!hostOrNull) return null;
        return selector.includes(".fpc-overlay-v2-host") ? hostOrNull : null;
      },
    },
    preventDefault() { calls.preventDefault += 1; },
    stopPropagation() { calls.stopPropagation += 1; },
  };
  return { event, calls };
}

function makeHost(elementId) {
  return { dataset: { fpcElementId: elementId } };
}

test("click inside a V2 overlay host invokes the handler with the element id and owns the event", () => {
  withDocumentStub((get) => {
    const seen = [];
    setV2OverlayClickHandler((payload) => seen.push(payload));

    const clickListener = get("click");
    const mouseDownCapture = get("mousedown", true);
    assert.equal(typeof clickListener?.handler, "function");
    assert.equal(typeof mouseDownCapture?.handler, "function");

    const { event, calls } = makeEvent(makeHost("Task_7"));
    clickListener.handler(event);
    assert.deepEqual(seen.map((p) => p.elementId), ["Task_7"]);
    assert.equal(calls.preventDefault, 1);
    assert.equal(calls.stopPropagation, 1);

    // mousedown is stopped in capture so the canvas never starts a pan.
    const down = makeEvent(makeHost("Task_7"));
    mouseDownCapture.handler(down.event);
    assert.equal(down.calls.stopPropagation, 1);
  });
});

test("clicks outside a V2 overlay host pass through untouched", () => {
  withDocumentStub((get) => {
    const seen = [];
    setV2OverlayClickHandler((payload) => seen.push(payload));
    const { event, calls } = makeEvent(null);
    get("click").handler(event);
    get("mousedown", true).handler(event);
    assert.equal(seen.length, 0);
    assert.equal(calls.preventDefault, 0);
    assert.equal(calls.stopPropagation, 0);
  });
});

test("host without element id consumes nothing and never calls the handler", () => {
  withDocumentStub((get) => {
    const seen = [];
    setV2OverlayClickHandler((payload) => seen.push(payload));
    const { event, calls } = makeEvent(makeHost("  "));
    get("click").handler(event);
    assert.equal(seen.length, 0);
    assert.equal(calls.preventDefault, 0);
  });
});

test("clearing the handler keeps the listener installed but inert", () => {
  withDocumentStub((get, listeners) => {
    setV2OverlayClickHandler(() => {});
    assert.ok(get("click"));
    setV2OverlayClickHandler(null);
    const { event } = makeEvent(makeHost("Task_1"));
    assert.doesNotThrow(() => get("click").handler(event));
    // listener count unchanged (install-once singleton)
    assert.equal(listeners.filter((l) => l.type === "click").length, 1);
  });
});

test("uninstall removes both delegated listeners", () => {
  withDocumentStub((get) => {
    setV2OverlayClickHandler(() => {});
    uninstallV2OverlayClickListener();
    assert.equal(get("click"), undefined);
    assert.equal(get("mousedown", true), undefined);
  });
});
