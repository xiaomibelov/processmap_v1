// AGENT-3 — behavior-тесты панели pending edits (PendingEditCard) в ProcessmanChatFeed.
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

const DIAGRAM_NODES = [
  { id: "Task_1", name: "Проверить партию" },
  { id: "Task_2", name: "Упаковка" },
];

function pendingEditMsg({ id = "m_1", editPlan, diff, status = "edit_pending", result = null, attachedAt = Date.now(), timeoutSec = 900 }) {
  return {
    id,
    role: "agent",
    status,
    text: "Агент предлагает изменить схему",
    at: Date.now(),
    pendingEdit: {
      pendingEditId: "pe_abc",
      editPlan: editPlan || {},
      diff: diff || [],
      timeoutSec,
      attachedAt,
      status,
      result,
      errorText: "",
    },
  };
}

const RENAME_PLAN = {
  note: "уточнить название шага",
  operations: [{ op: "update_node", node_id: "Task_1", fields: { title: "Проверка партии сырья" } }],
};

test("rename-панель: структурированный diff (элемент/свойство/было→стало), note, таймер, кнопки", async () => {
  const mod = await loadFeed();
  const env = setupDom();
  let confirmed = false;
  let rejected = false;
  const messages = [pendingEditMsg({ editPlan: RENAME_PLAN, diff: [{ op: "update", node_id: "Task_1", field: "title", new_value: "Проверка партии сырья" }] })];
  try {
    await act(async () => {
      env.root.render(React.createElement(mod.default, {
        messages,
        sessionId: "sess_1",
        nodes: DIAGRAM_NODES,
        onConfirmEdit: () => { confirmed = true; },
        onRejectEdit: () => { rejected = true; },
      }));
    });
    await flush();
    const doc = env.dom.window.document;
    assert.notEqual(doc.querySelector('[data-testid="processman-edit-card"]'), null, "карточка рендерится");
    assert.ok(doc.querySelector('[data-testid="processman-edit-note"]').textContent.includes("уточнить название шага"), "note агента показан");
    const rows = doc.querySelectorAll('[data-testid="processman-edit-op-row"]');
    assert.equal(rows.length, 1, "одна строка операции");
    const rowText = rows[0].textContent;
    assert.ok(rowText.includes("Проверить партию"), "элемент с резолвленным именем");
    assert.ok(rowText.includes("Название"), "свойство человекочитаемо");
    assert.ok(rowText.includes("Проверка партии сырья"), "новое значение");
    assert.ok(rowText.includes("Проверить партию"), "старое значение из модели");
    assert.notEqual(doc.querySelector('[data-testid="processman-edit-timer"]'), null, "таймер подтверждения");
    assert.equal(doc.querySelector('[data-testid="processman-edit-unsupported"]'), null, "баннер unsupported не нужен");
    await click(doc, env.dom.window, "processman-edit-confirm");
    assert.equal(confirmed, true, "confirm callback вызван");
    await click(doc, env.dom.window, "processman-edit-reject");
    assert.equal(rejected, true, "reject callback вызван");
  } finally {
    await env.cleanup();
  }
});

test("неподдержанные операции: баннер с пояснением, кнопка «Применить» отсутствует, «Отклонить» жива", async () => {
  const mod = await loadFeed();
  const env = setupDom();
  let rejected = false;
  let confirmed = false;
  const messages = [pendingEditMsg({
    editPlan: { note: "", operations: [{ op: "add_node", node_id: "Task_9", title: "Новый шаг" }] },
    diff: [{ op: "add_node", node_id: "Task_9", title: "Новый шаг" }],
  })];
  try {
    await act(async () => {
      env.root.render(React.createElement(mod.default, {
        messages,
        sessionId: "sess_1",
        nodes: DIAGRAM_NODES,
        onConfirmEdit: () => { confirmed = true; },
        onRejectEdit: () => { rejected = true; },
      }));
    });
    await flush();
    const doc = env.dom.window.document;
    const banner = doc.querySelector('[data-testid="processman-edit-unsupported"]');
    assert.notEqual(banner, null, "баннер про неподдержанные операции");
    assert.equal(doc.querySelector('[data-testid="processman-edit-confirm"]'), null, "«Применить» скрыт — нет тихих частичных применений");
    assert.notEqual(doc.querySelector('[data-testid="processman-edit-reject"]'), null, "«Отклонить» доступен");
    assert.notEqual(doc.querySelector('[data-testid="processman-edit-op-badge"]'), null, "бейдж неподдержанной операции");
    await click(doc, env.dom.window, "processman-edit-reject");
    assert.equal(rejected, true, "reject вызван");
    assert.equal(confirmed, false, "confirm не вызывался");
  } finally {
    await env.cleanup();
  }
});

