import test from "node:test";
import assert from "node:assert/strict";
import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import useBpmnQuickEditController from "./useBpmnQuickEditController.js";

function QuickEditHarness({
  quickEdit,
  targetId = "Task_1",
  dispatchActionRequest,
  draftOverride = "",
}) {
  const quick = useBpmnQuickEditController({
    quickEdit,
    targetId,
    dispatchActionRequest,
  });

  useEffect(() => {
    if (!draftOverride) return;
    if (quick.quickDraft === draftOverride) return;
    quick.setQuickDraft(draftOverride);
  }, [draftOverride, quick.quickDraft, quick.setQuickDraft]);

  return React.createElement("input", {
    ref: quick.inputRef,
    value: quick.quickDraft,
    onChange: (event) => quick.setQuickDraft(String(event?.target?.value ?? "")),
    onKeyDown: quick.onInputKeyDown,
    onBlur: quick.onInputBlur,
    "data-testid": "bpmn-context-menu-quick-input",
  });
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
    FocusEvent: globalThis.FocusEvent,
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
  globalThis.FocusEvent = dom.window.FocusEvent;
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  if (!dom.window.HTMLElement.prototype.attachEvent) {
    Object.defineProperty(dom.window.HTMLElement.prototype, "attachEvent", {
      configurable: true,
      value() {},
    });
  }
  if (!dom.window.HTMLElement.prototype.detachEvent) {
    Object.defineProperty(dom.window.HTMLElement.prototype, "detachEvent", {
      configurable: true,
      value() {},
    });
  }

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
    globalThis.FocusEvent = previous.FocusEvent;
    globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.reactActEnv;
  };

  return { dom, root, cleanup };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 24));
  });
}

async function renderHarness(root, props) {
  await act(async () => {
    root.render(React.createElement(QuickEditHarness, props));
  });
  await flush();
}

async function dispatchWithAct(target, event) {
  await act(async () => {
    target.dispatchEvent(event);
  });
}

function createQuickEdit() {
  return {
    actionId: "quick_set_name",
    label: "Название",
    placeholder: "Введите название шага",
    value: "Проверка",
    group: "quick_properties",
  };
}

test("dom integration: quick field autofocuses when task menu opens", async () => {
  const { dom, root, cleanup } = setupDom();
  try {
    await renderHarness(root, {
      quickEdit: createQuickEdit(),
      dispatchActionRequest: async () => ({ ok: true }),
    });
    const input = dom.window.document.querySelector("[data-testid='bpmn-context-menu-quick-input']");
    assert.ok(input);
    assert.equal(dom.window.document.activeElement, input);
  } finally {
    await cleanup();
  }
});

test("dom integration: Enter commits quick_set_name without close-on-success", async () => {
  const { dom, root, cleanup } = setupDom();
  const requests = [];
  try {
    await renderHarness(root, {
      quickEdit: createQuickEdit(),
      draftOverride: "Новое имя шага",
      dispatchActionRequest: async (request) => {
        requests.push(request);
        return { ok: true };
      },
    });
    const input = dom.window.document.querySelector("[data-testid='bpmn-context-menu-quick-input']");
    assert.ok(input);
    await dispatchWithAct(input, new dom.window.KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    }));
    await flush();

    assert.deepEqual(requests, [{
      actionId: "quick_set_name",
      closeOnSuccess: false,
      value: "Новое имя шага",
    }]);
  } finally {
    await cleanup();
  }
});

test("dom integration: blur commits quick_set_name without closing menu", async () => {
  const { dom, root, cleanup } = setupDom();
  const requests = [];
  try {
    await renderHarness(root, {
      quickEdit: createQuickEdit(),
      draftOverride: "Имя через blur",
      dispatchActionRequest: async (request) => {
        requests.push(request);
        return { ok: true };
      },
    });
    const input = dom.window.document.querySelector("[data-testid='bpmn-context-menu-quick-input']");
    assert.ok(input);
    await act(async () => {
      input.blur();
    });
    await flush();

    assert.deepEqual(requests, [{
      actionId: "quick_set_name",
      closeOnSuccess: false,
      value: "Имя через blur",
    }]);
  } finally {
    await cleanup();
  }
});
