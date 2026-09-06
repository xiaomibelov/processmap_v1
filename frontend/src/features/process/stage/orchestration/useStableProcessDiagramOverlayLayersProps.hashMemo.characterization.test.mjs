import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

// Модули фич используют vite-разрешение импортов без расширения ".js" —
// под node ESM такие спецификаторы не грузяются. Регистрируем resolve-hook
// (тот же приём, что в overlayMemoKeys.characterization.test.mjs).
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

const { default: useStableProcessDiagramOverlayLayersProps } = await import("./useStableProcessDiagramOverlayLayersProps.js");

// ---------------------------------------------------------------------------
// Characterization contour fix/canvas-pan-overlay-jank-v1 (F1, H1).
//
// Инвариант: fnv1aHex(draft.bpmn_xml) — ключ сегментного мемо bpmn-слоя — не
// должен пересчитываться на каждый рендер. Меняется ТОЛЬКО при смене самой
// строки bpmn_xml. Наблюдаемость: perf-счётчик
// "overlay.vm.draftBpmnXmlHash.computed" (тот же канал __FPC_DRAWIO_PERF__,
// что и остальные overlay.vm.* счётчики).
//
// Контекст: audit/canvas-pan-overlay-jank-v1 H1 — PR #918 вмержен без
// CHANGES_REQUESTED useMemo-фикса; хэш 768KB XML считался в теле хука на
// каждый рендер (1.1–6.7мс). Как причина jank отклонён, как дефект —
// подтверждён. Этот тест фиксирует контракт фикса.
// ---------------------------------------------------------------------------

const HASH_COMPUTED_COUNTER = "overlay.vm.draftBpmnXmlHash.computed";

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
  return { root, cleanup, window: dom.window };
}

function Harness({ draft, snapshots }) {
  const value = useStableProcessDiagramOverlayLayersProps({
    tab: "diagram",
    sid: "sid_hash",
    diagramMode: "modeler",
    draft,
  });
  useEffect(() => {
    snapshots.push(value);
  });
  return null;
}

function readCounter(window) {
  return Number(window.__FPC_DRAWIO_PERF__?.counters?.[HASH_COMPUTED_COUNTER] || 0);
}

test("хэш XML пересчитывается один раз на уникальную строку bpmn_xml, а не на каждый рендер", async () => {
  const { root, cleanup, window } = setupDom();
  try {
    window.__FPC_DRAWIO_PERF_ENABLE__ = true;
    const snapshots = [];
    const act = React.act;
    const xmlA = `<bpmn:definitions id="a"><bpmn:process id="p">${"x".repeat(20000)}</bpmn:process></bpmn:definitions>`;
    await act(async () => {
      root.render(React.createElement(Harness, { draft: { id: "sid_hash", bpmn_xml: xmlA }, snapshots }));
    });
    const afterFirst = readCounter(window);

    // Рендер с новой identity draft, та же строка XML — типичный rebuild meta.
    await act(async () => {
      root.render(React.createElement(Harness, { draft: { id: "sid_hash", bpmn_xml: xmlA, extra: {} }, snapshots }));
    });
    const afterSameXml = readCounter(window);
    assert.equal(
      afterSameXml,
      afterFirst,
      "хэш не должен пересчитываться при неизменной строке XML (число вычислений не растёт)",
    );
    assert.equal(afterFirst > 0, true, "канал наблюдаемости: счётчик вычислений хэша существует");

    // Реальная смена XML — хэш пересчитывается ровно один раз.
    const xmlB = xmlA.replace('id="a"', 'id="b"');
    await act(async () => {
      root.render(React.createElement(Harness, { draft: { id: "sid_hash", bpmn_xml: xmlB }, snapshots }));
    });
    const afterChange = readCounter(window);
    assert.equal(afterChange, afterFirst + 1, "смена XML → ровно одно новое вычисление хэша");
  } finally {
    await cleanup();
  }
});
