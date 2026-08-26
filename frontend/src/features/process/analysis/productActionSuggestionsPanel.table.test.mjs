// Table-render regression test for ProductActionSuggestionsPanel (product-actions-output-v2).
// Run: node --test src/features/process/analysis/productActionSuggestionsPanel.table.test.mjs
import test, { after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, "../../../..");

let viteServer = null;

async function loadModules() {
  if (!viteServer) {
    viteServer = await createServer({
      root: FRONTEND_ROOT,
      logLevel: "error",
      server: { middlewareMode: true },
      appType: "custom",
    });
  }
  const panel = await viteServer.ssrLoadModule("/src/features/process/analysis/ProductActionSuggestionsPanel.jsx");
  return { ProductActionSuggestionsPanel: panel.ProductActionSuggestionsPanel };
}

after(async () => {
  if (viteServer) await viteServer.close();
});

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost/",
  });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
    fetch: globalThis.fetch,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.Event = dom.window.Event;
  globalThis.MouseEvent = dom.window.MouseEvent;
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);

  const cleanup = async () => {
    await act(async () => { root.unmount(); });
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.HTMLElement = previous.HTMLElement;
    globalThis.Node = previous.Node;
    globalThis.Event = previous.Event;
    globalThis.MouseEvent = previous.MouseEvent;
    globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.IS_REACT_ACT_ENVIRONMENT;
    globalThis.fetch = previous.fetch;
  };

  return { dom, root, cleanup, container };
}

async function flush(ms = 120) {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
}

const MOCK_SUGGESTIONS = [
  {
    id: "s1",
    status: "pending",
    source: "llm",
    action: {
      action_text: "Перелить суп из контейнера в гастроёмкость",
      action_type: "перетаривание",
      action_stage: "до разогрева",
      action_object: "суп",
      action_object_category: "продукт",
      action_method: "перелить",
      product_name: "Суп",
      product_group: "Супы",
      step_id: "step-1",
      step_label: "Залить воду",
      node_id: "node-1",
      bpmn_element_id: "node-1",
    },
    binding: { step_id: "step-1", step_label: "Залить воду", node_id: "node-1", bpmn_element_id: "node-1" },
  },
  {
    id: "s2",
    status: "rejected",
    source: "llm",
    action: {
      action_text: "Надрезать упаковку рыбы ножом",
      action_type: "вскрытие",
      action_stage: "до разогрева",
      action_object: "упаковка рыбы",
      action_object_category: "упаковка",
      action_method: "надрез ножом",
      step_id: "step-2",
      step_label: "Промыть",
      node_id: "node-2",
      bpmn_element_id: "node-2",
    },
    binding: { step_id: "step-2", step_label: "Промыть", node_id: "node-2", bpmn_element_id: "node-2" },
  },
  {
    id: "s3",
    status: "pending",
    source: "llm",
    action: {
      action_text: "",
      action_type: "нарезка",
      action_stage: "подготовка",
      action_object: "куриная грудка",
      action_object_category: "ингредиент",
      action_method: "нарезать ножом",
      step_id: "step-3",
      step_label: "Нарезать",
      node_id: "node-3",
      bpmn_element_id: "node-3",
    },
    binding: { step_id: "step-3", step_label: "Нарезать", node_id: "node-3", bpmn_element_id: "node-3" },
  },
];

function mockFetch() {
  return async (url, options = {}) => {
    const path = String(url || "");
    if (path.includes("/rag-readiness")) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({ data: { rag_readiness_status: "ready" } }),
      };
    }
    if (path.includes("/analysis/product-actions/suggestions") && String(options.method || "GET").toUpperCase() === "GET") {
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({
          data: MOCK_SUGGESTIONS,
          meta: { counts: { pending: 2, approved: 0, rejected: 1, total: 3 } },
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ data: {} }),
    };
  };
}

test("ProductActionSuggestionsPanel renders compact table with action_text and labeled tags", async () => {
  const { ProductActionSuggestionsPanel } = await loadModules();
  const { root, cleanup, container } = setupDom();
  globalThis.fetch = mockFetch();

  try {
    await act(async () => {
      root.render(
        React.createElement(ProductActionSuggestionsPanel, {
          sessionId: "s1",
          baseDiagramStateVersion: 7,
          steps: [
            { id: "step-1", label: "Залить воду", node_id: "node-1" },
            { id: "step-2", label: "Промыть", node_id: "node-2" },
            { id: "step-3", label: "Нарезать", node_id: "node-3" },
          ],
        })
      );
    });
    await flush(200);

    const text = container.textContent;

    assert.ok(text.includes("Перелить суп из контейнера в гастроёмкость"), `Expected action_text in first column, got: ${text.slice(0, 400)}`);
    assert.ok(text.includes("Тип: перетаривание"), `Expected labeled type tag, got: ${text.slice(0, 400)}`);
    assert.ok(text.includes("Этап: до разогрева"), `Expected labeled stage tag, got: ${text.slice(0, 400)}`);
    assert.ok(text.includes("Объект: суп"), `Expected labeled object tag, got: ${text.slice(0, 400)}`);
    assert.ok(text.includes("Способ: перелить"), `Expected labeled method tag, got: ${text.slice(0, 400)}`);

    const rejectedApprove = container.querySelector('[data-testid="suggestion-approve-s2"]');
    assert.ok(!rejectedApprove, "Rejected row must not contain an approve button");

    const invalidApprove = container.querySelector('[data-testid="suggestion-approve-s3"]');
    assert.ok(invalidApprove, "Invalid pending row must still render an approve button (disabled)");
    assert.equal(invalidApprove.disabled, true, "Approve button must be disabled for invalid row");
  } finally {
    await cleanup();
  }
});