test("истёкший TTL: кнопки скрыты, статус «время истекло»", async () => {
  const mod = await loadFeed();
  const env = setupDom();
  const messages = [pendingEditMsg({
    editPlan: RENAME_PLAN,
    diff: [],
    attachedAt: Date.now() - 60_000,
    timeoutSec: 1,
  })];
  try {
    await act(async () => {
      env.root.render(React.createElement(mod.default, { messages, sessionId: "sess_1", nodes: DIAGRAM_NODES }));
    });
    await flush();
    const doc = env.dom.window.document;
    assert.equal(doc.querySelector('[data-testid="processman-edit-confirm"]'), null, "«Применить» скрыто после истечения");
    assert.equal(doc.querySelector('[data-testid="processman-edit-reject"]'), null, "«Отклонить» скрыто после истечения");
    assert.ok(doc.querySelector('[data-testid="processman-edit-status"]').textContent.includes("истекло"), "статус expired");
  } finally {
    await env.cleanup();
  }
});

test("статус applied без кнопок", async () => {
  const mod = await loadFeed();
  const env = setupDom();
  const messages = [pendingEditMsg({
    status: "edit_applied",
    editPlan: RENAME_PLAN,
    diff: [],
    result: { status: "applied", operations_applied: 1 },
  })];
  try {
    await act(async () => {
      env.root.render(React.createElement(mod.default, { messages, sessionId: "sess_1", nodes: DIAGRAM_NODES }));
    });
    await flush();
    const doc = env.dom.window.document;
    assert.notEqual(doc.querySelector('[data-testid="processman-edit-card"]'), null, "карточка рендерится");
    assert.equal(doc.querySelector('[data-testid="processman-edit-confirm"]'), null, "кнопки скрыты");
    assert.ok(doc.querySelector('[data-testid="processman-edit-status"]').textContent.includes("Правка применена"), "статус applied");
  } finally {
    await env.cleanup();
  }
});

test("conflict_rev: статус с версиями диаграммы из result.details", async () => {
  const mod = await loadFeed();
  const env = setupDom();
  const messages = [pendingEditMsg({
    status: "edit_conflict",
    editPlan: RENAME_PLAN,
    diff: [],
    result: { status: "conflict_rev", details: { pending_base_version: 3, server_current_version: 5 } },
  })];
  try {
    await act(async () => {
      env.root.render(React.createElement(mod.default, { messages, sessionId: "sess_1", nodes: DIAGRAM_NODES }));
    });
    await flush();
    const doc = env.dom.window.document;
    const statusText = doc.querySelector('[data-testid="processman-edit-status"]').textContent;
    assert.ok(statusText.includes("изменилась"), "статус конфликта");
    assert.ok(statusText.includes("3") && statusText.includes("5"), "версии диаграммы показаны");
  } finally {
    await env.cleanup();
  }
});

test("две пачки правок рендерятся независимо", async () => {
  const mod = await loadFeed();
  const env = setupDom();
  const messages = [
    pendingEditMsg({ id: "m_a", editPlan: RENAME_PLAN, diff: [] }),
    pendingEditMsg({ id: "m_b", pendingEditId: "pe_def", editPlan: RENAME_PLAN, diff: [] }),
  ];
  try {
    await act(async () => {
      env.root.render(React.createElement(mod.default, { messages, sessionId: "sess_1", nodes: DIAGRAM_NODES }));
    });
    await flush();
    const doc = env.dom.window.document;
    const cards = doc.querySelectorAll('[data-testid="processman-edit-card"]');
    assert.equal(cards.length, 2, "две карточки");
    assert.equal(doc.querySelectorAll('[data-testid="processman-edit-confirm"]').length, 2, "у каждой свои кнопки");
  } finally {
    await env.cleanup();
  }
});
