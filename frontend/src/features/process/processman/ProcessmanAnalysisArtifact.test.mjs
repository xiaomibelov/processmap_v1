// M9 (agent-ui-completion-v1) — компонентная проверка карточки артефакта
// фонового анализа: статусы none / ready / failed, <details>-развёртка, refresh.
// Запуск: node --test src/features/process/processman/ProcessmanAnalysisArtifact.test.mjs
import test, { after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(__dirname, "../../../..");

let viteServer = null;
async function loadComponent() {
  if (!viteServer) {
    viteServer = await createServer({
      root: FRONTEND_ROOT,
      logLevel: "error",
      server: { middlewareMode: true },
      appType: "custom",
    });
  }
  return viteServer.ssrLoadModule("/src/features/process/processman/ProcessmanAnalysisArtifact.jsx");
}

after(async () => {
  if (viteServer) await viteServer.close();
});

function setupDom(handler) {
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
    return handler(url, opts);
  };
  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  const cleanup = async () => {
    await act(async () => {
      root.unmount();
    });
    dom.window.close();
    for (const [key, value] of Object.entries(previous)) {
      const gKey = key === "reactActEnv" ? "IS_REACT_ACT_ENVIRONMENT" : key;
      globalThis[gKey] = value;
    }
  };
  return { dom, root, cleanup, calls };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 24));
  });
}

async function waitFor(doc, testid, { tries = 12, stepMs = 150 } = {}) {
  for (let i = 0; i < tries; i += 1) {
    if (doc.querySelector(`[data-testid="${testid}"]`)) return true;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, stepMs)); });
  }
  return !!doc.querySelector(`[data-testid="${testid}"]`);
}

const ARTIFACT_URL_RE = /\/agent-analysis\/artifact/;

const READY_ARTIFACT = {
  schema_version: "agent_analysis_v1.1",
  run_id: "ana_123",
  status: "done",
  generated_at: "2026-09-14T10:00:00",
  schema_hash: "abc",
  model: "deepseek-chat",
  analysis: { summary: "Схема содержит 2 узких места." },
};

test("artifact card: ready — сводка + <details> + refresh", async () => {
  const mod = await loadComponent();
  const env = await setupDom(async () =>
    new Response(
      JSON.stringify({ artifact: READY_ARTIFACT, schema_version: "agent_analysis_v1.1", version: 7, updated_at: "2026-09-14T10:00:00" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
  try {
    await act(async () => {
      env.root.render(React.createElement(mod.default, { sessionId: "sess_1" }));
    });
    const doc = env.dom.window.document;
    assert.equal(await waitFor(doc, "processman-analysis-artifact-ready"), true, "ready-статус виден");
    const summary = doc.querySelector('[data-testid="processman-analysis-artifact-summary"]').textContent;
    assert.ok(summary.includes("deepseek-chat"), "модель в сводке");
    assert.ok(summary.includes("v7"), "версия сессии в сводке");
    assert.ok(doc.querySelector('[data-testid="processman-analysis-artifact-details"]'), "<details> есть");
    assert.equal(env.calls.length, 1, "ровно 1 GET при монтировании");
    assert.ok(ARTIFACT_URL_RE.test(env.calls[0].url), `URL artifact: ${env.calls[0].url}`);
    // refresh = второй GET
    const refresh = doc.querySelector('[data-testid="processman-analysis-artifact-refresh"]');
    await act(async () => {
      refresh.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    await flush();
    assert.equal(env.calls.length, 2, "refresh = ещё один GET");
  } finally {
    await env.cleanup();
  }
});

test("artifact card: 404 / artifact=null — статус «нет анализа», без ошибки", async () => {
  const mod = await loadComponent();
  const env = await setupDom(async () =>
    new Response(JSON.stringify({ detail: "not_found" }), { status: 404, headers: { "Content-Type": "application/json" } }));
  try {
    await act(async () => {
      env.root.render(React.createElement(mod.default, { sessionId: "sess_2" }));
    });
    const doc = env.dom.window.document;
    assert.equal(await waitFor(doc, "processman-analysis-artifact-none"), true, "статус «нет анализа»");
    assert.equal(doc.querySelector('[data-testid="processman-analysis-artifact-failed"]'), null, "404 ≠ failed");
  } finally {
    await env.cleanup();
  }
});

test("artifact card: failed — ошибка сети (500) и artifact.status=failed", async () => {
  const mod = await loadComponent();
  const env500 = await setupDom(async () =>
    new Response(JSON.stringify({ detail: "server error" }), { status: 500, headers: { "Content-Type": "application/json" } }));
  try {
    await act(async () => {
      env500.root.render(React.createElement(mod.default, { sessionId: "sess_3" }));
    });
    const doc = env500.dom.window.document;
    assert.equal(await waitFor(doc, "processman-analysis-artifact-failed"), true, "сетевой сбой = failed");
  } finally {
    await env500.cleanup();
  }

  const env = await setupDom(async () =>
    new Response(
      JSON.stringify({ artifact: { ...READY_ARTIFACT, status: "failed", error: "rate_limited" }, schema_version: "agent_analysis_v1.1", version: 1, updated_at: "2026-09-14T09:00:00" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
  try {
    await act(async () => {
      env.root.render(React.createElement(mod.default, { sessionId: "sess_4" }));
    });
    const doc = env.dom.window.document;
    assert.equal(await waitFor(doc, "processman-analysis-artifact-failed"), true, "artifact.status=failed");
    const error = doc.querySelector('[data-testid="processman-analysis-artifact-error"]');
    assert.notEqual(error, null, "текст ошибки артефакта виден");
    assert.ok(error.textContent.includes("rate_limited"), "ошибка честная");
  } finally {
    await env.cleanup();
  }
});
