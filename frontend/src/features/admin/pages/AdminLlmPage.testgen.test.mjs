// TestGen-таб админки /admin/llm (контур test/llm-testgen-admin, Часть 2).
// Проверяем: видимость по праву «API Docs» (prop showTestgen — без права таба
// и панели нет в DOM), состояния кнопки запуска, историю и карточку активного
// запуска. Fetch мокается через globalThis.fetch.
// Запуск: node --test src/features/admin/pages/AdminLlmPage.testgen.test.mjs
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

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost/admin/llm?tab=testgen",
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
    localStorage: globalThis.localStorage,
    sessionStorage: globalThis.sessionStorage,
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
  globalThis.localStorage = dom.window.localStorage;
  globalThis.sessionStorage = dom.window.sessionStorage;
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
    globalThis.Element = previous.Element;
    globalThis.HTMLElement = previous.HTMLElement;
    globalThis.Node = previous.Node;
    globalThis.Event = previous.Event;
    globalThis.MouseEvent = previous.MouseEvent;
    globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    globalThis.localStorage = previous.localStorage;
    globalThis.sessionStorage = previous.sessionStorage;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.reactActEnv;
    globalThis.fetch = previous.fetch;
  };

  return { dom, root, container, cleanup };
}

async function flush(ms = 30) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

function wrapInAuth(element, AuthProviderComponent) {
  return React.createElement(AuthProviderComponent, null, element);
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetchMock(runsPayload, runResponse) {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input || "");
    const method = String(init?.method || "GET").toUpperCase();
    calls.push({ url, method, body: init?.body ? String(init.body) : "" });
    if (url === "/api/admin/testgen/run" && method === "POST") {
      return typeof runResponse === "function" ? runResponse() : jsonResponse(runResponse, 201);
    }
    if (url.startsWith("/api/admin/testgen/runs/")) {
      return jsonResponse({ ok: true, item: (runsPayload.items || [])[0] || {} });
    }
    if (url.startsWith("/api/admin/testgen/runs")) {
      return jsonResponse(runsPayload);
    }
    return jsonResponse({ ok: true, items: [] });
  };
  return calls;
}

const QUEUED_RUN = {
  run_id: "tg_abc123", status: "queued", tag: "notes", batch_limit: 3,
  github_run_id: "", pr_url: "", summary: {}, error: "", requested_by: "1",
  created_at: 1700000000, updated_at: 1700000000,
};

test("без права (showTestgen=false) таба и панели TestGen нет в DOM", async () => {
  const { AdminLlmPage, AuthProvider } = await loadPage();
  const { root, container, cleanup } = setupDom();
  installFetchMock({ ok: true, items: [], count: 0 });

  await act(async () => {
    root.render(wrapInAuth(React.createElement(AdminLlmPage), AuthProvider));
  });
  await flush();

  // Даже с ?tab=testgen в URL — таб не создан, панели нет.
  assert.equal(container.querySelector('[data-testid="llm-tab-testgen"]'), null);
  assert.equal(container.querySelector('[data-testid="testgen-panel"]'), null);

  await cleanup();
});

test("с правом (showTestgen=true) таб есть, панель открывается, форма видна", async () => {
  const { AdminLlmPage, AuthProvider } = await loadPage();
  const { root, container, cleanup } = setupDom();
  installFetchMock({ ok: true, items: [], count: 0 });

  await act(async () => {
    root.render(wrapInAuth(React.createElement(AdminLlmPage, { showTestgen: true }), AuthProvider));
  });
  await flush();

  const tab = container.querySelector('[data-testid="llm-tab-testgen"]');
  assert.ok(tab, "таб TestGen должен быть в DOM");
  await act(async () => {
    tab.dispatchEvent(new globalThis.MouseEvent("click", { bubbles: true }));
  });
  await flush();

  assert.ok(container.querySelector('[data-testid="testgen-panel"]'), "панель TestGen видна");
  assert.ok(container.querySelector('[data-testid="testgen-tag-select"]'));
  assert.ok(container.querySelector('[data-testid="testgen-limit-select"]'));
  const button = container.querySelector('[data-testid="testgen-run-button"]');
  assert.ok(button);
  assert.equal(button.disabled, false, "кнопка активна при отсутствии активных запусков");
  assert.ok(container.querySelector('[data-testid="testgen-history-empty"]'));

  await cleanup();
});

