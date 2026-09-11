// Вкладка «Проверка эндпоинтов» на странице /admin/llm.
// Запуск: node --test src/features/admin/pages/AdminLlmPage.endpointCheck.test.mjs
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
  const [pageMod, authMod] = await Promise.all([
    viteServer.ssrLoadModule("/src/features/admin/pages/AdminLlmPage.jsx"),
    viteServer.ssrLoadModule("/src/features/auth/AuthProvider.jsx"),
  ]);
  return { AdminLlmPage: pageMod.default, AuthProvider: authMod.AuthProvider };
}

after(async () => {
  if (viteServer) await viteServer.close();
});

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetchMock(statusPayload, detailPayload, runsPayload) {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input || "");
    const method = String(init?.method || "GET").toUpperCase();
    calls.push({ url, method, body: init?.body ? String(init.body) : "" });
    if (url === "/api/admin/endpoint-check/run" && method === "POST") {
      return jsonResponse({ ok: true, run_id: "run_new", status: "pending", trigger: "manual" }, 202);
    }
    if (url.startsWith("/api/admin/endpoint-check/runs/")) {
      return jsonResponse(detailPayload);
    }
    if (url.startsWith("/api/admin/endpoint-check/runs")) {
      return jsonResponse(runsPayload);
    }
    if (url.startsWith("/api/admin/endpoint-check/status")) {
      return jsonResponse(statusPayload);
    }
    return jsonResponse({ ok: true, items: [] });
  };
  return calls;
}

function setupDom({ tab = "endpoint-check" } = {}) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: `http://localhost/admin/llm?tab=${tab}`,
  });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    Element: globalThis.Element,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    reactActEnv: globalThis.IS_REACT_ACT_ENVIRONMENT,
    fetch: globalThis.fetch,
  };

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Element = dom.window.Element;
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
    globalThis.Element = previous.Element;
    globalThis.HTMLElement = previous.HTMLElement;
    globalThis.Node = previous.Node;
    globalThis.Event = previous.Event;
    globalThis.MouseEvent = previous.MouseEvent;
    globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.reactActEnv;
    globalThis.fetch = previous.fetch;
  };

  return { dom, root, container, cleanup };
}

async function flush(ms = 30) {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
}

function wrapInAuth(element, AuthProviderComponent) {
  return React.createElement(AuthProviderComponent, null, element);
}

const NO_NEW_RUN = {
  id: "run_clean",
  started_at: 1755600000,
  finished_at: 1755600060,
  trigger: "manual",
  status: "done",
  version: { commit: "68d4c6c2abc", branch: "main", env: "prod" },
  counts: { ok: 10, scanned: 10 },
  diff: { new_error: 0, new_domain_error: 0, still_failing: 0, still_domain_error: 0, fixed: 0, domain_fixed: 0, new_endpoint: 0 },
};

const DETAIL_NO_NEW = {
  ok: true,
  run: NO_NEW_RUN,
  results: [
    { operation_id: "op_ok", method: "get", path: "/api/a", http_status: 200, category: "ok", diff_status: "ok", latency_ms: 12 },
  ],
  not_scanned: { count: 0, operation_ids: [] },
  blind_zone: [],
};

test("без права (showEndpointCheck=false) таба и панели нет в DOM", async () => {
  const { AdminLlmPage, AuthProvider } = await loadPage();
  const { root, container, cleanup } = setupDom();
  installFetchMock({ ok: true, active: null, last_run: null }, DETAIL_NO_NEW, { ok: true, items: [], count: 0 });

  await act(async () => { root.render(wrapInAuth(React.createElement(AdminLlmPage), AuthProvider)); });
  await flush();

  assert.equal(container.querySelector('[data-testid="llm-tab-endpoint-check"]'), null);
  assert.equal(container.querySelector('[data-testid="endpoint-check-panel"]'), null);

  await cleanup();
});

test("с правом (showEndpointCheck=true) таб есть, панель открывается по URL", async () => {
  const { AdminLlmPage, AuthProvider } = await loadPage();
  const { root, container, cleanup } = setupDom();
  installFetchMock({ ok: true, active: null, last_run: NO_NEW_RUN }, DETAIL_NO_NEW, { ok: true, items: [NO_NEW_RUN], count: 1 });

  await act(async () => { root.render(wrapInAuth(React.createElement(AdminLlmPage, { showEndpointCheck: true }), AuthProvider)); });
  await flush();

  const tab = container.querySelector('[data-testid="llm-tab-endpoint-check"]');
  assert.ok(tab, "таб endpoint-check должен быть в DOM");
  assert.ok(container.querySelector('[data-testid="endpoint-check-panel"]'), "панель видна");
  assert.ok(container.querySelector('[data-testid="endpoint-check-run-button"]'));

  await cleanup();
});

