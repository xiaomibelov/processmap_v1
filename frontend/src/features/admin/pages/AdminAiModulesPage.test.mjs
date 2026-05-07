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

async function loadPage() {
  if (!viteServer) {
    viteServer = await createServer({
      root: FRONTEND_ROOT,
      logLevel: "error",
      server: { middlewareMode: true },
      appType: "custom",
    });
  }
  return viteServer.ssrLoadModule("/src/features/admin/pages/AdminAiModulesPage.jsx");
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
  if (!dom.window.HTMLElement.prototype.attachEvent) {
    Object.defineProperty(dom.window.HTMLElement.prototype, "attachEvent", { configurable: true, value() {} });
  }
  if (!dom.window.HTMLElement.prototype.detachEvent) {
    Object.defineProperty(dom.window.HTMLElement.prototype, "detachEvent", { configurable: true, value() {} });
  }

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

  return { dom, root, container, cleanup };
}

async function flush(ms = 30) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

function setFieldValue(element, value, dom) {
  const proto = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetchMock() {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input || "");
    const method = String(init?.method || "GET").toUpperCase();
    calls.push({ url, method, body: init?.body ? String(init.body) : "" });
    if (url.startsWith("/api/admin/ai/modules") && method === "GET") {
      return jsonResponse({
        ok: true,
        modules: [
          {
            module_id: "ai.questions.session",
            name: "AI-вопросы по процессу",
            enabled: true,
            status: "legacy",
            scope: ["session"],
            provider: "deepseek",
            model: "deepseek-chat",
            prompt_source: "code_seeded",
            has_execution_log: false,
            has_rate_limits: false,
            migration_priority: "P1",
          },
          {
            module_id: "ai.product_actions.suggest",
            name: "Предложения действий с продуктом",
            enabled: false,
            status: "future",
            scope: ["session"],
            provider: "deepseek",
            model: "deepseek-chat",
            prompt_source: "future_registry",
            has_execution_log: false,
            has_rate_limits: false,
            migration_priority: "P2",
          },
        ],
        provider_settings: {
          provider: "DeepSeek",
          has_api_key: true,
          base_url: "https://api.deepseek.com",
          source: "settings_file",
          verify_supported: true,
          admin_managed: false,
        },
        summary: { modules_total: 2, legacy: 1, future: 1 },
      });
    }
    if (url.startsWith("/api/admin/ai/prompts/prompt_session_v1/activate") && method === "POST") {
      return jsonResponse({ ok: true, item: { prompt_id: "prompt_session_v1", module_id: "ai.questions.session", version: "v1", status: "active" } });
    }
    if (url.startsWith("/api/admin/ai/prompts/prompt_session_v1/archive") && method === "POST") {
      return jsonResponse({ ok: true, item: { prompt_id: "prompt_session_v1", module_id: "ai.questions.session", version: "v1", status: "archived" } });
    }
    if (url.startsWith("/api/admin/ai/prompts/prompt_session_v1") && method === "GET") {
      return jsonResponse({
        ok: true,
        item: {
          prompt_id: "prompt_session_v1",
          module_id: "ai.questions.session",
          version: "v1",
          status: "draft",
          scope_level: "global",
          template: "Prompt text for session questions",
          variables_schema: { type: "object" },
          output_schema: { type: "object" },
          updated_at: 100,
        },
      });
    }
    if (url.startsWith("/api/admin/ai/prompts") && method === "POST") {
      return jsonResponse({
        ok: true,
        item: {
          prompt_id: "prompt_created",
          module_id: "ai.questions.session",
          version: "v2",
          status: "draft",
          template: "New prompt",
        },
      }, 201);
    }
    if (url.startsWith("/api/admin/ai/prompts") && method === "GET") {
      return jsonResponse({
        ok: true,
        items: [
          {
            prompt_id: "prompt_session_v1",
            module_id: "ai.questions.session",
            version: "v1",
            status: "draft",
            scope_level: "global",
            updated_at: 100,
          },
        ],
        count: 1,
        page: { limit: 200, offset: 0, total: 1, has_more: false },
      });
    }
    if (url.startsWith("/api/admin/ai/executions") && method === "GET") {
      return jsonResponse({
        ok: true,
        items: [
          {
            execution_id: "exec_1",
            module_id: "ai.questions.session",
            status: "success",
            prompt_version: "v1",
            input_hash: "sha256:abc",
            output_summary: "generated questions",
            latency_ms: 12,
          },
        ],
        count: 1,
        page: { limit: 50, offset: 0, total: 1, has_more: false },
      });
    }
    return jsonResponse({ ok: false, error: `unexpected ${method} ${url}` }, 404);
  };
  return {
    calls,
    restore() {
      globalThis.fetch = previousFetch;
    },
  };
}