test("запуск: POST уходит с tag/limit, кнопка блокируется на активном запуске", async () => {
  const { AdminLlmPage, AuthProvider } = await loadPage();
  const { root, container, cleanup } = setupDom();
  const calls = installFetchMock(
    { ok: true, items: [QUEUED_RUN], count: 1 },
    { ok: true, item: QUEUED_RUN },
  );

  await act(async () => {
    root.render(wrapInAuth(React.createElement(AdminLlmPage, { showTestgen: true }), AuthProvider));
  });
  await flush();
  await act(async () => {
    container.querySelector('[data-testid="llm-tab-testgen"]').dispatchEvent(new globalThis.MouseEvent("click", { bubbles: true }));
  });
  await flush();

  // Активный запуск из истории → кнопка заблокирована, карточка активного запуска показана.
  const button = container.querySelector('[data-testid="testgen-run-button"]');
  assert.equal(button.disabled, true, "кнопка заблокирована при активном запуске");
  assert.ok(container.querySelector('[data-testid="testgen-result"]'), "карточка активного запуска видна");
  assert.ok(container.querySelector('[data-testid="testgen-history-table"]'));

  await cleanup();
});

test("клик по кнопке: POST /api/admin/testgen/run с телом tag/limit", async () => {
  const { AdminLlmPage, AuthProvider } = await loadPage();
  const { root, container, cleanup } = setupDom();
  let started = false;
  const calls = installFetchMock(
    { ok: true, items: [], count: 0 },
    { ok: true, item: QUEUED_RUN },
  );
  // После успешного POST история начинает отдавать активный запуск.
  const rawFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input || "");
    if (url === "/api/admin/testgen/run" && String(init?.method || "").toUpperCase() === "POST") started = true;
    if (started && url.startsWith("/api/admin/testgen/runs") && !url.includes("/runs/")) {
      return jsonResponse({ ok: true, items: [QUEUED_RUN], count: 1 });
    }
    return rawFetch(input, init);
  };

  await act(async () => {
    root.render(wrapInAuth(React.createElement(AdminLlmPage, { showTestgen: true }), AuthProvider));
  });
  await flush();
  await act(async () => {
    container.querySelector('[data-testid="llm-tab-testgen"]').dispatchEvent(new globalThis.MouseEvent("click", { bubbles: true }));
  });
  await flush();

  // Выбираем limit=3.
  const limitSelect = container.querySelector('[data-testid="testgen-limit-select"]');
  await act(async () => {
    const proto = Object.getPrototypeOf(limitSelect);
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(limitSelect, "3");
    limitSelect.dispatchEvent(new globalThis.Event("change", { bubbles: true }));
  });
  await flush();

  await act(async () => {
    container.querySelector('[data-testid="testgen-run-button"]').dispatchEvent(new globalThis.MouseEvent("click", { bubbles: true }));
  });
  await flush(60);

  const post = calls.find((c) => c.url === "/api/admin/testgen/run" && c.method === "POST");
  assert.ok(post, "POST на /api/admin/testgen/run должен уйти");
  const body = JSON.parse(post.body);
  assert.equal(body.tag, "notes");
  assert.equal(body.limit, 3);
  // После ответа 201 история перезагружена и активный запуск заблокировал кнопку.
  assert.equal(container.querySelector('[data-testid="testgen-run-button"]').disabled, true);

  await cleanup();
});

test("ошибка 409: показывается сообщение, кнопка остаётся доступной", async () => {
  const { AdminLlmPage, AuthProvider } = await loadPage();
  const { root, container, cleanup } = setupDom();
  installFetchMock(
    { ok: true, items: [], count: 0 },
    () => jsonResponse({ error: { code: "conflict", message: "по тегу 'notes' уже есть активный запуск" } }, 409),
  );

  await act(async () => {
    root.render(wrapInAuth(React.createElement(AdminLlmPage, { showTestgen: true }), AuthProvider));
  });
  await flush();
  await act(async () => {
    container.querySelector('[data-testid="llm-tab-testgen"]').dispatchEvent(new globalThis.MouseEvent("click", { bubbles: true }));
  });
  await flush();

  await act(async () => {
    container.querySelector('[data-testid="testgen-run-button"]').dispatchEvent(new globalThis.MouseEvent("click", { bubbles: true }));
  });
  await flush(60);

  const errBox = container.querySelector('[data-testid="testgen-action-error"]');
  assert.ok(errBox, "блок ошибки виден");
  assert.match(errBox.textContent, /активный запуск/);
  assert.equal(container.querySelector('[data-testid="testgen-run-button"]').disabled, false);

  await cleanup();
});
