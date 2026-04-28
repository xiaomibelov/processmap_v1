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
    assert.equal(focusCalls.at(-1)?.options?.centerInViewport, true);

    await act(async () => {
      latest.selectIndex(0);
    });
    assert.equal(latest.activeResult?.elementId, "Task_A");
    assert.equal(focusCalls.at(-1)?.elementId, "Task_A");
    assert.equal(focusCalls.at(-1)?.options?.centerInViewport, true);

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

test("useDiagramSearchController routes row and Prev/Next through navigation callback when provided", async () => {
  const { root, cleanup } = setupDom();
  const navigateCalls = [];
  const focusCalls = [];
  let latest = null;
  let open = true;

  const bpmnRef = {
    current: {
      listSearchableElements: () => [
        {
          elementId: "Task_Main",
          name: "Main",
          type: "bpmn:Task",
        },
        {
          elementId: "Task_Child",
          name: "Child",
          type: "bpmn:Task",
          isInsideSubprocess: true,
          parentSubprocessId: "Sub_1",
          subprocessPath: [{ id: "Sub_1", name: "Подпроцесс" }],
        },
      ],
      setSearchHighlights: () => true,
      clearSearchHighlights: () => true,
    },
  };

  try {
    await renderHarness(root, {
      bpmnRef,
      requestDiagramFocus: (elementId, options) => {
        focusCalls.push({ elementId, options });
      },
      onNavigateSearchResult: (result, options) => {
        navigateCalls.push({ elementId: result?.elementId, options });
      },
      sessionId: "sid_nav",
      reloadKey: 1,
      diagramXml: "<bpmn:definitions/>",
      mutationVersion: 0,
      isOpen: open,
      setOpen: (next) => {
        open = next === true;
      },
      isEnabled: true,
    }, (value) => {
      latest = value;
    });

    await act(async () => {
      latest.setQuery("task");
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 16));
    });

    await act(async () => {
      latest.selectIndex(1);
    });
    await act(async () => {
      latest.prev();
    });
    await act(async () => {
      latest.next();
    });

    assert.deepEqual(
      navigateCalls.map((call) => [call.elementId, call.options?.source]),
      [
        ["Task_Child", "diagram_search_row"],
        ["Task_Main", "diagram_search_prev"],
        ["Task_Child", "diagram_search_next"],
      ],
    );
    assert.equal(focusCalls.length, 0);
  } finally {
    await cleanup();
  }
});

test("useDiagramSearchController recomputes results on mutation trigger and clears stale highlights on session switch", async () => {
  const { root, cleanup } = setupDom();
  let latest = null;
  let open = true;
  let currentSessionId = "sid_1";
  let elements = [
    { elementId: "Task_A", name: "Alpha", type: "bpmn:Task" },
  ];
  const clearCalls = [];

  const bpmnRef = {
    current: {
      listSearchableElements: () => elements,
      setSearchHighlights: () => true,
      clearSearchHighlights: () => {
        clearCalls.push(true);
        return true;
      },
    },
  };

  try {
    const makeProps = (mutationVersion) => ({
      bpmnRef,
      requestDiagramFocus: () => {},
      sessionId: currentSessionId,
      reloadKey: 1,
      diagramXml: "<bpmn:definitions/>",
      mutationVersion,
      isOpen: open,
      setOpen: (next) => {
        open = next === true;
      },
      isEnabled: true,
    });

    await renderHarness(root, makeProps(0), (value) => {
      latest = value;
    });
    await act(async () => {
      latest.setQuery("lane");
    });
    assert.equal(latest.results.length, 0);

    elements = [
      { elementId: "Lane_1", name: "Lane A", type: "bpmn:Lane" },
    ];
    await renderHarness(root, makeProps(1), (value) => {
      latest = value;
    });
    assert.equal(latest.results.length, 1);
    assert.equal(latest.results[0]?.elementId, "Lane_1");

    const clearCountBeforeSessionSwitch = clearCalls.length;
    currentSessionId = "sid_2";
    await renderHarness(root, makeProps(1), (value) => {
      latest = value;
    });
    assert.equal(open, false);
    assert.ok(clearCalls.length > clearCountBeforeSessionSwitch);
  } finally {
    await cleanup();
  }
});

