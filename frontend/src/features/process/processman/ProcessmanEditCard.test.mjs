// AGENT-3 — behavior-тест карточки подтверждения правки в ProcessmanChatFeed.
// Запуск: node --test src/features/process/processman/ProcessmanEditCard.test.mjs
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

async function loadFeed() {
  if (!viteServer) {
    viteServer = await createServer({
      root: FRONTEND_ROOT,
      logLevel: "error",
      server: { middlewareMode: true },
      appType: "custom",
    });
  }
  return viteServer.ssrLoadModule("/src/features/process/processman/ProcessmanChatFeed.jsx");
}

async function loadStore() {
  if (!viteServer) {
    viteServer = await createServer({
      root: FRONTEND_ROOT,
      logLevel: "error",
      server: { middlewareMode: true },
      appType: "custom",
    });
  }
  return viteServer.ssrLoadModule("/src/features/process/processman/chat/processmanChatStore.js");
}

after(async () => {
  if (viteServer) await viteServer.close();
});

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" });
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
    localStorage: globalThis.localStorage,
    reactActEnv: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  if (!dom.window.HTMLElement.prototype.attachEvent) dom.window.HTMLElement.prototype.attachEvent = () => {};
  if (!dom.window.HTMLElement.prototype.detachEvent) dom.window.HTMLElement.prototype.detachEvent = () => {};
  globalThis.Event = dom.window.Event;
  globalThis.MouseEvent = dom.window.MouseEvent;
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  globalThis.localStorage = dom.window.localStorage;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);

  const cleanup = async () => {
    await act(async () => { root.unmount(); });
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
    globalThis.localStorage = previous.localStorage;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.reactActEnv;
  };

  return { dom, root, cleanup };
}

async function flush(ms = 24) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function click(doc, win, testid) {
  const el = doc.querySelector(`[data-testid="${testid}"]`);
  assert.notEqual(el, null, `элемент ${testid} должен существовать`);
  await act(async () => {
    el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await flush();
  return el;
}

test("карточка HITL рендерится с diff, кнопками и вызывает колбэки", async () => {
  const mod = await loadFeed();
  const env = setupDom();
  let confirmed = false;
  let rejected = false;
  const messages = [
    {
      id: "m_1",
      role: "agent",
      status: "edit_pending",
      text: "Агент предлагает изменить схему",
      at: Date.now(),
      pendingEdit: {
        pendingEditId: "pe_abc",
        editPlan: { note: "добавить шаг" },
        diff: [
          { op: "add_node", node_id: "Task_7", title: "Новый шаг" },
          { op: "update", node_id: "Task_1", field: "name", new_value: "Переименованный" },
        ],
        timeoutSec: 900,
        status: "edit_pending",
        result: null,
        errorText: "",
      },
    },
  ];
  try {
    await act(async () => {
      env.root.render(React.createElement(mod.default, {
        messages,
        sessionId: "sess_1",
        onConfirmEdit: () => { confirmed = true; },
        onRejectEdit: () => { rejected = true; },
      }));
    });
    await flush();
    const doc = env.dom.window.document;
    assert.notEqual(doc.querySelector('[data-testid="processman-edit-card"]'), null, "карточка рендерится");
    assert.notEqual(doc.querySelector('[data-testid="processman-edit-diff"]'), null, "diff рендерится");
    assert.equal(doc.querySelectorAll('[data-testid="processman-edit-diff"] .pm-processman-edit-card__diff-item').length, 2, "два пункта diff");
    assert.notEqual(doc.querySelector('[data-testid="processman-edit-confirm"]'), null, "кнопка Применить");
    assert.notEqual(doc.querySelector('[data-testid="processman-edit-reject"]'), null, "кнопка Отклонить");
    await click(doc, env.dom.window, "processman-edit-confirm");
    assert.equal(confirmed, true, "confirm callback вызван");
    await click(doc, env.dom.window, "processman-edit-reject");
    assert.equal(rejected, true, "reject callback вызван");
  } finally {
    await env.cleanup();
  }
});

test("карточка HITL показывает статус applied без кнопок", async () => {
  const mod = await loadFeed();
  const env = setupDom();
  const messages = [
    {
      id: "m_2",
      role: "agent",
      status: "edit_applied",
      text: "Правка применена",
      at: Date.now(),
      pendingEdit: {
        pendingEditId: "pe_xyz",
        editPlan: {},
        diff: [],
        timeoutSec: 0,
        status: "edit_applied",
        result: { operations_applied: 1 },
        errorText: "",
      },
    },
  ];
  try {
    await act(async () => {
      env.root.render(React.createElement(mod.default, { messages, sessionId: "sess_1" }));
    });
    await flush();
    const doc = env.dom.window.document;
    assert.notEqual(doc.querySelector('[data-testid="processman-edit-card"]'), null, "карточка рендерится");
    assert.equal(doc.querySelector('[data-testid="processman-edit-confirm"]'), null, "кнопки скрыты");
    assert.equal(doc.querySelector('[data-testid="processman-edit-reject"]'), null, "кнопки скрыты");
    assert.ok(doc.querySelector('[data-testid="processman-edit-status"]').textContent.includes("Правка применена"), "статус applied");
  } finally {
    await env.cleanup();
  }
});
