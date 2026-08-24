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

async function loadPage(modulePath) {
  if (!viteServer) {
    viteServer = await createServer({
      root: FRONTEND_ROOT,
      logLevel: "error",
      server: { middlewareMode: true },
      appType: "custom",
    });
  }
  return viteServer.ssrLoadModule(modulePath);
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

test("AdminAgentRunsPage: renders empty state when no conversations", async () => {
  const mod = await loadPage("/src/features/admin/pages/AdminAgentRunsPage.jsx");
  const Page = mod.default;
  const env = setupDom();
  await act(async () => {
    env.root.render(React.createElement(Page, { payload: { items: [], count: 0 }, loading: false }));
  });
  await flush(50);
  try {
    const text = env.container.textContent || "";
    assert.ok(text.includes("Нет диалогов агентов"));
  } finally {
    await env.cleanup();
  }
});

test("AdminAgentRunsPage: renders table with conversations", async () => {
  const mod = await loadPage("/src/features/admin/pages/AdminAgentRunsPage.jsx");
  const Page = mod.default;
  const env = setupDom();
  const payload = {
    items: [
      {
        conversation_id: "conv:s1:u1",
        session_id: "sess_abc",
        user_id: "user_1",
        user_email: "user@local",
        user_name: "Test User",
        status: "active",
        turn_count: 4,
        total_tokens: 1200,
        first_activity_at: 1779465789,
        last_activity_at: 1779465856,
        applied_count: 1,
        rejected_count: 0,
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
    assert.ok(text.includes("conv:s1:u1"));
    assert.ok(text.includes("Test User"));
    assert.ok(text.includes("user@local"));
    assert.ok(text.includes("sess_abc"));
    assert.ok(text.includes("4"));
    assert.ok(text.includes("1200"));
    assert.ok(text.includes("Применено: 1"));
  } finally {
    await env.cleanup();
  }
});

test("AdminAgentRunDetailPage: renders conversation details and timeline", async () => {
  const mod = await loadPage("/src/features/admin/pages/AdminAgentRunDetailPage.jsx");
  const Page = mod.default;
  const env = setupDom();
  const payload = {
    item: {
      conversation_id: "conv:s1:u1",
      session_id: "sess_abc",
      project_id: "proj_1",
      user_id: "user_1",
      user_email: "user@local",
      user_name: "Test User",
      status: "closed",
      turn_count: 2,
      total_tokens: 800,
      summary: "Пользователь спрашивал о схеме и применил правку.",
      summary_missing: false,
      actions: { applied: 1, rejected: 0 },
      turns: [
        { id: "t1", role: "user", text: "переименуй шаг", created_at: 1779465789, truncated: false },
        { id: "t2", role: "assistant", text: "Готово", action: "edit_canvas", created_at: 1779465790, truncated: false },
      ],
    },
  };
  await act(async () => {
    env.root.render(React.createElement(Page, { payload, loading: false, error: "", onBack: () => {} }));
  });
  await flush(50);
  try {
    const text = env.container.textContent || "";
    assert.ok(text.includes("conv:s1:u1"));
    assert.ok(text.includes("Test User"));
    assert.ok(text.includes("Пользователь спрашивал о схеме"));
    assert.ok(text.includes("переименуй шаг"));
    assert.ok(text.includes("edit_canvas"));
    assert.ok(text.includes("Открыть сессию"));
  } finally {
    await env.cleanup();
  }
});
