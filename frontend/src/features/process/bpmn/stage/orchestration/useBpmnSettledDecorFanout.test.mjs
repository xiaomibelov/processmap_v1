import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

import useBpmnSettledDecorFanout from "./useBpmnSettledDecorFanout.js";

function HookHarness(props) {
  useBpmnSettledDecorFanout(props);
  return null;
}

test("re-applies user notes/docs decor when runtime becomes ready after initial no-op pass", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>");
  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
  const prevNavigator = globalThis.navigator;
  const prevActEnv = globalThis.IS_REACT_ACT_ENVIRONMENT;

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: dom.window.navigator,
  });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  try {
    const container = globalThis.document.getElementById("root");
    const root = createRoot(container);

    const viewerRef = { current: null };
    const modelerRef = { current: null };
    const modelerReadyRef = { current: false };
    const runtime = {
      status: { ready: false, defs: false, token: 0 },
      inst: null,
    };
    const modelerRuntimeRef = {
      current: {
        getStatus: () => runtime.status,
        getInstance: () => runtime.inst,
      },
    };

    const notesCalls = [];

    const baseProps = {
      viewerRef,
      modelerRef,
      modelerRuntimeRef,
      modelerReadyRef,
      view: "viewer",
      draft: {
        notesByElementId: {},
        notes_by_element: {},
        bpmn_meta: {},
        nodes: [],
      },
      diagramDisplayMode: "normal",
      stepTimeUnit: "min",
      robotMetaOverlayEnabled: false,
      robotMetaOverlayFilters: {},
      robotMetaStatusByElementId: {},
      selectedPropertiesOverlayPreview: null,
      propertiesOverlayAlwaysEnabled: false,
      propertiesOverlayAlwaysPreviewByElementId: {},
      isInterviewDecorModeOn: () => false,
      clearUserNotesDecor: () => {},
      applyUserNotesDecor: (inst, kind) => {
        notesCalls.push([inst?.id || null, kind]);
      },
      applyStepTimeDecor: () => {},
      applyRobotMetaDecor: () => {},
      applyPropertiesOverlayDecor: () => {},
      clearPropertiesOverlayDecor: () => {},
      selectedMarkerStateRef: { current: {} },
      settledSelectionFanoutRef: { current: {} },
      buildSettledSelectionFanoutSignature: () => "",
      emitElementSelection: () => {},
      syncAiQuestionPanelWithSelection: () => {},
      syncCamundaExtensionsToModeler: () => {},
    };

    await act(async () => {
      root.render(React.createElement(HookHarness, { ...baseProps, tick: 0 }));
    });

    assert.deepEqual(notesCalls, [
      [null, "viewer"],
      [null, "editor"],
    ]);

    viewerRef.current = { id: "viewer_inst" };
    runtime.inst = { id: "modeler_inst" };
    runtime.status = { ready: true, defs: true, token: 1 };
    modelerReadyRef.current = true;

    await act(async () => {
      root.render(React.createElement(HookHarness, { ...baseProps, tick: 1 }));
    });

    assert.deepEqual(notesCalls.slice(-2), [
      ["viewer_inst", "viewer"],
      ["modeler_inst", "editor"],
    ]);

    await act(async () => {
      root.unmount();
    });
  } finally {
    globalThis.window = prevWindow;
    globalThis.document = prevDocument;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      writable: true,
      value: prevNavigator,
    });
    globalThis.IS_REACT_ACT_ENVIRONMENT = prevActEnv;
  }
});
