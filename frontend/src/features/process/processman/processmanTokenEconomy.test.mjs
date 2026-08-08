// LLM4 — token economy панели PROCESSMAN (документ владельца, ревизия 1):
// открытие панели, смена контекста (вкладка воркбенча/режим), выбор узла =
// 0 запросов к LLM; только клик действия или ↻ = 1 вызов; статус LLM —
// 1× GET /api/llm/status на сессию (не LLM-gateway, 0 токенов).
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
const tobeSrc = readFileSync(fileURLToPath(new URL("./ProcessmanTobe.jsx", import.meta.url)), "utf8");
const analysisSrc = readFileSync(fileURLToPath(new URL("./ProcessmanAnalysis.jsx", import.meta.url)), "utf8");
const neutralSrc = readFileSync(fileURLToPath(new URL("./ProcessmanNeutral.jsx", import.meta.url)), "utf8");
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

// ---- Source-часть: в панели нет авто-вызовов (маунт/смена контекста/смена шага) ----

test("source: компоненты панели без авто-LLM-вызовов и без fetch", () => {
  // ProcessmanAnalysis / ProcessmanNeutral / processmanView — вообще без useEffect/api/fetch
  for (const [name, src] of [["ProcessmanAnalysis", analysisSrc], ["ProcessmanNeutral", neutralSrc], ["processmanView", viewSrc]]) {
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    assert.ok(!/\buseEffect\b/.test(code), `${name}: нет useEffect`);
    assert.ok(!/\bapiLlm[A-Za-z]*\(/.test(code), `${name}: нет LLM-вызовов`);
    assert.ok(!/\bfetch\(/.test(code), `${name}: нет fetch`);
  }
  // ProcessmanTobe: LLM-вызовы допустимы ТОЛЬКО в ACTION_RUNNERS (клик), но не в useEffect
  const tobeCode = tobeSrc.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  const effects = tobeCode.match(/useEffect\(\(\)\s*=>[\s\S]*?\}, \[[^\]]*\]\)/g) || [];
  for (const effect of effects) {
    assert.ok(!/apiLlm|fetch\(/.test(effect), `useEffect без LLM-вызовов: ${effect.slice(0, 80)}…`);
  }
  // ProcessmanPanel: apiLlmFeedback только по клику (в sendFeedback), useEffect — без api/fetch
  const panelEffects = panelSrc.match(/useEffect\(\(\)\s*=>[\s\S]*?\}, \[[^\]]*\]\)/g) || [];
  for (const effect of panelEffects) {
    assert.ok(!/apiLlm|fetch\(/.test(effect), `useEffect панели без сетевых вызовов: ${effect.slice(0, 80)}…`);
  }
  assert.ok(panelSrc.includes("apiLlmFeedback"), "feedback-вызов есть (по клику 👍/👎)");
  assert.ok(!/apiLlm(SuggestNext|ExplainStep|StepQa|Analysis)\(/.test(panelSrc), "ProcessmanPanel не вызывает LLM-действия сам");
  // SchemaAssistantBlock перенесён целиком: действия только в обработчиках клика
  assert.ok(!/\buseEffect\b/.test(blockSrc), "SchemaAssistantBlock: нет useEffect");
});

test("source: ровно один apiLlmStatus() в ProcessStage, 1× на сессию через ref", () => {
  const calls = stageSrc.match(/apiLlmStatus\(/g) || [];
  assert.equal(calls.length, 1, "apiLlmStatus вызывается в одном месте ProcessStage");
  assert.ok(/processmanStatusLoadedRef/.test(stageSrc), "кэш-флаг на сессию");
  assert.ok(
    /if \(!sid \|\| processmanStatusLoadedRef\.current\) return;/.test(stageSrc),
    "статус грузится 1× на сессию (для disabled-кнопки S1 и квоты S7; не LLM-gateway)",
  );
  assert.ok(/processmanStatusLoadedRef\.current = true;/.test(stageSrc), "флаг выставляется до запроса");
});

test("source: панель рендерится независимо от вкладки (не закрывается при переключении) + кэш-ref", () => {
  assert.ok(/\(processmanOpen \|\| processmanClosing\)/.test(stageSrc), "рендер по open/closing, без привязки к tab");
  assert.ok(/processmanCacheRef/.test(stageSrc), "in-memory кэш v1 живёт в ProcessStage (переживает закрытие панели)");
  assert.ok(/onToggleProcessman/.test(stageSrc), "toggle-колбэк проброшен в тулбар");
});

// ---- Behavior-часть: рендер + смена контекста + выбор узла = 0 fetch ----

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

function panelProps(extra = {}) {
  return {
    sessionId: "sess_1",
    tab: "diagram",
    selectedBpmnElement: { id: "Act_1", name: "Шаг 1", type: "task" },
    llmStatus: { ok: true, status: 200, result: { configured: true, quota: { used: 0, limit: 200000 } } },
    cacheRef: { current: new Map() },
    onOpenFullAnalysis: () => {},
    onClose: () => {},
    ...extra,
  };
}

test("behavior: открытие панели + смена контекста (вкладка/режим) + выбор узла = 0 сетевых вызовов", async () => {
  const mod = await loadPanel();
  const env = setupDom();
  try {
    await act(async () => {
      env.root.render(React.createElement(mod.default, panelProps()));
    });
    await flush();
    assert.equal(env.calls.length, 0, "рендер панели не вызывает сеть");

    // смена контекста: diagram → interview → xml → обратно
    for (const props of [
      { tab: "interview" },
      { tab: "xml" },
      { tab: "diagram" },
    ]) {
      await act(async () => {
        env.root.render(React.createElement(mod.default, panelProps(props)));
      });
      await flush();
      assert.equal(env.calls.length, 0, `контекст ${props.tab} не вызывает сеть`);
    }

    // выбор другого узла = 0 вызовов
    await act(async () => {
      env.root.render(React.createElement(mod.default, panelProps({
        selectedBpmnElement: { id: "Act_2", name: "Шаг 2", type: "task" },
      })));
    });
    await flush();
    assert.equal(env.calls.length, 0, "выбор узла не вызывает сеть");
  } finally {
    await env.cleanup();
  }
});

test("behavior: только клик действия = ровно 1 вызов /suggest-next; клик по «Схема»-помощнику = 1 вызов", async () => {
  const mod = await loadPanel();
  const env = setupDom();
  try {
    // TO BE-контекст: клик suggest
    let doc;
    await act(async () => {
      env.root.render(React.createElement(mod.default, panelProps()));
    });
    await flush();
    doc = env.dom.window.document;
    const suggest = doc.querySelector('[data-testid="processman-action-suggest"]');
    assert.notEqual(suggest, null);
    await act(async () => {
      suggest.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    await flush();
    assert.equal(env.calls.length, 1, "клик suggest = ровно 1 вызов");
    assert.ok(env.calls[0].url.includes("/suggest-next"), `URL suggest-next: ${env.calls[0].url}`);
    assert.equal(env.calls[0].method, "POST");

    // diagram-контекст: клик по действию SchemaAssistantBlock (перенесён в панель)
    await act(async () => {
      env.root.render(React.createElement(mod.default, panelProps({ tab: "diagram" })));
    });
    await flush();
    const toggle = doc.querySelector('[data-testid="schema-assistant-toggle"]');
    assert.notEqual(toggle, null);
    await act(async () => {
      toggle.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    await flush();
    assert.equal(env.calls.length, 1, "открытие помощника — без новых вызовов");
    const suggestSa = doc.querySelector('[data-testid="schema-assistant-suggest"]');
    assert.notEqual(suggestSa, null);
    await act(async () => {
      suggestSa.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    await flush();
    assert.equal(env.calls.length, 2, "клик действия помощника = ровно 1 новый вызов");
    assert.ok(env.calls[1].url.includes("/suggest-next"), `URL suggest-next: ${env.calls[1].url}`);
  } finally {
    await env.cleanup();
  }
});
