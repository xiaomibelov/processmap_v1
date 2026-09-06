import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

const resolveHookSource = `
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const text = String(specifier || "");
    if (!/\\.(?:mjs|cjs|js|jsx|json)$/.test(text)) {
      for (const candidate of [text + ".js", text.replace(/\\/$/, "") + "/index.js"]) {
        try {
          return await nextResolve(candidate, context);
        } catch {
          // try the next candidate
        }
      }
    }
    throw error;
  }
}
`;
register(`data:text/javascript,${encodeURIComponent(resolveHookSource)}`);

const { default: useStableDiagramControlsView } = await import("./useStableDiagramControlsView.js");

// ---------------------------------------------------------------------------
// Characterization contour fix/canvas-pan-overlay-jank-v1 (F2, RC-A).
//
// Контракт мемоизации controls-view (buildDiagramControlsView +
// buildDiagramControlsSections, ~740мс/8с pan в профиле аудита): свежий
// объект-аргумент с shallow-equal значениями → ТОТ ЖЕ referential output.
// Нестабильные значения (новая identity функций/объектов на рендер) → новый
// output (поэтому call site в ProcessStage обязан стабилизировать колбэки).
// ---------------------------------------------------------------------------

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  const cleanup = async () => {
    root.unmount();
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.IS_REACT_ACT_ENVIRONMENT;
  };
  return { root, cleanup };
}

const stableFn = () => {};
const stableToText = (v) => String(v || "");
const stableDrawioUiState = { enabled: false, interaction_mode: "view", active_tool: "select" };
const stableRobotMetaCounts = { total: 0 };
const stableBpmnRef = { current: null };

function makeInput(overrides = {}) {
  return Object.assign({
    tab: "diagram",
    sessionId: "sid_controls",
    pathHighlightEnabled: false,
    diagramFocusMode: false,
    diagramFullscreenActive: false,
    hybridVisible: false,
    drawioUiState: stableDrawioUiState,
    hybridV2ToolState: "hidden",
    hybridModeEffective: "hidden",
    toText: stableToText,
    hasSession: true,
    bpmnRef: stableBpmnRef,
    isBpmnTab: true,
    robotMetaOverlayEnabled: false,
    robotMetaCounts: stableRobotMetaCounts,
    activeQualityOverlayCount: 0,
    onNoop: stableFn,
  }, overrides);
}

function Harness({ input, snapshots }) {
  const view = useStableDiagramControlsView(() => input);
  useEffect(() => {
    snapshots.push(view);
  });
  return null;
}

test("shallow-equal input → тот же referential output; изменение → новый output", async () => {
  const { root, cleanup } = setupDom();
  try {
    const snapshots = [];
    const act = React.act;
    const input = makeInput();
    await act(async () => {
      root.render(React.createElement(Harness, { input, snapshots }));
    });
    const first = snapshots[snapshots.length - 1];

    // Свежий объект, те же значения (все функции стабильны).
    await act(async () => {
      root.render(React.createElement(Harness, { input: makeInput(), snapshots }));
    });
    const second = snapshots[snapshots.length - 1];
    assert.equal(second, first, "shallow-equal input должен давать referentially-stable view");

    // Реальное изменение примитивного значения → новый output.
    await act(async () => {
      root.render(React.createElement(Harness, { input: makeInput({ pathHighlightEnabled: true }), snapshots }));
    });
    const third = snapshots[snapshots.length - 1];
    assert.notEqual(third, first, "изменение input → новый view");

    // Новая identity функции — bust кэша (call site обязан стабилизировать).
    await act(async () => {
      root.render(React.createElement(Harness, { input: makeInput({ onNoop: () => {} }), snapshots }));
    });
    const fourth = snapshots[snapshots.length - 1];
    assert.notEqual(fourth, third, "нестабильная функция bust-ит мемо — контракт для call site");
  } finally {
    await cleanup();
  }
});