test("useDiagramSearchController supports properties mode with active-only highlight and centered focus", async () => {
  const { root, cleanup } = setupDom();
  const focusCalls = [];
  const highlightCalls = [];
  const clearCalls = [];
  let latest = null;
  let open = true;

  const bpmnRef = {
    current: {
      listSearchableElements: () => [
        { elementId: "Task_E", name: "Element Alpha", type: "bpmn:Task" },
      ],
      listSearchableProperties: () => [
        {
          searchId: "Task_A::prop_0",
          elementId: "Task_A",
          elementTitle: "Call Worker",
          elementType: "bpmn:ServiceTask",
          elementTypeLabel: "ServiceTask",
          propertyName: "container_tara",
          propertyValue: "Кастрюля",
          sourcePath: "extensionElements.values[0].name/value",
        },
        {
          searchId: "Task_B::prop_0",
          elementId: "Task_B",
          elementTitle: "Retries",
          elementType: "bpmn:ServiceTask",
          elementTypeLabel: "ServiceTask",
          propertyName: "retries",
          propertyValue: "3",
        },
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

  try {
    await renderHarness(root, {
      bpmnRef,
      requestDiagramFocus: (elementId, options) => {
        focusCalls.push({ elementId, options });
      },
      sessionId: "sid_prop",
      reloadKey: 1,
      diagramXml: "<bpmn:definitions/>",
      mutationVersion: 0,
      isOpen: open,
      setOpen: (next) => {
        open = next === true;
      },
      isEnabled: true,
    }, (value) => {
      latest = value;
    });

    await act(async () => {
      latest.setMode("properties");
    });
    await act(async () => {
      latest.setQuery("container_tara");
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 16));
    });

    assert.equal(latest.mode, "properties");
    assert.equal(latest.results.length, 1);
    assert.equal(latest.activeResult?.elementId, "Task_A");
    assert.equal(latest.activeResult?.propertyName, "container_tara");
    assert.deepEqual(highlightCalls.at(-1), {
      matchElementIds: [],
      activeElementId: "Task_A",
    });

    await act(async () => {
      latest.setQuery("Кастрюля");
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 16));
    });
    assert.equal(latest.results.length, 1);
    assert.equal(latest.activeResult?.propertyValue, "Кастрюля");

    await act(async () => {
      latest.setQuery("r");
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 16));
    });
    assert.equal(latest.results.length, 2);

    await act(async () => {
      latest.next();
    });
    assert.equal(latest.activeResult?.elementId, "Task_B");
    assert.equal(focusCalls.at(-1)?.elementId, "Task_B");
    assert.equal(focusCalls.at(-1)?.options?.centerInViewport, true);

    await act(async () => {
      latest.close();
    });
    await renderHarness(root, {
      bpmnRef,
      requestDiagramFocus: () => {},
      sessionId: "sid_prop",
      reloadKey: 1,
      diagramXml: "<bpmn:definitions/>",
      mutationVersion: 0,
      isOpen: open,
      setOpen: (next) => {
        open = next === true;
      },
      isEnabled: true,
    }, (value) => {
      latest = value;
    });
    assert.equal(latest.mode, "elements");
    assert.equal(latest.query, "");
    assert.ok(clearCalls.length > 0);
  } finally {
    await cleanup();
  }
});

test("useDiagramSearchController refreshes property source on first query without tab switch when source becomes ready late", async () => {
  const { root, cleanup } = setupDom();
  let latest = null;
  let open = true;
  let propertyCalls = 0;

  const bpmnRef = {
    current: {
      listSearchableElements: () => [],
      listSearchableProperties: () => {
        propertyCalls += 1;
        if (propertyCalls < 2) return [];
        return [
          {
            searchId: "Task_A::prop_0",
            elementId: "Task_A",
            elementTitle: "Call Worker",
            elementType: "bpmn:ServiceTask",
            elementTypeLabel: "ServiceTask",
            propertyName: "container_tara",
            propertyValue: "Кастрюля",
            sourcePath: "extensionElements.values[0].name/value",
          },
        ];
      },
      setSearchHighlights: () => true,
      clearSearchHighlights: () => true,
    },
  };

  try {
    await renderHarness(root, {
      bpmnRef,
      requestDiagramFocus: () => {},
      sessionId: "sid_delayed_props",
      reloadKey: 1,
      diagramXml: "<bpmn:definitions/>",
      mutationVersion: 0,
      isOpen: open,
      setOpen: (next) => {
        open = next === true;
      },
      isEnabled: true,
    }, (value) => {
      latest = value;
    });

    await act(async () => {
      latest.setMode("properties");
    });
    await act(async () => {
      latest.setQuery("container_tara");
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220));
    });

    assert.ok(propertyCalls >= 2);
    assert.equal(latest.results.length, 1);
    assert.equal(latest.results[0]?.propertyName, "container_tara");
    assert.equal(latest.results[0]?.propertyValue, "Кастрюля");
  } finally {
    await cleanup();
  }
});
