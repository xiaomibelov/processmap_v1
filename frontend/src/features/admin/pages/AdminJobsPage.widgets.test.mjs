// RED→GREEN: перенос виджетов на /admin/jobs (feature/admin-dashboard-v2-feature-map).
// AutoPassOutcomesWidget + JobsThroughputWidget (собственный fetch dashboard на странице),
// дубли удалены: QueueHealthWidget + recent-failures блок.
// Запуск: node --test src/features/admin/pages/AdminJobsPage.widgets.test.mjs
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
  const mod = await viteServer.ssrLoadModule("/src/features/admin/pages/AdminJobsPage.jsx");
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
  redis_health: { mode: "ON", queue_enabled: true, queue_depth: 2 },
  jobs_health: { queue_depth: 2, autopass_runs: 10, autopass_done: 7, lock_busy_total: 1, avg_duration_s: 5 },
  charts: { autopass_outcomes: { runs: 10, done: 7, failed: 3, success_rate_pct: 70 } },
};

const JOBS_PAYLOAD = {
  ok: true,
  summary: { queued: 1, running: 0, failed: 1, completed: 8, total: 10, avg_duration_s: 5, lock_busy_total: 1 },
  queue_health: { enabled: true, queue_depth: 2, mode: "redis", state: "ready", degraded: false, incident: false, reason: "" },
  items: [
    { job_id: "job-1", session_id: "s-1", status: "failed", last_error: "boom" },
  ],
  count: 1,
};

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/admin/jobs" });
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

test("SMOKE: /admin/jobs рендерится с перенесёнными виджетами и без дублей", async () => {
  const env = setupDom();
  try {
    const Page = await loadPage();
    await act(async () => {
      env.root.render(React.createElement(Page, { payload: JOBS_PAYLOAD, onNavigate: () => {} }));
    });
    await flush();
    const text = env.dom.window.document.body.textContent;
    assert.ok(text.includes("AutoPass Outcomes"), "AutoPassOutcomesWidget на месте");
    assert.ok(text.includes("Jobs Throughput"), "JobsThroughputWidget на месте");
    assert.ok(text.includes("70%"), "success rate из dashboard fetch");
    assert.equal(text.includes("Состояние очереди"), false, "QueueHealthWidget-дубль удалён");
    assert.equal(text.includes("Последние сбои"), false, "recent-failures-дубль удалён");
  } finally {
    await env.cleanup();
  }
});

test("/admin/jobs: onNavigate проброшен в AutoPassOutcomesWidget", async () => {
  const env = setupDom();
  try {
    const Page = await loadPage();
    let navigated = null;
    await act(async () => {
      env.root.render(React.createElement(Page, { payload: JOBS_PAYLOAD, onNavigate: (p) => { navigated = p; } }));
    });
    await flush();
    const doc = env.dom.window.document;
    const button = Array.from(doc.querySelectorAll("button")).find((b) => b.textContent.trim() === "Open Jobs");
    assert.ok(button, "кнопка Open Jobs");
    await act(async () => {
      button.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    await flush();
    assert.equal(navigated, "/admin/jobs");
  } finally {
    await env.cleanup();
  }
});
