// LLM4 — behavior-тест панели PROCESSMAN (вкладки, статика S7, статусы S6/S8).
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
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  // Панель сама не делает сетевых вызовов; SchemaAssistantBlock — только по клику.
  // Стаб на случай случайных fetch: никогда не должен сработать в этих тестах.
  globalThis.fetch = async () => {
    throw new Error("unexpected fetch in ProcessmanPanel.test");
  };
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
    globalThis.fetch = previous.fetch;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.reactActEnv;
  };

  return { dom, root, cleanup };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 24));
  });
}

async function renderPanel(env, mod, props = {}) {
  await act(async () => {
    env.root.render(React.createElement(mod.default, {
      sessionId: "sess_1",
      steps: [],
      selectedBpmnElement: null,
      llmStatus: null,
      onOpenFullAnalysis: () => {},
      onClose: () => {},
      ...props,
    }));
  });
  await flush();
  return env.dom.window.document;
}

async function clickTab(doc, win, id) {
  const tab = doc.querySelector(`[data-testid="processman-tab-${id}"]`);
  assert.notEqual(tab, null, `вкладка ${id} должна существовать`);
  await act(async () => {
    tab.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

test("панель рендерит заголовок, подзаголовок и 5 вкладок (Схема · TO BE · Анализ · AS IS · Отчёты)", async () => {
  const mod = await loadPanel();
  const env = setupDom();
  try {
    const doc = await renderPanel(env, mod);
    const panel = doc.querySelector('[data-testid="processman-panel"]');
    assert.notEqual(panel, null, "контейнер панели");
    assert.ok(/Процесс-менеджер/.test(panel.textContent || ""), "заголовок");
    const tabIds = ["schema", "tobe", "analysis", "asis", "reports"];
    for (const id of tabIds) {
      const tab = doc.querySelector(`[data-testid="processman-tab-${id}"]`);
      assert.notEqual(tab, null, `вкладка ${id}`);
      assert.equal(tab.getAttribute("role"), "tab");
    }
    assert.ok(/Схема/.test(doc.querySelector('[data-testid="processman-tab-schema"]').textContent || ""));
    assert.ok(/TO BE/.test(doc.querySelector('[data-testid="processman-tab-tobe"]').textContent || ""));
    assert.ok(/Анализ процессов/.test(doc.querySelector('[data-testid="processman-tab-analysis"]').textContent || ""));
    assert.ok(/AS IS/.test(doc.querySelector('[data-testid="processman-tab-asis"]').textContent || ""));
    assert.ok(/Отчёты/.test(doc.querySelector('[data-testid="processman-tab-reports"]').textContent || ""));
    // дефолтная вкладка — «Схема»
    assert.equal(doc.querySelector('[data-testid="processman-tab-schema"]').getAttribute("aria-selected"), "true");
    assert.notEqual(doc.querySelector('[data-testid="processman-schema-pane"]'), null, "schema pane по умолчанию");
    assert.notEqual(doc.querySelector('[data-testid="schema-assistant-block"]'), null, "SchemaAssistantBlock в панели");
  } finally {
    await env.cleanup();
  }
});

test("close-кнопка вызывает onClose", async () => {
  const mod = await loadPanel();
  const env = setupDom();
  let closed = 0;
  try {
    const doc = await renderPanel(env, mod, { onClose: () => { closed += 1; } });
    const closeBtn = doc.querySelector('[data-testid="processman-close"]');
    assert.notEqual(closeBtn, null);
    await act(async () => {
      closeBtn.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(closed, 1);
  } finally {
    await env.cleanup();
  }
});

test("вкладка TO BE: пустое состояние без выбранного узла (S2), контекст с узлом (S3)", async () => {
  const mod = await loadPanel();
  const env = setupDom();
  try {
    // пустое состояние
    let doc = await renderPanel(env, mod);
    await clickTab(doc, env.dom.window, "tobe");
    assert.notEqual(doc.querySelector('[data-testid="processman-tobe-empty"]'), null, "пустое состояние TO BE");
    assert.ok(/Выберите узел на канве/.test(doc.querySelector('[data-testid="processman-tobe-empty"]').textContent || ""));
    await env.cleanup();

    // узел с шагом в маршруте
    const env2 = setupDom();
    try {
      doc = await renderPanel(env2, mod, {
        selectedBpmnElement: { id: "Task_1", name: "Проверить документы", type: "bpmn:Task", laneName: "Кредитный отдел" },
        steps: [{ id: "st1", node_id: "Task_1", work_duration_sec: 120, wait_duration_sec: 30 }],
      });
      await clickTab(doc, env2.dom.window, "tobe");
      const ctx = doc.querySelector('[data-testid="processman-tobe-context"]');
      assert.notEqual(ctx, null, "контекст TO BE");
      assert.ok(/Проверить документы/.test(ctx.textContent || ""), "имя узла");
      assert.ok(/Кредитный отдел/.test(ctx.textContent || ""), "лейн");
      assert.equal(doc.querySelector('[data-testid="processman-tobe-route-badge"]').textContent.trim(), "Входит в маршрут");
      assert.equal(doc.querySelector('[data-testid="processman-tobe-work"]').textContent.trim(), "Работа: 120 сек");
      assert.equal(doc.querySelector('[data-testid="processman-tobe-wait"]').textContent.trim(), "Ожидание: 30 сек");
    } finally {
      await env2.cleanup();
    }
  } finally {
    // no-op guard: первый env уже очищен выше
  }
});

test("TO BE: узел вне маршрута — бейдж «Вне маршрута» + предупреждение (S4)", async () => {
  const mod = await loadPanel();
  const env = setupDom();
  try {
    const doc = await renderPanel(env, mod, {
      selectedBpmnElement: { id: "Task_9", name: "Чужой узел", type: "bpmn:Task" },
      steps: [{ id: "st1", node_id: "Task_1" }],
    });
    await clickTab(doc, env.dom.window, "tobe");
    assert.equal(doc.querySelector('[data-testid="processman-tobe-route-badge"]').textContent.trim(), "Вне маршрута");
    assert.notEqual(doc.querySelector('[data-testid="processman-tobe-no-step"]'), null, "предупреждение о вне маршрута");
    assert.ok(/Шаг не найден в маршруте/.test(doc.querySelector('[data-testid="processman-tobe-no-step"]').textContent || ""));
  } finally {
    await env.cleanup();
  }
});

test("вкладка «Анализ процессов»: configured — квота, exhausted — предупреждение (S6)", async () => {
  const mod = await loadPanel();
  const env = setupDom();
  try {
    const doc = await renderPanel(env, mod, {
      llmStatus: { ok: true, status: 200, result: { configured: true, quota: { used: 123456, limit: 200000 } } },
    });
    await clickTab(doc, env.dom.window, "analysis");
    const cfg = doc.querySelector('[data-testid="processman-analysis-configured"]');
    assert.notEqual(cfg, null, "configured блок");
    assert.ok(/LLM настроен/.test(cfg.textContent || ""));
    assert.ok(/Использовано 123456 из 200000 токенов за 24 часа/.test(doc.querySelector('[data-testid="processman-analysis-quota"]').textContent || ""));
    assert.equal(doc.querySelector('[data-testid="processman-analysis-exhausted"]'), null, "не exhausted при used < limit");
    assert.notEqual(doc.querySelector('[data-testid="processman-analysis-open-full"]'), null, "CTA «Открыть полный анализ»");
    await env.cleanup();

    const env2 = setupDom();
    try {
      const doc2 = await renderPanel(env2, mod, {
        llmStatus: { ok: true, status: 200, result: { configured: true, quota: { used: 200000, limit: 200000 } } },
      });
      await clickTab(doc2, env2.dom.window, "analysis");
      const ex = doc2.querySelector('[data-testid="processman-analysis-exhausted"]');
      assert.notEqual(ex, null, "exhausted при used == limit");
      assert.ok(/лимит токенов исчерпан/.test(ex.textContent || ""));
    } finally {
      await env2.cleanup();
    }
  } finally {
    // no-op guard
  }
});

test("вкладка «Анализ процессов»: idle (ещё грузится) и not_configured (S8-честность)", async () => {
  const mod = await loadPanel();
  const env = setupDom();
  try {
    const doc = await renderPanel(env, mod, { llmStatus: null });
    await clickTab(doc, env.dom.window, "analysis");
    assert.notEqual(doc.querySelector('[data-testid="processman-analysis-idle"]'), null, "idle-состояние");
    await env.cleanup();

    const env2 = setupDom();
    try {
      const doc2 = await renderPanel(env2, mod, {
        llmStatus: { ok: true, status: 200, result: { configured: false, quota: { used: 0, limit: 0 } } },
      });
      await clickTab(doc2, env2.dom.window, "analysis");
      const nc = doc2.querySelector('[data-testid="processman-analysis-not-configured"]');
      assert.notEqual(nc, null, "not configured блок");
      assert.ok(/LLM-провайдер не настроен/.test(nc.textContent || ""));
      assert.notEqual(doc2.querySelector('[data-testid="processman-analysis-go-to"]'), null, "CTA «Перейти к анализу»");
    } finally {
      await env2.cleanup();
    }
  } finally {
    // no-op guard
  }
});

test("«Открыть полный анализ» вызывает onOpenFullAnalysis", async () => {
  const mod = await loadPanel();
  const env = setupDom();
  let opened = 0;
  try {
    const doc = await renderPanel(env, mod, {
      llmStatus: { ok: true, status: 200, result: { configured: true, quota: { used: 1, limit: 200000 } } },
      onOpenFullAnalysis: () => { opened += 1; },
    });
    await clickTab(doc, env.dom.window, "analysis");
    const cta = doc.querySelector('[data-testid="processman-analysis-open-full"]');
    assert.notEqual(cta, null);
    await act(async () => {
      cta.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(opened, 1);
  } finally {
    await env.cleanup();
  }
});

test("вкладки AS IS и Отчёты — статичный S7-текст без LLM-контента", async () => {
  const mod = await loadPanel();
  const env = setupDom();
  try {
    const doc = await renderPanel(env, mod);
    await clickTab(doc, env.dom.window, "asis");
    const asis = doc.querySelector('[data-testid="processman-asis"]');
    assert.notEqual(asis, null);
    assert.ok(/AS IS/.test(asis.textContent || ""));
    assert.ok(/Текущая схема/.test(asis.textContent || ""));

    await clickTab(doc, env.dom.window, "reports");
    const reports = doc.querySelector('[data-testid="processman-reports"]');
    assert.notEqual(reports, null);
    assert.ok(/Отчёты по сценарию/.test(reports.textContent || ""));
    assert.ok(/план выполнения, маршруты и покрытие/.test(reports.textContent || ""), "S7-хинт доступных отчётов");
    // на статичных вкладках нет SchemaAssistantBlock и LLM-CTA
    assert.equal(doc.querySelector('[data-testid="schema-assistant-block"]'), null, "помощник только на «Схеме»");
    assert.equal(doc.querySelector('[data-testid="processman-analysis-open-full"]'), null, "CTA анализа только на «Анализе»");
  } finally {
    await env.cleanup();
  }
});
