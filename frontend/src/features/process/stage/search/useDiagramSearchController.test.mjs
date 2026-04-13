import assert from "node:assert/strict";
import test from "node:test";

import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import useDiagramSearchController from "./useDiagramSearchController.js";

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    Element: globalThis.Element,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    reactActEnv: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
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
    globalThis.Element = previous.Element;
    globalThis.HTMLElement = previous.HTMLElement;
    globalThis.Node = previous.Node;
    globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.reactActEnv;
  };
  return { root, cleanup };
}

function HookHarness({ props, expose }) {
  const value = useDiagramSearchController(props);
  useEffect(() => {
    expose(value);
  }, [value, expose]);
  return null;
}

async function renderHarness(root, props, expose) {
  await act(async () => {
    root.render(React.createElement(HookHarness, { props, expose }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 16));
  });
}

test("useDiagramSearchController syncs highlights and uses existing focus path for next/select", async () => {
  const { root, cleanup } = setupDom();
  const focusCalls = [];
  const highlightCalls = [];
  const clearCalls = [];
  let latest = null;
  let open = true;

  const bpmnRef = {
    current: {
      listSearchableElements: () => [
        { elementId: "Task_A", name: "Alpha", type: "bpmn:Task" },
        { elementId: "Task_B", name: "Beta", type: "bpmn:Task" },
      ],
      setSearchHighlights: (payload) => {
        highlightCalls.push(payload);
        return true;
      },
      clearSearchHighlights: () => {
        clearCalls.push(true);
        return true;
      },
    },
  };

  const props = {
    bpmnRef,
    requestDiagramFocus: (elementId, options) => {
      focusCalls.push({ elementId, options });
    },
    sessionId: "sid_1",
    reloadKey: 1,
    diagramXml: "<bpmn:definitions/>",
    mutationVersion: 0,
    isOpen: open,
    setOpen: (next) => {
      open = next === true;
    },
    isEnabled: true,
  };

  try {
    await renderHarness(root, props, (value) => {
      latest = value;
    });

    await act(async () => {
      latest.setQuery("task");
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 16));
    });

    assert.equal(latest.results.length, 2);
    assert.equal(latest.activeResult?.elementId, "Task_A");

    const lastHighlight = highlightCalls.at(-1);
    assert.deepEqual(lastHighlight, {
      matchElementIds: ["Task_A", "Task_B"],
      activeElementId: "Task_A",
    });

    await act(async () => {
      latest.next();
    });
    assert.equal(latest.activeResult?.elementId, "Task_B");
    assert.equal(focusCalls.at(-1)?.elementId, "Task_B");

    await act(async () => {
      latest.selectIndex(0);
    });
    assert.equal(latest.activeResult?.elementId, "Task_A");
    assert.equal(focusCalls.at(-1)?.elementId, "Task_A");

    const clearCountBeforeNoResults = clearCalls.length;
    await act(async () => {
      latest.setQuery("not_found");
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 16));
    });
    assert.equal(latest.results.length, 0);
    assert.ok(clearCalls.length > clearCountBeforeNoResults);
  } finally {
    await cleanup();
  }
});
