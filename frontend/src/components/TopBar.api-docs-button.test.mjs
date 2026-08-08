// Кнопка «API Docs» в TopBar: видна при праве уровня админки (как «Админ-панель»),
// отсутствует в DOM без права; гонка прав — не показывается до загрузки.
// Запуск: node --test src/components/TopBar.api-docs-button.test.mjs
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
const FRONTEND_ROOT = path.resolve(__dirname, "../..");

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
  const [topbar, auth, apiCore] = await Promise.all([
    viteServer.ssrLoadModule("/src/components/TopBar.jsx"),
    viteServer.ssrLoadModule("/src/features/auth/AuthProvider.jsx"),
    viteServer.ssrLoadModule("/src/lib/apiCore.js"),
  ]);
  return { TopBar: topbar.default, AuthProvider: auth.AuthProvider, useAuth: auth.useAuth, setAccessToken: apiCore.setAccessToken, apiAuthMe: apiCore.apiAuthMe };
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

function setupDom({ me }) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent,
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
  globalThis.MouseEvent = dom.window.MouseEvent;
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  globalThis.localStorage = dom.window.localStorage;
  globalThis.sessionStorage = dom.window.sessionStorage;
  // access token — иначе AuthProvider не вызывает /api/auth/me
  dom.window.localStorage.setItem("fpc_auth_access_token", "test-token");
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/api/auth/me")) return jsonResponse(me);
    if (u.includes("/api/auth/login") || u.includes("/api/auth/refresh")) return jsonResponse({ access_token: "t", refresh_token: "r" });
    return jsonResponse({ ok: true, items: [], results: [], notes: [], aggregate: {}, by_element: {} });
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
    globalThis.MouseEvent = previous.MouseEvent;
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

function mePayload(role) {
  return {
    id: "u1",
    email: "t@local",
    is_admin: false,
    role: "analyst",
    active_org_id: "org_default",
    default_org_id: "org_default",
    orgs: [{ org_id: "org_default", name: "Default", role }],
    groups: [],
  };
}

async function renderTopBar(env, mods, { orgRole = "" } = {}) {
  mods.setAccessToken?.("test-token"); // accessToken кэшируется при init apiCore — ставим явно
  await act(async () => {
    env.root.render(
      React.createElement(mods.AuthProvider, null,
        React.createElement(mods.TopBar, {
          orgs: [{ org_id: "org_default", name: "Default", role: orgRole }],
          activeOrgId: "org_default",
          projects: [],
          sessions: [],
          mentionNotifications: [],
          noteNotifications: [],
        })),
    );
  });
  await flush(150);
  return env.dom.window.document;
}

test("роль org_owner (право уровня админки): кнопка «API Docs» есть, ведёт на /api/docs в новой вкладке", async () => {
  const mods = await loadModules();
  const env = setupDom({ me: mePayload("org_owner") });
  try {
    const doc = await renderTopBar(env, mods, { orgRole: "org_owner" });
    const btn = doc.querySelector('[data-testid="topbar-api-docs-button"]');
    assert.notEqual(btn, null, "кнопка должна быть в DOM");
    assert.equal(btn.getAttribute("href"), "/api/docs");
    assert.equal(btn.getAttribute("target"), "_blank");
    assert.equal(btn.getAttribute("rel"), "noopener noreferrer");
    // рядом — кнопка «Админ-панель» (то же условие видимости)
    assert.notEqual(doc.querySelector('[data-testid="topbar-admin-button"]'), null);
  } finally {
    await env.cleanup();
  }
});

test("platform admin (is_admin): кнопка есть", async () => {
  const mods = await loadModules();
  const env = setupDom({ me: { ...mePayload("viewer"), is_admin: true } });
  try {
    const doc = await renderTopBar(env, mods, { orgRole: "viewer" });
    await flush(200);
    assert.notEqual(doc.querySelector('[data-testid="topbar-api-docs-button"]'), null);
  } finally {
    await env.cleanup();
  }
});

test("роль viewer (без права): кнопки «API Docs» НЕТ в DOM (не disabled)", async () => {
  const mods = await loadModules();
  const env = setupDom({ me: mePayload("viewer") });
  try {
    const doc = await renderTopBar(env, mods);
    assert.equal(doc.querySelector('[data-testid="topbar-api-docs-button"]'), null, "кнопки не должно быть в DOM");
    assert.equal(doc.querySelector('[data-testid="topbar-admin-button"]'), null, "и админ-кнопки тоже нет");
  } finally {
    await env.cleanup();
  }
});

test("гонка прав: до загрузки me кнопка не показывается (не моргает)", async () => {
  const mods = await loadModules();
  const env = setupDom({ me: new Promise(() => {}) }); // me никогда не резолвится
  env.dom.window.fetch = async () => new Promise(() => {});
  try {
    await act(async () => {
      env.root.render(
        React.createElement(mods.AuthProvider, null,
          React.createElement(mods.TopBar, {
            orgs: [], activeOrgId: "", projects: [], sessions: [],
            mentionNotifications: [], noteNotifications: [],
          })),
      );
    });
    await flush(80);
    const doc = env.dom.window.document;
    assert.equal(doc.querySelector('[data-testid="topbar-api-docs-button"]'), null, "до загрузки прав кнопки нет");
  } finally {
    await env.cleanup();
  }
});
