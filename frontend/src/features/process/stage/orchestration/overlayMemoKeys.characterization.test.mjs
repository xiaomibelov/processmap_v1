import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

// useStableProcessDiagramOverlayLayersProps импортирует
// "./buildProcessDiagramOverlayLayersProps" БЕЗ расширения ".js"
// (vite-разрешение, под node ESM не загружается). Регистрируем resolve-hook,
// добивающий ".js" при ERR_MODULE_NOT_FOUND — только для этого тест-процесса.
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

const { default: useStableProcessDiagramOverlayLayersProps } = await import("./useStableProcessDiagramOverlayLayersProps.js");

// ---------------------------------------------------------------------------
// Characterization contour canvas-save-pipeline-extraction-v1 (Этап 0).
//
// Текущее поведение сегментного мемо useStableProcessDiagramOverlayLayersProps:
// readMemoizedSegment кэширует по areInputsShallowEqual — identity по каждому
// ключу. Ключ "draft" входит в BPMN_INPUT_KEYS (useStableProcessDiagramOverlayLayersProps.js:81),
// поэтому ЛЮБАЯ смена identity входного объекта draft (даже с идентичным
// содержимым bpmn_xml) даёт cache miss. Это эталон текущего поведения
// (в т.ч. известный промах мемо); будущая правка на примитивный ключ
// (draft?.bpmn_xml) зафиксирована отдельным test.todo ниже.
//
// Наблюдаемость: perf-счётчики window.__FPC_DRAWIO_PERF__.counters
// ("overlay.vm.diagramOverlayProps.cacheHit"/".cacheMiss",
//  "overlay.vm.input.changed.draft") — тот же канал, что использует продакшн.
// ---------------------------------------------------------------------------

const DIAGRAM_COUNTER_HIT = "overlay.vm.diagramOverlayProps.cacheHit";
const DIAGRAM_COUNTER_MISS = "overlay.vm.diagramOverlayProps.cacheMiss";
const CHANGED_DRAFT_COUNTER = "overlay.vm.input.changed.draft";

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    Event: globalThis.Event,
    Element: globalThis.Element,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    reactActEnv: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Event = dom.window.Event;
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
    globalThis.Event = previous.Event;
    globalThis.Element = previous.Element;
    globalThis.HTMLElement = previous.HTMLElement;
    globalThis.Node = previous.Node;
    globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.reactActEnv;
  };
  return { root, cleanup, window: dom.window };
}

function Harness({ input, expose }) {
  const value = useStableProcessDiagramOverlayLayersProps(input);
  useEffect(() => {
    expose(value);
  }, [value, expose]);
  return null;
}

function readPerfCounter(window, key) {
  return Number(window.__FPC_DRAWIO_PERF__?.counters?.[key] || 0);
}

function makeInput({ draft }) {
  return {
    tab: "diagram",
    sid: "sid_overlay",
    diagramMode: "modeler",
    draft,
  };
}

test("same input identity hits the bpmn segment cache on second render", async () => {
  const { root, cleanup, window } = setupDom();
  window.__FPC_DRAWIO_PERF_ENABLE__ = true;
  let latest = null;
  const draft = { id: "sid_overlay", bpmn_xml: "<bpmn:definitions id=\"same\"/>" };
  const input = makeInput({ draft });

  try {
    await act(async () => {
      root.render(React.createElement(Harness, { input, expose: (v) => { latest = v; } }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 16));
    });
    assert.ok(latest, "hook exposes overlay props");
    const missAfterFirst = readPerfCounter(window, DIAGRAM_COUNTER_MISS);
    assert.ok(missAfterFirst >= 1, "first render is a cache miss");

    await act(async () => {
      root.render(React.createElement(Harness, { input, expose: (v) => { latest = v; } }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 16));
    });

    assert.equal(
      readPerfCounter(window, DIAGRAM_COUNTER_MISS),
      missAfterFirst,
      "second render with the same input identity must not miss the cache",
    );
    assert.ok(
      readPerfCounter(window, DIAGRAM_COUNTER_HIT) >= 1,
      "second render with the same input identity must hit the cache",
    );
  } finally {
    await cleanup();
  }
});

test("new draft identity with identical bpmn_xml misses the bpmn segment cache (current bug-etalone)", async () => {
  const { root, cleanup, window } = setupDom();
  window.__FPC_DRAWIO_PERF_ENABLE__ = true;
  let latest = null;
  const bpmnXml = "<bpmn:definitions id=\"same-content\"/>";
  const firstInput = makeInput({ draft: { id: "sid_overlay", bpmn_xml: bpmnXml } });

  try {
    await act(async () => {
      root.render(React.createElement(Harness, { input: firstInput, expose: (v) => { latest = v; } }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 16));
    });
    const missAfterFirst = readPerfCounter(window, DIAGRAM_COUNTER_MISS);

    // Новый объект draft с ТЕМ ЖЕ содержимым bpmn_xml — текущий эталон: промах.
    const secondInput = makeInput({ draft: { id: "sid_overlay", bpmn_xml: bpmnXml } });
    assert.notEqual(secondInput.draft, firstInput.draft, "draft identity must differ");
    assert.equal(secondInput.draft.bpmn_xml, firstInput.draft.bpmn_xml, "draft content identical");

    await act(async () => {
      root.render(React.createElement(Harness, { input: secondInput, expose: (v) => { latest = v; } }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 16));
    });

    assert.equal(
      readPerfCounter(window, DIAGRAM_COUNTER_MISS),
      missAfterFirst + 1,
      "new draft identity must produce exactly one more cache miss (identity-keyed memo)",
    );
    assert.ok(
      readPerfCounter(window, CHANGED_DRAFT_COUNTER) >= 1,
      "perf counter must attribute the miss to the draft key (BPMN_INPUT_KEYS :81)",
    );
    assert.equal(
      readPerfCounter(window, DIAGRAM_COUNTER_HIT),
      0,
      "identity change must not be a cache hit in the current implementation",
    );
  } finally {
    await cleanup();
  }
});

test.todo(
  "future fix: new draft identity with identical bpmn_xml must HIT the bpmn segment cache (primitive draft?.bpmn_xml memo key)",
);
