// UX-UPDATE — behavior-тест цепочки [Обновить] при blocked-состоянии
// (fix/app-update-refresh-dead-end, закрывает пробел Q6 аудита):
//   blocked → refresh() !ok + error + риск; forceRefresh() → навигация (__pm_cb);
//   flush-hang → timeout (C1) → retry доступен (refreshBusy сбрасывается).
// Запуск: node --test src/features/appUpdate/useAppUpdateAvailable.refresh.behavior.test.mjs
import test, { after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM, VirtualConsole } from "jsdom";
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
  const navErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => {
    if (/navigation/i.test(String(error?.detail || error))) navErrors.push(String(error?.detail || error));
  });
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost/app",
    virtualConsole,
  });
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
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ sha: "f1cdeadend00000000000000000000000000aa", builtAt: "2026-09-21T00:00:00Z" }),
  });

  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  const hookRef = { current: null };

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

  return { dom, root, cleanup, navErrors, hookRef };
}

async function renderHook(env, hookMod, { safeRefreshTimeoutMs } = {}) {
  const ProbeComponent = () => {
    const value = hookMod.default({ refreshGuard: null, safeRefreshTimeoutMs });
    env.hookRef.current = value;
    return null;
  };
  await act(async () => {
    env.root.render(React.createElement(ProbeComponent));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  return env.hookRef.current;
}

test("blocked (conflict): refresh() → !ok conflict, error и риск доступны UI; auto-reload не срабатывает", async () => {
  const { hookMod, controllerMod } = await loadModules();
  const env = setupDom();
  try {
    controllerMod.__resetAppSafeRefreshForTests();
    controllerMod.registerAppSafeRefreshHandler({
      getRisk: () => ({ status: "conflict", message: "конфликт сохранения" }),
      flush: async () => ({ ok: true, status: "saved" }),
    });
    const hook = await renderHook(env, hookMod);
    assert.equal(hook.refreshRisk.status, "conflict");

    const result = await act(async () => hook.refresh());
    assert.equal(result.ok, false);
    assert.equal(result.status, "conflict");
    assert.ok(env.hookRef.current.refreshError.length > 0, "error проброшен в UI");
    assert.equal(env.navErrors.length, 0, "reload НЕ выполнен при blocked");
  } finally {
    await env.cleanup();
  }
});

test("A/B: forceRefresh() из blocked-состояния → навигация с __pm_cb (hardReloadPage)", async () => {
  const { hookMod, controllerMod } = await loadModules();
  const env = setupDom();
  try {
    controllerMod.__resetAppSafeRefreshForTests();
    controllerMod.registerAppSafeRefreshHandler({
      getRisk: () => ({ status: "conflict", message: "конфликт сохранения" }),
      flush: async () => ({ ok: true, status: "saved" }),
    });
    const hook = await renderHook(env, hookMod);
    assert.equal(typeof hook.forceRefresh, "function", "хук экспонирует forceRefresh");

    await act(async () => { hook.forceRefresh(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    assert.ok(
      env.navErrors.some((e) => /navigation/i.test(e)) || String(env.dom.window.location.href).includes("__pm_cb"),
      "forceRefresh инициировал cache-bust навигацию",
    );
  } finally {
    await env.cleanup();
  }
});

test("C1: flush-hang → timeout по safeRefreshTimeoutMs; refreshBusy сбрасывается (retry доступен)", async () => {
  const { hookMod, controllerMod } = await loadModules();
  const env = setupDom();
  try {
    controllerMod.__resetAppSafeRefreshForTests();
    controllerMod.registerAppSafeRefreshHandler({
      getRisk: () => ({ status: "dirty" }),
      flush: () => new Promise(() => {}),
    });
    const hook = await renderHook(env, hookMod, { safeRefreshTimeoutMs: 60 });

    const startedAt = Date.now();
    const result = await Promise.race([
      act(async () => hook.refresh()),
      new Promise((resolve) => setTimeout(() => resolve({ __stuck: true }), 3000)),
    ]);
    const elapsed = Date.now() - startedAt;

    assert.equal(result.__stuck, undefined, "refresh вернулся по таймауту (C1), а не висит (sentinel)");
    assert.equal(result.ok, false);
    assert.equal(result.status, "timeout");
    assert.ok(elapsed < 3000, `refresh вернулся по таймауту (${elapsed}ms), а не завис`);
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    assert.equal(env.hookRef.current.refreshBusy, false, "retry доступен после таймаута");
  } finally {
    await env.cleanup();
  }
});