test("пустой фильтр «Новые» при 0 новых ошибок: показывает осмысленное состояние и кнопку «Все»", async () => {
  const { AdminLlmPage, AuthProvider } = await loadPage();
  const { root, container, cleanup } = setupDom();
  installFetchMock({ ok: true, active: null, last_run: NO_NEW_RUN }, DETAIL_NO_NEW, { ok: true, items: [NO_NEW_RUN], count: 1 });

  await act(async () => { root.render(wrapInAuth(React.createElement(AdminLlmPage, { showEndpointCheck: true }), AuthProvider)); });
  await flush();

  const emptyMessage = container.querySelector('[data-testid="endpoint-check-empty-message"]');
  assert.ok(emptyMessage, "должно быть пустое состояние");
  assert.match(emptyMessage.textContent, /Новых ошибок нет/);
  assert.ok(container.querySelector('[data-testid="endpoint-check-show-all"]'), "должна быть кнопка «Все»");

  await cleanup();
});

test("клик по кнопке «Запустить»: POST /api/admin/endpoint-check/run", async () => {
  const { AdminLlmPage, AuthProvider } = await loadPage();
  const { root, container, cleanup } = setupDom();
  const calls = installFetchMock(
    { ok: true, active: null, last_run: NO_NEW_RUN },
    DETAIL_NO_NEW,
    { ok: true, items: [], count: 0 },
  );

  await act(async () => { root.render(wrapInAuth(React.createElement(AdminLlmPage, { showEndpointCheck: true }), AuthProvider)); });
  await flush();

  await act(async () => {
    container.querySelector('[data-testid="endpoint-check-run-button"]').dispatchEvent(new globalThis.MouseEvent("click", { bubbles: true }));
  });
  await flush(60);

  const post = calls.find((c) => c.url === "/api/admin/endpoint-check/run" && c.method === "POST");
  assert.ok(post, "POST на /api/admin/endpoint-check/run должен уйти");

  await cleanup();
});

test("ошибка 409: показывается notice, кнопка остаётся доступной", async () => {
  const { AdminLlmPage, AuthProvider } = await loadPage();
  const { root, container, cleanup } = setupDom();
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input || "");
    const method = String(init?.method || "GET").toUpperCase();
    if (url === "/api/admin/endpoint-check/run" && method === "POST") {
      return jsonResponse({ detail: "scan_already_running", run_id: "run_active" }, 409);
    }
    return jsonResponse({ ok: true, items: [] });
  };

  await act(async () => { root.render(wrapInAuth(React.createElement(AdminLlmPage, { showEndpointCheck: true }), AuthProvider)); });
  await flush();

  await act(async () => {
    container.querySelector('[data-testid="endpoint-check-run-button"]').dispatchEvent(new globalThis.MouseEvent("click", { bubbles: true }));
  });
  await flush(60);

  const notice = container.querySelector('[data-testid="endpoint-check-notice"]');
  assert.ok(notice, "блок notice виден");
  assert.match(notice.textContent, /уже выполняется/);
  assert.equal(container.querySelector('[data-testid="endpoint-check-run-button"]').disabled, false);

  await cleanup();
});

test("drill-down по строке: раскрывает тело ответа и error-events", async () => {
  const { AdminLlmPage, AuthProvider } = await loadPage();
  const { root, container, cleanup } = setupDom();
  const detail = {
    ok: true,
    run: NO_NEW_RUN,
    results: [
      {
        operation_id: "op_err",
        method: "get",
        path: "/api/err",
        http_status: 500,
        category: "http_error",
        diff_status: "new_error",
        latency_ms: 34,
        body_excerpt: "{\"error\": \"boom\"}",
        error_events: [{ event_id: "evt_1", message: "something failed", fingerprint: "fp1" }],
      },
    ],
    not_scanned: { count: 0, operation_ids: [] },
    blind_zone: [],
  };
  installFetchMock({ ok: true, active: null, last_run: NO_NEW_RUN }, detail, { ok: true, items: [NO_NEW_RUN], count: 1 });

  await act(async () => { root.render(wrapInAuth(React.createElement(AdminLlmPage, { showEndpointCheck: true }), AuthProvider)); });
  await flush();

  const row = container.querySelector('[data-testid="endpoint-check-row-op_err"]');
  assert.ok(row, "строка op_err есть");
  await act(async () => {
    row.dispatchEvent(new globalThis.MouseEvent("click", { bubbles: true }));
  });
  await flush();

  assert.ok(container.querySelector("pre")?.textContent.includes('"error": "boom"'), "тело ответа видно");
  assert.ok(container.textContent.includes("something failed"), "error-events видны");

  await cleanup();
});
