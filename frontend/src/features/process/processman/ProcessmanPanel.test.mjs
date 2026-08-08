// LLM4 — behavior-тесты панели PROCESSMAN (документ владельца, ревизия 1):
// каркас (шапка/футер/role), контент за вкладкой воркбенча, состояния
// S1/S4/S5/S6/S7/S8, кэш in-memory (S3), 👍/👎 feedback.
// Запуск: node --test src/features/process/processman/ProcessmanPanel.test.mjs
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

async function loadPanel() {
  if (!viteServer) {
    viteServer = await createServer({
      root: FRONTEND_ROOT,
      logLevel: "error",
      server: { middlewareMode: true },
      appType: "custom",
    });
  }
  return viteServer.ssrLoadModule("/src/features/process/processman/ProcessmanPanel.jsx");
}

after(async () => {
  if (viteServer) await viteServer.close();
});

function jsonResponse(data, { status = 200, delayMs = 0 } = {}) {
  return async () => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (k) => (String(k).toLowerCase() === "content-type" ? "application/json" : null) },
      json: async () => data,
      text: async () => JSON.stringify(data),
      blob: async () => new Blob(),
    };
  };
}

function setupDom({ fetchImpl } = {}) {
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
    localStorage: globalThis.localStorage,
    fetch: globalThis.fetch,
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
  globalThis.localStorage = dom.window.localStorage;
  const calls = [];
  globalThis.fetch = fetchImpl
    ? async (url, opts) => { calls.push({ url: String(url), opts }); return fetchImpl(url, opts); }
    : async (url, opts) => { calls.push({ url: String(url), opts }); throw new Error(`unexpected fetch: ${url}`); };
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
    globalThis.localStorage = previous.localStorage;
    globalThis.fetch = previous.fetch;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.reactActEnv;
  };

  return { dom, root, calls, cleanup };
}

