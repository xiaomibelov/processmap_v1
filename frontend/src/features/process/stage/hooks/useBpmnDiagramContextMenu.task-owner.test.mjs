import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import useBpmnDiagramContextMenu from "./useBpmnDiagramContextMenu.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readSource() {
  return fs.readFileSync(path.join(__dirname, "useBpmnDiagramContextMenu.js"), "utf8");
}

function Harness({ hookProps, expose }) {
  const value = useBpmnDiagramContextMenu(hookProps);
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

test("task-menu hook no longer owns subprocess preview branch", () => {
  const source = readSource();
  assert.equal(source.includes("openInsidePreview"), false);
  assert.equal(source.includes("bpmnSubprocessPreview"), false);
  assert.equal(source.includes("openBpmnSubprocessPreviewProperties"), false);
});

test("task-menu hook still opens task context menu with task quick-edit contract", async () => {
  const { root, cleanup } = setupDom();
  let latest = null;
  try {
    await renderHarness(root, {
      expose: (value) => {
        latest = value;
      },
      hookProps: {
        bpmnRef: {
          current: {
            getUndoRedoState: () => ({ canUndo: true, canRedo: false }),
            runDiagramContextAction: async () => ({ ok: true }),
          },
        },
        undoRedoState: { canUndo: false, canRedo: true },
        tab: "diagram",
        hasSession: true,
        drawioEditorOpen: false,
        hybridPlacementHitLayerActive: false,
        hybridModeEffective: "",
        modalOpenSignal: false,
        closeAllDiagramActions: () => {},
        setInfoMsg: () => {},
        setGenErr: () => {},
      },
    });

    let accepted = false;
    await act(async () => {
      accepted = latest.onBpmnContextMenuRequest({
        sessionId: "SID_1",
        clientX: 220,
        clientY: 160,
        source: "task.body.contextmenu",
        target: {
          kind: "element",
          id: "Task_1",
          bpmnType: "bpmn:Task",
          type: "bpmn:Task",
          name: "Проверка",
        },
      });
    });
    await flush();

    assert.equal(accepted, true);
    assert.equal(latest?.bpmnContextMenu?.target?.id, "Task_1");
    assert.equal(latest?.bpmnContextMenu?.kind, "task");
    assert.equal(latest?.bpmnContextMenu?.quickEdit?.actionId, "quick_set_name");
    assert.equal("bpmnSubprocessPreview" in latest, false);
    assert.equal("openBpmnSubprocessPreviewProperties" in latest, false);
    assert.equal("closeBpmnSubprocessPreview" in latest, false);
  } finally {
    await cleanup();
  }
});

test("context menu action error does not render raw object text", async () => {
  const { root, cleanup } = setupDom();
  let latest = null;
  const errors = [];
  try {
    await renderHarness(root, {
      expose: (value) => {
        latest = value;
      },
      hookProps: {
        bpmnRef: {
          current: {
            getUndoRedoState: () => ({ canUndo: false, canRedo: false }),
            runDiagramContextAction: async () => ({
              ok: false,
              error: {
                code: "forced_clipboard_structured_error",
                message: "Не удалось вставить элемент",
              },
            }),
          },
        },
        undoRedoState: {},
        tab: "diagram",
        hasSession: true,
        drawioEditorOpen: false,
        hybridPlacementHitLayerActive: false,
        hybridModeEffective: "",
        modalOpenSignal: false,
        closeAllDiagramActions: () => {},
        setInfoMsg: () => {},
        setGenErr: (message) => errors.push(String(message || "")),
      },
    });

    await act(async () => {
      latest.onBpmnContextMenuRequest({
        sessionId: "SID_1",
        clientX: 220,
        clientY: 160,
        source: "task.body.contextmenu",
        target: {
          kind: "element",
          id: "Task_1",
          bpmnType: "bpmn:Task",
          type: "bpmn:Task",
          name: "Проверка",
        },
      });
    });
    await flush();

    await act(async () => {
      await latest.runBpmnContextMenuAction({ actionId: "paste" });
    });

    assert.equal(errors.at(-1), "Не удалось вставить элемент");
    assert.notEqual(errors.at(-1), "[object Object]");
  } finally {
    await cleanup();
  }
});
