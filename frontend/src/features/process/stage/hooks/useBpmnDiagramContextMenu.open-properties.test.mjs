import assert from "node:assert/strict";
import test from "node:test";
import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import useBpmnDiagramContextMenu from "./useBpmnDiagramContextMenu.js";
import useBpmnPropertiesOverlayController from "../../bpmn/context-menu/properties-overlay/useBpmnPropertiesOverlayController.js";

function HookHarness({ apiRef, bpmnRef }) {
  const overlay = useBpmnPropertiesOverlayController({
    bpmnRef,
    setGenErr: () => {},
    setInfoMsg: () => {},
  });
  const contextMenu = useBpmnDiagramContextMenu({
    bpmnRef,
    undoRedoState: {},
    tab: "diagram",
    hasSession: true,
    drawioEditorOpen: false,
    hybridPlacementHitLayerActive: false,
    hybridModeEffective: "",
    modalOpenSignal: false,
    closeAllDiagramActions: () => {},
    setInfoMsg: () => {},
    setGenErr: () => {},
    onActionResult: overlay.handleContextMenuActionResult,
  });

  useEffect(() => {
    apiRef.current = { overlay, contextMenu };
  }, [apiRef, contextMenu, overlay]);

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

function buildOverlayPayload(elementId) {
  return {
    elementId,
    elementName: "Подпроцесс",
    bpmnType: "bpmn:SubProcess",
    documentation: [],
    extensionProperties: [],
    robotMeta: [],
  };
}

function createActionRunner() {
  return {
    current: {
      async runDiagramContextAction(payload) {
        const actionId = String(payload?.actionId || "");
        const targetId = String(payload?.target?.id || "");
        if (actionId === "open_inside") {
          return {
            ok: true,
            openInsidePreview: {
              targetId,
              clientX: Number(payload?.clientX || 0),
              clientY: Number(payload?.clientY || 0),
              title: "Подпроцесс",
              items: [],
              summary: { stepCount: 0, transitionCount: 0, hasStart: false, hasEnd: false, hasGateway: false },
            },
          };
        }
        if (actionId === "open_properties") {
          return {
            ok: true,
            openPropertiesOverlay: buildOverlayPayload(targetId),
          };
        }
        return { ok: false, error: "unsupported_action" };
      },
    },
  };
}

async function openSubprocessMenu(apiRef) {
  await act(async () => {
    apiRef.current.contextMenu.onBpmnContextMenuRequest({
      sessionId: "session_1",
      clientX: 240,
      clientY: 180,
      target: {
        id: "SubProcess_1",
        kind: "element",
        type: "bpmn:SubProcess",
        name: "Подпроцесс",
      },
    });
  });
  assert.equal(apiRef.current.contextMenu.bpmnContextMenu?.target?.id, "SubProcess_1");
}

test("direct context-menu open_properties still opens overlay for the subprocess target", async () => {
  const { root, cleanup } = setupDom();
  const apiRef = { current: null };
  const bpmnRef = createActionRunner();

  try {
    await act(async () => {
      root.render(React.createElement(HookHarness, { apiRef, bpmnRef }));
    });

    await openSubprocessMenu(apiRef);

    await act(async () => {
      await apiRef.current.contextMenu.runBpmnContextMenuAction("open_properties");
    });

    assert.equal(apiRef.current.overlay.isOpen, true);
    assert.equal(apiRef.current.overlay.schema?.elementId, "SubProcess_1");
    assert.equal(apiRef.current.overlay.schema?.bpmnType, "bpmn:SubProcess");
    assert.equal(apiRef.current.contextMenu.bpmnSubprocessPreview, null);
  } finally {
    await cleanup();
  }
});

test("preview modal open properties closes preview and opens overlay for the same subprocess target", async () => {
  const { root, cleanup } = setupDom();
  const apiRef = { current: null };
  const bpmnRef = createActionRunner();

  try {
    await act(async () => {
      root.render(React.createElement(HookHarness, { apiRef, bpmnRef }));
    });

    await openSubprocessMenu(apiRef);

    await act(async () => {
      await apiRef.current.contextMenu.runBpmnContextMenuAction("open_inside");
    });

    assert.equal(apiRef.current.contextMenu.bpmnSubprocessPreview?.targetId, "SubProcess_1");
    assert.equal(apiRef.current.overlay.isOpen, false);

    await act(async () => {
      await apiRef.current.contextMenu.openBpmnSubprocessPreviewProperties();
    });

    assert.equal(apiRef.current.contextMenu.bpmnSubprocessPreview, null);
    assert.equal(apiRef.current.overlay.isOpen, true);
    assert.equal(apiRef.current.overlay.schema?.elementId, "SubProcess_1");
    assert.equal(apiRef.current.overlay.schema?.elementName, "Подпроцесс");
    assert.equal(apiRef.current.overlay.schema?.bpmnType, "bpmn:SubProcess");
  } finally {
    await cleanup();
  }
});
