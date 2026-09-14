// feature/session-doc-attachments (TESTS 41–42) — триггеры ревьюера.
// «ревью: текст» и «/review текст» (case-insensitive) → apiAgentReview + review-card
// в ленте; обычное сообщение — в обычный chat, review НЕ вызывается.
// Иконка в композере с текстом → review endpoint (42).
// Моки — на уровне api-layer (проп apiReview / колбэк onReview), fetch только
// для SSE-чата (не для ревью).
//
// ВАЖНО: jsdom-глобалы ставим ДО динамического импорта react/react-dom —
// иначе react-dom считает isInputEventSupported=false (наблюдается в момент
// загрузки модуля) и onChange у input не сработает.
// Запуск: node --test src/features/process/processman/chat/processmanReviewTrigger.test.mjs
import test, { after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

import { parseReviewTrigger } from "./processmanReviewTrigger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, "../../../../..");

// ---- jsdom globals ДО загрузки react (см. примечание выше) ----
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" });
const savedGlobals = {
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

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");

after(() => {
  dom.window.close();
  globalThis.window = savedGlobals.window;
  globalThis.document = savedGlobals.document;
  globalThis.Element = savedGlobals.Element;
  globalThis.HTMLElement = savedGlobals.HTMLElement;
  globalThis.Node = savedGlobals.Node;
  globalThis.Event = savedGlobals.Event;
  globalThis.MouseEvent = savedGlobals.MouseEvent;
  globalThis.KeyboardEvent = savedGlobals.KeyboardEvent;
  globalThis.requestAnimationFrame = savedGlobals.requestAnimationFrame;
  globalThis.cancelAnimationFrame = savedGlobals.cancelAnimationFrame;
  globalThis.IS_REACT_ACT_ENVIRONMENT = savedGlobals.reactActEnv;
});

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
  return viteServer.ssrLoadModule(id);
}

after(async () => {
  if (viteServer) await viteServer.close();
});

// ---------------------------------------------------------------- pure seam

test("pure: «ревью:» и «/review» (case-insensitive, trim) → триггер; обычный текст — нет", () => {
  assert.deepEqual(parseReviewTrigger("ревью: проверь температуру"), { isReview: true, text: "проверь температуру" });
  assert.deepEqual(parseReviewTrigger("  РЕВЬЮ:   проверь  "), { isReview: true, text: "проверь" }, "RU caps + trim");
  assert.deepEqual(parseReviewTrigger("/review проверь"), { isReview: true, text: "проверь" });
  assert.deepEqual(parseReviewTrigger("/REVIEW проверь"), { isReview: true, text: "проверь" }, "latin caps");
  assert.deepEqual(parseReviewTrigger("/review"), { isReview: true, text: "" }, "голый префикс — пустой остаток");
  assert.deepEqual(parseReviewTrigger("ревью без двоеточия"), { isReview: false, text: "ревью без двоеточия" });
  assert.deepEqual(parseReviewTrigger("обычное сообщение"), { isReview: false, text: "обычное сообщение" });
});

// ---------------------------------------------------------------- DOM helpers

const doc = dom.window.document;

function makeContainer() {
  const container = doc.createElement("div");
  doc.body.appendChild(container);
  return container;
}

async function flush(ms = 30) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function typeAndSubmit(container, text) {
  const input = container.querySelector('[data-testid="processman-qa-input"]');
  assert.notEqual(input, null, "поле ввода");
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setter.call(input, text);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  await flush();
  assert.equal(input.value, text, "controlled input принял значение (onChange сработал)");
  const send = container.querySelector('[data-testid="processman-action-qa"]');
  await act(async () => {
    send.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await flush(60);
}

const SID = "sess_trigger";

function fetchCalls() {
  return globalThis.__fpc_review_trigger_fetch_calls__ || [];
}

async function mountTobe(apiReview) {
  const mod = await loadModule("/src/features/process/processman/ProcessmanTobe.jsx");
  const store = await loadModule("/src/features/process/processman/chat/processmanChatStore.js");
  store.resetChatHistories();
  store.hydrateChatHistory(SID, []); // гидрация выполнена → mount без сети
  const prevFetch = globalThis.fetch;
  const calls = [];
  globalThis.__fpc_review_trigger_fetch_calls__ = calls;
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: String(opts?.method || "GET") });
    if (String(url).includes("/agent/stream")) {
      const encoder = new TextEncoder();
      const chunks = [
        encoder.encode('event: token\ndata: {"delta":"обычный ответ"}\n\n'),
        encoder.encode('event: done\ndata: {"usage":{}}\n\n'),
      ];
      let i = 0;
      return {
        ok: true,
        status: 200,
        headers: { get: (k) => (String(k).toLowerCase() === "content-type" ? "text/event-stream" : null) },
        body: {
          getReader: () => ({
            read: async () => {
              if (i >= chunks.length) return { done: true };
              const value = chunks[i];
              i += 1;
              return { done: false, value };
            },
            cancel: async () => {},
          }),
        },
      };
    }
    return prevFetch ? prevFetch(url, opts) : new Response("{}", { status: 200 });
  };
  const container = makeContainer();
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(mod.default, {
      sessionId: SID,
      selectedElement: { id: "Act_1", name: "Шаг 1", type: "task" },
      llmStatus: { ok: true, status: 200, result: { configured: true, quota: { used: 0, limit: 200000 } } },
      cacheRef: { current: new Map() },
      onAnswerChange: () => {},
      onStatusChange: () => {},
      apiReview,
    }));
  });
  await flush();
  const cleanup = async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    globalThis.fetch = prevFetch;
    delete globalThis.__fpc_review_trigger_fetch_calls__;
  };
  return { container, cleanup, store };
}

