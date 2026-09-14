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
  return viteServer.ssrLoadModule("/src/features/admin/pages/AdminRagPage.jsx");
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

function settingsPayload() {
  return {
    loading: false,
    error: "",
    data: {
      settings: {
        enabled: true,
        indexing_enabled: true,
        default_top_k: 10,
        max_top_k: 50,
        default_min_score: null,
        show_technical_fragments: false,
        allowed_source_types: ["bpmn_xml", "product_action"],
      },
      status: {
        sources_count: 0,
        documents_count: 0,
        active_documents_count: 0,
        chunks_count: 0,
        feedback_count: 0,
        eval_cases_count: 0,
      },
    },
  };
}

function planPayload(overrides = {}) {
  return {
    loading: false,
    error: "",
    data: {
      ok: true,
      schedule: {
        task: "rag-index-nightly-refresh",
        crontab: "30 4 * * *",
        tz: "Europe/Moscow",
        next_run_at: 1789435800,
      },
      queue: {
        total: 2,
        preview: [
          { session_id: "sess-q1", title: "Queued One", rag_queued_at: 1789342200, updated_at: 1789342200 },
          { session_id: "sess-q2", title: "Queued Two", rag_queued_at: 1789342300, updated_at: 1789342300 },
        ],
      },
      readiness_counts: { not_ready: 3, queued: 2, indexed: 10, error: 1 },
      index_size: { documents: 12, active_documents: 11, chunks: 340 },
      disclaimer: "preview = кандидаты; фактическая индексация определяется сравнением content-hash",
      ...overrides,
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

test("AdminRagPage: план индексации показывает расписание, очередь, readiness и размер индекса", async () => {
  const env = await renderPage({
    payload: settingsPayload(),
    planPayload: planPayload(),
  });
  try {
    const text = env.container.textContent || "";
    assert.ok(text.includes("План индексации"));
    assert.ok(text.includes("ежедневно 04:30 (МСК)"));
    assert.ok(text.includes("rag-index-nightly-refresh"));
    assert.ok(text.includes("Queued One"));
    assert.ok(text.includes("Queued Two"));
    assert.ok(text.includes("sess-q1"));
    assert.ok(text.includes("Проиндексированы"));
    assert.ok(text.includes("content-hash"));
  } finally {
    await env.cleanup();
  }
});

test("AdminRagPage: пустая очередь показывает empty-state", async () => {
  const env = await renderPage({
    payload: settingsPayload(),
    planPayload: planPayload({
      queue: { total: 0, preview: [] },
      readiness_counts: { not_ready: 0, queued: 0, indexed: 0, error: 0 },
    }),
  });
  try {
    const text = env.container.textContent || "";
    assert.ok(text.includes("План индексации"));
    assert.ok(text.includes("Очередь пуста"));
  } finally {
    await env.cleanup();
  }
});

test("AdminRagPage: ошибка загрузки плана показывается внутри секции", async () => {
  const env = await renderPage({
    payload: settingsPayload(),
    planPayload: { loading: false, error: "Ошибка загрузки", data: null },
  });
  try {
    const text = env.container.textContent || "";
    assert.ok(text.includes("План индексации"));
    assert.ok(text.includes("Ошибка загрузки"));
  } finally {
    await env.cleanup();
  }
});
