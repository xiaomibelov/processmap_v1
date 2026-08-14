import test, { after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { JSDOM } from "jsdom";

// Real behavioral tests for the "New session" modal (SessionCreateModal),
// rendered in jsdom through the real shared Modal (focus trap, Escape) and
// Button primitives. Replaces the former source-grep .source.test.mjs.
//
// NOTE: jsdom globals must be installed BEFORE react-dom is loaded, because
// react-dom computes its DOM capability flags (canUseDOM / isInputEventSupported)
// once at module evaluation time.

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;
globalThis.Element = dom.window.Element;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { createServer } = await import("vite");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, "../../..");

let viteServer = null;

async function loadModal() {
  if (!viteServer) {
    viteServer = await createServer({
      root: FRONTEND_ROOT,
      logLevel: "error",
      server: { middlewareMode: true },
      appType: "custom",
    });
  }
  return viteServer.ssrLoadModule("/src/features/explorer/SessionCreateModal.jsx");
}

after(async () => {
  if (viteServer) await viteServer.close();
  dom.window.close();
});

async function renderModal(props = {}) {
  const { default: SessionCreateModal } = await loadModal();
  const calls = { submit: [], close: 0 };
  const finalProps = {
    sessions: [],
    onClose: () => { calls.close += 1; },
    onSubmit: async (payload) => { calls.submit.push(payload); },
    ...props,
  };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(SessionCreateModal, finalProps));
  });
  const cleanup = async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  };
  return { calls, cleanup };
}

function modalDom() {
  return {
    form: () => document.querySelector('[data-testid="session-create-modal"]'),
    nameInput: () => document.querySelector('[data-testid="session-create-name"]'),
    submitButton: () => document.querySelector('[data-testid="session-create-submit"]'),
    error: () => document.querySelector(".formError"),
  };
}

async function typeName(value) {
  const input = modalDom().nameInput();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

async function submitForm() {
  const form = modalDom().form();
  await act(async () => {
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  });
}

test("renders design-system modal, autofocuses name input, submit disabled while name empty", async () => {
  const { cleanup } = await renderModal();
  try {
    const m = modalDom();
    assert.notEqual(m.form(), null);
    assert.notEqual(document.querySelector(".modalOverlay[role=\"dialog\"]"), null);
    assert.match(document.body.textContent, /Новая сессия/);
    assert.match(document.body.textContent, /Название сессии/);
    assert.match(document.body.textContent, /Тип сессии/);
    // Autofocus on mount.
    assert.equal(document.activeElement, m.nameInput());
    // Cannot submit with empty name.
    assert.equal(m.submitButton().disabled, true);

    await typeName("Сессия А");
    assert.equal(m.submitButton().disabled, false);
  } finally {
    await cleanup();
  }
});

test("successful submit calls onSubmit with payload and closes the modal", async () => {
  const { calls, cleanup } = await renderModal();
  try {
    await typeName("  Сессия А  ");
    await submitForm();
    assert.equal(calls.submit.length, 1);
    assert.deepEqual(calls.submit[0], { name: "Сессия А", processLayer: "as_is", derivedFrom: "" });
    assert.equal(calls.close, 1);
  } finally {
    await cleanup();
  }
});

test("double submit while busy calls onSubmit only once", async () => {
  let resolveSubmit = null;
  const submitCalls = { count: 0 };
  const { calls, cleanup } = await renderModal({
    onSubmit: () => {
      submitCalls.count += 1;
      return new Promise((resolve) => { resolveSubmit = resolve; });
    },
  });
  try {
    await typeName("Сессия А");

    // First submit: handler sets busy and awaits onSubmit; state flushes after act.
    await submitForm();
    assert.equal(submitCalls.count, 1);
    assert.equal(modalDom().submitButton().disabled, true);

    // Second submit while busy: the `if (busy) return;` guard must swallow it.
    await submitForm();
    assert.equal(submitCalls.count, 1, "onSubmit must not be called twice while busy");
    assert.equal(calls.close, 0);

    await act(async () => {
      resolveSubmit();
    });
    assert.equal(submitCalls.count, 1);
    assert.equal(calls.close, 1);
  } finally {
    await cleanup();
  }
});

test("failed submit keeps modal open, preserves entered name, shows error", async () => {
  const { calls, cleanup } = await renderModal({
    onSubmit: async () => { throw new Error("Сервер недоступен"); },
  });
  try {
    const m = modalDom();
    await typeName("Сессия А");
    await submitForm();

    // Modal stays open, onClose NOT called.
    assert.equal(calls.close, 0);
    assert.notEqual(m.form(), null, "modal form must still be rendered");
    // Entered name is preserved.
    assert.equal(m.nameInput().value, "Сессия А");
    // Error from onSubmit is shown.
    assert.notEqual(m.error(), null);
    assert.match(m.error().textContent, /Сервер недоступен/);
    // busy is reset: user can retry.
    assert.equal(m.submitButton().disabled, false);
  } finally {
    await cleanup();
  }
});

test("empty name submit shows validation error and does not call onSubmit/onClose", async () => {
  const { calls, cleanup } = await renderModal();
  try {
    await submitForm();
    assert.equal(calls.submit.length, 0);
    assert.equal(calls.close, 0);
    const m = modalDom();
    assert.notEqual(m.error(), null);
    assert.match(m.error().textContent, /Введите название сессии/);
  } finally {
    await cleanup();
  }
});

test("Escape keydown closes the modal", async () => {
  const { calls, cleanup } = await renderModal();
  try {
    await act(async () => {
      window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    assert.equal(calls.close, 1);
  } finally {
    await cleanup();
  }
});

test("Tab / Shift+Tab cycle focus within the modal (focus trap)", async () => {
  const { cleanup } = await renderModal();
  try {
    const card = document.querySelector(".modalCard");
    assert.notEqual(card, null);
    const focusable = Array.from(card.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((node) => !node.hasAttribute("disabled") && node.getAttribute("aria-hidden") !== "true");
    assert.ok(focusable.length >= 2, "expected several focusable controls in the modal");
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    // Focus inside the modal never escapes: Tab on the last wraps to the first.
    last.focus();
    assert.equal(document.activeElement, last);
    await act(async () => {
      window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    });
    assert.equal(document.activeElement, first, "Tab on last element must wrap focus to the first");

    // Shift+Tab on the first wraps to the last.
    await act(async () => {
      window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    });
    assert.equal(document.activeElement, last, "Shift+Tab on first element must wrap focus to the last");

    // Every focusable control belongs to the modal card.
    for (const node of focusable) {
      assert.ok(card.contains(node), "focusable control must live inside the modal card");
    }
  } finally {
    await cleanup();
  }
});
