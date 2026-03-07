import test from "node:test";
import assert from "node:assert/strict";
import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import useDrawioOverlayInteraction from "./useDrawioOverlayInteraction.js";

function createMaps({
  includeElement = true,
  layerVisible = true,
  layerLocked = false,
  elementVisible = true,
  elementLocked = false,
  elementDeleted = false,
  offsetX = 0,
  offsetY = 0,
} = {}) {
  const layerMap = new Map();
  layerMap.set("DL1", {
    visible: layerVisible,
    locked: layerLocked,
    opacity: 1,
  });
  const elementMap = new Map();
  if (includeElement) {
    elementMap.set("shape1", {
      layer_id: "DL1",
      visible: elementVisible,
      locked: elementLocked,
      deleted: elementDeleted,
      opacity: 1,
      offset_x: offsetX,
      offset_y: offsetY,
    });
  }
  return { layerMap, elementMap };
}

function OverlayHookHarness({
  visible = true,
  hasRenderable = true,
  meta = { locked: false },
  layerMap,
  elementMap,
  matrixScale = 1,
  onCommitMove,
  onDeleteElement,
  onSelectionChange,
  onState,
}) {
  const interaction = useDrawioOverlayInteraction({
    visible,
    hasRenderable,
    meta,
    layerMap,
    elementMap,
    matrixScale,
    screenToDiagram: (x, y) => ({ x, y }),
    onCommitMove,
    onDeleteElement,
    onSelectionChange,
  });

  useEffect(() => {
    onState?.({
      selectedId: interaction.selectedId,
      draftOffset: interaction.draftOffset,
    });
  }, [interaction.draftOffset, interaction.selectedId, onState]);

  return React.createElement(
    "div",
    { ref: interaction.rootRef, "data-testid": "drawio-root" },
    React.createElement("div", {
      id: "shape1",
      "data-testid": "shape1",
      "data-drawio-el-id": "shape1",
    }),
  );
}

function createPointerLikeEvent(win, type, { pointerId = 1, clientX = 0, clientY = 0, bubbles = true } = {}) {
  const event = new win.MouseEvent(type, { bubbles, cancelable: true, clientX, clientY });
  Object.defineProperty(event, "pointerId", { configurable: true, value: pointerId });
  Object.defineProperty(event, "clientX", { configurable: true, value: clientX });
  Object.defineProperty(event, "clientY", { configurable: true, value: clientY });
  return event;
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 24));
  });
}

async function dispatchWithAct(target, event) {
  await act(async () => {
    target.dispatchEvent(event);
  });
}

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    Element: globalThis.Element,
    Node: globalThis.Node,
    MouseEvent: globalThis.MouseEvent,
    KeyboardEvent: globalThis.KeyboardEvent,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    reactActEnv: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Element = dom.window.Element;
  globalThis.Node = dom.window.Node;
  globalThis.MouseEvent = dom.window.MouseEvent;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  let alreadyUnmounted = false;

  const safeUnmount = async () => {
    if (alreadyUnmounted) return;
    alreadyUnmounted = true;
    await act(async () => {
      root.unmount();
    });
  };

  const cleanup = async () => {
    await safeUnmount();
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.Element = previous.Element;
    globalThis.Node = previous.Node;
    globalThis.MouseEvent = previous.MouseEvent;
    globalThis.KeyboardEvent = previous.KeyboardEvent;
    globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.reactActEnv;
  };

  return { dom, root, cleanup, safeUnmount };
}

test("dom integration: pointer drag updates draft state and duplicate mouseup is tolerated", async () => {
  const { dom, root, cleanup } = setupDom();
  const moves = [];
  const selections = [];
  const states = [];
  try {
    const { layerMap, elementMap } = createMaps({ offsetX: 0, offsetY: 0 });
    await act(async () => {
      root.render(React.createElement(OverlayHookHarness, {
        visible: true,
        hasRenderable: true,
        meta: { locked: false },
        layerMap,
        elementMap,
        onCommitMove: (payload) => moves.push(payload),
        onDeleteElement: () => false,
        onSelectionChange: (id) => selections.push(String(id || "")),
        onState: (row) => states.push(row),
      }));
    });
    await flush();
    const shape = dom.window.document.querySelector("[data-testid='shape1']");
    assert.ok(shape);
    await dispatchWithAct(shape, createPointerLikeEvent(dom.window, "pointerdown", {
      pointerId: 7,
      clientX: 100,
      clientY: 50,
    }));
    await dispatchWithAct(dom.window.document, createPointerLikeEvent(dom.window, "pointermove", {
      pointerId: 7,
      clientX: 130,
      clientY: 90,
    }));
    await flush();
    await dispatchWithAct(dom.window.document, createPointerLikeEvent(dom.window, "pointerup", {
      pointerId: 7,
      clientX: 130,
      clientY: 90,
    }));
    await dispatchWithAct(dom.window, new dom.window.MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      clientX: 130,
      clientY: 90,
    }));
    await flush();
    assert.equal(selections.includes("shape1"), true);
    assert.equal(states.some((row) => String(row?.draftOffset?.id || "") === "shape1"), true);
    assert.ok(moves.length <= 1);
  } finally {
    await cleanup();
  }
});

