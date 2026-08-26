// Error-copy regression test for ProductActionSuggestionsPanel (P0.2/P0.3).
// Run: node --test src/features/process/analysis/productActionSuggestionsPanel.error.test.mjs
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

function mockFetchReturningProviderError() {
  return async () => ({
    ok: false,
    status: 503,
    headers: { get: () => "application/json" },
    json: async () => ({ error: "AI_PROVIDER_NOT_CONFIGURED" }),
  });
}

function mockFetchReturning(code) {
  return async () => ({
    ok: false,
    status: 503,
    headers: { get: () => "application/json" },
    json: async () => ({ ok: false, error: code, message: code }),
  });
}

test("ProductActionSuggestionsPanel shows human-readable error and hides empty state when provider is not configured", async () => {
  const { ProductActionSuggestionsPanel } = await loadModules();
  const { root, cleanup, container } = setupDom();
  globalThis.fetch = mockFetchReturningProviderError();

  try {
    await act(async () => {
      root.render(
        React.createElement(ProductActionSuggestionsPanel, {
          sessionId: "s1",
          baseDiagramStateVersion: 7,
          steps: [],
        })
      );
    });
    await flush(200);

    const text = container.textContent;
    const errorBlock = container.querySelector('[data-testid="product-actions-error"]');
    const errorBlockText = errorBlock ? errorBlock.textContent : "";
    const codeBlock = container.querySelector('[data-testid="product-actions-error-code"]');

    assert.ok(text.includes("AI-провайдер не настроен"), `Expected human-readable error message, got: ${text.slice(0, 400)}`);
    assert.doesNotMatch(errorBlockText, /AI_PROVIDER_NOT_CONFIGURED/, `Raw error code must not be in the main error block: ${errorBlockText.slice(0, 400)}`);
    assert.ok(codeBlock, "Technical error code block must be rendered");
    assert.ok(codeBlock.textContent.includes("AI_PROVIDER_NOT_CONFIGURED"), "Technical code block must contain the original code");
    assert.ok(!container.querySelector('[data-testid="product-actions-empty"]'), "Empty state must not be rendered alongside error");
    assert.ok(errorBlock, "Error state must be rendered");
  } finally {
    await cleanup();
  }
});

for (const errorCode of ["AI_PROVIDER_ERROR", "AI_RESPONSE_PARSE_ERROR", "AI_RATE_LIMIT_EXCEEDED"]) {
  test(`ProductActionSuggestionsPanel maps ${errorCode} to human-readable message`, async () => {
    const { ProductActionSuggestionsPanel } = await loadModules();
    const { root, cleanup, container } = setupDom();
    globalThis.fetch = mockFetchReturning(errorCode);

    try {
      await act(async () => {
        root.render(
          React.createElement(ProductActionSuggestionsPanel, {
            sessionId: "s1",
            baseDiagramStateVersion: 7,
            steps: [],
          })
        );
      });
      await flush(200);

      const errorBlock = container.querySelector('[data-testid="product-actions-error"]');
      const errorBlockText = errorBlock ? errorBlock.textContent : "";
      const codeBlock = container.querySelector('[data-testid="product-actions-error-code"]');

      assert.doesNotMatch(errorBlockText, new RegExp(errorCode), `Raw ${errorCode} must not be in main error block: ${errorBlockText.slice(0, 400)}`);
      assert.ok(codeBlock, "Technical error code block must be rendered");
      assert.ok(codeBlock.textContent.includes(errorCode), "Technical code block must contain the original code");
    } finally {
      await cleanup();
    }
  });
}
