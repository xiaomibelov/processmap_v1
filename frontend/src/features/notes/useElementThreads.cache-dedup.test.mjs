// useElementThreads: два подписчика на один (sid, elementId) → один fetch.
// Запуск: node --test src/features/notes/useElementThreads.cache-dedup.test.mjs
import test, { after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const FRONTEND_ROOT = path.resolve(process.cwd());

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
  const mod = await viteServer.ssrLoadModule("/src/features/notes/useElementThreads.js");
  const cacheMod = await viteServer.ssrLoadModule("/src/lib/noteThreadsCache.js");
  return { useElementThreads: mod.useElementThreads, __resetForTests: cacheMod.__resetForTests };
}

after(async () => {
  if (viteServer) await viteServer.close();
});

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost/",
  });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    Event: globalThis.Event,
    CustomEvent: globalThis.CustomEvent,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    localStorage: globalThis.localStorage,
    fetch: globalThis.fetch,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.Event = dom.window.Event;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  globalThis.localStorage = dom.window.localStorage;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  let fetchCount = 0;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/api/sessions/") && u.includes("/note-threads")) {
      fetchCount += 1;
      await new Promise((resolve) => { setTimeout(resolve, 5); });
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({
          items: [{ id: "thread-1", scope_type: "diagram_element", scope_ref: { element_id: "e1" }, updated_at: 1 }],
        }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
  };

  return {
    root: dom.window.document.getElementById("root"),
    restore: () => {
      Object.assign(globalThis, previous);
    },
    fetchCount: () => fetchCount,
  };
}

test("two subscribers with the same (sid, elementId) produce one network request", async () => {
  const { useElementThreads, __resetForTests } = await loadModules();
  __resetForTests();
  const { root, restore, fetchCount } = setupDom();

  const threadLists = [];

  function Subscriber({ label }) {
    const { threads } = useElementThreads("s1", "e1");
    useEffect(() => {
      threadLists.push({ label, count: threads.length });
    }, [threads, label]);
    return null;
  }

  function App() {
    return React.createElement(React.Fragment, null,
      React.createElement(Subscriber, { label: "a" }),
      React.createElement(Subscriber, { label: "b" }),
    );
  }

  await act(async () => {
    createRoot(root).render(React.createElement(App));
  });

  // Allow async effects to settle.
  await act(async () => {
    await new Promise((resolve) => { setTimeout(resolve, 50); });
  });

  assert.equal(fetchCount(), 1, "expected one network request for two subscribers");
  assert.equal(threadLists.some((x) => x.count === 1), true, "expected at least one subscriber to receive the thread");

  restore();
});
