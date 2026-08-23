// AgentMarkdown — unit/behavior-тесты безопасного markdown-рендера.
// Запуск: node --test src/features/process/processman/AgentMarkdown.test.mjs
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

async function loadMarkdown() {
  if (!viteServer) {
    viteServer = await createServer({
      root: FRONTEND_ROOT,
      logLevel: "error",
      server: { middlewareMode: true },
      appType: "custom",
    });
  }
  return viteServer.ssrLoadModule("/src/features/process/processman/AgentMarkdown.jsx");
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
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
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
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.IS_REACT_ACT_ENVIRONMENT;
  };

  return { dom, root, cleanup };
}

async function renderAgentMarkdown(mod, text, { nodes = [], onNodeClick = () => {} } = {}) {
  const env = setupDom();
  await act(async () => {
    env.root.render(React.createElement(mod.default, { text, nodes, onNodeClick }));
  });
  return { doc: env.dom.window.document, cleanup: env.cleanup };
}

function firstText(el) {
  return el?.textContent?.trim() ?? "";
}

// ------------------------------------------------------------------ inline styles

test("bold, italic, inline code", async () => {
  const mod = await loadMarkdown();
  const { doc, cleanup } = await renderAgentMarkdown(mod, "**жирный**, *курсив* и `код`");
  try {
    const strong = doc.querySelector("strong");
    const em = doc.querySelector("em");
    const code = doc.querySelector("code");
    assert.equal(strong?.textContent, "жирный");
    assert.equal(em?.textContent, "курсив");
    assert.equal(code?.textContent, "код");
  } finally {
    await cleanup();
  }
});

test("ссылки открываются в новой вкладке и валидируются", async () => {
  const mod = await loadMarkdown();
  const { doc, cleanup } = await renderAgentMarkdown(mod, "[ProcessMap](https://processmap.ru) и [bad](javascript:alert(1))");
  try {
    const links = Array.from(doc.querySelectorAll("a"));
    assert.equal(links.length, 1, "только валидная ссылка");
    assert.equal(links[0].getAttribute("href"), "https://processmap.ru");
    assert.equal(links[0].getAttribute("target"), "_blank");
    assert.ok((links[0].getAttribute("rel") || "").includes("noopener"), "rel noopener");
    assert.ok(doc.body.textContent.includes("bad"), "подпись запрещённой ссылки осталась текстом");
  } finally {
    await cleanup();
  }
});

// ------------------------------------------------------------------ block styles

test("заголовки визуально смиренные", async () => {
  const mod = await loadMarkdown();
  const { doc, cleanup } = await renderAgentMarkdown(mod, "# H1\n## H2\n### H3");
  try {
    assert.equal(doc.querySelector('[data-testid="processman-markdown-h1"]')?.textContent, "H1");
    assert.equal(doc.querySelector('[data-testid="processman-markdown-h2"]')?.textContent, "H2");
    assert.equal(doc.querySelector('[data-testid="processman-markdown-h3"]')?.textContent, "H3");
  } finally {
    await cleanup();
  }
});

test("маркированный и нумерованный списки", async () => {
  const mod = await loadMarkdown();
  const { doc, cleanup } = await renderAgentMarkdown(mod, "- one\n- two\n\n1. first\n2. second");
  try {
    const ul = doc.querySelector('[data-testid="processman-markdown-ul"]');
    const ol = doc.querySelector('[data-testid="processman-markdown-ol"]');
    assert.equal(ul?.tagName, "UL");
    assert.equal(ul?.children.length, 2);
    assert.equal(ol?.tagName, "OL");
    assert.equal(ol?.children.length, 2);
  } finally {
    await cleanup();
  }
});

test("fenced code block", async () => {
  const mod = await loadMarkdown();
  const { doc, cleanup } = await renderAgentMarkdown(mod, "```python\nprint(1)\n```");
  try {
    const pre = doc.querySelector('[data-testid="processman-markdown-pre"]');
    const code = doc.querySelector('[data-testid="processman-markdown-code-block"]');
    assert.equal(pre?.tagName, "PRE");
    assert.equal(code?.textContent, "print(1)");
    assert.ok((code?.className || "").includes("language-python"), "язык сохранён в классе");
  } finally {
    await cleanup();
  }
});

// ------------------------------------------------------------------ security / partial streaming

test("XSS: HTML и script рендерятся как текст", async () => {
  const mod = await loadMarkdown();
  const { doc, cleanup } = await renderAgentMarkdown(mod, "<script>alert(1)</script>");
  try {
    assert.equal(doc.querySelector("script"), null, "script не вставлен");
    assert.ok(doc.body.textContent.includes("<script>alert(1)</script>"), "HTML escaped / plain text");
  } finally {
    await cleanup();
  }
});

test("стриминг: незакрытый bold остаётся plain text, не ломает layout", async () => {
  const mod = await loadMarkdown();
  const { doc, cleanup } = await renderAgentMarkdown(mod, "**не закрыто");
  try {
    assert.equal(doc.querySelector("strong"), null, "не полный bold не рендерится");
    assert.ok(doc.body.textContent.includes("**не закрыто"));
  } finally {
    await cleanup();
  }
});

test("стриминг: открытый fenced code block стабилен", async () => {
  const mod = await loadMarkdown();
  const { doc, cleanup } = await renderAgentMarkdown(mod, "```\npartial");
  try {
    const pre = doc.querySelector('[data-testid="processman-markdown-pre"]');
    assert.equal(pre?.tagName, "PRE");
    assert.ok(pre.textContent.includes("partial"));
  } finally {
    await cleanup();
  }
});

// ------------------------------------------------------------------ node mentions

test("упоминания узлов работают поверх markdown", async () => {
  const mod = await loadMarkdown();
  let clickedId = "";
  const nodes = [{ id: "Act_1", name: "Проверка документов", type: "task" }];
  const { doc, cleanup } = await renderAgentMarkdown(mod, "Смотри **шаг** — Проверка документов важно.", { nodes, onNodeClick: (id) => { clickedId = id; } });
  try {
    const chip = doc.querySelector('[data-testid="processman-node-chip-Act_1"]');
    assert.notEqual(chip, null, "чип узла найден");
    assert.ok(chip.textContent.includes("Проверка документов"));
    await act(async () => {
      chip.dispatchEvent(new globalThis.MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    assert.equal(clickedId, "Act_1");
    const strong = doc.querySelector("strong");
    assert.equal(strong?.textContent, "шаг");
  } finally {
    await cleanup();
  }
});
