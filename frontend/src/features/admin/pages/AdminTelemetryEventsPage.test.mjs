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
  return viteServer.ssrLoadModule("/src/features/admin/pages/AdminTelemetryEventsPage.jsx");
}

after(async () => {
  if (viteServer) await viteServer.close();
});

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
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
  if (!dom.window.HTMLElement.prototype.attachEvent) {
    Object.defineProperty(dom.window.HTMLElement.prototype, "attachEvent", {
      configurable: true,
      value() {},
    });
  }
  if (!dom.window.HTMLElement.prototype.detachEvent) {
    Object.defineProperty(dom.window.HTMLElement.prototype, "detachEvent", {
      configurable: true,
      value() {},
    });
  }

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
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.reactActEnv;
  };

  return { dom, root, container, cleanup };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function samplePayload() {
  return {
    ok: true,
    count: 2,
    page: { limit: 50, offset: 0, total: 2, order: "asc" },
    timeline: { deduped: false, order: "asc" },
    items: [
      {
        id: "evt_api_failure",
        occurred_at: 100,
        ingested_at: 101,
        source: "frontend",
        event_type: "api_failure",
        severity: "error",
        message: "API failed for save",
        request_id: "req_incident",
        session_id: "sess_timeline",
        runtime_id: "rt_tab",
        route: "/api/sessions/sess_timeline",
      },
      {
        id: "evt_backend_exception",
        occurred_at: 110,
        ingested_at: 111,
        source: "backend",
        event_type: "backend_exception",
        severity: "error",
        message: "Unhandled backend exception",
        request_id: "req_incident",
        session_id: "sess_timeline",
        runtime_id: "",
        route: "/api/sessions/sess_timeline",
      },
    ],
  };
}

function sampleDetail() {
  return {
    ok: true,
    item: {
      id: "evt_backend_exception",
      schema_version: 1,
      occurred_at: 110,
      ingested_at: 111,
      source: "backend",
      event_type: "backend_exception",
      severity: "error",
      message: "Unhandled backend exception",
      user_id: "user_admin",
      org_id: "org_main",
      session_id: "sess_timeline",
      project_id: "proj_main",
      route: "/api/sessions/sess_timeline",
      runtime_id: "",
      tab_id: "",
      request_id: "req_incident",
      correlation_id: "corr_incident",
      app_version: "test",
      git_sha: "abc123",
      fingerprint: "fp_backend_exception",
      context_json: {
        method: "GET",
        authorization: "[REDACTED]",
        request_body: { _redacted: "payload" },
        safe: "ok",
      },
    },
  };
}

async function renderPage(props = {}) {
  const mod = await loadPage();
  const Page = mod.default;
  const domEnv = setupDom();
  await act(async () => {
    domEnv.root.render(React.createElement(Page, props));
  });
  await flush();
  return domEnv;
}

test("AdminTelemetryEventsPage: renders ordered incident timeline and selected redacted detail", async () => {
  const env = await renderPage({
    payload: samplePayload(),
    filters: { request_id: "req_incident", limit: 50, order: "asc" },
    detailPayload: sampleDetail(),
    selectedEventId: "evt_backend_exception",
  });
  try {
    const text = env.container.textContent || "";
    assert.ok(text.includes("api_failure"));
    assert.ok(text.includes("backend_exception"));
    assert.ok(text.indexOf("api_failure") < text.indexOf("backend_exception"));
    assert.ok(text.includes("req_incident"));
    assert.ok(text.includes("sess_timeline"));
    assert.ok(text.includes("fp_backend_exception"));
    assert.ok(text.includes("[REDACTED]"));
    assert.ok(text.includes("_redacted"));
    assert.equal(text.includes("forbidden-secret"), false);
  } finally {
    await env.cleanup();
  }
});

test("AdminTelemetryEventsPage: timeline open detail action emits selected event id", async () => {
  let openedEventId = "";
  const env = await renderPage({
    payload: samplePayload(),
    filters: { request_id: "", limit: 50, order: "asc" },
    onOpenDetail: (eventId) => {
      openedEventId = eventId;
    },
  });
  try {
    const button = env.container.querySelector('[data-testid="telemetry-open-detail-evt_backend_exception"]');
    assert.ok(button);
    await act(async () => {
      button.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    await flush();
    assert.equal(openedEventId, "evt_backend_exception");
  } finally {
    await env.cleanup();
  }
});

test("AdminTelemetryEventsPage: empty result state is predictable", async () => {
  const env = await renderPage({
    payload: { ok: true, items: [], count: 0, page: { total: 0, limit: 50, offset: 0, order: "asc" } },
    filters: { request_id: "req_missing", limit: 50, order: "asc" },
  });
  try {
    const empty = env.container.querySelector('[data-testid="telemetry-empty-state"]');
    assert.ok(empty);
    assert.match(empty.textContent || "", /не найдены/i);
  } finally {
    await env.cleanup();
  }
});

test("AdminTelemetryEventsPage: backend error state is safe", async () => {
  const env = await renderPage({
    payload: { ok: false, items: [], count: 0 },
    filters: { request_id: "req_forbidden", limit: 50, order: "asc" },
    error: "insufficient_permissions",
  });
  try {
    const text = env.container.textContent || "";
    assert.ok(text.includes("insufficient_permissions"));
    assert.equal(text.includes("forbidden-secret"), false);
  } finally {
    await env.cleanup();
  }
});
