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

const { default: useHybridSelectionController } = await import("./useHybridSelectionController.js");

// ---------------------------------------------------------------------------
// Characterization contour fix/canvas-pan-overlay-jank-v1 (F2, RC-A).
//
// Инвариант: docLive приходит из useMemo поверх hybridV2Doc; identity doc
// меняется на каждую запись meta даже при неизменном значении. Эффект-фильтр
// selectedIds обязан делать bail-out (вернуть prev), если членство не changed —
// иначе каждая запись meta порождает новую identity selectedIds и каскад
// пересчёта всех зависимых useMemo (RC-A, audit ROOT_CAUSES §RC-A).
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

function makeDocLive() {
  return {
    schema_version: 2,
    layers: [{ id: "L1", name: "Hybrid", visible: true, locked: false, opacity: 1 }],
    elements: [
      { id: "E1", layer_id: "L1", kind: "text", x: 0, y: 0, text: "a" },
      { id: "E2", layer_id: "L1", kind: "text", x: 10, y: 0, text: "b" },
    ],
    edges: [],
    bindings: [],
    view: {},
  };
}

function Harness({ docLive, snapshots }) {
  const value = useHybridSelectionController({
    enabled: true,
    modeEffective: "view",
    uiLocked: false,
    overlayRect: null,
    renderable: [],
    docLive,
    isEditableTarget: () => false,
    onDeleteIds: () => false,
    onRequestEditSelected: () => false,
  });
  useEffect(() => {
    snapshots.push({ selectedIds: value.selectedIds });
  });
  return null;
}

test("identity churn: новая identity docLive с тем же содержимым не меняет selectedIds identity", async () => {
  const { root, cleanup } = setupDom();
  try {
    const snapshots = [];
    const act = React.act;
    await act(async () => {
      root.render(React.createElement(Harness, { docLive: makeDocLive(), snapshots }));
    });
    // Выбираем оба элемента через последний снапшот API.
    const api = (() => {
      let latest = null;
      const ApiHarness = ({ docLive }) => {
        const value = useHybridSelectionController({
          enabled: true,
          modeEffective: "view",
          uiLocked: false,
          overlayRect: null,
          renderable: [],
          docLive,
          isEditableTarget: () => false,
          onDeleteIds: () => false,
          onRequestEditSelected: () => false,
        });
        latest = value;
        return null;
      };
      return { ApiHarness, getLatest: () => latest };
    })();
    await act(async () => {
      root.render(React.createElement(api.ApiHarness, { docLive: makeDocLive() }));
    });
    await act(async () => {
      api.getLatest().replaceSelection(["E1", "E2"]);
    });
    const selectedBefore = api.getLatest().selectedIds;
    assert.deepEqual(selectedBefore, ["E1", "E2"]);

    // Новая identity docLive, то же содержимое — типичная запись meta.
    await act(async () => {
      root.render(React.createElement(api.ApiHarness, { docLive: makeDocLive() }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const selectedAfter = api.getLatest().selectedIds;
    assert.deepEqual(selectedAfter, ["E1", "E2"]);
    assert.equal(
      selectedAfter,
      selectedBefore,
      "selectedIds: новая identity при неизменном членстве (churn коммит)",
    );
  } finally {
    await cleanup();
  }
});

test("behavior invariant: удалённый из docLive элемент выбывает из selection", async () => {
  const { root, cleanup } = setupDom();
  try {
    const act = React.act;
    let latest = null;
    const ApiHarness = ({ docLive }) => {
      const value = useHybridSelectionController({
        enabled: true,
        modeEffective: "view",
        uiLocked: false,
        overlayRect: null,
        renderable: [],
        docLive,
        isEditableTarget: () => false,
        onDeleteIds: () => false,
        onRequestEditSelected: () => false,
      });
      latest = value;
      return null;
    };
    await act(async () => {
      root.render(React.createElement(ApiHarness, { docLive: makeDocLive() }));
    });
    await act(async () => {
      latest.replaceSelection(["E1", "E2"]);
    });
    const doc = makeDocLive();
    doc.elements = doc.elements.filter((row) => row.id !== "E2");
    await act(async () => {
      root.render(React.createElement(ApiHarness, { docLive: doc }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    assert.deepEqual(latest.selectedIds, ["E1"]);
  } finally {
    await cleanup();
  }
});
