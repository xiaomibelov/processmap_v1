// RED→GREEN: перенос PublishGitMirrorWidget на /admin/orgs?tab=gitMirror
// (feature/admin-dashboard-v2-feature-map). Данные — собственный fetch dashboard на странице.
// Запуск: node --test src/features/admin/pages/AdminOrgsPage.widgets.test.mjs
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
  const pageMod = await viteServer.ssrLoadModule("/src/features/admin/pages/AdminOrgsPage.jsx");
  const providerMod = await viteServer.ssrLoadModule("/src/features/admin/providers/AdminQueryProvider.jsx");
  return { Page: pageMod.default, AdminQueryProvider: providerMod.AdminQueryProvider };
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

const DASHBOARD_PAYLOAD = {
  ok: true,
  publish_git_mirror: {
    published_bpmn_versions: 9,
    mirrored_to_git: 8,
    pending: 0,
    failed: 1,
    latest_result_state: "synced",
    latest_result_version_number: 9,
    latest_attempt_at: "2026-09-20T10:00:00+03:00",
    org_mirror_enabled: true,
    org_mirror_health_status: "valid",
  },
};

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/admin/orgs?tab=gitMirror" });
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
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/api/admin/dashboard")) return jsonResponse(DASHBOARD_PAYLOAD);
    return jsonResponse({ ok: true, config: {}, items: [] });
  };
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);

  const cleanup = async () => {
    // Намеренно НЕ делаем root.unmount(): react-query (AdminGitMirrorPanel → useAdminQuery)
    // при удалении последнего наблюдателя планирует gc-таймер на gcTime=10м, и node --test
    // ждёт drain event loop → файл висит ~10 минут. Живой наблюдатель таймер не планирует.
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

test("SMOKE: /admin/orgs таб gitMirror рендерит PublishGitMirrorWidget над конфиг-панелью", async () => {
  const env = setupDom();
  try {
    const { Page, AdminQueryProvider } = await loadModules();
    await act(async () => {
      env.root.render(React.createElement(AdminQueryProvider, null,
        React.createElement(Page, {
          payload: { items: [], active_org_id: "org-1" },
          activeOrgId: "org-1",
          activeOrgName: "Org 1",
          activeOrgRole: "org_admin",
          isAdmin: true,
          onNavigate: () => {},
        }),
      ));
    });
    await flush();
    const text = env.dom.window.document.body.textContent;
    assert.ok(text.includes("Publish / Git Mirror"), "PublishGitMirrorWidget в табе gitMirror");
    assert.ok(text.includes("9"), "published_bpmn_versions из dashboard fetch");
    assert.ok(text.includes("Git mirror"), "конфиг-панель AdminGitMirrorPanel на месте");
  } finally {
    await env.cleanup();
  }
});