test("dom integration: editable gating blocks drag commit when drawio is non-editable", async () => {
  const { dom, root, cleanup } = setupDom();
  const moves = [];
  const selections = [];
  try {
    const { layerMap, elementMap } = createMaps({});
    await act(async () => {
      root.render(React.createElement(OverlayHookHarness, {
        visible: true,
        hasRenderable: true,
        meta: { locked: true },
        layerMap,
        elementMap,
        onCommitMove: (payload) => moves.push(payload),
        onDeleteElement: () => false,
        onSelectionChange: (id) => selections.push(String(id || "")),
      }));
    });
    const shape = dom.window.document.querySelector("[data-testid='shape1']");
    await dispatchWithAct(shape, createPointerLikeEvent(dom.window, "pointerdown", { pointerId: 3, clientX: 10, clientY: 10 }));
    await dispatchWithAct(dom.window, createPointerLikeEvent(dom.window, "pointermove", { pointerId: 3, clientX: 40, clientY: 20 }));
    await dispatchWithAct(dom.window, createPointerLikeEvent(dom.window, "pointerup", { pointerId: 3, clientX: 40, clientY: 20 }));
    await flush();
    assert.equal(moves.length, 0);
    assert.equal(selections.length, 0);
  } finally {
    await cleanup();
  }
});

test("dom integration: keyboard delete path works only with active editable selection", async () => {
  const { dom, root, cleanup } = setupDom();
  const deleted = [];
  const selections = [];
  try {
    const { layerMap, elementMap } = createMaps({});
    await act(async () => {
      root.render(React.createElement(OverlayHookHarness, {
        visible: true,
        hasRenderable: true,
        meta: { locked: false },
        layerMap,
        elementMap,
        onCommitMove: () => {},
        onDeleteElement: (id) => {
          deleted.push(id);
          return true;
        },
        onSelectionChange: (id) => selections.push(String(id || "")),
      }));
    });
    const shape = dom.window.document.querySelector("[data-testid='shape1']");
    await dispatchWithAct(shape, createPointerLikeEvent(dom.window, "pointerdown", { pointerId: 5, clientX: 20, clientY: 20 }));
    await flush();
    await dispatchWithAct(dom.window, new dom.window.KeyboardEvent("keydown", {
      key: "Delete",
      bubbles: true,
      cancelable: true,
    }));
    await flush();
    assert.deepEqual(deleted, ["shape1"]);
    assert.equal(selections.includes("shape1"), true);
    assert.equal(selections.includes(""), true);
  } finally {
    await cleanup();
  }
});

test("dom integration: selection is cleared on rerender when selected element disappears", async () => {
  const { root, cleanup } = setupDom();
  const selections = [];
  try {
    const first = createMaps({ includeElement: true });
    await act(async () => {
      root.render(React.createElement(OverlayHookHarness, {
        visible: true,
        hasRenderable: true,
        meta: { locked: false },
        layerMap: first.layerMap,
        elementMap: first.elementMap,
        onCommitMove: () => {},
        onDeleteElement: () => false,
        onSelectionChange: (id) => selections.push(String(id || "")),
      }));
    });
    const shape = document.querySelector("[data-testid='shape1']");
    await dispatchWithAct(shape, createPointerLikeEvent(window, "pointerdown", { pointerId: 9, clientX: 10, clientY: 10 }));
    await flush();
    const second = createMaps({ includeElement: false });
    await act(async () => {
      root.render(React.createElement(OverlayHookHarness, {
        visible: true,
        hasRenderable: true,
        meta: { locked: false },
        layerMap: second.layerMap,
        elementMap: second.elementMap,
        onCommitMove: () => {},
        onDeleteElement: () => false,
        onSelectionChange: (id) => selections.push(String(id || "")),
      }));
    });
    await flush();
    assert.equal(selections.includes("shape1"), true);
    assert.equal(selections.includes(""), true);
  } finally {
    await cleanup();
  }
});

