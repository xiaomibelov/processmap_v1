// Видимость карточки «Проверка эндпоинтов» на дашборде админки: есть в DOM
// только при праве уровня кнопки «API Docs» (canOpenApiDocs = canOpenOrgSettings).
// Паттерн — TopBar.api-docs-button.test.mjs (vite ssrLoadModule + jsdom).
// Запуск: node --test src/features/admin/pages/AdminDashboardPage.endpointCheck.test.mjs
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

async function loadPage() {
  if (!viteServer) {
    viteServer = await createServer({
      root: FRONTEND_ROOT,
      logLevel: "error",
      server: { middlewareMode: true },
      appType: "custom",
    });
  }
  const mod = await viteServer.ssrLoadModule("/src/features/admin/pages/AdminDashboardPage.jsx");
  return mod.default;
}

after(async () => {
  if (viteServer) await viteServer.close();
});

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => (String(k).toLowerCase() === "content-type" ? "application/json" : null) },
    json: async () => data,
    text: async () => JSON.stringify(data),
    blob: async () => new Blob(),
  };
}

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    Event: globalThis.Event,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    localStorage: globalThis.localStorage,
    sessionStorage: globalThis.sessionStorage,
    fetch: globalThis.fetch,
    reactActEnv: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.Event = dom.window.Event;
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  globalThis.localStorage = dom.window.localStorage;
  globalThis.sessionStorage = dom.window.sessionStorage;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/api/admin/endpoint-check/status")) {
      return jsonResponse({
        active: null,
        last_run: {
          id: "run_1",
          started_at: 1755600000,
          finished_at: 1755600060,
          trigger: "deploy",
          version: { commit: "68d4c6c2abc", branch: "main", env: "prod" },
          counts: { ok: 40, http_error: 2, http_error_5xx: 1, domain_error: 0, timeout: 0, conn_error: 0, scanned: 42 },
          diff: { new_error: 2, still_failing: 1, fixed: 3, new_endpoint: 0, new_domain_error: 0, still_domain_error: 0, domain_fixed: 0 },
        },
      });
    }
    if (u.includes("/api/feature-flags")) return jsonResponse({ flags: {} });
    return jsonResponse({ ok: true, items: [] });
  };
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
    globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    globalThis.localStorage = previous.localStorage;
    globalThis.sessionStorage = previous.sessionStorage;
    globalThis.fetch = previous.fetch;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.reactActEnv;
  };

  return { dom, root, cleanup };
}

async function flush(ms = 60) {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
}

test("AdminDashboardPage: без права canOpenApiDocs карточки нет в DOM вообще", async () => {
  const Page = await loadPage();
  const { dom, root, cleanup } = setupDom();
  try {
    await act(async () => {
      root.render(React.createElement(Page, { payload: {}, onNavigate: () => {}, canOpenApiDocs: false }));
    });
    await flush();
    assert.equal(dom.window.document.querySelector('[data-testid="endpoint-check-run-button"]'), null);
    assert.equal(dom.window.document.body.textContent.includes("Проверка эндпоинтов"), false);
  } finally {
    await cleanup();
  }
});

test("AdminDashboardPage: с правом — карточка, сводка и красный бейдж new_error", async () => {
  const Page = await loadPage();
  const { dom, root, cleanup } = setupDom();
  try {
    await act(async () => {
      root.render(React.createElement(Page, { payload: {}, onNavigate: () => {}, canOpenApiDocs: true }));
    });
    await flush(120);
    const runBtn = dom.window.document.querySelector('[data-testid="endpoint-check-run-button"]');
    assert.ok(runBtn, "кнопка «Запустить» должна быть в DOM");
    assert.equal(runBtn.disabled, false);
    const text = dom.window.document.body.textContent;
    assert.ok(text.includes("Проверка эндпоинтов"));
    assert.ok(text.includes("40 ok"));
    assert.ok(text.includes("2 новых ошибок"));
    const badge = dom.window.document.querySelector('[data-testid="endpoint-check-new-errors-badge"]');
    assert.ok(badge, "красный бейдж при diff.new_error > 0 должен быть виден сразу");
    assert.ok(badge.textContent.includes("2"));
  } finally {
    await cleanup();
  }
});
