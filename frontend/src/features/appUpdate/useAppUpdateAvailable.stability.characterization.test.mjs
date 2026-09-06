// F2 (canvas-pan-overlay-jank-v1): characterization-guard на idle React-шторм.
// Регистрация safe-refresh handler (или любой notify) при СЕМАНТИЧЕСКИ неизменном
// риске не должна давать лишних ре-рендеров владельца хука. Лишний setState с
// свежим object-identity разрывал контур шторма ~270 commits/s (RC-A аудита).
// Запуск: node --test src/features/appUpdate/useAppUpdateAvailable.stability.characterization.test.mjs
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
const FRONTEND_ROOT = path.resolve(__dirname, "../../..");

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
  const hookMod = await viteServer.ssrLoadModule("/src/features/appUpdate/useAppUpdateAvailable.js");
  const controllerMod = await viteServer.ssrLoadModule("/src/features/appUpdate/appSafeRefreshController.js");
  return { hookMod, controllerMod };
}

after(async () => {
  if (viteServer) await viteServer.close();
});

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent,
    fetch: globalThis.fetch,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    reactActEnv: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.Event = dom.window.Event;
  globalThis.MouseEvent = dom.window.MouseEvent;
  globalThis.fetch = async () => ({ ok: false });
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
    globalThis.MouseEvent = previous.MouseEvent;
    globalThis.fetch = previous.fetch;
    globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.reactActEnv;
  };

  return { dom, root, cleanup };
}

test("notify safe-refresh при неизменном риске: 0 лишних ре-рендеров; при смене риска — ровно 1", async () => {
  const { hookMod, controllerMod } = await loadModules();
  controllerMod.__resetAppSafeRefreshForTests();
  const env = setupDom();
  let renders = 0;
  function Probe() {
    hookMod.default();
    renders += 1;
    return null;
  }
  try {
    await act(async () => {
      env.root.render(React.createElement(Probe));
    });
    // flush эффектов (initial sync + boot checkForUpdate)
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    const baseline = renders;

    // Регистрация handler → notify; риск семантически тот же (clean)
    await act(async () => {
      controllerMod.registerAppSafeRefreshHandler({ getRisk: () => ({ status: "clean", message: "" }) });
    });
    assert.equal(renders, baseline, "notify при неизменном риске не должен ре-рендерить");

    // Повторная регистрация (unregister+register → 2 notify) при том же риске
    await act(async () => {
      controllerMod.registerAppSafeRefreshHandler({ getRisk: () => ({ status: "clean", message: "" }) });
    });
    assert.equal(renders, baseline, "повторная регистрация при неизменном риске не должна ре-рендерить");

    // Смена риска dirty → ровно один ре-рендер (поведение сохранено)
    await act(async () => {
      controllerMod.registerAppSafeRefreshHandler({
        getRisk: () => ({ status: "dirty", message: "есть несохранённые изменения" }),
      });
    });
    assert.equal(renders, baseline + 1, "смена риска → ровно 1 ре-рендер");
  } finally {
    await env.cleanup();
    controllerMod.__resetAppSafeRefreshForTests();
  }
});
