import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, "../../../../../..");

let viteServer = null;

async function loadBoundary() {
  if (!viteServer) {
    viteServer = await createServer({
      root: FRONTEND_ROOT,
      logLevel: "error",
      server: { middlewareMode: true },
      appType: "custom",
    });
  }
  return viteServer.ssrLoadModule("/src/features/process/bpmn/stage/load/DiagramLoadBoundary.jsx");
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
    reactActEnv: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
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
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.reactActEnv;
  };

  return { dom, root, cleanup };
}

async function flush(ms = 24) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

function querySkeleton(env) {
  return env.dom.window.document.querySelector('[data-testid="diagram-skeleton"]');
}

test("DiagramLoadBoundary delays skeleton reveal (~400ms) and hides instantly", async () => {
  const { default: DiagramLoadBoundary } = await loadBoundary();
  const env = setupDom();
  try {
    await act(async () => {
      env.root.render(React.createElement(
        DiagramLoadBoundary,
        { loadState: "importing", errorReason: "", hasDiagram: false },
        React.createElement("div", { "data-testid": "canvas-child" }),
      ));
    });
    await flush(30);
    // Порог анти-мерцания: сразу после перехода скелетона нет.
    assert.equal(querySkeleton(env), null);

    // После ~400ms ожидания скелетон виден (длинная загрузка большой схемы).
    await flush(460);
    assert.notEqual(querySkeleton(env), null);
    const caption = env.dom.window.document.querySelector('[data-testid="diagram-skeleton-caption"]');
    assert.match(caption?.textContent || "", /Загружаем схему/);

    // Мгновенное скрытие при готовности.
    await act(async () => {
      env.root.render(React.createElement(
        DiagramLoadBoundary,
        { loadState: "ready", errorReason: "", hasDiagram: true },
        React.createElement("div", { "data-testid": "canvas-child" }),
      ));
    });
    await flush(30);
    assert.equal(querySkeleton(env), null);
  } finally {
    await env.cleanup();
  }
});

test("DiagramLoadBoundary keeps fast loads skeleton-free", async () => {
  const { default: DiagramLoadBoundary } = await loadBoundary();
  const env = setupDom();
  try {
    await act(async () => {
      env.root.render(React.createElement(
        DiagramLoadBoundary,
        { loadState: "importing", errorReason: "", hasDiagram: false },
        React.createElement("div"),
      ));
    });
    // Быстрая загрузка: ready наступает раньше порога — скелетон не появляется вообще.
    await flush(120);
    await act(async () => {
      env.root.render(React.createElement(
        DiagramLoadBoundary,
        { loadState: "ready", errorReason: "", hasDiagram: true },
        React.createElement("div"),
      ));
    });
    await flush(450);
    assert.equal(querySkeleton(env), null);
  } finally {
    await env.cleanup();
  }
});

test("diagram skeleton styles stay compositor-cheap and theme-aware", () => {
  const css = fs.readFileSync(path.join(__dirname, "DiagramSkeleton.css"), "utf8");
  // Анимации только на transform/opacity (без layout/paint-нагрузки → без влияния на FPS).
  assert.equal(/@keyframes diagramSkeleton-shimmer \{[^}]*transform/s.test(css), true);
  assert.equal(css.includes("will-change: transform"), true);
  assert.equal(css.includes("prefers-reduced-motion"), true);
  assert.equal(css.includes(".dark .diagramSkeleton"), true);
  assert.equal(css.includes("var(--c-bg"), true);
  // Никаких анимаций ширины/высоты/позиции.
  assert.equal(/animation:[^;]*(width|height|top|left)/.test(css), false);

  const source = fs.readFileSync(path.join(__dirname, "DiagramSkeleton.jsx"), "utf8");
  assert.equal(source.includes('import "./DiagramSkeleton.css"'), true);
  assert.equal(source.includes("Загружаем схему…"), true);

  const boundary = fs.readFileSync(path.join(__dirname, "DiagramLoadBoundary.jsx"), "utf8");
  assert.equal(boundary.includes("SKELETON_REVEAL_DELAY_MS = 400"), true);
});
