// UX-UPDATE — behavior-тест тоста «Вышло обновление» (рендер, клики, состояния).
// Запуск: node --test src/features/appUpdate/AppUpdateBanner.test.mjs
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
const FRONTEND_ROOT = path.resolve(__dirname, "../../..");

let viteServer = null;

async function loadBanner() {
  if (!viteServer) {
    viteServer = await createServer({
      root: FRONTEND_ROOT,
      logLevel: "error",
      server: { middlewareMode: true },
      appType: "custom",
    });
  }
  return viteServer.ssrLoadModule("/src/features/appUpdate/AppUpdateBanner.jsx");
}

after(async () => {
  if (viteServer) await viteServer.close();
});

function setupDom() {
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
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.reactActEnv;
  };

  return { dom, root, cleanup };
}

async function renderBanner(env, mod, props = {}) {
  await act(async () => {
    env.root.render(React.createElement(mod.default, {
      visible: true,
      runtime: { sha: "bbb2222", builtAt: "2026-08-08T12:00:00Z" },
      refreshRisk: { status: "clean", message: "" },
      onRefresh: () => {},
      onDismiss: () => {},
      ...props,
    }));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  return env.dom.window.document;
}

test("тост: виден при visible, role=status + aria-live, sha в описании, фокус на тосте", async () => {
  const mod = await loadBanner();
  const env = setupDom();
  try {
    const doc = await renderBanner(env, mod);
    const toast = doc.querySelector('[data-testid="app-update-toast"]');
    assert.notEqual(toast, null);
    assert.equal(toast.getAttribute("role"), "status");
    assert.equal(toast.getAttribute("aria-live"), "polite");
    assert.ok(toast.textContent.includes("Вышло обновление ProcessMap"));
    assert.ok(toast.textContent.includes("bbb2222"), "sha показан");
    assert.equal(doc.activeElement, toast, "фокус на тосте при появлении (клавиатура)");
    assert.notEqual(doc.querySelector('[data-testid="app-update-refresh"]'), null, "[Обновить]");
    assert.notEqual(doc.querySelector('[data-testid="app-update-dismiss"]'), null, "[Позже]");
  } finally {
    await env.cleanup();
  }
});

test("тост: скрыт при visible=false (ничего не рендерит)", async () => {
  const mod = await loadBanner();
  const env = setupDom();
  try {
    const doc = await renderBanner(env, mod, { visible: false });
    assert.equal(doc.querySelector('[data-testid="app-update-toast"]'), null);
  } finally {
    await env.cleanup();
  }
});

test("[Обновить] → onRefresh (reload только по клику); [Позже] → onDismiss (snooze)", async () => {
  const mod = await loadBanner();
  const env = setupDom();
  try {
    let refreshed = 0;
    let dismissed = 0;
    const doc = await renderBanner(env, mod, {
      onRefresh: () => { refreshed += 1; },
      onDismiss: () => { dismissed += 1; },
    });
    await act(async () => {
      doc.querySelector('[data-testid="app-update-refresh"]')
        .dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(refreshed, 1);
    assert.equal(dismissed, 0);
    await act(async () => {
      doc.querySelector('[data-testid="app-update-dismiss"]')
        .dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(dismissed, 1);
  } finally {
    await env.cleanup();
  }
});

test("грязная TO BE (risk=dirty): текст «Сохранить и обновить», кнопка активна", async () => {
  const mod = await loadBanner();
  const env = setupDom();
  try {
    const doc = await renderBanner(env, mod, { refreshRisk: { status: "dirty", message: "" } });
    assert.ok(doc.querySelector('[data-testid="app-update-toast"]')?.textContent.includes("Сохраните изменения"));
    const btn = doc.querySelector('[data-testid="app-update-refresh"]');
    assert.ok(btn?.textContent.includes("Сохранить и обновить"));
    assert.equal(btn?.disabled, false);
  } finally {
    await env.cleanup();
  }
});

test("risk=saving/conflict: [Обновить] disabled, ошибка показана честно", async () => {
  const mod = await loadBanner();
  const env = setupDom();
  try {
    let doc = await renderBanner(env, mod, { refreshRisk: { status: "saving", message: "" } });
    assert.equal(doc.querySelector('[data-testid="app-update-refresh"]')?.disabled, true);
    doc = await renderBanner(env, mod, {
      refreshRisk: { status: "conflict", message: "конфликт сохранения" },
    });
    assert.equal(doc.querySelector('[data-testid="app-update-refresh"]')?.disabled, true);
    assert.ok(doc.querySelector('[data-testid="app-update-error"]')?.textContent.includes("конфликт"));
  } finally {
    await env.cleanup();
  }
});
