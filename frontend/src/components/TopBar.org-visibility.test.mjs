// TopBar: пометка «отключена» для неактивных организаций у админа.
// Запуск: node --test src/components/TopBar.org-visibility.test.mjs
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
  const [topbar, auth] = await Promise.all([
    viteServer.ssrLoadModule("/src/components/TopBar.jsx"),
    viteServer.ssrLoadModule("/src/features/auth/AuthProvider.jsx"),
  ]);
  return { TopBar: topbar.default, AuthProvider: auth.AuthProvider };
}

after(async () => {
  if (viteServer) await viteServer.close();
});

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
  dom.window.localStorage.setItem("fpc_auth_access_token", "test-token");
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/api/auth/me")) return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => me, text: async () => JSON.stringify(me) };
    if (u.includes("/api/auth/refresh")) return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ access_token: "t", refresh_token: "r" }), text: async () => "{}" };
    return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({}), text: async () => "{}" };
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

function mePayload(isAdmin) {
  return {
    id: "u1",
    email: "t@local",
    is_admin: isAdmin,
    role: isAdmin ? "admin" : "viewer",
    active_org_id: "org_default",
    default_org_id: "org_default",
    orgs: [
      { org_id: "org_default", name: "Default", role: "viewer", is_active: true },
      { org_id: "org_active", name: "Active Org", role: "viewer", is_active: true },
      { org_id: "org_inactive", name: "Inactive Org", role: "viewer", is_active: false },
    ],
    groups: [],
  };
}

async function renderTopBar(env, mods, { orgs, activeOrgId = "org_default" }) {
  await act(async () => {
    env.root.render(
      React.createElement(mods.AuthProvider, null,
        React.createElement(mods.TopBar, {
          orgs,
          activeOrgId,
          projects: [],
          sessions: [],
          mentionNotifications: [],
          noteNotifications: [],
        })),
    );
  });
  await flush(120);
  return env.dom.window.document;
}

test("админ видит неактивные организации с пометкой «отключена»", async () => {
  const mods = await loadModules();
  const env = setupDom({ me: mePayload(true) });
  try {
    const orgs = [
      { org_id: "org_default", name: "Default", role: "viewer", is_active: true },
      { org_id: "org_active", name: "Active Org", role: "viewer", is_active: true },
      { org_id: "org_inactive", name: "Inactive Org", role: "viewer", is_active: false },
    ];
    const doc = await renderTopBar(env, mods, { orgs, activeOrgId: "org_default" });
    const select = doc.querySelector('[data-testid="topbar-org-switcher"]');
    assert.notEqual(select, null, "select организации должен быть в DOM");
    const options = Array.from(select.querySelectorAll("option"));
    const labels = options.map((o) => o.textContent);
    const inactiveOption = options.find((o) => o.getAttribute("value") === "org_inactive");
    assert.notEqual(inactiveOption, null, "неактивная органция должна быть в списке для админа");
    assert.match(inactiveOption.textContent, /\(отключена\)|\(disabled\)/, "неактивная организация должна иметь пометку отключена");
  } finally {
    await env.cleanup();
  }
});

test("не-админ не видит неактивные организации в списке", async () => {
  const mods = await loadModules();
  const env = setupDom({ me: mePayload(false) });
  try {
    const orgs = [
      { org_id: "org_default", name: "Default", role: "viewer", is_active: true },
      { org_id: "org_active", name: "Active Org", role: "viewer", is_active: true },
    ];
    const doc = await renderTopBar(env, mods, { orgs, activeOrgId: "org_default" });
    const select = doc.querySelector('[data-testid="topbar-org-switcher"]');
    assert.notEqual(select, null, "select организации должен быть в DOM");
    const values = Array.from(select.querySelectorAll("option")).map((o) => o.getAttribute("value"));
    assert.deepEqual(values, ["org_default", "org_active"]);
  } finally {
    await env.cleanup();
  }
});
