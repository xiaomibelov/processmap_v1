// AuthProvider: автовыбор организации из localStorage с учётом активности.
// Запуск: node --test src/features/auth/AuthProvider.org-selection.test.mjs
import test, { after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import React, { act, useContext } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, "../../..");

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
  const [auth, apiCore] = await Promise.all([
    viteServer.ssrLoadModule("/src/features/auth/AuthProvider.jsx"),
    viteServer.ssrLoadModule("/src/lib/apiCore.js"),
  ]);
  return { AuthProvider: auth.AuthProvider, useAuth: auth.useAuth, setAccessToken: apiCore.setAccessToken, getActiveOrgId: apiCore.getActiveOrgId };
}

after(async () => {
  if (viteServer) await viteServer.close();
});

function setupDom({ me, storedActiveOrgId = "" }) {
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
  if (storedActiveOrgId) {
    dom.window.localStorage.setItem("fpc_active_org_id", storedActiveOrgId);
  }
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/api/auth/me")) {
      return {
        ok: true, status: 200,
        headers: { get: () => "application/json" },
        json: async () => me,
        text: async () => JSON.stringify(me),
      };
    }
    if (u.includes("/api/auth/refresh")) {
      return {
        ok: true, status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({ access_token: "t", refresh_token: "r" }),
        text: async () => "{}",
      };
    }
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

async function flush(ms = 80) {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
}

function mePayload({ isAdmin = false, orgs = [] } = {}) {
  return {
    id: "u1",
    email: "t@local",
    is_admin: isAdmin,
    role: isAdmin ? "admin" : "viewer",
    active_org_id: "org_default",
    default_org_id: "org_default",
    orgs,
    groups: [],
  };
}

function AuthProbe() {
  const auth = useContext(loadModules().then ? null : null); // placeholder, replaced below
  return React.createElement("span", { "data-testid": "auth-probe" }, auth ? String(auth.activeOrgId || "") : "");
}

test("автовыбор: сохранённая активная организация подставляется при входе", async () => {
  const mods = await loadModules();
  const env = setupDom({
    me: mePayload({ isAdmin: false, orgs: [
      { org_id: "org_default", name: "Default", role: "viewer", is_active: true },
      { org_id: "org_active", name: "Active Org", role: "viewer", is_active: true },
    ] }),
    storedActiveOrgId: "org_active",
  });
  try {
    let captured = null;
    function Probe() {
      const auth = mods.useAuth();
      captured = auth;
      return React.createElement("span", { "data-testid": "probe" }, auth.activeOrgId || "");
    }
    await act(async () => {
      env.root.render(React.createElement(mods.AuthProvider, null, React.createElement(Probe)));
    });
    await flush(200);
    assert.equal(captured?.activeOrgId, "org_active", "должна подставиться сохранённая активная организация");
    assert.equal(env.dom.window.localStorage.getItem("fpc_active_org_id"), "org_active");
  } finally {
    await env.cleanup();
  }
});

test("игнорирование сохранённой неактивной организации для не-админа", async () => {
  const mods = await loadModules();
  const env = setupDom({
    me: mePayload({ isAdmin: false, orgs: [
      { org_id: "org_default", name: "Default", role: "viewer", is_active: true },
      { org_id: "org_active", name: "Active Org", role: "viewer", is_active: true },
      { org_id: "org_inactive", name: "Inactive Org", role: "viewer", is_active: false },
    ] }),
    storedActiveOrgId: "org_inactive",
  });
  try {
    let captured = null;
    function Probe() {
      const auth = mods.useAuth();
      captured = auth;
      return React.createElement("span", { "data-testid": "probe" }, auth.activeOrgId || "");
    }
    await act(async () => {
      env.root.render(React.createElement(mods.AuthProvider, null, React.createElement(Probe)));
    });
    await flush(200);
    assert.notEqual(captured?.activeOrgId, "org_inactive", "неактивная организация не должна быть выбрана");
    assert.equal(captured?.activeOrgId, "org_default", "должен быть fallback к дефолтной/серверной active");
  } finally {
    await env.cleanup();
  }
});

test("админ может войти в сохранённую неактивную организацию", async () => {
  const mods = await loadModules();
  const env = setupDom({
    me: mePayload({ isAdmin: true, orgs: [
      { org_id: "org_default", name: "Default", role: "viewer", is_active: true },
      { org_id: "org_active", name: "Active Org", role: "viewer", is_active: true },
      { org_id: "org_inactive", name: "Inactive Org", role: "viewer", is_active: false },
    ] }),
    storedActiveOrgId: "org_inactive",
  });
  try {
    let captured = null;
    function Probe() {
      const auth = mods.useAuth();
      captured = auth;
      return React.createElement("span", { "data-testid": "probe" }, auth.activeOrgId || "");
    }
    await act(async () => {
      env.root.render(React.createElement(mods.AuthProvider, null, React.createElement(Probe)));
    });
    await flush(200);
    assert.equal(captured?.activeOrgId, "org_inactive", "админ может выбрать неактивную организацию");
  } finally {
    await env.cleanup();
  }
});
