// RED→GREEN: перенос виджетов на /admin/sessions (feature/admin-dashboard-v2-feature-map).
// ReportsHealthWidget + RedisHealthWidget (собственный fetch dashboard на странице),
// дубли удалены: attention SectionCard («Требуют внимания») + redis-per-session SectionCard («Распределение Redis»).
// Запуск: node --test src/features/admin/pages/AdminSessionsPage.widgets.test.mjs
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
  const mod = await viteServer.ssrLoadModule("/src/features/admin/pages/AdminSessionsPage.jsx");
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

const DASHBOARD_PAYLOAD = {
  ok: true,
  generated_at: "2026-09-20T12:00:00+03:00",
  redis_health: { mode: "ON", state: "ready", queue_enabled: true, queue_depth: 0, lock_busy_total: 0, reason: "" },
  charts: { report_doc_health: { reports_ready: 4, doc_ready: 3, pending: 2, completion_rate_pct: 77 } },
};

const SESSIONS_PAYLOAD = {
  ok: true,
  items: [
    { session_id: "s-1", project_name: "P1", status: "in_progress", warnings_count: 2, errors_count: 1, redis_mode: "on", updated_at: 1720000000 },
  ],
  count: 1,
};

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/admin/sessions" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent,
    KeyboardEvent: globalThis.KeyboardEvent,
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
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  globalThis.localStorage = dom.window.localStorage;
  globalThis.sessionStorage = dom.window.sessionStorage;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/api/admin/dashboard")) return jsonResponse(DASHBOARD_PAYLOAD);
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
    globalThis.MouseEvent = previous.MouseEvent;
    globalThis.KeyboardEvent = previous.KeyboardEvent;
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

test("SMOKE: /admin/sessions рендерится с ReportsHealthWidget и RedisHealthWidget, дубли удалены", async () => {
  const env = setupDom();
  try {
    const Page = await loadPage();
    await act(async () => {
      env.root.render(React.createElement(Page, {
        payload: SESSIONS_PAYLOAD,
        filters: {},
        onFiltersChange: () => {},
        paging: {},
        onPagingChange: () => {},
        onOpenSession: () => {},
        onNavigate: () => {},
      }));
    });
    await flush();
    const text = env.dom.window.document.body.textContent;
    assert.ok(text.includes("Report / Doc Health"), "ReportsHealthWidget на месте");
    assert.ok(text.includes("77%"), "completion rate из dashboard fetch");
    assert.ok(text.includes("Redis / Persistence Health"), "RedisHealthWidget на месте");
    assert.equal(text.includes("Требуют внимания"), false, "attention-дубль удалён");
    assert.equal(text.includes("Распределение Redis"), false, "redis-per-session-дубль удалён");
    assert.ok(text.includes("Таблица сессий"), "основной контент страницы на месте");
  } finally {
    await env.cleanup();
  }
});
