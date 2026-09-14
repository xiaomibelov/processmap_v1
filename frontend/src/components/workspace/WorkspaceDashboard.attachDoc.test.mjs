// feature/session-doc-attach-from-workspace — «Прикрепить документ» из меню строки сессии.
// Seam: модульный export workspaceDashboardApi ({ getWorkspace, attachDoc }) подменяется
// из теста напрямую (мок api-layer, не fetch). Рендер через vite ssrLoadModule + jsdom,
// по прецеденту ProcessmanReviewCard.test.mjs.
// Запуск: node --test src/components/workspace/WorkspaceDashboard.attachDoc.test.mjs
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
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

async function loadModule(id) {
  if (!viteServer) {
    viteServer = await createServer({
      root: FRONTEND_ROOT,
      logLevel: "error",
      server: { middlewareMode: true },
      appType: "custom",
    });
  }
  return viteServer.ssrLoadModule(id).catch((err) => {
    const chain = [];
    let cursor = err;
    while (cursor) {
      chain.push(`${cursor.code || ""}: ${String(cursor.message || cursor).split("\n")[0]}`);
      cursor = cursor.cause;
    }
    throw new Error(`ssrLoadModule(${id}) failed: ${chain.join(" <- ")}`);
  });
}

after(async () => {
  if (viteServer) await viteServer.close();
});

// ---------------------------------------------------------------- fixtures

const ROW = {
  id: "sess-1",
  name: "Техкарта пельменей",
  project_id: "proj-1",
  owner: "user@local",
  status: "in_progress",
  updated_at: 1726000000,
  reports_versions: 1,
  needs_attention: 0,
};

const WORKSPACE_FIXTURE = {
  ok: true,
  status: 200,
  org: { id: "org-1", name: "Организация" },
  summary: { total: 1, draft: 0, in_progress: 1, ready: 0, attention: 0 },
  users: [],
  projects: [{ id: "proj-1", name: "Проект 1", owner: "user@local", session_count: 1 }],
  sessions: [ROW],
  page: { limit: 10, offset: 0, total: 1 },
};

// ---------------------------------------------------------------- DOM harness

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
    KeyboardEvent: globalThis.KeyboardEvent,
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
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
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
    globalThis.KeyboardEvent = previous.KeyboardEvent;
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

