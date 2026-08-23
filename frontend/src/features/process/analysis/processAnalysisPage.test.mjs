// Tests for ProcessAnalysisPage tab switching and a11y.
// Run: node --test src/features/process/analysis/processAnalysisPage.test.mjs
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

async function loadModules() {
  if (!viteServer) {
    viteServer = await createServer({
      root: FRONTEND_ROOT,
      logLevel: "error",
      server: { middlewareMode: true },
      appType: "custom",
    });
  }
  const page = await viteServer.ssrLoadModule("/src/features/process/analysis/ProcessAnalysisPage.jsx");
  const i18n = await viteServer.ssrLoadModule("/src/features/process/analysis/useProcessAnalysisI18n.js");
  return { ProcessAnalysisPage: page.ProcessAnalysisPage, createT: i18n.createT };
}

after(async () => {
  if (viteServer) await viteServer.close();
});

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost/",
  });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    Event: globalThis.Event,
    KeyboardEvent: globalThis.KeyboardEvent,
    MouseEvent: globalThis.MouseEvent,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.Event = dom.window.Event;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
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
    globalThis.HTMLElement = previous.HTMLElement;
    globalThis.Node = previous.Node;
    globalThis.Event = previous.Event;
    globalThis.KeyboardEvent = previous.KeyboardEvent;
    globalThis.MouseEvent = previous.MouseEvent;
    globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.IS_REACT_ACT_ENVIRONMENT;
  };

  return { dom, root, cleanup, container };
}

async function flush(ms = 50) {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
}

function makeTabs() {
  return [
    { key: "steps", label: "Steps", content: React.createElement("div", null, "Steps content") },
    { key: "summary", label: "Summary", content: React.createElement("div", null, "Summary content") },
    { key: "ai", label: "AI", content: React.createElement("div", null, "AI content") },
  ];
}

test("ProcessAnalysisPage renders tabs and switches content on click", async () => {
  const { ProcessAnalysisPage, createT } = await loadModules();
  const { root, cleanup, container } = setupDom();

  try {
    await act(async () => {
      root.render(
        React.createElement(ProcessAnalysisPage, {
          title: "Analysis",
          tabs: makeTabs(),
          defaultTabKey: "steps",
          t: createT("en"),
        })
      );
    });
    await flush();
    assert.ok(container.querySelector('[data-testid="process-analysis-page"]'));
    assert.match(container.textContent, /Steps content/);
    assert.doesNotMatch(container.textContent, /Summary content/);

    const summaryTab = Array.from(container.querySelectorAll('[role="tab"]')).find(
      (el) => el.textContent === "Summary"
    );
    assert.ok(summaryTab);
    await act(async () => {
      summaryTab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    assert.match(container.textContent, /Summary content/);
    assert.doesNotMatch(container.textContent, /Steps content/);
    assert.equal(summaryTab.getAttribute("aria-selected"), "true");
  } finally {
    await cleanup();
  }
});

test("ProcessAnalysisPage supports keyboard arrow navigation", async () => {
  const { ProcessAnalysisPage, createT } = await loadModules();
  const { root, cleanup, container } = setupDom();

  try {
    await act(async () => {
      root.render(
        React.createElement(ProcessAnalysisPage, {
          title: "Analysis",
          tabs: makeTabs(),
          defaultTabKey: "steps",
          t: createT("en"),
        })
      );
    });
    await flush();
    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    const first = tabs[0];
    first.focus();

    await act(async () => {
      first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    await flush();
    assert.equal(document.activeElement.getAttribute("role"), "tab");
    assert.match(container.textContent, /Summary content/);

    await act(async () => {
      document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    await flush();
    assert.match(container.textContent, /AI content/);
  } finally {
    await cleanup();
  }
});

test("ProcessAnalysisPage tabs have role tab and aria-selected", async () => {
  const { ProcessAnalysisPage, createT } = await loadModules();
  const { root, cleanup, container } = setupDom();

  try {
    await act(async () => {
      root.render(
        React.createElement(ProcessAnalysisPage, {
          title: "Analysis",
          tabs: makeTabs(),
          defaultTabKey: "summary",
          t: createT("en"),
        })
      );
    });
    await flush();
    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    assert.equal(tabs.length, 3);
    tabs.forEach((tab) => {
      assert.ok(tab.hasAttribute("aria-selected"));
      assert.ok(tab.hasAttribute("aria-controls"));
    });
    const selected = tabs.find((t) => t.getAttribute("aria-selected") === "true");
    assert.equal(selected.textContent, "Summary");
  } finally {
    await cleanup();
  }
});
