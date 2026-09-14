// feature/session-doc-attachments (TESTS 34–36) — карточка ревью по техкарте.
// Разметка по цитатам (sequential indexOf), боковой список ненайденных,
// пустой список → зелёная плашка, клик по mark → поповер (Escape закрывает).
// Запуск: node --test src/features/process/processman/review/ProcessmanReviewCard.test.mjs
import test, { after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

import { buildReviewSegments, countBySeverity, normalizeSeverity } from "./reviewSegments.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, "../../../../..");

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

// ---------------------------------------------------------------- pure seams

test("pure: quote найден → mark с severity; не найден → только боковой список", () => {
  const checkedText = "Нагреть воду до 75°C, выдержать 10 минут. Добавить соль.";
  const annotations = [
    { quote: "75°C", severity: "error", comment: "c1" },
    { quote: "10 минут", severity: "warning", comment: "c2" },
    { quote: "несуществующая цитата", severity: "info", comment: "c3" },
  ];
  const { segments, side } = buildReviewSegments(checkedText, annotations);
  const marks = segments.filter((s) => s.type === "mark");
  assert.equal(marks.length, 2, "два найденных фрагмента");
  assert.equal(marks[0].annotation.severity, "error");
  assert.equal(marks[0].index, 0);
  assert.equal(marks[1].annotation.severity, "warning");
  assert.equal(marks[1].index, 1);
  // повторный quote ищется от предыдущего совпадения
  const again = buildReviewSegments("абв абв", [
    { quote: "абв", severity: "info" },
    { quote: "абв", severity: "error" },
  ]);
  const againMarks = again.segments.filter((s) => s.type === "mark");
  assert.equal(againMarks.length, 2);
  assert.ok(againMarks[1].start > againMarks[0].start, "второй поиск — после первого совпадения");
  assert.equal(side.length, 1, "ненайденная цитата — в боковом списке");
  assert.equal(side[0].annotation.comment, "c3");
  assert.equal(countBySeverity(annotations).error, 1);
  assert.equal(countBySeverity(annotations).warning, 1);
  assert.equal(normalizeSeverity("BAD"), "info", "неизвестная severity → info");
});

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

async function renderCard(review, { onRetry } = {}) {
  const mod = await loadModule("/src/features/process/processman/review/ProcessmanReviewCard.jsx");
  const env = setupDom();
  const msg = { id: "m_rev", role: "agent", at: Date.now(), review };
  await act(async () => {
    env.root.render(React.createElement(mod.default, { msg, onRetry }));
  });
  await flush();
  return { doc: env.dom.window.document, win: env.dom.window, cleanup: env.cleanup };
}

async function click(el, win) {
  await act(async () => {
    el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await flush();
}

const CHECKED = "Нагреть воду до 75°C, выдержать 10 минут.";
const ANNOTATIONS = [
  { quote: "75°C", start: null, end: null, severity: "error", comment: "Температура ниже нормы техкарты", techCardRef: "п. 3.1 Термообработка" },
  { quote: "10 минут", start: null, end: null, severity: "warning", comment: "Выдержка не указана для партии > 500 кг", techCardRef: null },
  { quote: "несуществующая цитата", start: null, end: null, severity: "info", comment: "orphan", techCardRef: "п. 9" },
];

// ---------------------------------------------------------------- 34: разметка

test("34: render — найденные quotes в <mark> с классом severity и data-annotation-idx, ненайденный — в боковом списке, текст не падает", async () => {
  const { doc, cleanup } = await renderCard({
    status: "done",
    reviewId: "r1",
    checkedText: CHECKED,
    annotations: ANNOTATIONS,
    retrievalMode: "rag",
    errorText: "",
  });
  try {
    assert.notEqual(doc.querySelector('[data-testid="processman-review-card"]'), null, "карточка рендерится");
    const marks = Array.from(doc.querySelectorAll('[data-testid="processman-review-mark"]'));
    assert.equal(marks.length, 2, "два mark по найденным цитатам");
    assert.ok(marks[0].className.includes("pm-review-mark--error"), "mark severity=error");
    assert.ok(marks[1].className.includes("pm-review-mark--warning"), "mark severity=warning");
    assert.equal(marks[0].getAttribute("data-annotation-idx"), "0");
    assert.equal(marks[1].getAttribute("data-annotation-idx"), "1");
    const text = doc.querySelector('[data-testid="processman-review-text"]').textContent;
    assert.ok(text.includes("Нагреть воду до"), "текст до цитаты на месте");
    assert.ok(text.includes(CHECKED), "проверяемый текст целиком присутствует");
    const side = doc.querySelector('[data-testid="processman-review-side"]');
    assert.notEqual(side, null, "боковой список ненайденных аннотаций");
    assert.ok(side.textContent.includes("несуществующая цитата"), "ненайденная цитата в списке");
    const summary = doc.querySelector('[data-testid="processman-review-summary"]').textContent;
    assert.ok(summary.includes("3"), "сводка: 3 замечания");
    assert.ok(summary.includes("поиск по документам сессии"), "подпись retrievalMode=rag");
  } finally {
    await cleanup();
  }
});

test("35: пустой annotations → зелёная плашка «Замечаний не найдено»", async () => {
  const { doc, cleanup } = await renderCard({
    status: "done",
    reviewId: "r2",
    checkedText: "Всё по техкарте.",
    annotations: [],
    retrievalMode: "direct",
    errorText: "",
  });
  try {
    const clean = doc.querySelector('[data-testid="processman-review-clean"]');
    assert.notEqual(clean, null, "зелёная плашка показана");
    assert.ok(clean.textContent.includes("Замечаний не найдено"));
    assert.equal(doc.querySelector('[data-testid="processman-review-mark"]'), null, "без mark при пустом списке");
  } finally {
    await cleanup();
  }
});

test("36: клик по <mark> → поповер с comment и techCardRef; Escape закрывает", async () => {
  const { doc, win, cleanup } = await renderCard({
    status: "done",
    reviewId: "r1",
    checkedText: CHECKED,
    annotations: ANNOTATIONS,
    retrievalMode: "rag",
    errorText: "",
  });
  try {
    const mark = doc.querySelector('[data-testid="processman-review-mark"]');
    await click(mark, win);
    let popover = doc.querySelector('[data-testid="processman-review-popover"]');
    assert.notEqual(popover, null, "поповер открылся");
    assert.ok(popover.textContent.includes("Температура ниже нормы техкарты"), "comment в поповере");
    assert.ok(popover.textContent.includes("п. 3.1 Термообработка"), "techCardRef в поповере");
    assert.ok(popover.textContent.includes("Пункт техкарты"), "заголовок блока техкарты");
    assert.ok(popover.textContent.includes("75°C"), "цитата в поповере");
    // Escape закрывает
    await act(async () => {
      doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await flush();
    popover = doc.querySelector('[data-testid="processman-review-popover"]');
    assert.equal(popover, null, "Escape закрыл поповер");
    // повторный клик открывает снова, клик вне — закрывает
    await click(doc.querySelector('[data-testid="processman-review-mark"]'), win);
    assert.notEqual(doc.querySelector('[data-testid="processman-review-popover"]'), null, "повторный клик открывает");
    await act(async () => {
      doc.body.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    });
    await flush();
    assert.equal(doc.querySelector('[data-testid="processman-review-popover"]'), null, "клик вне закрыл поповер");
  } finally {
    await cleanup();
  }
});

test("состояния: pending → skeleton; error → inline-текст + retry вызывает onRetry", async () => {
  // pending
  {
    const { doc, cleanup } = await renderCard({
      status: "pending",
      reviewId: "",
      checkedText: "текст",
      annotations: [],
      retrievalMode: "",
      errorText: "",
    });
    try {
      assert.notEqual(doc.querySelector('[data-testid="processman-review-loading"]'), null, "skeleton при pending");
      assert.equal(doc.querySelector('[data-testid="processman-review-text"]'), null, "текста нет до ответа");
    } finally {
      await cleanup();
    }
  }
  // error + retry
  {
    let retried = null;
    const { doc, win, cleanup } = await renderCard({
      status: "error",
      reviewId: "",
      checkedText: "текст",
      annotations: [],
      retrievalMode: "",
      errorText: "review_parse_failed",
    }, { onRetry: (msg) => { retried = msg; } });
    try {
      const err = doc.querySelector('[data-testid="processman-review-error"]');
      assert.notEqual(err, null, "inline-блок ошибки");
      assert.ok(err.textContent.includes("review_parse_failed"), "текст ошибки показан");
      await click(doc.querySelector('[data-testid="processman-review-retry"]'), win);
      assert.notEqual(retried, null, "retry вызвал onRetry с сообщением");
      assert.equal(retried.review.checkedText, "текст");
    } finally {
      await cleanup();
    }
  }
});