async function click(el, win) {
  await act(async () => {
    el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await flush();
}

async function renderDashboard({ attachDoc } = {}) {
  const mod = await loadModule("/src/components/workspace/WorkspaceDashboard.jsx");
  mod.workspaceDashboardApi.getWorkspace = async () => WORKSPACE_FIXTURE;
  mod.workspaceDashboardApi.attachDoc = attachDoc;
  const env = setupDom();
  const opened = [];
  const props = {
    activeOrgId: "org-1",
    userId: "user-1",
    onOpenSession: (row, options) => { opened.push({ row, options }); },
  };
  await act(async () => {
    env.root.render(React.createElement(mod.default, props));
  });
  await flush(320); // 220ms debounce загрузки workspace
  return { doc: env.dom.window.document, win: env.dom.window, cleanup: env.cleanup, opened, mod };
}

async function openRowMenu(doc, win) {
  const button = doc.querySelector('[data-testid="workspace-session-actions-button"]');
  await click(button, win);
  return doc.querySelectorAll('[data-testid="workspace-session-actions-menu"]').length > 0;
}

function pickFile(input, win, name = "техкарта.md") {
  const file = new win.File(["# Техкарта\n\nНагреть воду."], name, { type: "text/markdown" });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  return file;
}

async function fireChange(input, win) {
  await act(async () => {
    input.dispatchEvent(new win.Event("change", { bubbles: true, cancelable: true }));
  });
  await flush();
}

function okAttachResponse(filename = "техкарта.md", chunksCreated = 12) {
  return { ok: true, status: 201, doc: { filename, rag: { chunksCreated } } };
}

function errAttachResponse(status, detail, error = "") {
  return { ok: false, status, error, data: { detail } };
}

const ACTION_ITEM_TESTID = '[data-testid="workspace-session-action-attach_doc"]';
const INPUT_TESTID = '[data-testid="workspace-session-attach-doc-input"]';
const TOAST_TESTID = '[data-testid="workspace-attach-doc-toast"]';

// ---------------------------------------------------------------- 1–2: пункт меню (desktop + mobile)

test("1: пункт «Прикрепить документ» присутствует в меню строки с i18n-лейблом", async () => {
  const { doc, win, cleanup } = await renderDashboard({ attachDoc: async () => okAttachResponse() });
  try {
    assert.equal(doc.querySelector(TOAST_TESTID), null, "toast скрыт до действия");
    await openRowMenu(doc, win);
    const item = doc.querySelector(ACTION_ITEM_TESTID);
    assert.notEqual(item, null, "пункт attach_doc в меню строки");
    assert.ok(item.textContent.includes("Прикрепить документ"), "i18n-лейбл из ru.workspace.sessionActions.attachDoc");
    const input = doc.querySelector(INPUT_TESTID);
    assert.notEqual(input, null, "скрытый file input существует");
    assert.equal(input.getAttribute("accept"), ".md,.txt,.text,.doc,.docx", "accept-контракт");
    assert.equal(input.style.display, "none", "input скрыт");
    assert.equal(input.disabled, false, "input активен вне pending");
  } finally {
    await cleanup();
  }
});

test("2: пункт виден и в desktop-таблице, и в mobile-карточке (общий рендерер)", async () => {
  const { doc, win, cleanup } = await renderDashboard({ attachDoc: async () => okAttachResponse() });
  try {
    await openRowMenu(doc, win);
    const items = doc.querySelectorAll(ACTION_ITEM_TESTID);
    assert.equal(items.length, 2, "пункт в обоих рендерерах (desktop table + mobile card)");
    const mobileBlock = doc.querySelector(".md\\:hidden");
    assert.notEqual(mobileBlock, null, "mobile-блок карточек в разметке");
    assert.notEqual(mobileBlock.querySelector(ACTION_ITEM_TESTID), null, "пункт внутри mobile-карточки");
    const desktopBlock = doc.querySelector(".hidden.md\\:block");
    assert.notEqual(desktopBlock, null, "desktop-блок таблицы в разметке");
    assert.notEqual(desktopBlock.querySelector(ACTION_ITEM_TESTID), null, "пункт внутри desktop-таблицы");
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------- 3: клик → attach

test("3: клик по пункту → programmatic click input → выбор файла → attachDoc вызван один раз с row.id; сессия не открывается", async () => {
  const calls = [];
  const { doc, win, cleanup, opened } = await renderDashboard({
    attachDoc: async (sessionId, file) => { calls.push({ sessionId, file }); return okAttachResponse(); },
  });
  try {
    await openRowMenu(doc, win);
    const input = doc.querySelector(INPUT_TESTID);
    let inputClicks = 0;
    input.addEventListener("click", () => { inputClicks += 1; });
    await click(doc.querySelectorAll(ACTION_ITEM_TESTID)[0], win);
    assert.equal(inputClicks, 1, "диспетчер кликнул по скрытому input");
    assert.equal(doc.querySelector('[data-testid="workspace-session-actions-menu"]'), null, "меню закрыто после клика");
    assert.equal(calls.length, 0, "attach не вызван до выбора файла");
    const file = pickFile(input, win);
    await fireChange(input, win);
    assert.equal(calls.length, 1, "ровно один вызов attachDoc");
    assert.equal(calls[0].sessionId, "sess-1", "row.id как sessionId");
    assert.equal(calls[0].file, file, "передан выбранный файл");
    assert.equal(opened.length, 0, "сессия не открывалась, навигации нет");
    const toast = doc.querySelector(TOAST_TESTID);
    assert.notEqual(toast, null, "toast показан");
    assert.ok(toast.textContent.includes("техкарта.md"), "filename в toast");
    assert.ok(toast.textContent.includes("12"), "chunksCreated в toast");
    assert.equal(input.value, "", "value input сброшен для повторного выбора");
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------- 4: success toast

test("4: успех 201 → toast «{filename}» прикреплён (N фрагментов в индексе)", async () => {
  const { doc, win, cleanup } = await renderDashboard({
    attachDoc: async () => okAttachResponse("рецепт.txt", 7),
  });
  try {
    await openRowMenu(doc, win);
    const input = doc.querySelector(INPUT_TESTID);
    await click(doc.querySelectorAll(ACTION_ITEM_TESTID)[0], win);
    pickFile(input, win, "рецепт.txt");
    await fireChange(input, win);
    const toast = doc.querySelector(TOAST_TESTID);
    assert.notEqual(toast, null, "toast есть");
    assert.ok(toast.textContent.includes("«рецепт.txt» прикреплён"), "успешный текст с filename");
    assert.ok(toast.textContent.includes("(7 фрагментов в индексе)"), "chunksCreated подставлен");
    assert.ok(toast.className.includes("border-success"), "success-плашка зелёная (токен success)");
    await click(doc.querySelector('[data-testid="workspace-attach-doc-toast-close"]'), win);
    assert.equal(doc.querySelector(TOAST_TESTID), null, "ручной close скрывает toast");
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------- 5–6: i18n-маппинг ошибок

test("5: 413 doc_too_large → toast с i18n-текстом «Файл больше 2 МБ»", async () => {
  const { doc, win, cleanup } = await renderDashboard({
    attachDoc: async () => errAttachResponse(413, { error: "doc_too_large", detail: "file exceeds 2 MB" }, "doc_too_large"),
  });
  try {
    await openRowMenu(doc, win);
    const input = doc.querySelector(INPUT_TESTID);
    await click(doc.querySelectorAll(ACTION_ITEM_TESTID)[0], win);
    pickFile(input, win);
    await fireChange(input, win);
    const toast = doc.querySelector(TOAST_TESTID);
    assert.notEqual(toast, null, "toast ошибки есть");
    assert.ok(toast.textContent.includes("Файл больше 2 МБ"), "doc_too_large → i18n-текст");
    assert.ok(toast.className.includes("border-danger"), "error-плашка красная (токен danger)");
  } finally {
    await cleanup();
  }
});

test("6: 422 doc_extension_not_allowed / doc_limit_reached → соответствующие i18n-тексты", async () => {
  const codes = [
    ["doc_extension_not_allowed", "Формат не поддерживается (.md, .txt, .doc, .docx)"],
    ["doc_limit_reached", "Лимит 20 документов на сессию"],
  ];
  for (const [code, expectedText] of codes) {
    const { doc, win, cleanup } = await renderDashboard({
      attachDoc: async () => errAttachResponse(422, { error: code, detail: `${code}: raw backend text` }, code),
    });
    try {
      await openRowMenu(doc, win);
      const input = doc.querySelector(INPUT_TESTID);
      await click(doc.querySelectorAll(ACTION_ITEM_TESTID)[0], win);
      pickFile(input, win);
      await fireChange(input, win);
      const toast = doc.querySelector(TOAST_TESTID);
      assert.notEqual(toast, null, `toast для ${code}`);
      assert.ok(toast.textContent.includes(expectedText), `${code} → i18n-текст`);
    } finally {
      await cleanup();
    }
  }
});

// ---------------------------------------------------------------- 7: неизвестная ошибка

test("7: неизвестная ошибка (сырая строка detail) → fallback «Ошибка: {detail}»", async () => {
  const { doc, win, cleanup } = await renderDashboard({
    attachDoc: async () => ({ ok: false, status: 500, error: "boom: disk full", data: {} }),
  });
  try {
    await openRowMenu(doc, win);
    const input = doc.querySelector(INPUT_TESTID);
    await click(doc.querySelectorAll(ACTION_ITEM_TESTID)[0], win);
    pickFile(input, win);
    await fireChange(input, win);
    const toast = doc.querySelector(TOAST_TESTID);
    assert.notEqual(toast, null, "toast есть");
    assert.ok(toast.textContent.includes("Ошибка: boom: disk full"), "сырой detail через unknown-плейсхолдер");
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------- 8: двойной сабмит

test("8: пока attach в полёте — повторный выбор/клик no-op (один вызов); после resolve повторный выбор снова работает", async () => {
  const calls = [];
  let resolveAttach = null;
  const { doc, win, cleanup } = await renderDashboard({
    attachDoc: (sessionId, file) => new Promise((resolve) => {
      calls.push({ sessionId, file });
      resolveAttach = () => resolve(okAttachResponse("техкарта.md", 3));
    }),
  });
  try {
    await openRowMenu(doc, win);
    const input = doc.querySelector(INPUT_TESTID);
    await click(doc.querySelectorAll(ACTION_ITEM_TESTID)[0], win);
    pickFile(input, win);
    await fireChange(input, win);
    assert.equal(calls.length, 1, "первый вызов в полёте");
    assert.equal(input.disabled, true, "input disabled во время pending");
    // повторный выбор файла, пока pending
    pickFile(input, win, "второй.md");
    await fireChange(input, win);
    assert.equal(calls.length, 1, "повторный выбор файла — no-op по флагу pending");
    // повторный клик по пункту меню, пока pending
    await openRowMenu(doc, win);
    const item = doc.querySelectorAll(ACTION_ITEM_TESTID)[0];
    assert.equal(item.disabled, true, "пункт меню disabled во время pending");
    assert.ok(item.textContent.includes("Прикрепляем"), "пункт показывает pending-текст");
    await click(item, win);
    assert.equal(calls.length, 1, "повторный клик — no-op");
    // завершаем полёт
    await act(async () => { resolveAttach(); });
    await flush();
    assert.equal(input.disabled, false, "pending сброшен после resolve");
    // повторный выбор того же файла (value сброшен) → второй вызов возможен
    pickFile(input, win);
    await fireChange(input, win);
    assert.equal(calls.length, 2, "после resolve повторный выбор снова стреляет");
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------- 9: customize off

test("9: Customize → выключение тоггла attach_doc → пункт исчезает из меню", async () => {
  const { doc, win, cleanup } = await renderDashboard({ attachDoc: async () => okAttachResponse() });
  try {
    await openRowMenu(doc, win);
    assert.equal(doc.querySelectorAll(ACTION_ITEM_TESTID).length, 2, "пункт включён по умолчанию");
    await click(doc.querySelector('[data-testid="workspace-session-actions-customize-open"]'), win);
    const toggle = doc.querySelector('[data-testid="workspace-session-actions-toggle-attach_doc"]');
    assert.notEqual(toggle, null, "тоггл в Customize-модалке");
    assert.equal(toggle.checked, true, "defaultEnabled: true");
    await act(async () => {
      toggle.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await flush();
    assert.equal(toggle.checked, false, "тоггл выключен");
    await click(doc.querySelector('[data-testid="workspace-session-actions-customize"] button:last-child'), win);
    await openRowMenu(doc, win);
    assert.equal(doc.querySelectorAll(ACTION_ITEM_TESTID).length, 0, "пункт исчез из меню");
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------- 10: token economy (source-contract)

test("10: token economy — apiSessionDocsAttach не вызывается из useEffect; attach только из обработчика выбора файла", () => {
  const src = fs.readFileSync(path.join(__dirname, "WorkspaceDashboard.jsx"), "utf8");
  assert.match(src, /export const workspaceDashboardApi = \{/, "модульный seam workspaceDashboardApi существует");
  assert.match(src, /apiSessionDocsAttach,\s*\n\}/, "seam по умолчанию указывает на реальный apiSessionDocsAttach");
  const effects = src.match(/useEffect\(\(\)\s*=>[\s\S]*?\},\s*\[[^\]]*\]\s*\)/g) || [];
  assert.ok(effects.length >= 5, `ожидали >=5 useEffect в компоненте, нашли ${effects.length}`);
  for (const effect of effects) {
    assert.ok(
      !/apiSessionDocsAttach|workspaceDashboardApi\.attachDoc/.test(effect),
      `useEffect без вызовов attach: ${effect.slice(0, 90)}…`,
    );
  }
  const handlerMatch = src.match(/async function onAttachDocPicked\(event\) \{[\s\S]*?\n  \}/);
  assert.notEqual(handlerMatch, null, "обработчик onAttachDocPicked существует");
  assert.match(handlerMatch[0], /workspaceDashboardApi\.attachDoc\(/, "attach вызывается только из обработчика выбора файла");
});
