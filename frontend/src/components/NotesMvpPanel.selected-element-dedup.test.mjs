// NotesMvpPanel: смена selectedElement в режиме scopeFilter="all" не вызывает refetch.
// Запуск: node --test src/components/NotesMvpPanel.selected-element-dedup.test.mjs
import test, { after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const FRONTEND_ROOT = path.resolve(process.cwd());

let viteServer = null;

async function loadModule() {
  if (!viteServer) {
    viteServer = await createServer({
      root: FRONTEND_ROOT,
      logLevel: "error",
      server: { middlewareMode: true },
      appType: "custom",
    });
  }
  const mod = await viteServer.ssrLoadModule("/src/components/NotesMvpPanel.jsx");
  return mod.default;
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

  let noteThreadsCount = 0;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/api/sessions/") && u.includes("/note-threads")) {
      noteThreadsCount += 1;
      await new Promise((resolve) => { setTimeout(resolve, 5); });
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({ items: [] }),
      };
    }
    return { ok: false, status: 404, headers: { get: () => "" }, json: async () => ({}), text: async () => "" };
  };

  return {
    root: dom.window.document.getElementById("root"),
    restore: () => {
      Object.assign(globalThis, previous);
    },
    noteThreadsCount: () => noteThreadsCount,
  };
}

test("changing selectedElement in scopeFilter=all does not refetch note-threads", async () => {
  const NotesMvpPanel = await loadModule();
  const { root, restore, noteThreadsCount } = setupDom();

  const sessions = [];

  function App() {
    const [selectedElement, setSelectedElement] = useState({ id: "el-1", type: "bpmn:Task", name: "A" });
    const [request, setRequest] = useState({ requestKey: "init", scopeFilter: "all" });

    return React.createElement("div", null,
      React.createElement(NotesMvpPanel, {
        ref: null,
        sessionId: "s1",
        sessionTitle: "Test session",
        sessions,
        selectedElement,
        externalOpenRequest: request,
      }),
      React.createElement("button", {
        id: "switch",
        onClick: () => {
          setSelectedElement({ id: "el-2", type: "bpmn:Task", name: "B" });
        },
      }, "Switch"),
      React.createElement("button", {
        id: "reopen",
        onClick: () => {
          setRequest({ requestKey: `reopen-${Date.now()}`, scopeFilter: "selected_element" });
        },
      }, "Reopen"),
    );
  }

  let rootInstance;
  await act(async () => {
    rootInstance = createRoot(root);
    rootInstance.render(React.createElement(App));
  });

  // Let initial fetch settle.
  await act(async () => {
    await new Promise((resolve) => { setTimeout(resolve, 80); });
  });

  const countAfterMount = noteThreadsCount();
  assert.equal(countAfterMount >= 1, true, "expected at least one fetch after mount");

  // Change selected element twice.
  const switchBtn = root.querySelector("#switch");
  await act(async () => {
    switchBtn.click();
  });
  await act(async () => {
    await new Promise((resolve) => { setTimeout(resolve, 80); });
  });

  await act(async () => {
    switchBtn.click();
  });
  await act(async () => {
    await new Promise((resolve) => { setTimeout(resolve, 80); });
  });

  assert.equal(
    noteThreadsCount(),
    countAfterMount,
    "expected no additional note-threads fetch when selectedElement changes in scopeFilter=all",
  );

  // Sanity: reopening the panel with selected_element filter should fetch.
  const reopenBtn = root.querySelector("#reopen");
  await act(async () => {
    reopenBtn.click();
  });
  await act(async () => {
    await new Promise((resolve) => { setTimeout(resolve, 80); });
  });

  assert.equal(noteThreadsCount() > countAfterMount, true, "expected fetch after reopen request");

  rootInstance.unmount();
  restore();
});
