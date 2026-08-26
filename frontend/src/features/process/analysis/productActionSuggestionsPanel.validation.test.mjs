// Bulk-approve validation test for ProductActionSuggestionsPanel (product-actions-output-v2).
// Run: node --test src/features/process/analysis/productActionSuggestionsPanel.validation.test.mjs
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

const VALID_PENDING = {
  id: "s-valid",
  status: "pending",
  source: "llm",
  action: {
    action_text: "Нарезать куриную грудку ножом",
    action_type: "нарезка",
    action_stage: "подготовка",
    action_object: "куриная грудка",
    action_object_category: "ингредиент",
    action_method: "нарезать ножом",
    step_id: "step-1",
    step_label: "Нарезать",
    node_id: "node-1",
    bpmn_element_id: "node-1",
  },
  binding: { step_id: "step-1", step_label: "Нарезать", node_id: "node-1", bpmn_element_id: "node-1" },
};

const INVALID_PENDING = {
  id: "s-invalid",
  status: "pending",
  source: "llm",
  action: {
    action_text: "",
    action_type: "перекладывание",
    action_stage: "до разогрева",
    action_object: "рис",
    action_object_category: "ингредиент",
    action_method: "пересыпать",
    step_id: "step-2",
    step_label: "Пересыпать",
    node_id: "node-2",
    bpmn_element_id: "node-2",
  },
  binding: { step_id: "step-2", step_label: "Пересыпать", node_id: "node-2", bpmn_element_id: "node-2" },
};

function createMockFetch(calls) {
  return async (url, options = {}) => {
    const call = { url: String(url || ""), method: String(options.method || "GET").toUpperCase(), body: options.body };
    calls.push(call);

    if (call.url.includes("/rag-readiness")) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({ data: { rag_readiness_status: "ready" } }),
      };
    }

    if (call.url.includes("/analysis/product-actions/suggestions") && call.method === "GET") {
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({
          data: [VALID_PENDING, INVALID_PENDING],
          meta: { counts: { pending: 2, approved: 0, rejected: 0, total: 2 } },
        }),
      };
    }

    if (call.url.includes("/analysis/product-actions/suggestions") && call.method === "POST") {
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({ data: call.body || {} }),
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

test("Bulk approve only approves valid pending rows", async () => {
  const { ProductActionSuggestionsPanel } = await loadModules();
  const { root, cleanup, container } = setupDom();
  const calls = [];
  globalThis.fetch = createMockFetch(calls);

  try {
    await act(async () => {
      root.render(
        React.createElement(ProductActionSuggestionsPanel, {
          sessionId: "s1",
          baseDiagramStateVersion: 7,
          steps: [
            { id: "step-1", label: "Нарезать", node_id: "node-1" },
            { id: "step-2", label: "Пересыпать", node_id: "node-2" },
          ],
        })
      );
    });
    await flush(200);

    const bulkApprove = container.querySelector('[data-testid="product-actions-bulk-approve"]');
    assert.ok(bulkApprove, "Bulk approve button must be rendered");
    assert.equal(bulkApprove.disabled, false, "Bulk approve button must be enabled when valid pending rows exist");

    await act(async () => {
      bulkApprove.click();
    });
    await flush(200);

    const approveCalls = calls.filter((c) =>
      c.method === "POST"
      && c.url.includes("/analysis/product-actions/suggestions")
      && !c.url.includes("/apply")
    );

    assert.equal(approveCalls.length, 1, `Expected exactly one approve POST, got ${approveCalls.length}`);
    const approvedBody = typeof approveCalls[0].body === "string" ? JSON.parse(approveCalls[0].body) : approveCalls[0].body;
    assert.equal(approvedBody.id, "s-valid", "Only the valid row should be approved");
    assert.equal(approvedBody.status, "approved", "Approved row must have status approved");

    const validApprove = container.querySelector('[data-testid="suggestion-approve-s-valid"]');
    assert.ok(!validApprove, "Valid row should no longer have a pending approve button after bulk approve");

    const invalidApprove = container.querySelector('[data-testid="suggestion-approve-s-invalid"]');
    assert.ok(invalidApprove, "Invalid row must still be pending");
    assert.equal(invalidApprove.disabled, true, "Invalid row approve button must remain disabled");
  } finally {
    await cleanup();
  }
});
