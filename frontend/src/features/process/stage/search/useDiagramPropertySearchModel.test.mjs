import assert from "node:assert/strict";
import test from "node:test";

import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import useDiagramPropertySearchModel, {
  collectDiagramPropertySearchResults,
  normalizeDiagramPropertySearchEntry,
} from "./useDiagramPropertySearchModel.js";

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
  const value = useDiagramPropertySearchModel(props);
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

test("normalizeDiagramPropertySearchEntry normalizes property and element fields", () => {
  const row = normalizeDiagramPropertySearchEntry({
    searchId: "Task_1::prop_1",
    elementId: "Task_1",
    elementTitle: "Approve",
    elementType: "bpmn:ServiceTask",
    propertyName: "Retries",
    propertyValue: "3",
    sourcePath: "extensionElements.values[0].retries",
  });
  assert.equal(row.entryKey, "Task_1::prop_1");
  assert.equal(row.elementTypeLabel, "ServiceTask");
  assert.equal(row.propertyName, "Retries");
  assert.equal(row.propertyValue, "3");
  assert.equal(row.sourcePath, "extensionElements.values[0].retries");
});

test("collectDiagramPropertySearchResults matches only by property name/value (case-insensitive)", () => {
  const rows = [
    {
      elementId: "Task_A",
      elementTitle: "Call Worker",
      elementType: "bpmn:ServiceTask",
      propertyName: "topic",
      propertyValue: "inventory",
    },
    {
      elementId: "Task_B",
      elementTitle: "Approve",
      elementType: "bpmn:UserTask",
      propertyName: "priority",
      propertyValue: "high",
    },
  ];
  assert.deepEqual(
    collectDiagramPropertySearchResults(rows, "topic").map((item) => item.elementId),
    ["Task_A"],
  );
  assert.deepEqual(
    collectDiagramPropertySearchResults(rows, "HIGH").map((item) => item.elementId),
    ["Task_B"],
  );
  assert.deepEqual(
    collectDiagramPropertySearchResults(rows, "service").map((item) => item.elementId),
    [],
  );
});

test("collectDiagramPropertySearchResults matches multi-word values with whitespace-normalized query", () => {
  const rows = [
    {
      elementId: "Task_CheckOrder",
      elementTitle: "Проверить заказ",
      elementType: "bpmn:ServiceTask",
      propertyName: "instruction",
      propertyValue: "Проверить заказ перед отправкой",
    },
    {
      elementId: "Task_Signal",
      elementTitle: "Звуковой сигнал",
      elementType: "bpmn:ServiceTask",
      propertyName: "signal",
      propertyValue: "Звуковой сигнал готов",
    },
  ];
  assert.deepEqual(
    collectDiagramPropertySearchResults(rows, "проверить заказ").map((item) => item.elementId),
    ["Task_CheckOrder"],
  );
  assert.deepEqual(
    collectDiagramPropertySearchResults(rows, "  проверить   заказ  ").map((item) => item.elementId),
    ["Task_CheckOrder"],
  );
  assert.deepEqual(
    collectDiagramPropertySearchResults(rows, "звуковой сигнал").map((item) => item.elementId),
    ["Task_Signal"],
  );
});

test("collectDiagramPropertySearchResults preserves owner subprocess hierarchy metadata", () => {
  const rows = [
    {
      elementId: "Task_CheckOrder",
      elementTitle: "Проверить заказ",
      elementType: "bpmn:ServiceTask",
      propertyName: "instruction",
      propertyValue: "Проверить заказ перед отправкой",
      parentSubprocessId: "Sub_1",
      parentSubprocessName: "Проверить заказ",
      subprocessPath: [{ id: "Sub_1", name: "Проверить заказ" }],
      searchGroupKey: "subprocess:Sub_1",
      searchGroupLabel: "Subprocess: Проверить заказ",
      isInsideSubprocess: true,
    },
  ];
  const [row] = collectDiagramPropertySearchResults(rows, "отправкой");
  assert.equal(row.searchGroupKey, "subprocess:Sub_1");
  assert.equal(row.searchGroupLabel, "Subprocess: Проверить заказ");
  assert.equal(row.parentSubprocessId, "Sub_1");
  assert.equal(row.subprocessPathLabel, "Проверить заказ");
  assert.equal(row.isInsideSubprocess, true);
});

test("useDiagramPropertySearchModel supports wrap-around navigation and clears state on close", async () => {
  const { root, cleanup } = setupDom();
  let latest = null;
  let openState = true;
  const onOpenChange = (next) => {
    openState = next === true;
  };
  const props = {
    isOpen: openState,
    onOpenChange,
    entries: [
      {
        elementId: "Task_A",
        elementTitle: "Call Worker",
        elementType: "bpmn:ServiceTask",
        propertyName: "topic",
        propertyValue: "inventory",
      },
      {
        elementId: "Task_B",
        elementTitle: "Approve",
        elementType: "bpmn:UserTask",
        propertyName: "priority",
        propertyValue: "high",
      },
    ],
  };
  try {
    await renderHarness(root, props, (value) => {
      latest = value;
    });
    await act(async () => {
      latest.setQuery("t");
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
