import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

// Модули фич используют vite-разрешение импортов без расширения ".js" —
// под node ESM такие спецификаторы не грузятся. Регистрируем resolve-hook,
// добивающий ".js" при ERR_MODULE_NOT_FOUND (тот же приём, что в
// overlayMemoKeys.characterization.test.mjs).
const resolveHookSource = `
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const text = String(specifier || "");
    if (!/\.(?:mjs|cjs|js|jsx|json)$/.test(text)) {
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

const { default: useHybridStore } = await import("./useHybridStore.js");

// ---------------------------------------------------------------------------
// Characterization contour fix/canvas-pan-overlay-jank-v1 (F2, RC-A).
//
// Инвариант: запись в session store пересоздаёт объект draft.bpmn_meta целиком
// (App.jsx sessionToDraft rebuild), поэтому useHybridStore регулярно получает
// draftBpmnMeta с НОВОЙ identity, но ТЕМ ЖЕ логическим значением. Эффекты
// гидрации hybrid-состояния обязаны в этом случае НЕ дергать setState с новой
// identity (React иначе делает полный коммит ProcessStage без смены значения —
// усилитель idle-шторма RC-A, audit/canvas-pan-overlay-jank-v1 ROOT_CAUSES §RC-A).
//
// Поведение при РЕАЛЬНОМ изменении meta — без изменений: state обновляется.
// ---------------------------------------------------------------------------

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.navigator = dom.window.navigator;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  const cleanup = async () => {
    root.unmount();
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.navigator = previous.navigator;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.IS_REACT_ACT_ENVIRONMENT;
  };
  return { root, cleanup, window: dom.window };
}

function Harness({ draftBpmnMeta, snapshots }) {
  const value = useHybridStore({ sid: "sid_1", projectId: "proj_1", draftBpmnMeta, userId: "user_1" });
  useEffect(() => {
    snapshots.push({
      hybridLayerByElementId: value.hybridLayerByElementId,
      hybridV2Doc: value.hybridV2Doc,
    });
  });
  return null;
}

// Meta той же формы, что у реальной сессии 2ce69bd74c (stage): слой есть,
// elements/edges пустые — ровно та форма, при которой эффекты гидрации
// раньше ставили setState с новой identity на каждую запись meta.
function makeStageLikeMeta() {
  return {
    version: 3,
    hybrid_layer_by_element_id: { Activity_A: { dx: 4, dy: -2 } },
    hybrid_v2: {
      schema_version: 2,
      layers: [{ id: "L1", name: "Hybrid", visible: true, locked: false, opacity: 1 }],
      elements: [],
      edges: [],
      bindings: [],
      view: {},
    },
    drawio: { enabled: false, locked: false, opacity: 1, last_saved_at: "", doc_xml: "" },
    viewport: { zoom: 1, viewbox: { x: 0, y: 0, width: 1000, height: 600 } },
  };
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("identity churn: новая identity draftBpmnMeta с тем же значением не меняет state identity", async () => {
  const { root, cleanup, window } = setupDom();
  try {
    const snapshots = [];
    const meta = makeStageLikeMeta();
    const act = React.act;
    await act(async () => {
      root.render(React.createElement(Harness, { draftBpmnMeta: meta, snapshots }));
    });
    assert.equal(snapshots.length >= 1, true, "первая гидрация должна отрендериться");
    const before = snapshots[snapshots.length - 1];

    // Имитируем запись в session store: полный rebuild meta с новыми identity
    // всех вложенных объектов, логическое значение неизменно.
    const rebuilt = deepClone(meta);
    await act(async () => {
      root.render(React.createElement(Harness, { draftBpmnMeta: rebuilt, snapshots }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const after = snapshots[snapshots.length - 1];

    assert.equal(
      after.hybridLayerByElementId,
      before.hybridLayerByElementId,
      "hybridLayerByElementId: новая identity при неизменном значении (churn коммит ProcessStage)",
    );
    assert.equal(
      after.hybridV2Doc,
      before.hybridV2Doc,
      "hybridV2Doc: новая identity при неизменном значении (churn коммит ProcessStage)",
    );
  } finally {
    await cleanup();
    void window;
  }
});

test("behavior invariant: реальное изменение hybrid_layer_by_element_id обновляет state", async () => {
  const { root, cleanup } = setupDom();
  try {
    const snapshots = [];
    const meta = makeStageLikeMeta();
    const act = React.act;
    await act(async () => {
      root.render(React.createElement(Harness, { draftBpmnMeta: meta, snapshots }));
    });
    const before = snapshots[snapshots.length - 1];
    assert.deepEqual(before.hybridLayerByElementId, { Activity_A: { dx: 4, dy: -2 } });

    const changed = deepClone(meta);
    changed.hybrid_layer_by_element_id = { Activity_B: { dx: 10, dy: 20 } };
    await act(async () => {
      root.render(React.createElement(Harness, { draftBpmnMeta: changed, snapshots }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const after = snapshots[snapshots.length - 1];
    assert.deepEqual(after.hybridLayerByElementId, { Activity_B: { dx: 10, dy: 20 } });
  } finally {
    await cleanup();
  }
});