const REVIEW_RESULT = {
  ok: true,
  status: 200,
  reviewId: "rev_1",
  retrievalMode: "rag",
  annotations: [
    { quote: "температуру", start: null, end: null, severity: "error", comment: "Ниже нормы", techCardRef: "п. 3.1" },
  ],
};

// ---------------------------------------------------------------- 41: routing

test("41: «ревью: текст» → apiAgentReview(текст без префикса), user-сообщение + review-card в ленте", async () => {
  const reviewCalls = [];
  const apiReview = async (sid, payload) => {
    reviewCalls.push({ sid, payload });
    return REVIEW_RESULT;
  };
  const { container, cleanup, store } = await mountTobe(apiReview);
  try {
    await typeAndSubmit(container, "ревью: проверь температуру");
    assert.equal(reviewCalls.length, 1, "review endpoint вызван один раз");
    assert.equal(reviewCalls[0].sid, SID);
    assert.deepEqual(reviewCalls[0].payload, { text: "проверь температуру" }, "префикс срезан");
    assert.ok(!(fetchCalls().some((c) => c.url.includes("/agent/review"))), "review не через fetch (api-layer мок)");
    assert.ok(!(fetchCalls().length && fetchCalls().some((c) => c.url.includes("/agent/stream"))), "обычный stream не вызывался");
    const history = store.getChatHistory(SID);
    const userMsg = history.find((m) => m.role === "user");
    assert.equal(userMsg.text, "проверь температуру", "user-сообщение без префикса в ленте");
    const reviewMsg = history.find((m) => m.review);
    assert.notEqual(reviewMsg, null, "review-сообщение в сторе");
    assert.equal(reviewMsg.review.status, "done");
    assert.equal(reviewMsg.review.reviewId, "rev_1");
    assert.equal(reviewMsg.review.checkedText, "проверь температуру");
    assert.equal(reviewMsg.review.annotations.length, 1);
    assert.equal(reviewMsg.review.retrievalMode, "rag");
    // review-card отрендерилась с подсветкой
    const card = container.querySelector('[data-testid="processman-review-card"]');
    assert.notEqual(card, null, "review-card в DOM");
    assert.notEqual(card.querySelector('[data-testid="processman-review-mark"]'), null, "mark подсветки");
    assert.ok(card.textContent.includes("1"), "сводка в карточке");
  } finally {
    await cleanup();
  }
});

test("41: «/REVIEW текст» (case-insensitive) → тот же review endpoint; «ревью:» без текста ничего не шлёт", async () => {
  const reviewCalls = [];
  const apiReview = async (sid, payload) => {
    reviewCalls.push({ sid, payload });
    return { ok: true, status: 200, reviewId: "rev_2", retrievalMode: "direct", annotations: [] };
  };
  const { container, cleanup, store } = await mountTobe(apiReview);
  try {
    await typeAndSubmit(container, "/REVIEW второй текст");
    assert.equal(reviewCalls.length, 1);
    assert.deepEqual(reviewCalls[0].payload, { text: "второй текст" });
    await flush();
    const clean = container.querySelector('[data-testid="processman-review-clean"]');
    assert.notEqual(clean, null, "пустой список аннотаций → «Замечаний не найдено»");
    assert.ok(clean.textContent.includes("Замечаний не найдено"));

    const historyLen = store.getChatHistory(SID).length;
    await typeAndSubmit(container, "ревью:");
    assert.equal(reviewCalls.length, 1, "голый префикс — новый вызов не отправлен");
    assert.equal(store.getChatHistory(SID).length, historyLen, "лента не изменилась");
    assert.ok(!(fetchCalls().some((c) => c.url.includes("/agent/stream"))), "и в обычный чат голый префикс не ушёл");
  } finally {
    await cleanup();
  }
});