test("dom integration: overlay visible flag gates interaction and rerender toggle", async () => {
  const { dom, root, cleanup } = setupDom();
  const moves = [];
  const states = [];
  try {
    const maps = createMaps({});
    await act(async () => {
      root.render(React.createElement(OverlayHookHarness, {
        visible: false,
        hasRenderable: true,
        meta: { locked: false },
        layerMap: maps.layerMap,
        elementMap: maps.elementMap,
        onCommitMove: (payload) => moves.push(payload),
        onDeleteElement: () => false,
        onSelectionChange: () => {},
        onState: (row) => states.push({ phase: "hidden", ...row }),
      }));
    });
    const shape = dom.window.document.querySelector("[data-testid='shape1']");
    await dispatchWithAct(shape, createPointerLikeEvent(dom.window, "pointerdown", { pointerId: 2, clientX: 10, clientY: 10 }));
    await dispatchWithAct(dom.window, createPointerLikeEvent(dom.window, "pointermove", { pointerId: 2, clientX: 60, clientY: 10 }));
    await dispatchWithAct(dom.window, createPointerLikeEvent(dom.window, "pointerup", { pointerId: 2, clientX: 60, clientY: 10 }));
    await flush();
    assert.equal(moves.length, 0);
    assert.equal(states.some((row) => row.phase === "hidden" && row?.draftOffset?.id === "shape1"), false);

    await act(async () => {
      root.render(React.createElement(OverlayHookHarness, {
        visible: true,
        hasRenderable: true,
        meta: { locked: false },
        layerMap: maps.layerMap,
        elementMap: maps.elementMap,
        onCommitMove: (payload) => moves.push(payload),
        onDeleteElement: () => false,
        onSelectionChange: () => {},
        onState: (row) => states.push({ phase: "visible", ...row }),
      }));
    });
    await dispatchWithAct(shape, createPointerLikeEvent(dom.window, "pointerdown", { pointerId: 2, clientX: 10, clientY: 10 }));
    await dispatchWithAct(dom.window.document, createPointerLikeEvent(dom.window, "pointermove", { pointerId: 2, clientX: 70, clientY: 20 }));
    await dispatchWithAct(dom.window.document, createPointerLikeEvent(dom.window, "pointerup", { pointerId: 2, clientX: 70, clientY: 20 }));
    await flush();
    assert.equal(states.some((row) => row.phase === "visible" && row?.draftOffset?.id === "shape1"), true);
    assert.ok(moves.length <= 1);
  } finally {
    await cleanup();
  }
});

test("dom integration: listener lifecycle cleanup prevents post-unmount commits", async () => {
  const { dom, root, cleanup, safeUnmount } = setupDom();
  const moves = [];
  const win = dom.window;
  const trackedTypes = new Set(["pointermove", "pointerup", "pointercancel", "mousemove", "mouseup"]);
  const counts = { add: 0, remove: 0 };
  const originalAdd = win.addEventListener.bind(win);
  const originalRemove = win.removeEventListener.bind(win);
  win.addEventListener = (type, fn, opts) => {
    if (trackedTypes.has(String(type))) counts.add += 1;
    return originalAdd(type, fn, opts);
  };
  win.removeEventListener = (type, fn, opts) => {
    if (trackedTypes.has(String(type))) counts.remove += 1;
    return originalRemove(type, fn, opts);
  };
  try {
    const maps = createMaps({});
    await act(async () => {
      root.render(React.createElement(OverlayHookHarness, {
        visible: true,
        hasRenderable: true,
        meta: { locked: false },
        layerMap: maps.layerMap,
        elementMap: maps.elementMap,
        onCommitMove: (payload) => moves.push(payload),
        onDeleteElement: () => false,
        onSelectionChange: () => {},
      }));
    });
    const shape = dom.window.document.querySelector("[data-testid='shape1']");
    await dispatchWithAct(shape, createPointerLikeEvent(dom.window, "pointerdown", { pointerId: 11, clientX: 10, clientY: 10 }));
    await safeUnmount();
    await dispatchWithAct(dom.window, createPointerLikeEvent(dom.window, "pointermove", { pointerId: 11, clientX: 100, clientY: 100 }));
    await dispatchWithAct(dom.window, createPointerLikeEvent(dom.window, "pointerup", { pointerId: 11, clientX: 100, clientY: 100 }));
    await flush();
    assert.equal(moves.length, 0);
    assert.ok(counts.add > 0);
    assert.ok(counts.remove >= counts.add);
  } finally {
    win.addEventListener = originalAdd;
    win.removeEventListener = originalRemove;
    await cleanup();
  }
});
