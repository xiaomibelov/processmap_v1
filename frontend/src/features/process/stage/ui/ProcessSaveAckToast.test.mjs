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
const FRONTEND_ROOT = path.resolve(__dirname, "../../../../..");

let viteServer = null;

async function loadToast() {
  if (!viteServer) {
    viteServer = await createServer({
      root: FRONTEND_ROOT,
      logLevel: "error",
      server: { middlewareMode: true },
      appType: "custom",
    });
  }
  return viteServer.ssrLoadModule("/src/features/process/stage/ui/ProcessSaveAckToast.jsx");
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
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
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
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.reactActEnv;
  };

  return { dom, root, cleanup };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 24));
  });
}

test("ProcessSaveAckToast keeps message-only rendering free of action controls", async () => {
  const { default: ProcessSaveAckToast } = await loadToast();
  const env = setupDom();
  try {
    await act(async () => {
      env.root.render(React.createElement(ProcessSaveAckToast, {
        visible: true,
        message: "Сохранение: сессия сохранена.",
        tone: "success",
      }));
    });
    await flush();

    const toast = env.dom.window.document.querySelector('[data-testid="process-save-ack-toast"]');
    assert.notEqual(toast, null);
    assert.match(toast.textContent, /Сохранение: сессия сохранена\./);
    assert.equal(env.dom.window.document.querySelector('[data-testid="process-save-ack-toast-action"]'), null);
    assert.equal(env.dom.window.document.querySelector('[data-testid="process-save-ack-toast-dismiss"]'), null);
  } finally {
    await env.cleanup();
  }
});

test("ProcessSaveAckToast supports persistent action and manual dismiss", async () => {
  const { default: ProcessSaveAckToast } = await loadToast();
  const env = setupDom();
  let actionCount = 0;
  let dismissCount = 0;
  try {
    await act(async () => {
      env.root.render(React.createElement(ProcessSaveAckToast, {
        visible: true,
        message: "Сессию обновил Анна",
        description: "Обновите сессию, чтобы увидеть актуальную версию.",
        tone: "warning",
        actionLabel: "Обновить сессию",
        onAction: () => {
          actionCount += 1;
        },
        persistent: true,
        onDismiss: () => {
          dismissCount += 1;
        },
      }));
    });
    await flush();

    const toast = env.dom.window.document.querySelector('[data-testid="process-save-ack-toast"]');
    const action = env.dom.window.document.querySelector('[data-testid="process-save-ack-toast-action"]');
    const dismiss = env.dom.window.document.querySelector('[data-testid="process-save-ack-toast-dismiss"]');
    assert.equal(toast?.getAttribute("data-persistent"), "true");
    assert.match(toast?.textContent || "", /Сессию обновил Анна/);
    assert.match(toast?.textContent || "", /Обновите сессию/);
    assert.equal(action?.textContent, "Обновить сессию");

    await act(async () => {
      action.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
      dismiss.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(actionCount, 1);
    assert.equal(dismissCount, 1);
  } finally {
    await env.cleanup();
  }
});
