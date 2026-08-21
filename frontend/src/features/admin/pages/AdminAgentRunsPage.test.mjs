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
  return viteServer.ssrLoadModule("/src/features/admin/pages/AdminAgentRunsPage.jsx");
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

async function flush(ms = 30) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

test("AdminAgentRunsPage: renders empty state when no runs", async () => {
  const mod = await loadPage();
  const Page = mod.default;
  const env = setupDom();
  await act(async () => {
    env.root.render(React.createElement(Page, { payload: { runs: [], count: 0 }, loading: false }));
  });
  await flush(50);
  try {
    const text = env.container.textContent || "";
    assert.ok(text.includes("Нет активных запусков агентов"));
  } finally {
    await env.cleanup();
  }
});

test("AdminAgentRunsPage: renders table with runs", async () => {
  const mod = await loadPage();
  const Page = mod.default;
  const env = setupDom();
  const payload = {
    runs: [
      {
        run_id: "20260522T160309Z-89364",
        contour_id: "feat/active-runs-monitor-v1",
        status: "active",
        stop_requested: false,
        started_at: 1779465789,
        last_activity_at: 1779465856,
        agents: [
          { agent: "1", pid: "904", highlight: true },
          { agent: "2", pid: "1987", highlight: false },
        ],
      },
    ],
    count: 1,
  };
  await act(async () => {
    env.root.render(React.createElement(Page, { payload, loading: false }));
  });
  await flush(50);
  try {
    const text = env.container.textContent || "";
    assert.ok(text.includes("20260522T160309Z-89364"));
    assert.ok(text.includes("feat/active-runs-monitor-v1"));
    assert.ok(text.includes("active") || text.includes("Активен"));
    assert.ok(text.includes("1") && text.includes("2"));
  } finally {
    await env.cleanup();
  }
});
