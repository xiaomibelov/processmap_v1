import test from "node:test";
import assert from "node:assert/strict";

import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import useBpmnSubprocessPreview from "./useBpmnSubprocessPreview.js";

function Harness({ hookProps, expose }) {
  const value = useBpmnSubprocessPreview(hookProps);
  useEffect(() => {
    expose(value);
  }, [expose, value]);
  return null;
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
    KeyboardEvent: globalThis.KeyboardEvent,
    MouseEvent: globalThis.MouseEvent,
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
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
  globalThis.MouseEvent = dom.window.MouseEvent;
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
    globalThis.KeyboardEvent = previous.KeyboardEvent;
    globalThis.MouseEvent = previous.MouseEvent;
    globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.reactActEnv;
  };

  return { root, cleanup };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 24));
  });
}

async function renderHarness(root, props) {
  await act(async () => {
    root.render(React.createElement(Harness, props));
  });
  await flush();
}

function createHookProps(overrides = {}) {
  return {
    bpmnRef: {
      current: {
        runDiagramContextAction: async () => ({ ok: true }),
      },
    },
    hasSession: true,
    tab: "diagram",
    drawioEditorOpen: false,
    hybridPlacementHitLayerActive: false,
    hybridModeEffective: "",
    setInfoMsg: () => {},
    setGenErr: () => {},
    ...overrides,
  };
}

test("subprocess preview hook consumes open_inside result and preserves open-properties follow-up", async () => {
  const { root, cleanup } = setupDom();
  let latest = null;
  const contextActionCalls = [];
  const closeCalls = [];
  try {
    await renderHarness(root, {
      expose: (value) => {
        latest = value;
      },
      hookProps: createHookProps({
        bpmnRef: {
          current: {
            runDiagramContextAction: async (payload) => {
              contextActionCalls.push(payload);
              return { ok: true };
            },
          },
        },
      }),
    });

    let handled = false;
    await act(async () => {
      handled = latest.handleBpmnContextActionResult({
        ok: true,
        openInsidePreview: {
          title: "Подпроцесс",
          kindLabel: "Подпроцесс",
          clientX: 240,
          clientY: 180,
        },
      }, {
        menuTarget: { id: "SubProcess_1" },
        closeContextMenu: () => closeCalls.push("close"),
      });
    });
    await flush();

    assert.equal(handled, true);
    assert.equal(latest?.bpmnSubprocessPreview?.title, "Подпроцесс");
    assert.equal(latest?.bpmnSubprocessPreview?.targetId, "SubProcess_1");
    assert.deepEqual(closeCalls, ["close"]);

    let result = null;
    await act(async () => {
      result = await latest.openBpmnSubprocessPreviewProperties();
    });
    await flush();

    assert.equal(result?.ok, true);
    assert.deepEqual(contextActionCalls, [{
      actionId: "open_properties",
      target: { id: "SubProcess_1", kind: "element" },
      clientX: 240,
      clientY: 180,
      value: "",
    }]);
    assert.equal(latest?.bpmnSubprocessPreview, null);
  } finally {
    await cleanup();
  }
});

test("subprocess preview hook clears preview when BPMN context ownership becomes blocked", async () => {
  const { root, cleanup } = setupDom();
  let latest = null;
  try {
    await renderHarness(root, {
      expose: (value) => {
        latest = value;
      },
      hookProps: createHookProps(),
    });

    await act(async () => {
      latest.handleBpmnContextActionResult({
        ok: true,
        openInsidePreview: { title: "Подпроцесс" },
      }, {
        menuTarget: { id: "SubProcess_1" },
      });
    });
    await flush();
    assert.equal(latest?.bpmnSubprocessPreview?.targetId, "SubProcess_1");

    await renderHarness(root, {
      expose: (value) => {
        latest = value;
      },
      hookProps: createHookProps({
        drawioEditorOpen: true,
      }),
    });

    assert.equal(latest?.bpmnSubprocessPreview, null);
  } finally {
    await cleanup();
  }
});