async function renderPage() {
  const mod = await loadPage();
  const Page = mod.default;
  const env = setupDom();
  await act(async () => {
    env.root.render(React.createElement(Page));
  });
  await flush(50);
  return env;
}

test("AdminAiModulesPage: renders module catalog, prompts, provider summary and safe execution log", async () => {
  const mock = installFetchMock();
  const env = await renderPage();
  try {
    const text = env.container.textContent || "";
    assert.ok(text.includes("ai.questions.session"));
    assert.ok(text.includes("AI-вопросы по процессу"));
    assert.ok(text.includes("DeepSeek"));
    assert.ok(text.includes("https://api.deepseek.com"));
    assert.ok(text.includes("prompt_session_v1") || text.includes("v1"));
    assert.ok(text.includes("exec_1"));
    assert.ok(text.includes("sha256:abc"));
    assert.equal(text.includes("SECRET_SHOULD_NOT_LEAK"), false);
    assert.ok(mock.calls.some((call) => call.url.startsWith("/api/admin/ai/modules")));
    assert.ok(mock.calls.some((call) => call.url.startsWith("/api/admin/ai/prompts")));
    assert.ok(mock.calls.some((call) => call.url.startsWith("/api/admin/ai/executions")));
  } finally {
    await env.cleanup();
    mock.restore();
  }
});

test("AdminAiModulesPage: create draft and activate/archive call prompt registry endpoints", async () => {
  const mock = installFetchMock();
  const env = await renderPage();
  try {
    const versionInput = env.container.querySelector('[data-testid="ai-prompt-create-version"]');
    const templateInput = env.container.querySelector('[data-testid="ai-prompt-create-template"]');
    const form = env.container.querySelector('[data-testid="ai-prompt-create-form"]');
    assert.ok(versionInput);
    assert.ok(templateInput);
    assert.ok(form);
    await act(async () => {
      setFieldValue(versionInput, "v2", env.dom);
      setFieldValue(templateInput, "New prompt", env.dom);
    });
    await flush();
    await act(async () => {
      form.dispatchEvent(new env.dom.window.Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush(50);

    await act(async () => {
      env.container.querySelector('[data-testid="ai-prompt-activate-prompt_session_v1"]')?.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    await flush(50);
    await act(async () => {
      env.container.querySelector('[data-testid="ai-prompt-archive-prompt_session_v1"]')?.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    await flush(50);

    const createCall = mock.calls.find((call) => call.url === "/api/admin/ai/prompts" && call.method === "POST");
    assert.ok(createCall);
    assert.equal(JSON.parse(createCall.body).module_id, "ai.questions.session");
    assert.ok(mock.calls.some((call) => call.url === "/api/admin/ai/prompts/prompt_session_v1/activate" && call.method === "POST"));
    assert.ok(mock.calls.some((call) => call.url === "/api/admin/ai/prompts/prompt_session_v1/archive" && call.method === "POST"));
  } finally {
    await env.cleanup();
    mock.restore();
  }
});
