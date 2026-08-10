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
  return viteServer.ssrLoadModule("/src/features/admin/pages/AdminLlmPage.jsx");
}

after(async () => {
  if (viteServer) await viteServer.close();
});

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost/admin/llm",
  });
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

    if (url.startsWith("/api/admin/llm/models/model_2/set-default") && method === "POST") {
      return jsonResponse({
        ok: true,
        item: {
          id: "model_2", org_id: "org1", provider: "deepseek", model_name: "deepseek-reasoner",
          display_name: "DeepSeek Reasoner", enabled: true, is_default: true, params: {},
          created_by: "admin", created_at: 110, updated_by: "admin", updated_at: 190,
        },
      });
    }
    if (url.startsWith("/api/admin/llm/models/model_2") && method === "PATCH") {
      return jsonResponse({
        ok: true,
        item: {
          id: "model_2", org_id: "org1", provider: "deepseek", model_name: "deepseek-reasoner",
          display_name: "DeepSeek Reasoner", enabled: false, is_default: false, params: {},
          created_by: "admin", created_at: 110, updated_by: "admin", updated_at: 190,
        },
      });
    }
    if (url === "/api/admin/llm/models" && method === "POST") {
      return jsonResponse({
        ok: true,
        item: {
          id: "model_3", org_id: "org1", provider: "openai", model_name: "gpt-4o-mini",
          display_name: "GPT-4o mini", enabled: true, is_default: false, params: {},
          created_by: "admin", created_at: 120, updated_by: "admin", updated_at: 120,
        },
      }, 201);
    }
    if (url === "/api/admin/llm/models" && method === "GET") {
      return jsonResponse({
        ok: true,
        items: [
          {
            id: "model_1", org_id: "org1", provider: "deepseek", model_name: "deepseek-chat",
            display_name: "DeepSeek Chat", enabled: true, is_default: true, params: {},
            created_by: "migration-016", created_at: 100, updated_by: "migration-016", updated_at: 100,
          },
          {
            id: "model_2", org_id: "org1", provider: "deepseek", model_name: "deepseek-reasoner",
            display_name: "DeepSeek Reasoner", enabled: true, is_default: false, params: {},
            created_by: "admin", created_at: 110, updated_by: "admin", updated_at: 150,
          },
        ],
        count: 2,
      });
    }
    if (url.startsWith("/api/admin/llm/feature-models/") && method === "PUT") {
      return jsonResponse({ ok: true, item: { feature: "schema_assistant", model_id: "model_2" } });
    }
    if (url === "/api/admin/llm/feature-models" && method === "GET") {
      return jsonResponse({
        ok: true,
        items: [
          { feature: "process_analysis", model_id: "model_2", model_name: "deepseek-reasoner",
            model_enabled: true, updated_by: "admin", updated_at: 170 },
        ],
        count: 1,
      });
    }
    if (url.startsWith("/api/admin/llm/providers/prov_1/test") && method === "POST") {
      return jsonResponse({
        ok: true,
        item: { ok: true, latency_ms: 42, model: "deepseek-chat", preview: "pong", error: "" },
      });
    }
    if (url.startsWith("/api/admin/llm/providers") && method === "POST") {
      return jsonResponse({
        ok: true,
        item: {
          id: "prov_created",
          org_id: "org1",
          name: "Created",
          base_url: "https://api.created.example/v1",
          model: "cheap-model",
          priority: 5,
          enabled: true,
          has_api_key: false,
          key_last4: "",
          created_by: "admin",
          created_at: 200,
          updated_by: "admin",
          updated_at: 200,
        },
      }, 201);
    }
    if (url.startsWith("/api/admin/llm/providers") && method === "GET") {
      return jsonResponse({
        ok: true,
        items: [
          {
            id: "prov_1",
            org_id: "org1",
            name: "DeepSeek main",
            base_url: "https://api.deepseek.com/v1",
            model: "deepseek-chat",
            priority: 10,
            enabled: true,
            has_api_key: true,
            key_last4: "x7k2",
            api_key: "sk-SECRET_SHOULD_NOT_LEAK",
            created_by: "admin",
            created_at: 100,
            updated_by: "admin",
            updated_at: 150,
          },
          {
            id: "prov_2",
            org_id: "org1",
            name: "Fallback no key",
            base_url: "https://fallback.example/v1",
            model: "fallback-1",
            priority: 20,
            enabled: false,
            has_api_key: false,
            key_last4: "",
            created_by: "admin",
            created_at: 101,
            updated_by: "admin",
            updated_at: 151,
          },
        ],
        count: 2,
      });
    }
    if (url.startsWith("/api/admin/llm/prompts/prompt_1/activate") && method === "POST") {
      return jsonResponse({
        ok: true,
        item: { id: "prompt_1", feature: "process_analysis", version: 2, status: "active" },
        archived_id: "prompt_0",
      });
    }
    if (url.startsWith("/api/admin/llm/prompts") && method === "GET") {
      return jsonResponse({
        ok: true,
        items: [
          {
            id: "prompt_1",
            feature: "process_analysis",
            version: 2,
            system: "sys",
            template: "tpl",
            status: "draft",
            max_tokens: 1024,
            model_class: "primary",
            updated_by: "admin",
            updated_at: 170,
          },
        ],
        count: 1,
        page: { limit: 100, offset: 0, total: 1, has_more: false },
      });
    }
    if (url.startsWith("/api/admin/llm/features/process_analysis") && method === "PATCH") {
      return jsonResponse({
        ok: true,
        item: {
          feature: "process_analysis",
          enabled: false,
          daily_token_limit: 50000,
          used_tokens_24h: 1200,
          updated_by: "admin",
          updated_at: 180,
        },
      });
    }
    if (url.startsWith("/api/admin/llm/features") && method === "GET") {
      return jsonResponse({
        ok: true,
        items: [
          { feature: "process_analysis", enabled: true, daily_token_limit: 50000, used_tokens_24h: 1200, updated_by: "admin", updated_at: 180 },
          { feature: "as_is_transform", enabled: true, daily_token_limit: 10000, used_tokens_24h: 0, updated_by: "admin", updated_at: 181 },
          { feature: "schema_assistant", enabled: false, daily_token_limit: 5000, used_tokens_24h: 5000, updated_by: "admin", updated_at: 182 },
        ],
      });
    }
    if (url.startsWith("/api/admin/llm/usage") && method === "GET") {
      return jsonResponse({
        ok: true,
        items: [
          {
            day: "2026-08-03",
            feature: "process_analysis",
            model: "deepseek-chat",
            calls: 7,
            prompt_tokens: 700,
            completion_tokens: 300,
            cached_hits: 2,
            errors: 1,
          },
        ],
        totals: { calls: 7, prompt_tokens: 700, completion_tokens: 300, cached_hits: 2, errors: 1 },
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

async function switchTab(env, tabId) {
  await act(async () => {
    env.container.querySelector(`[data-testid="llm-tab-${tabId}"]`)?.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
  });
  await flush(60);
}

test("AdminLlmPage: providers tab renders rows with masked key and never leaks api_key", async () => {
  const mock = installFetchMock();
  const env = await renderPage();
  try {
    const text = env.container.textContent || "";
    assert.ok(text.includes("DeepSeek main"));
    assert.ok(text.includes("Fallback no key"));
    assert.ok(text.includes("•••x7k2"));
    assert.equal(text.includes("sk-SECRET_SHOULD_NOT_LEAK"), false);
    assert.equal(text.includes("has_api_key"), false);
    assert.equal(text.includes("api_key"), false);
    assert.ok(env.container.querySelector('[data-testid="llm-provider-row-prov_1"]'));
    assert.ok(env.container.querySelector('[data-testid="llm-provider-row-prov_2"]'));
    assert.ok(mock.calls.some((call) => call.url.startsWith("/api/admin/llm/providers") && call.method === "GET"));
  } finally {
    await env.cleanup();
    mock.restore();
  }
});

test("AdminLlmPage: create provider fires POST with correct body", async () => {
  const mock = installFetchMock();
  const env = await renderPage();
  try {
    const nameInput = env.container.querySelector('[data-testid="llm-provider-form-name"]');
    const baseUrlInput = env.container.querySelector('[data-testid="llm-provider-form-base-url"]');
    const modelInput = env.container.querySelector('[data-testid="llm-provider-form-model"]');
    const priorityInput = env.container.querySelector('[data-testid="llm-provider-form-priority"]');
    const form = env.container.querySelector('[data-testid="llm-provider-form"]');
    assert.ok(nameInput && baseUrlInput && modelInput && priorityInput && form);

    await act(async () => {
      setFieldValue(nameInput, "New provider", env.dom);
      setFieldValue(baseUrlInput, "https://api.new.example/v1", env.dom);
      setFieldValue(modelInput, "new-model", env.dom);
      setFieldValue(priorityInput, "7", env.dom);
    });
    await flush();
    await act(async () => {
      form.dispatchEvent(new env.dom.window.Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush(50);

    const createCall = mock.calls.find((call) => call.url === "/api/admin/llm/providers" && call.method === "POST");
    assert.ok(createCall);
    const body = JSON.parse(createCall.body);
    assert.equal(body.name, "New provider");
    assert.equal(body.base_url, "https://api.new.example/v1");
    assert.equal(body.model, "new-model");
    assert.equal(body.priority, 7);
    assert.equal(body.enabled, true);
    assert.equal(Object.prototype.hasOwnProperty.call(body, "api_key"), false);
  } finally {
    await env.cleanup();
    mock.restore();
  }
});

test("AdminLlmPage: provider test button shows latency and preview from mock", async () => {
  const mock = installFetchMock();
  const env = await renderPage();
  try {
    await act(async () => {
      env.container.querySelector('[data-testid="llm-provider-test-prov_1"]')?.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    await flush(60);

    const text = env.container.textContent || "";
    assert.ok(text.includes("42"), "latency should be rendered");
    assert.ok(text.includes("pong"), "preview should be rendered");
    assert.ok(mock.calls.some((call) => call.url === "/api/admin/llm/providers/prov_1/test" && call.method === "POST"));
  } finally {
    await env.cleanup();
    mock.restore();
  }
});

test("AdminLlmPage: prompts tab activate fires POST for the right id", async () => {
  const mock = installFetchMock();
  const env = await renderPage();
  try {
    await switchTab(env, "prompts");
    assert.ok(env.container.querySelector('[data-testid="llm-prompt-row-prompt_1"]'));

    await act(async () => {
      env.container.querySelector('[data-testid="llm-prompt-activate-prompt_1"]')?.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    await flush(60);

    assert.ok(mock.calls.some((call) => call.url === "/api/admin/llm/prompts/prompt_1/activate" && call.method === "POST"));
  } finally {
    await env.cleanup();
    mock.restore();
  }
});

test("AdminLlmPage: features tab toggle fires PATCH", async () => {
  const mock = installFetchMock();
  const env = await renderPage();
  try {
    await switchTab(env, "features");
    assert.ok(env.container.querySelector('[data-testid="llm-feature-row-process_analysis"]'));

    await act(async () => {
      env.container.querySelector('[data-testid="llm-feature-toggle-process_analysis"]')?.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    await flush(60);

    const patchCall = mock.calls.find((call) => call.url === "/api/admin/llm/features/process_analysis" && call.method === "PATCH");
    assert.ok(patchCall);
    assert.equal(JSON.parse(patchCall.body).enabled, false);
    const text = env.container.textContent || "";
    assert.ok(text.includes("1200 / 50000"));
  } finally {
    await env.cleanup();
    mock.restore();
  }
});

test("AdminLlmPage: models tab renders registry, toggle and set-default fire API calls", async () => {
  const mock = installFetchMock();
  const env = await renderPage();
  try {
    await switchTab(env, "models");
    const text = env.container.textContent || "";
    assert.ok(env.container.querySelector('[data-testid="llm-model-row-deepseek-chat"]'));
    assert.ok(env.container.querySelector('[data-testid="llm-model-row-deepseek-reasoner"]'));
    assert.ok(text.includes("DeepSeek Chat"));
    // default-модель не имеет кнопки set-default
    assert.equal(env.container.querySelector('[data-testid="llm-model-set-default-deepseek-chat"]'), null);
    assert.ok(env.container.querySelector('[data-testid="llm-model-set-default-deepseek-reasoner"]'));
    // override-селекты по известным фичам
    assert.ok(env.container.querySelector('[data-testid="llm-feature-model-row-schema_assistant"]'));

    await act(async () => {
      env.container.querySelector('[data-testid="llm-model-toggle-deepseek-reasoner"]')?.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    await flush(60);
    const patchCall = mock.calls.find((call) => call.url === "/api/admin/llm/models/model_2" && call.method === "PATCH");
    assert.ok(patchCall);
    assert.equal(JSON.parse(patchCall.body).enabled, false);

    await act(async () => {
      env.container.querySelector('[data-testid="llm-model-set-default-deepseek-reasoner"]')?.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    await flush(60);
    assert.ok(mock.calls.some((call) => call.url === "/api/admin/llm/models/model_2/set-default" && call.method === "POST"));
  } finally {
    await env.cleanup();
    mock.restore();
  }
});

test("AdminLlmPage: models tab create form fires POST and override select fires PUT", async () => {
  const mock = installFetchMock();
  const env = await renderPage();
  try {
    await switchTab(env, "models");
    const providerInput = env.container.querySelector('[data-testid="llm-model-form-provider"]');
    const nameInput = env.container.querySelector('[data-testid="llm-model-form-model-name"]');
    const displayInput = env.container.querySelector('[data-testid="llm-model-form-display-name"]');
    const form = env.container.querySelector('[data-testid="llm-model-create-form"]');
    assert.ok(providerInput && nameInput && displayInput && form);

    await act(async () => {
      setFieldValue(providerInput, "openai", env.dom);
      setFieldValue(nameInput, "gpt-4o-mini", env.dom);
      setFieldValue(displayInput, "GPT-4o mini", env.dom);
    });
    await flush();
    await act(async () => {
      form.dispatchEvent(new env.dom.window.Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush(50);
    const createCall = mock.calls.find((call) => call.url === "/api/admin/llm/models" && call.method === "POST");
    assert.ok(createCall);
    const body = JSON.parse(createCall.body);
    assert.equal(body.model_name, "gpt-4o-mini");
    assert.equal(body.provider, "openai");
    assert.equal(body.is_default, false);

    const select = env.container.querySelector('[data-testid="llm-feature-model-select-schema_assistant"]');
    assert.ok(select);
    await act(async () => {
      select.value = "model_2";
      select.dispatchEvent(new env.dom.window.Event("change", { bubbles: true }));
    });
    await flush(60);
    const putCall = mock.calls.find((call) => call.url === "/api/admin/llm/feature-models/schema_assistant" && call.method === "PUT");
    assert.ok(putCall);
    assert.equal(JSON.parse(putCall.body).model_id, "model_2");
  } finally {
    await env.cleanup();
    mock.restore();
  }
});

test("AdminLlmPage: usage tab renders rows and totals from mock", async () => {
  const mock = installFetchMock();
  const env = await renderPage();
  try {
    await switchTab(env, "usage");
    const text = env.container.textContent || "";
    assert.ok(text.includes("2026-08-03"));
    assert.ok(text.includes("process_analysis"));
    const totals = env.container.querySelector('[data-testid="llm-usage-totals"]');
    assert.ok(totals);
    const totalsText = totals.textContent || "";
    assert.ok(totalsText.includes("7"));
    assert.ok(totalsText.includes("700"));
    assert.ok(totalsText.includes("300"));
    assert.ok(mock.calls.some((call) => call.url.startsWith("/api/admin/llm/usage") && call.method === "GET"));
    const usageCall = mock.calls.find((call) => call.url.startsWith("/api/admin/llm/usage"));
    assert.ok(/from_ts=\d+/.test(usageCall.url));
    assert.ok(/to_ts=\d+/.test(usageCall.url));
  } finally {
    await env.cleanup();
    mock.restore();
  }
});
