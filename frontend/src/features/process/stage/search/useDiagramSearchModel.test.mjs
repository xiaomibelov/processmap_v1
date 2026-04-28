import assert from "node:assert/strict";
import test from "node:test";

import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import useDiagramSearchModel, {
  collectDiagramSearchResults,
  normalizeDiagramSearchElement,
} from "./useDiagramSearchModel.js";

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
  const value = useDiagramSearchModel(props);
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

test("normalizeDiagramSearchElement normalizes type and deduplicates label equal to name", () => {
  const row = normalizeDiagramSearchElement({
    elementId: "Task_1",
    name: "Согласование",
    label: "Согласование",
    type: "bpmn:UserTask",
  });
  assert.equal(row.elementId, "Task_1");
  assert.equal(row.label, "");
  assert.equal(row.typeLabel, "UserTask");
});

test("collectDiagramSearchResults matches by id/name/label/type case-insensitive", () => {
  const rows = [
    { elementId: "Task_Approve", name: "Согласовать", type: "bpmn:UserTask" },
    { elementId: "Gateway_1", name: "Проверка", label: "Route Check", type: "bpmn:ExclusiveGateway" },
  ];
  assert.deepEqual(
    collectDiagramSearchResults(rows, "approve").map((item) => item.elementId),
    ["Task_Approve"],
  );
  assert.deepEqual(
    collectDiagramSearchResults(rows, "route").map((item) => item.elementId),
    ["Gateway_1"],
  );
  assert.deepEqual(
    collectDiagramSearchResults(rows, "exclusive").map((item) => item.elementId),
    ["Gateway_1"],
  );
});

test("collectDiagramSearchResults matches multi-word names with whitespace-normalized query", () => {
  const rows = [
    { elementId: "Task_CheckOrder", name: "Проверить заказ", type: "bpmn:Task" },
    { elementId: "Task_Signal", name: "Звуковой сигнал", type: "bpmn:Task" },
  ];
  assert.deepEqual(
    collectDiagramSearchResults(rows, "проверить заказ").map((item) => item.elementId),
    ["Task_CheckOrder"],
  );
  assert.deepEqual(
    collectDiagramSearchResults(rows, "  проверить   заказ  ").map((item) => item.elementId),
    ["Task_CheckOrder"],
  );
  assert.deepEqual(
    collectDiagramSearchResults(rows, "звуковой сигнал").map((item) => item.elementId),
    ["Task_Signal"],
  );
});

test("useDiagramSearchModel supports wrap-around next/prev and clears state on close", async () => {
  const { root, cleanup } = setupDom();
  let latest = null;
  let openState = true;
  const onOpenChange = (next) => {
    openState = next === true;
  };
  const props = {
    isOpen: openState,
    onOpenChange,
    elements: [
      { elementId: "Task_A", name: "Alpha", type: "bpmn:Task" },
      { elementId: "Task_B", name: "Beta", type: "bpmn:Task" },
    ],
  };
  try {
    await renderHarness(root, props, (value) => {
      latest = value;
    });
    await act(async () => {
      latest.setQuery("task");
    });
    assert.equal(latest.results.length, 2);
    assert.equal(latest.activeResult?.elementId, "Task_A");

    await act(async () => {
      latest.next();
    });
    assert.equal(latest.activeResult?.elementId, "Task_B");

    await act(async () => {
      latest.next();
    });
    assert.equal(latest.activeResult?.elementId, "Task_A");

    await act(async () => {
      latest.prev();
    });
    assert.equal(latest.activeResult?.elementId, "Task_B");

    await act(async () => {
      latest.close();
    });
    await renderHarness(root, {
      ...props,
      isOpen: openState,
    }, (value) => {
      latest = value;
    });
    assert.equal(openState, false);
    assert.equal(latest.query, "");
    assert.equal(latest.activeIndex, -1);
  } finally {
    await cleanup();
  }
});
