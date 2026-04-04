import assert from "node:assert/strict";
import test from "node:test";
import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import useBpmnPropertiesOverlayController from "./useBpmnPropertiesOverlayController.js";

function ControllerHarness({ controllerRef, ...props }) {
  const controller = useBpmnPropertiesOverlayController(props);

  useEffect(() => {
    controllerRef.current = controller;
  }, [controller, controllerRef]);

  return null;
}

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    pretendToBeVisual: true,
  });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    reactActEnv: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: dom.window.navigator,
  });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const container = dom.window.document.getElementById("root");
  const root = createRoot(container);

  return {
    root,
    async cleanup() {
      await act(async () => {
        root.unmount();
      });
      dom.window.close();
      globalThis.window = previous.window;
      globalThis.document = previous.document;
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        writable: true,
        value: previous.navigator,
      });
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.reactActEnv;
    },
  };
}

function findEditableRow(schema, predicate) {
  const editable = (schema?.sections || []).find((section) => section.id === "editable");
  return (editable?.rows || []).find(predicate) || null;
}

test("controller preserves documentation array entries and textFormat when saving the visible row", async () => {
  const { root, cleanup } = setupDom();
  const controllerRef = { current: null };
  const calls = [];
  const initialPayload = {
    elementId: "Task_1",
    elementName: "Проверка",
    bpmnType: "bpmn:Task",
    documentation: [
      { text: "Исходный текст", textFormat: "text/html" },
      { text: "Доп. описание", textFormat: "text/markdown" },
    ],
    extensionProperties: [],
    robotMeta: [],
  };

  try {
    const bpmnRef = {
      current: {
        async runDiagramContextAction(payload) {
          calls.push(payload);
          return {
            ok: true,
            openPropertiesOverlay: {
              ...initialPayload,
              documentation: payload.documentation,
            },
          };
        },
      },
    };

    await act(async () => {
      root.render(React.createElement(ControllerHarness, {
        controllerRef,
        bpmnRef,
        setGenErr: () => {},
        setInfoMsg: () => {},
      }));
    });

    await act(async () => {
      controllerRef.current.handleContextMenuActionResult({
        actionId: "open_properties",
        result: { openPropertiesOverlay: initialPayload },
        menu: { target: { id: "Task_1" } },
      });
    });

    const documentationRow = findEditableRow(
      controllerRef.current.schema,
      (row) => row?.id === "documentation",
    );
    assert.ok(documentationRow);

    let result = null;
    await act(async () => {
      result = await controllerRef.current.submitRowValue("documentation", "Обновленный текст");
    });

    assert.deepEqual(calls[0], {
      actionId: "properties_overlay_update_documentation",
      elementId: "Task_1",
      target: { id: "Task_1" },
      documentation: [
        { text: "Обновленный текст", textFormat: "text/html" },
        { text: "Доп. описание", textFormat: "text/markdown" },
      ],
    });
    assert.deepEqual(result, { ok: true });
  } finally {
    await cleanup();
  }
});

test("controller forwards stable extension property key for duplicate names", async () => {
  const { root, cleanup } = setupDom();
  const controllerRef = { current: null };
  const calls = [];
  const initialPayload = {
    elementId: "Task_1",
    elementName: "Проверка",
    bpmnType: "bpmn:Task",
    documentation: [],
    extensionProperties: [
      { key: "0:0:priority", name: "priority", value: "high" },
      { key: "1:0:priority", name: "priority", value: "low" },
    ],
    robotMeta: [],
  };

  try {
    const bpmnRef = {
      current: {
        async runDiagramContextAction(payload) {
          calls.push(payload);
          return {
            ok: true,
            openPropertiesOverlay: {
              ...initialPayload,
              extensionProperties: initialPayload.extensionProperties.map((row) => (
                row.key === payload.propertyKey
                  ? { ...row, value: payload.value }
                  : row
              )),
            },
          };
        },
      },
    };

    await act(async () => {
      root.render(React.createElement(ControllerHarness, {
        controllerRef,
        bpmnRef,
        setGenErr: () => {},
        setInfoMsg: () => {},
      }));
    });

    await act(async () => {
      controllerRef.current.handleContextMenuActionResult({
        actionId: "open_properties",
        result: { openPropertiesOverlay: initialPayload },
        menu: { target: { id: "Task_1" } },
      });
    });

    const extensionRow = findEditableRow(
      controllerRef.current.schema,
      (row) => row?.propertyKey === "1:0:priority",
    );
    assert.ok(extensionRow);

    let result = null;
    await act(async () => {
      result = await controllerRef.current.submitRowValue(extensionRow.id, "medium");
    });

    assert.deepEqual(calls[0], {
      actionId: "properties_overlay_update_extension_property",
      elementId: "Task_1",
      target: { id: "Task_1" },
      propertyName: "priority",
      propertyKey: "1:0:priority",
      value: "medium",
    });
    assert.deepEqual(result, { ok: true });
  } finally {
    await cleanup();
  }
});