test("41: обычное сообщение → обычный chat (/agent/stream), review endpoint НЕ вызывается", async () => {
  const reviewCalls = [];
  const apiReview = async (sid, payload) => {
    reviewCalls.push({ sid, payload });
    return REVIEW_RESULT;
  };
  const { container, cleanup, store } = await mountTobe(apiReview);
  try {
    await typeAndSubmit(container, "что дальше после шага?");
    assert.equal(reviewCalls.length, 0, "review не вызван для обычного сообщения");
    assert.ok(fetchCalls().some((c) => c.url.includes("/agent/stream")), "обычный чат ушёл на /agent/stream");
    const history = store.getChatHistory(SID);
    assert.equal(history.filter((m) => m.review).length, 0, "review-сообщения нет");
    assert.equal(history.filter((m) => m.role === "user").length, 1, "user-сообщение есть");
  } finally {
    await cleanup();
  }
});

test("41: retry карточки ревью после ошибки — тот же endpoint с тем же текстом", async () => {
  let attempts = 0;
  const reviewCalls = [];
  const apiReview = async (sid, payload) => {
    attempts += 1;
    reviewCalls.push({ sid, payload });
    return attempts === 1
      ? { ok: false, status: 502, error: "review_parse_failed" }
      : REVIEW_RESULT;
  };
  const { container, cleanup, store } = await mountTobe(apiReview);
  try {
    await typeAndSubmit(container, "ревью: проверь температуру");
    let reviewMsg = store.getChatHistory(SID).find((m) => m.review);
    assert.equal(reviewMsg.review.status, "error", "первая попытка — ошибка");
    const errBlock = container.querySelector('[data-testid="processman-review-error"]');
    assert.ok(errBlock.textContent.includes("review_parse_failed"), "текст ошибки в карточке");
    await act(async () => {
      container.querySelector('[data-testid="processman-review-retry"]').dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await flush(60);
    assert.equal(reviewCalls.length, 2, "retry повторил вызов");
    assert.deepEqual(reviewCalls[1].payload, { text: "проверь температуру" }, "тот же текст");
    reviewMsg = store.getChatHistory(SID).find((m) => m.review);
    assert.equal(reviewMsg.review.status, "done", "карточка резолвнута");
    assert.equal(store.getChatHistory(SID).filter((m) => m.review).length, 1, "retry не плодит карточки");
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------- 42: composer icon

test("42: иконка в композере с текстом → onReview(текст); disabled/spinner пока ревью идёт", async () => {
  const mod = await loadModule("/src/features/process/processman/ProcessmanComposer.jsx");
  const container = makeContainer();
  const root = createRoot(container);
  const reviewCalls = [];
  async function renderComposer(props) {
    await act(async () => {
      root.render(React.createElement(mod.default, {
        value: "проверь это",
        onChange: () => {},
        onSubmit: () => {},
        onReview: (text) => { reviewCalls.push(text); },
        ...props,
      }));
    });
    await flush();
  }
  try {
    await renderComposer({});
    const btn = container.querySelector('[data-testid="processman-action-review"]');
    assert.notEqual(btn, null, "кнопка ревью в композере");
    assert.equal(btn.disabled, false, "активна при непустом тексте");
    await act(async () => {
      btn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await flush();
    assert.deepEqual(reviewCalls, ["проверь это"], "onReview вызван с текстом поля");

    await renderComposer({ reviewRunning: true });
    const busy = container.querySelector('[data-testid="processman-action-review"]');
    assert.equal(busy.disabled, true, "disabled пока ревью идёт");
    assert.notEqual(busy.querySelector(".pm-processman-composer__review-spinner"), null, "спиннер вместо иконки");

    await renderComposer({ value: "   " });
    assert.equal(container.querySelector('[data-testid="processman-action-review"]').disabled, true, "disabled при пустом тексте");
  } finally {
    await act(async () => { root.unmount(); });
    container.remove();
  }
});
