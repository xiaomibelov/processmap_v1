// NotesMvpPanel: drag-end НЕ должен вызывать refetch note-threads (драг не меняет scope_ref.element_id).
// Запуск: node --test src/components/NotesMvpPanel.drag-end-no-refetch.test.mjs
import test, { after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

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

async function loadDragState() {
  await loadModule();
  return viteServer.ssrLoadModule("/src/features/process/bpmn/stage/diagramDragState.js");
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

test("diagram drag-end does not refetch note-threads", async () => {
  const NotesMvpPanel = await loadModule();
  const dragState = await loadDragState();
  const { root, restore, noteThreadsCount } = setupDom();

  const sessions = [];

  function App() {
    const [request] = useState({ requestKey: "init", scopeFilter: "all" });
    return React.createElement(NotesMvpPanel, {
      ref: null,
      sessionId: "s1",
      sessionTitle: "Test session",
      sessions,
      selectedElement: { id: "el-1", type: "bpmn:Task", name: "A" },
      externalOpenRequest: request,
    });
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

  // Simulate a canvas drag: start + end. Dragging does not change thread data
  // (scope_ref.element_id stays the same), so no refetch may fire.
  await act(async () => {
    dragState.setDiagramDragging(true);
  });
  await act(async () => {
    dragState.setDiagramDragging(false);
  });
  await act(async () => {
    await new Promise((resolve) => { setTimeout(resolve, 80); });
  });

  assert.equal(
    noteThreadsCount(),
    countAfterMount,
    "expected no note-threads refetch on diagram drag-end",
  );

  rootInstance.unmount();
  restore();
});