async function flush(ms = 24) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function renderPanel(env, mod, props = {}) {
  const cacheRef = props.cacheRef || { current: new Map() };
  await act(async () => {
    env.root.render(React.createElement(mod.default, {
      sessionId: "sess_1",
      tab: "diagram",
      mode: "tobe",
      selectedBpmnElement: { id: "Act_1", name: "Шаг 1", type: "task" },
      llmStatus: { ok: true, status: 200, result: { configured: true, quota: { used: 0, limit: 200000 } } },
      cacheRef,
      onOpenFullAnalysis: () => {},
      onClose: () => {},
      ...props,
    }));
  });
  await flush();
  return env.dom.window.document;
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

// ------------------------------------------------------------------ каркас
test("каркас: role=complementary, шапка 48px (PROCESSMAN капсом + бейдж + крестик), футер с дисклеймером", async () => {
  const mod = await loadPanel();
  const env = setupDom();
  try {
    const doc = await renderPanel(env, mod);
    const panel = doc.querySelector('[data-testid="processman-panel"]');
    assert.notEqual(panel, null);
    assert.equal(panel.getAttribute("role"), "complementary");
    assert.ok(doc.querySelector(".pm-processman__header"), "шапка");
    assert.ok(doc.querySelector(".pm-processman__title")?.textContent.includes("PROCESSMAN"), "капс");
    assert.equal(doc.querySelector('[data-testid="processman-context-badge"]')?.textContent.trim(), "TO BE");
    assert.notEqual(doc.querySelector('[data-testid="processman-close"]'), null, "крестик");
    const footer = doc.querySelector('[data-testid="processman-footer"]');
    assert.ok(footer?.textContent.includes("Ответ генерирует ИИ"), "дисклеймер в футере");
    assert.ok(doc.querySelector('[data-testid="processman-icon"] svg'), "SVG-иконка в шапке");
    assert.equal(env.calls.length, 0, "открытие панели = 0 сетевых вызовов");
  } finally {
    await env.cleanup();
  }
});

// ------------------------------------------------- контент за вкладкой воркбенча
test("контент следует за вкладкой: interview → analysis, diagram+tobe → TO BE-действия, xml → neutral", async () => {
  const mod = await loadPanel();
  const env = setupDom();
  try {
    // analysis
    let doc = await renderPanel(env, mod, { tab: "interview", mode: "schema" });
    assert.notEqual(doc.querySelector('[data-testid="processman-analysis"]'), null, "analysis-контент");
    assert.equal(doc.querySelector('[data-testid="processman-context-badge"]')?.textContent.trim(), "Анализ");
    assert.notEqual(doc.querySelector('[data-testid="processman-analysis-open-full"]'), null, "CTA «Открыть полный анализ»");
    // tobe
    doc = await renderPanel(env, mod, { tab: "diagram", mode: "tobe" });
    assert.notEqual(doc.querySelector('[data-testid="processman-action-suggest"]'), null, "кнопка suggest-next");
    assert.notEqual(doc.querySelector('[data-testid="processman-action-explain"]'), null, "кнопка explain-step");
    assert.notEqual(doc.querySelector('[data-testid="processman-action-qa"]'), null, "кнопка step-qa");
    // neutral
    doc = await renderPanel(env, mod, { tab: "xml", mode: "schema" });
    assert.notEqual(doc.querySelector('[data-testid="processman-neutral"]'), null, "нейтральное состояние");
    assert.equal(env.calls.length, 0, "смена контекста = 0 сетевых вызовов");
  } finally {
    await env.cleanup();
  }
});

test("schema-контекст: SchemaAssistantBlock перенесён в панель", async () => {
  const mod = await loadPanel();
  const env = setupDom();
  try {
    const doc = await renderPanel(env, mod, { tab: "diagram", mode: "schema" });
    assert.notEqual(doc.querySelector('[data-testid="processman-schema-pane"]'), null, "schema-pane");
    assert.notEqual(doc.querySelector('[data-testid="schema-assistant-block"]'), null, "SchemaAssistantBlock в панели");
    assert.equal(env.calls.length, 0);
  } finally {
    await env.cleanup();
  }
});

// ------------------------------------------------------------------ S1
test("S1: нет ключа (configured=false) — TO BE-действия disabled + честное состояние", async () => {
  const mod = await loadPanel();
  const env = setupDom();
  try {
    const doc = await renderPanel(env, mod, {
      llmStatus: { ok: true, status: 200, result: { configured: false, quota: { used: 0, limit: 0 } } },
    });
    assert.notEqual(doc.querySelector('[data-testid="processman-tobe-no-key"]'), null, "no-key состояние");
    assert.equal(doc.querySelector('[data-testid="processman-action-suggest"]')?.disabled, true);
    assert.equal(env.calls.length, 0, "0 запросов");
  } finally {
    await env.cleanup();
  }
});

// ------------------------------------------------------------------ S7
test("S7: лимит по quota (used>=limit) — действия disabled + состояние исчерпания", async () => {
  const mod = await loadPanel();
  const env = setupDom();
  try {
    const doc = await renderPanel(env, mod, {
      llmStatus: { ok: true, status: 200, result: { configured: true, quota: { used: 200000, limit: 200000 } } },
    });
    assert.notEqual(doc.querySelector('[data-testid="processman-tobe-quota"]'), null, "quota-состояние");
    assert.equal(doc.querySelector('[data-testid="processman-action-suggest"]')?.disabled, true);
    assert.equal(env.calls.length, 0, "0 запросов");
  } finally {
    await env.cleanup();
  }
});

// ------------------------------------------------------------------ S2
test("S2: шаг не выбран — пустое состояние, действия disabled, 0 запросов", async () => {
  const mod = await loadPanel();
  const env = setupDom();
  try {
    const doc = await renderPanel(env, mod, { selectedBpmnElement: null });
    assert.notEqual(doc.querySelector('[data-testid="processman-tobe-empty"]'), null, "пустое состояние");
    assert.equal(doc.querySelector('[data-testid="processman-action-suggest"]')?.disabled, true);
    assert.equal(env.calls.length, 0);
  } finally {
    await env.cleanup();
  }
});

// ------------------------------------------------------------------ S4/S5/S8
test("S4/S5/S8: клик → loading (skeleton >300ms, анти-даблклик) → ответ с fallback-бейджем", async (t) => {
  const mod = await loadPanel();
  const suggestPayload = {
    ok: true, status: "ok",
    suggestions: { candidates: [{ code: "op_cook", rationale: "нагрев" }], note: "" },
    fallback: true,
    usage: { prompt_tokens: 11, completion_tokens: 7 },
  };
  const env = setupDom({ fetchImpl: jsonResponse(suggestPayload, { delayMs: 500 }) });
  try {
    const doc = await renderPanel(env, mod);
    // анти-даблклик: клик запускает ровно 1 запрос, кнопка disabled во время загрузки
    await click(doc, env.dom.window, "processman-action-suggest");
    assert.equal(env.calls.length, 1, "1 запрос suggest-next");
    assert.equal(doc.querySelector('[data-testid="processman-action-suggest"]')?.disabled, true, "кнопка disabled при loading");
    await click(doc, env.dom.window, "processman-action-suggest").catch(() => null); // даблклик игнорируется
    assert.equal(env.calls.length, 1, "даблклик не добавляет запрос");
    // S4: skeleton после 300ms
    await flush(380);
    assert.notEqual(doc.querySelector('[data-testid="processman-answer-loading"]'), null, "skeleton >300ms");
    // S5: ответ
    await flush(400);
    assert.notEqual(doc.querySelector('[data-testid="processman-answer-ok"]'), null, "ответ показан");
    assert.ok(doc.querySelector('[data-testid="processman-answer-text"]')?.textContent.includes("op_cook"));
    assert.notEqual(doc.querySelector('[data-testid="processman-answer-time"]'), null, "время ответа");
    assert.notEqual(doc.querySelector('[data-testid="processman-answer-refresh"]'), null, "↻ Обновить");
    // S8: fallback-бейдж
    assert.notEqual(doc.querySelector('[data-testid="processman-answer-fallback"]'), null, "бейдж fallback-провайдера");
    // футер: «новый запрос»
    assert.equal(doc.querySelector('[data-testid="processman-cache-badge"]')?.textContent.trim(), "новый запрос");
  } finally {
    await env.cleanup();
  }
});

// ------------------------------------------------------------------ S3/S6
test("S3: повторный клик по тому же шагу — из in-memory кэша (0 запросов), бейдж «из кэша · 0 токенов»", async () => {
  const mod = await loadPanel();
  const payload = {
    ok: true, status: "ok",
    explanation: "робот кладёт контейнер в СВЧ",
    usage: { prompt_tokens: 3, completion_tokens: 5 },
  };
  const env = setupDom({ fetchImpl: jsonResponse(payload) });
  try {
    const cacheRef = { current: new Map() };
    const doc = await renderPanel(env, mod, { cacheRef });
    await click(doc, env.dom.window, "processman-action-explain");
    await flush(60);
    assert.equal(env.calls.length, 1, "первый клик = 1 запрос");
    // второй клик — из кэша
    await click(doc, env.dom.window, "processman-action-explain");
    await flush(60);
    assert.equal(env.calls.length, 1, "повторный клик = 0 запросов (in-memory)");
    assert.equal(doc.querySelector('[data-testid="processman-cache-badge"]')?.textContent.trim(), "из кэша · 0 токенов");
  } finally {
    await env.cleanup();
  }
});

test("S6: ошибка LLM (no_provider) — человекочитаемый текст + [Повторить]", async () => {
  const mod = await loadPanel();
  let first = true;
  const env = setupDom({
    fetchImpl: async () => {
      if (first) {
        first = false;
        return jsonResponse({ ok: false, status: "no_provider", error: "no enabled LLM providers" })();
      }
      return jsonResponse({ ok: true, status: "ok", explanation: "ответ после retry", usage: {} })();
    },
  });
  try {
    const doc = await renderPanel(env, mod);
    await click(doc, env.dom.window, "processman-action-explain");
    await flush(60);
    const err = doc.querySelector('[data-testid="processman-answer-error"]');
    assert.notEqual(err, null, "состояние ошибки");
    assert.ok(/провайдер не настроен/i.test(err.textContent || ""), "человекочитаемо (маппинг no_provider)");
    // [Повторить]
    await click(doc, env.dom.window, "processman-answer-retry");
    await flush(60);
    const llmCalls = env.calls.filter((c) => c.url.includes("/llm/explain-step"));
    assert.equal(llmCalls.length, 2, "retry = новый LLM-запрос (telemetry не считается)");
    assert.ok(doc.querySelector('[data-testid="processman-answer-text"]')?.textContent.includes("ответ после retry"));
  } finally {
    await env.cleanup();
  }
});

// ------------------------------------------------------------------ 👍/👎
test("👍/👎 в футере: появляются с ответом, клик → POST /api/llm/feedback (без LLM-вызова)", async () => {
  const mod = await loadPanel();
  const env = setupDom({
    fetchImpl: async (url) => {
      if (String(url).includes("/api/llm/feedback")) {
        return jsonResponse({ ok: true, recorded: "feedback_up", tokens: 0 })();
      }
      return jsonResponse({
        ok: true, status: "ok",
        suggestions: { candidates: [{ code: "op_cook", rationale: "нагрев" }], note: "" },
        usage: {},
      })();
    },
  });
  try {
    const doc = await renderPanel(env, mod);
    assert.equal(doc.querySelector('[data-testid="processman-feedback-up"]'), null, "без ответа 👍👎 скрыты");
    await click(doc, env.dom.window, "processman-action-suggest");
    await flush(60);
    assert.notEqual(doc.querySelector('[data-testid="processman-answer-ok"]'), null, "ответ показан");
    assert.notEqual(doc.querySelector('[data-testid="processman-feedback-up"]'), null, "👍 появился с ответом");
    await click(doc, env.dom.window, "processman-feedback-up");
    await flush(60);
    const feedbackCalls = env.calls.filter((c) => c.url.includes("/api/llm/feedback"));
    assert.equal(feedbackCalls.length, 1, "ровно 1 POST feedback");
    assert.equal(String(feedbackCalls[0].opts?.method || "GET").toUpperCase(), "POST");
    assert.notEqual(doc.querySelector('[data-testid="processman-feedback-thanks"]'), null, "подтверждение записи");
  } finally {
    await env.cleanup();
  }
});

// ------------------------------------------------------------------ Esc
test("Esc внутри панели закрывает её (onClose)", async () => {
  const mod = await loadPanel();
  const env = setupDom();
  try {
    let closed = false;
    const doc = await renderPanel(env, mod, { onClose: () => { closed = true; } });
    const panel = doc.querySelector('[data-testid="processman-panel"]');
    await act(async () => {
      panel.dispatchEvent(new env.dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await flush();
    assert.equal(closed, true, "Esc вызвал onClose");
  } finally {
    await env.cleanup();
  }
});
