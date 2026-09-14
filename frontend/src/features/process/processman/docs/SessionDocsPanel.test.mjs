// feature/session-doc-attachments (TESTS 37–40) — панель «Документы сессии».
// Список грузится ТОЛЬКО по открытию (37); attach через file input + inline-ошибка (38);
// detach с двухшаговым подтверждением (39); «открыть» → Modal с полным текстом (40).
// Моки — на уровне api-layer (проп api), fetch не трогаем.
// Запуск: node --test src/features/process/processman/docs/SessionDocsPanel.test.mjs
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
const FRONTEND_ROOT = path.resolve(__dirname, "../../../../..");

let viteServer = null;

async function loadPanel() {
  if (!viteServer) {
    viteServer = await createServer({
      root: FRONTEND_ROOT,
      logLevel: "error",
      server: { middlewareMode: true },
      appType: "custom",
    });
  }
  return viteServer.ssrLoadModule("/src/features/process/processman/docs/SessionDocsPanel.jsx");
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

const DOCS = [
  { docId: "d1", uri: "session://s1/docs/d1", filename: "техкарта.md", ext: "md", sizeBytes: 1024, createdAt: "2026-09-14T10:00:00Z" },
  { docId: "d2", uri: "session://s1/docs/d2", filename: "описание.txt", ext: "txt", sizeBytes: 20480, createdAt: "2026-09-14T11:00:00Z" },
];

function makeApi(overrides = {}) {
  const calls = { list: [], attach: [], detach: [], get: [] };
  const api = {
    list: async (sid) => { calls.list.push(sid); return { ok: true, status: 200, docs: [...DOCS] }; },
    attach: async (sid, file) => { calls.attach.push({ sid, file }); return { ok: true, status: 201, doc: { docId: "d3" } }; },
    detach: async (sid, docId) => { calls.detach.push({ sid, docId }); return { ok: true, status: 204 }; },
    get: async (sid, docId) => { calls.get.push({ sid, docId }); return { ok: true, status: 200, filename: "техкарта.md", ext: "md", contentText: "Полный текст техкарты\nп. 3.1 Термообработка" }; },
    ...overrides,
  };
  return { api, calls };
}

async function renderPanel(api) {
  const mod = await loadPanel();
  const env = setupDom();
  await act(async () => {
    env.root.render(React.createElement(mod.default, { sessionId: "sess_docs", api }));
  });
  await flush();
  return { doc: env.dom.window.document, win: env.dom.window, cleanup: env.cleanup };
}

test("37: свёрнутая секция не грузит список; открытие = ровно один вызов list; элементы с filename и размером", async () => {
  const { api, calls } = makeApi();
  const { doc, win, cleanup } = await renderPanel(api);
  try {
    assert.equal(calls.list.length, 0, "collapsed: авто-загрузки нет (нет fetch из useEffect)");
    await click(doc, win, "processman-docs-toggle");
    assert.equal(calls.list.length, 1, "открытие = один вызов list");
    assert.equal(calls.list[0], "sess_docs");
    const items = Array.from(doc.querySelectorAll('[data-testid="processman-docs-item"]'));
    assert.equal(items.length, 2, "два документа в списке");
    assert.ok(items[0].textContent.includes("техкарта.md"), "filename первого");
    assert.ok(items[0].textContent.includes("1.0 КБ"), "размер в KB первого");
    assert.ok(items[1].textContent.includes("20.0 КБ"), "размер второго");
    assert.ok(items[0].textContent.includes("MD"), "ext-бейдж");
    assert.equal(doc.querySelector('[data-testid="processman-docs-count"]').textContent, "2", "счётчик в заголовке");
    // повторное открытие/закрытие без перезагрузки списка
    await click(doc, win, "processman-docs-toggle");
    await click(doc, win, "processman-docs-toggle");
    assert.equal(calls.list.length, 1, "повторное открытие не перезагружает (кэш в state)");
  } finally {
    await cleanup();
  }
});

test("38: attach — выбор файла → вызов attach + обновление списка; ошибка 422 → inline-текст", async () => {
  // успех
  {
    const { api, calls } = makeApi();
    const { doc, win, cleanup } = await renderPanel(api);
    try {
      await click(doc, win, "processman-docs-toggle");
      assert.equal(calls.list.length, 1);
      const input = doc.querySelector('[data-testid="processman-docs-file-input"]');
      assert.notEqual(input, null, "скрытый file input есть");
      assert.equal(input.getAttribute("accept"), ".md,.txt,.text,.doc,.docx", "accept whitelist");
      const file = new win.File(["# Техкарта\nНагреть до 75°C"], "техкарта.md", { type: "text/markdown" });
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      await click(doc, win, "processman-docs-attach");
      await act(async () => {
        input.dispatchEvent(new win.Event("change", { bubbles: true }));
      });
      await flush();
      assert.equal(calls.attach.length, 1, "attach вызван");
      assert.equal(calls.attach[0].sid, "sess_docs");
      assert.equal(calls.attach[0].file.name, "техкарта.md");
      assert.equal(calls.list.length, 2, "список перезагружен после attach");
      assert.equal(doc.querySelector('[data-testid="processman-docs-attach-error"]'), null, "ошибки нет");
    } finally {
      await cleanup();
    }
  }
  // ошибка 422 → inline-текст из detail
  {
    const { api, calls } = makeApi({
      attach: async () => ({ ok: false, status: 422, error: "doc_extension_not_allowed" }),
    });
    const { doc, win, cleanup } = await renderPanel(api);
    try {
      await click(doc, win, "processman-docs-toggle");
      const input = doc.querySelector('[data-testid="processman-docs-file-input"]');
      const file = new win.File(["binary"], "отчет.pdf", { type: "application/pdf" });
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      await click(doc, win, "processman-docs-attach");
      await act(async () => {
        input.dispatchEvent(new win.Event("change", { bubbles: true }));
      });
      await flush();
      const err = doc.querySelector('[data-testid="processman-docs-attach-error"]');
      assert.notEqual(err, null, "inline-ошибка показана");
      assert.ok(err.textContent.includes("doc_extension_not_allowed"), "текст detail из API");
    } finally {
      await cleanup();
    }
  }
});

test("39: detach — двухшаговое подтверждение → вызов detach, элемент исчезает; «отмена» отменяет", async () => {
  const { api, calls } = makeApi();
  const { doc, win, cleanup } = await renderPanel(api);
  try {
    await click(doc, win, "processman-docs-toggle");
    assert.equal(doc.querySelectorAll('[data-testid="processman-docs-item"]').length, 2);
    await click(doc, win, "processman-docs-detach");
    assert.notEqual(doc.querySelector('[data-testid="processman-docs-detach-confirm"]'), null, "inline-подтверждение появилось");
    await click(doc, win, "processman-docs-detach-cancel");
    assert.equal(doc.querySelector('[data-testid="processman-docs-detach-confirm"]'), null, "отмена скрыла подтверждение");
    assert.equal(calls.detach.length, 0, "detach не вызывался");
    await click(doc, win, "processman-docs-detach");
    await click(doc, win, "processman-docs-detach-confirm");
    assert.equal(calls.detach.length, 1, "detach вызван один раз");
    assert.deepEqual(calls.detach[0], { sid: "sess_docs", docId: "d1" });
    const items = doc.querySelectorAll('[data-testid="processman-docs-item"]');
    assert.equal(items.length, 1, "элемент исчез из списка");
    assert.ok(!items[0].textContent.includes("техкарта.md"), "откреплён именно первый документ");
    assert.equal(doc.querySelector('[data-testid="processman-docs-count"]').textContent, "1", "счётчик обновлён");
    assert.notEqual(doc.querySelector('[data-testid="processman-docs-toast"]'), null, "toast после detach");
  } finally {
    await cleanup();
  }
});

test("40: «открыть» → Modal с полным текстом из get", async () => {
  const { api, calls } = makeApi();
  const { doc, win, cleanup } = await renderPanel(api);
  try {
    await click(doc, win, "processman-docs-toggle");
    await click(doc, win, "processman-docs-open");
    assert.equal(calls.get.length, 1, "get вызван один раз");
    assert.deepEqual(calls.get[0], { sid: "sess_docs", docId: "d1" });
    const pre = doc.querySelector('[data-testid="processman-docs-viewer-text"]');
    assert.notEqual(pre, null, "просмотр открылся");
    assert.ok(pre.textContent.includes("Полный текст техкарты"), "полный текст документа");
    assert.ok(pre.textContent.includes("п. 3.1 Термообработка"), "второй абзац текста");
    const dialog = doc.querySelector('[role="dialog"]');
    assert.notEqual(dialog, null, "Modal отрендерился (portal)");
    assert.ok(dialog.textContent.includes("техкарта.md"), "шапка Modal с filename");
    // Escape закрывает Modal
    await act(async () => {
      win.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await flush();
    assert.equal(doc.querySelector('[data-testid="processman-docs-viewer-text"]'), null, "Modal закрыт");
  } finally {
    await cleanup();
  }
});

test("ошибка списка → inline-блок с текстом и кнопка «Повторить»", async () => {
  let attempts = 0;
  const { api, calls } = makeApi({
    list: async (sid) => {
      attempts += 1;
      calls.list.push(sid);
      return attempts === 1
        ? { ok: false, status: 500, error: "server error" }
        : { ok: true, status: 200, docs: [...DOCS] };
    },
  });
  const { doc, win, cleanup } = await renderPanel(api);
  try {
    await click(doc, win, "processman-docs-toggle");
    const err = doc.querySelector('[data-testid="processman-docs-error"]');
    assert.notEqual(err, null, "inline-ошибка списка");
    assert.ok(err.textContent.includes("server error"));
    await click(doc, win, "processman-docs-retry");
    assert.equal(calls.list.length, 2, "retry повторил list");
    assert.equal(doc.querySelectorAll('[data-testid="processman-docs-item"]').length, 2, "список загрузился после retry");
  } finally {
    await cleanup();
  }
});
