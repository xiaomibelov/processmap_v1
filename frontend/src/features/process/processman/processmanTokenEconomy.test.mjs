// LLM4 — token economy панели PROCESSMAN (решение владельца):
// открытие панели, переключение вкладок и выбор узла = 0 LLM-вызовов;
// только клик действия = 1 вызов; статус LLM — 1× GET /api/llm/status + кэш на сессию.
// Запуск: node --test src/features/process/processman/processmanTokenEconomy.test.mjs
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, "../../../..");

const panelSrc = readFileSync(fileURLToPath(new URL("./ProcessmanPanel.jsx", import.meta.url)), "utf8");
const tobeSrc = readFileSync(fileURLToPath(new URL("./TobeStepContext.jsx", import.meta.url)), "utf8");
const analysisSrc = readFileSync(fileURLToPath(new URL("./LlmAnalysisSummary.jsx", import.meta.url)), "utf8");
const viewSrc = readFileSync(fileURLToPath(new URL("./processmanView.js", import.meta.url)), "utf8");
const stageSrc = readFileSync(fileURLToPath(new URL("../../../components/ProcessStage.jsx", import.meta.url)), "utf8");
const blockSrc = readFileSync(fileURLToPath(new URL("../../../components/process/SchemaAssistantBlock.jsx", import.meta.url)), "utf8");

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

// ---- Source-часть: в панели и её view-слое нет авто-вызовов ----

test("source: панель и дочерние вкладки не содержат useEffect/авто-LLM-вызовов", () => {
  for (const [name, src] of [["ProcessmanPanel", panelSrc], ["TobeStepContext", tobeSrc], ["LlmAnalysisSummary", analysisSrc], ["processmanView", viewSrc]]) {
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    assert.ok(!/\buseEffect\b/.test(code), `${name}: нет useEffect (нет авто-вызовов)`);
    assert.ok(!/\bapiLlm[A-Za-z]*\(/.test(code), `${name}: нет прямых LLM-вызовов`);
    assert.ok(!/\bfetch\(/.test(code), `${name}: нет fetch`);
  }
  // SchemaAssistantBlock перенесён целиком: действия только в обработчиках клика (source-тест LLM3 уже покрывает)
  assert.ok(!/\buseEffect\b/.test(blockSrc), "SchemaAssistantBlock: нет useEffect");
});

test("source: ровно один apiLlmStatus() в ProcessStage, кэш на сессию через ref", () => {
  const calls = stageSrc.match(/apiLlmStatus\(/g) || [];
  assert.equal(calls.length, 1, "apiLlmStatus вызывается в одном месте ProcessStage");
  assert.ok(/processmanStatusLoadedRef/.test(stageSrc), "кэш-флаг на сессию");
  assert.ok(
    /if \(!processmanOpen \|\| processmanStatusLoadedRef\.current\) return;/.test(stageSrc),
    "статус грузится только при первом открытии панели",
  );
  assert.ok(/processmanStatusLoadedRef\.current = true;/.test(stageSrc), "флаг выставляется до запроса");
});

test("source: ProcessStage рендерит панель только в diagram (не interview) и без LLM-вызовов при открытии", () => {
  assert.ok(/processmanOpen && tab === "diagram" && !isInterview/.test(stageSrc), "панель только на «Схеме» воркбенча");
  assert.ok(/onToggleProcessman/.test(stageSrc), "toggle-колбэк проброшен в тулбар");
});

// ---- Behavior-часть: рендер + переключение вкладок = 0 fetch ----

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
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: String(opts?.method || "GET") });
    return new Response(JSON.stringify({ ok: true, status: "ok", suggestions: { candidates: [], note: "" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

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

  return { dom, root, cleanup, calls };
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
  assert.notEqual(tab, null, `вкладка ${id}`);
  await act(async () => {
    tab.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

test("behavior: открытие панели + все вкладки + выбор узла = 0 сетевых вызовов", async () => {
  const mod = await loadPanel();
  const env = setupDom();
  try {
    const doc = await renderPanel(env, mod);
    assert.equal(env.calls.length, 0, "рендер панели не вызывает сеть");

    for (const id of ["tobe", "analysis", "asis", "reports", "schema"]) {
      await clickTab(doc, env.dom.window, id);
      assert.equal(env.calls.length, 0, `переключение на ${id} не вызывает сеть`);
    }

    // выбор узла = смена пропсов (перемонтирование контекста) — тоже без вызовов
    await act(async () => {
      env.root.render(React.createElement(mod.default, {
        sessionId: "sess_1",
        steps: [{ id: "st1", node_id: "Task_1" }],
        selectedBpmnElement: { id: "Task_1", name: "Шаг A", type: "bpmn:Task" },
        llmStatus: null,
      }));
    });
    await flush();
    assert.equal(env.calls.length, 0, "выбор узла не вызывает сеть");
  } finally {
    await env.cleanup();
  }
});

test("behavior: только клик действия «Предложить следующий блок» = ровно 1 вызов /suggest-next", async () => {
  const mod = await loadPanel();
  const env = setupDom();
  try {
    const doc = await renderPanel(env, mod);
    // открыть SchemaAssistantBlock (чистый toggle — 0 вызовов)
    const toggle = doc.querySelector('[data-testid="schema-assistant-toggle"]');
    assert.notEqual(toggle, null);
    await act(async () => {
      toggle.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    await flush();
    assert.equal(env.calls.length, 0, "открытие помощника не вызывает сеть");

    // клик действия — ровно 1 вызов
    const suggest = doc.querySelector('[data-testid="schema-assistant-suggest"]');
    assert.notEqual(suggest, null);
    await act(async () => {
      suggest.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    await flush();
    assert.equal(env.calls.length, 1, "клик действия = ровно 1 вызов");
    assert.ok(env.calls[0].url.includes("/suggest-next"), `URL указывает на suggest-next: ${env.calls[0].url}`);
    assert.equal(env.calls[0].method, "POST");
  } finally {
    await env.cleanup();
  }
});
