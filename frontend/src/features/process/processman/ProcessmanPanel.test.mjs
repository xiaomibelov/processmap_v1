// PROCESSMAN-REDESIGN (PR-1) — behavior-тесты панели: каркас (шапка со
// статусом/«?»/свернуть/закрыть), чат-лента в TO BE-контексте, контекст-чип,
// quick actions (сворачивание под «⋯»), empty state, onboarding one-shot,
// collapse-to-icon, S1/S2/S4/S5/S6/S7/S8, кэш (S3), 👍/👎, Стоп, Esc.
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

// Ждём появления testid (typewriter + passive effects — не мгновенны).
async function waitFor(doc, testid, { tries = 12, stepMs = 150 } = {}) {
  for (let i = 0; i < tries; i += 1) {
    if (doc.querySelector(`[data-testid="${testid}"]`)) return true;
    await flush(stepMs);
  }
  return !!doc.querySelector(`[data-testid="${testid}"]`);
}

async function renderPanel(env, mod, props = {}) {
  const cacheRef = props.cacheRef || { current: new Map() };
  await act(async () => {
    env.root.render(React.createElement(mod.default, {
      sessionId: "sess_1",
      tab: "diagram",
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

// Сброс in-memory историй чата между тестами (модульный стор).
async function resetChat() {
  const store = await viteServer.ssrLoadModule("/src/features/process/processman/chat/processmanChatStore.js");
  store.resetChatHistories();
}

// ------------------------------------------------------------------ каркас
test("каркас: role=complementary, компактная шапка (✦ + PROCESSMAN + статус + новая беседа/?/свернуть/крестик), футер только с дисклеймером", async () => {
  const mod = await loadPanel();
  const env = setupDom();
  try {
    const doc = await renderPanel(env, mod);
    const panel = doc.querySelector('[data-testid="processman-panel"]');
    assert.notEqual(panel, null);
    assert.equal(panel.getAttribute("role"), "complementary");
    assert.ok(doc.querySelector(".pm-processman__header"), "шапка");
    assert.ok(doc.querySelector(".pm-processman__title")?.textContent.includes("PROCESSMAN"), "капс");
    assert.ok(doc.querySelector(".pm-processman__icon svg"), "SVG-иконка ✦ в шапке");
    assert.equal(doc.querySelector(".pm-processman__mission"), null, "нет обрезанного подзаголовка в шапке");
    assert.equal(doc.querySelector('[data-testid="processman-status"]')?.textContent.trim(), "Готов помочь", "текстовый статус");
    assert.notEqual(doc.querySelector('[data-testid="processman-new-conversation"]'), null, "кнопка новой беседы");
    assert.notEqual(doc.querySelector('[data-testid="processman-collapse"]'), null, "кнопка «свернуть»");
    assert.notEqual(doc.querySelector('[data-testid="processman-close"]'), null, "крестик");
    const footer = doc.querySelector('[data-testid="processman-footer"]');
    assert.ok(footer?.textContent.includes("Ответ генерирует ИИ"), "дисклеймер в футере");
    assert.equal(doc.querySelector('[data-testid="processman-cache-badge"]'), null, "нет cache/new-request чипа в футере");
    assert.equal(doc.querySelector('[data-testid="processman-feedback"]'), null, "нет feedback-компонента в футере");
    assert.equal(env.calls.length, 0, "открытие панели = 0 сетевых вызовов");
  } finally {
    await env.cleanup();
  }
});

// ------------------------------------------------- контент за вкладкой воркбенча
test("контент следует за вкладкой: interview → analysis, diagram → чат (quick actions + composer + чип), xml → neutral; SchemaAssistantBlock удалён", async () => {
  const mod = await loadPanel();
  const env = setupDom();
  try {
    // analysis
    let doc = await renderPanel(env, mod, { tab: "interview" });
    assert.notEqual(doc.querySelector('[data-testid="processman-analysis"]'), null, "analysis-контент");
    assert.notEqual(doc.querySelector('[data-testid="processman-analysis-open-full"]'), null, "CTA «Открыть полный анализ»");
    // diagram → чат-контент
    doc = await renderPanel(env, mod, { tab: "diagram" });
    assert.notEqual(doc.querySelector('[data-testid="processman-action-suggest"]'), null, "карточка suggest-next");
    assert.notEqual(doc.querySelector('[data-testid="processman-action-explain"]'), null, "карточка explain-step");
    assert.notEqual(doc.querySelector('[data-testid="processman-composer"]'), null, "composer");
    assert.notEqual(doc.querySelector('[data-testid="processman-context-chip"]'), null, "контекст-чип");
    assert.equal(doc.querySelector('[data-testid="processman-schema-pane"]'), null, "schema-pane удалён из панели");
    assert.equal(doc.querySelector('[data-testid="schema-assistant-block"]'), null, "SchemaAssistantBlock не рендерится");
    // neutral
    doc = await renderPanel(env, mod, { tab: "xml" });
    assert.notEqual(doc.querySelector('[data-testid="processman-neutral"]'), null, "нейтральное состояние");
    assert.equal(env.calls.length, 0, "смена контекста = 0 сетевых вызовов");
  } finally {
    await env.cleanup();
  }
});

// ------------------------------------------------------------------ S1
test("S1: нет ключа (configured=false) — действия disabled + честное состояние", async () => {
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
test("S2: пустой диалог — empty state с примерами, действия disabled без шага, 0 запросов", async () => {
  const mod = await loadPanel();
  const env = setupDom();
  try {
    const doc = await renderPanel(env, mod, { selectedBpmnElement: null });
    assert.notEqual(doc.querySelector('[data-testid="processman-tobe-empty"]'), null, "пустое состояние");
    assert.equal(doc.querySelector('[data-testid="processman-action-suggest"]')?.disabled, true, "без выбранного шага suggest disabled");
    assert.notEqual(doc.querySelector('[data-testid="processman-example-q1"]'), null, "кликабельные примеры вопросов");
    assert.equal(env.calls.length, 0);
    // клик по примеру → текст в composer (без сети)
    await click(doc, env.dom.window, "processman-example-q1");
    const input = doc.querySelector('[data-testid="processman-qa-input"]');
    assert.ok(String(input?.value || "").length > 3, "пример подставлен в composer");
    assert.equal(env.calls.length, 0, "подстановка примера = 0 запросов");
  } finally {
    await env.cleanup();
  }
});

// ------------------------------------------------------------------ S4/S5/S8
test("S4/S5/S8: клик → loading (анти-даблклик) → ответ в ленте с fallback-бейджем; quick actions сворачиваются под «⋯»", async () => {
  const mod = await loadPanel();
  await resetChat();
  const suggestPayload = {
    ok: true, status: "ok",
    suggestions: { candidates: [{ code: "op_cook", rationale: "нагрев" }], note: "" },
    fallback: true,
    usage: { prompt_tokens: 11, completion_tokens: 7 },
  };
  const env = setupDom({ fetchImpl: jsonResponse(suggestPayload, { delayMs: 800 }) });
  try {
    const doc = await renderPanel(env, mod);
    await click(doc, env.dom.window, "processman-action-suggest");
    assert.equal(env.calls.length, 1, "1 запрос suggest-next");
    // quick actions свернулись под «⋯» после первого сообщения
    assert.notEqual(doc.querySelector('[data-testid="processman-actions-more"]'), null, "кнопка «⋯» появилась");
    assert.equal(doc.querySelector('[data-testid="processman-action-suggest"]'), null, "карточки скрыты под «⋯»");
    await click(doc, env.dom.window, "processman-actions-more");
    const suggestAgain = doc.querySelector('[data-testid="processman-action-suggest"]');
    assert.notEqual(suggestAgain, null, "карточки разворачиваются по «⋯»");
    assert.equal(suggestAgain?.disabled, true, "кнопка disabled при loading (анти-даблклик)");
    await act(async () => {
      suggestAgain.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await flush();
    assert.equal(env.calls.length, 1, "даблклик не добавляет запрос");
    // S4: индикатор загрузки (честные этапы, без фейковых стадий)
    await flush(300);
    assert.notEqual(doc.querySelector('[data-testid="processman-answer-loading"]'), null, "loading-состояние");
    assert.notEqual(doc.querySelector('[data-testid="processman-stages"]'), null, "индикатор этапов");
    // S5: ответ (ждём конца typewriter поллингом — passive effects не мгновенны)
    assert.equal(await waitFor(doc, "processman-answer-ok"), true, "ответ показан");
    assert.equal(doc.querySelector('[data-testid="processman-answer-text"]')?.textContent.includes("op_cook"), false, "код кандидата не дублируется plain-text bullet");
    assert.notEqual(doc.querySelector('[data-testid="processman-candidate-card"]'), null, "кандидаты отрисованы карточками");
    assert.equal(doc.querySelector('[data-testid="processman-answer-time"]'), null, "время ответа не шумит в теле");
    assert.equal(doc.querySelector('[data-testid="processman-answer-refresh"]'), null, "новый запрос не живёт под ответом");
    // S8: fallback-бейдж
    assert.notEqual(doc.querySelector('[data-testid="processman-answer-fallback"]'), null, "бейдж fallback-провайдера");
    // user-сообщение в ленте
    const userMsg = doc.querySelector('[data-testid="processman-msg-user"]');
    assert.notEqual(userMsg, null, "реплика пользователя в ленте");
    assert.equal(userMsg?.textContent.includes("Вы"), false, "лейбл «Вы» не повторяется");
    assert.match(userMsg?.getAttribute("title") || "", /^\d{2}:\d{2}$/, "время пользователя только в title");
    // футер больше не содержит состояние запроса
    assert.equal(doc.querySelector('[data-testid="processman-cache-badge"]'), null);
  } finally {
    await env.cleanup();
  }
});

// ------------------------------------------------------------------ S3/S6
test("S3: повторный клик по тому же шагу — из in-memory кэша (0 запросов), бейдж «из кэша · 0 токенов»", async () => {
  const mod = await loadPanel();
  await resetChat();
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
    assert.equal(await waitFor(doc, "processman-answer-ok"), true, "первый ответ доиграл");
    assert.equal(env.calls.length, 1, "первый клик = 1 запрос");
    // второй клик (через «⋯») — из кэша
    await click(doc, env.dom.window, "processman-actions-more");
    await click(doc, env.dom.window, "processman-action-explain");
    await flush(120);
    assert.equal(env.calls.length, 1, "повторный клик = 0 запросов (in-memory)");
    assert.equal(doc.querySelector('[data-testid="processman-cache-badge"]'), null, "cache badge не захламляет footer");
  } finally {
    await env.cleanup();
  }
});

test("S6: ошибка LLM (no_provider) — человекочитаемый текст + [Повторить]", async () => {
  const mod = await loadPanel();
  await resetChat();
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
    await flush(120);
    const llmCalls = env.calls.filter((c) => c.url.includes("/llm/explain-step"));
    assert.equal(llmCalls.length, 2, "retry = новый LLM-запрос (telemetry не считается)");
    assert.ok(doc.querySelector('[data-testid="processman-answer-text"]')?.textContent.includes("ответ после retry"));
  } finally {
    await env.cleanup();
  }
});

// ------------------------------------------------------------------ «Стоп»
test("«Стоп» во время генерации: запрос обрывается, поздний ответ игнорируется", async () => {
  const mod = await loadPanel();
  await resetChat();
  const env = setupDom({
    fetchImpl: jsonResponse({ ok: true, status: "ok", suggestions: { candidates: [{ code: "op_late", rationale: "поздний" }], note: "" }, usage: {} }, { delayMs: 400 }),
  });
  try {
    const doc = await renderPanel(env, mod);
    await click(doc, env.dom.window, "processman-action-suggest");
    await flush(60);
    assert.notEqual(doc.querySelector('[data-testid="processman-stop"]'), null, "кнопка «Стоп» во время pending");
    await click(doc, env.dom.window, "processman-stop");
    await flush(500); // ответ «прилетел» после стопа
    assert.equal(doc.querySelector('[data-testid="processman-answer-ok"]'), null, "поздний ответ не показан");
    assert.equal(doc.querySelector('[data-testid="processman-answer-text"]'), null, "текст ответа не опубликован");
  } finally {
    await env.cleanup();
  }
});

// ------------------------------------------------------------------ чипы узлов
test("имена узлов в ответе — кликабельные чипы 📍 → onFocusElement(id)", async () => {
  const mod = await loadPanel();
  await resetChat();
  const env = setupDom({
    fetchImpl: jsonResponse({ ok: true, status: "ok", explanation: "Смотри шаг Проверка документов — там узкое место.", usage: {} }),
  });
  try {
    let focusedId = "";
    const doc = await renderPanel(env, mod, {
      diagramNodes: [{ id: "Act_9", name: "Проверка документов", type: "task" }],
      onFocusElement: (id) => { focusedId = id; },
    });
    await click(doc, env.dom.window, "processman-action-explain");
    assert.equal(await waitFor(doc, "processman-node-chip-Act_9"), true, "чип узла в ответе");
    const chip = doc.querySelector('[data-testid="processman-node-chip-Act_9"]');
    await act(async () => {
      chip.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await flush();
    assert.equal(focusedId, "Act_9", "клик по чипу → focus узла");
  } finally {
    await env.cleanup();
  }
});

// ------------------------------------------------------------------ 👍/👎
test("feedback в сообщении агента: появляется под ответом, клик → POST /api/llm/feedback (без LLM-вызова)", async () => {
  const mod = await loadPanel();
  await resetChat();
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
    assert.equal(doc.querySelector('[data-testid="processman-feedback-up"]'), null, "без ответа feedback скрыт");
    await click(doc, env.dom.window, "processman-action-suggest");
    await flush(120);
    assert.notEqual(doc.querySelector('[data-testid="processman-answer-ok"]'), null, "ответ показан");
    const footer = doc.querySelector('[data-testid="processman-footer"]');
    assert.equal(footer?.querySelector('[data-testid="processman-feedback-up"]'), null, "feedback не в футере");
    assert.notEqual(doc.querySelector('[data-testid="processman-msg-actions"] [data-testid="processman-feedback-up"]'), null, "feedback появился под сообщением");
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

// ------------------------------------------------------------------ контекст-чип
test("контекст-чип: имя выбранного шага + «×» сброс → onClearSelection", async () => {
  const mod = await loadPanel();
  const env = setupDom();
  try {
    let cleared = false;
    const doc = await renderPanel(env, mod, { onClearSelection: () => { cleared = true; } });
    const chip = doc.querySelector('[data-testid="processman-context-chip"]');
    assert.ok(chip?.textContent.includes("Шаг 1"), "имя шага в чипе");
    await click(doc, env.dom.window, "processman-context-chip-reset");
    assert.equal(cleared, true, "сброс вызвал onClearSelection");
    // без выделения — «вся схема»
    const doc2 = await renderPanel(env, mod, { selectedBpmnElement: null });
    assert.ok(doc2.querySelector('[data-testid="processman-context-chip"]')?.textContent.includes("вся схема"));
    assert.equal(env.calls.length, 0, "чип = 0 запросов");
  } finally {
    await env.cleanup();
  }
});

// ------------------------------------------------------------------ onboarding
test("onboarding: карточка 1 раз (localStorage), затем «?» в шапке открывает её снова", async () => {
  const mod = await loadPanel();
  const env = setupDom();
  try {
    // первый показ
    let doc = await renderPanel(env, mod);
    assert.notEqual(doc.querySelector('[data-testid="processman-onboarding"]'), null, "карточка при первом открытии");
    assert.equal(doc.querySelector('[data-testid="processman-help"]'), null, "«?» скрыт, пока карточка видна");
    await click(doc, env.dom.window, "processman-onboarding-hide");
    assert.equal(doc.querySelector('[data-testid="processman-onboarding"]'), null, "скрыта после «Понятно»");
    assert.equal(env.dom.window.localStorage.getItem("fpc.processman.onboarded.v1"), "1", "флаг записан");
    // повторный рендер — карточки нет, есть «?»
    doc = await renderPanel(env, mod);
    assert.equal(doc.querySelector('[data-testid="processman-onboarding"]'), null, "one-shot: больше не показывается");
    assert.notEqual(doc.querySelector('[data-testid="processman-help"]'), null, "«?» в шапке");
    await click(doc, env.dom.window, "processman-help");
    assert.notEqual(doc.querySelector('[data-testid="processman-onboarding"]'), null, "«?» открывает карточку снова");
    assert.equal(env.calls.length, 0, "onboarding = 0 запросов");
  } finally {
    await env.cleanup();
  }
});

// ------------------------------------------------------------------ collapse-to-icon
test("collapse-to-icon: панель сворачивается в rail 48px и разворачивается обратно", async () => {
  const mod = await loadPanel();
  const env = setupDom();
  try {
    const doc = await renderPanel(env, mod);
    await click(doc, env.dom.window, "processman-collapse");
    const panel = doc.querySelector('[data-testid="processman-panel"]');
    assert.ok(panel?.className.includes("pm-processman--collapsed"), "класс collapsed");
    assert.equal(doc.querySelector('[data-testid="processman-body"]'), null, "тело скрыто");
    assert.equal(doc.querySelector('[data-testid="processman-footer"]'), null, "футер скрыт");
    assert.notEqual(doc.querySelector('[data-testid="processman-expand"]'), null, "кнопка разворота");
    await click(doc, env.dom.window, "processman-expand");
    assert.notEqual(doc.querySelector('[data-testid="processman-body"]'), null, "тело вернулось");
    assert.equal(env.calls.length, 0, "collapse = 0 запросов");
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
