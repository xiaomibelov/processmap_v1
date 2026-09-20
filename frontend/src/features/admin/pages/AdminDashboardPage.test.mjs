// RED→GREEN: пересборка страницы «Сводка» (feature/admin-dashboard-v2-feature-map).
// Модель: «Возможности системы» (capability_map, accordion) + «Требует реакции» (attention)
// + «Feature Flags» (каталог /api/admin/feature-flags/catalog) + «Система» (строка фактов).
// Smoke-рендер обязателен (прецедент TDZ: новые компоненты без smoke-теста ловили runtime-краш).
// Запуск: node --test src/features/admin/pages/AdminDashboardPage.test.mjs
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

import { ru } from "../../../shared/i18n/ru.js";
import { en } from "../../../shared/i18n/en.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, "../../../..");

let viteServer = null;
// i18n-инстанс из графа vite (ssrLoadModule) — отдельный от node-графа теста,
// локаль нужно переключать именно на нём.
let viteI18n = null;

async function loadPage() {
  if (!viteServer) {
    viteServer = await createServer({
      root: FRONTEND_ROOT,
      logLevel: "error",
      server: { middlewareMode: true },
      appType: "custom",
    });
  }
  const mod = await viteServer.ssrLoadModule("/src/features/admin/pages/AdminDashboardPage.jsx");
  if (!viteI18n) {
    viteI18n = await viteServer.ssrLoadModule("/src/shared/i18n/index.js");
  }
  return mod.default;
}

after(async () => {
  if (viteServer) await viteServer.close();
});

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => (String(k).toLowerCase() === "content-type" ? "application/json" : null) },
    json: async () => data,
    text: async () => JSON.stringify(data),
    blob: async () => new Blob(),
  };
}

const DASHBOARD_PAYLOAD = {
  ok: true,
  generated_at: "2026-09-20T12:00:00+03:00",
  kpis: { projects: 12, active_sessions: 5, avg_save_latency_ms: 42 },
  redis_health: { mode: "ON", state: "ready", queue_enabled: true, queue_depth: 3 },
  jobs_health: { queue_depth: 3, autopass_runs: 10, autopass_done: 7 },
  capability_map: [
    {
      domain: "canvas",
      label: "Канвас / BPMN-редактор",
      capabilities: [
        { id: "save", label: "Save-пайплайн", status: "ok", fact: "avg 42 мс", href: "/admin/jobs" },
        { id: "overlays", label: "Overlays Hybrid V2", status: "pilot", fact: "флаг включён", href: "/app" },
      ],
    },
    {
      domain: "rag",
      label: "RAG",
      capabilities: [
        { id: "rag-index", label: "Индексация", status: "no_data", fact: "", href: "/admin/rag" },
        { id: "rag-nightly", label: "Ночной индексатор", status: "off", fact: "", href: "" },
      ],
    },
  ],
  attention: [
    { kind: "autopass_failed", count: 3, label: "AutoPass: сбои запусков", href: "/admin/jobs" },
  ],
  recent_audit: [
    { id: "a1", action: "org.update", status: "ok", actor: "admin@local", ts: 1720000000 },
    { id: "a2", action: "login", status: "ok", actor: "d1a4751e90a14f98b604066b38377bd2", ts: 1720000100 },
  ],
};

const CATALOG_PAYLOAD = {
  ok: true,
  groups: [
    {
      id: "canvas",
      label: "Canvas",
      flags: [
        { key: "useBpmnExtensionOverlays", label: "Hybrid Overlay V2", description: "d", maturity: "stable", owner_contour: "fix/hybrid-overlays", removal_criterion: "2 недели без инцидентов", source: "runtime", editable: true, value: true, default: false },
        { key: "FPC_ASYNC_SUBPROCESS_SYNC", label: "Async subprocess sync", description: "d", maturity: "rollout", owner_contour: "fix/save-pipeline", removal_criterion: "", source: "env", editable: false, value: false, default: false },
      ],
    },
    {
      id: "other",
      label: "",
      flags: [
        { key: "custom_unknown_flag", label: "custom_unknown_flag", description: "", maturity: "experimental", owner_contour: "", removal_criterion: "", source: "runtime", editable: true, value: false, default: false },
      ],
    },
  ],
  meta: { generated_at: "2026-09-20T12:00:00+03:00" },
};

function setupDom({ patchStatus = 200, patchError = null } = {}) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/admin/dashboard" });
  const patchCalls = [];
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    localStorage: globalThis.localStorage,
    sessionStorage: globalThis.sessionStorage,
    fetch: globalThis.fetch,
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
  globalThis.localStorage = dom.window.localStorage;
  globalThis.sessionStorage = dom.window.sessionStorage;
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    const method = String(options?.method || "GET").toUpperCase();
    if (method === "PATCH" && u.includes("/api/admin/feature-flags")) {
      patchCalls.push({ url: u, body: JSON.parse(String(options.body || "{}")) });
      if (patchStatus < 300) return jsonResponse({ ok: true, flags: {} }, patchStatus);
      return jsonResponse({ ok: false, detail: patchError || "FEATURE_FLAG_ENV_READONLY" }, patchStatus);
    }
    if (u.includes("/api/admin/feature-flags/catalog")) return jsonResponse(CATALOG_PAYLOAD);
    if (u.includes("/api/admin/dashboard")) return jsonResponse(DASHBOARD_PAYLOAD);
    if (u.includes("/api/feature-flags")) return jsonResponse({ flags: {} });
    return jsonResponse({ ok: true, items: [] });
  };
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
    globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    globalThis.localStorage = previous.localStorage;
    globalThis.sessionStorage = previous.sessionStorage;
    globalThis.fetch = previous.fetch;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.reactActEnv;
    if (viteI18n) viteI18n.setLocale("ru");
  };

  return { dom, root, cleanup, patchCalls };
}

async function flush(ms = 80) {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
}

async function renderPage(env, props = {}) {
  const { locale = "ru", ...rest } = props;
  const Page = await loadPage();
  if (viteI18n) viteI18n.setLocale(locale);
  let navigated = null;
  await act(async () => {
    env.root.render(React.createElement(Page, {
      payload: DASHBOARD_PAYLOAD,
      onNavigate: (p) => { navigated = p; },
      ...rest,
    }));
  });
  await flush();
  return { getNavigated: () => navigated };
}

// ---------- SMOKE (обязателен) ----------

test("SMOKE: Сводка рендерится без краша на полном payload", async () => {
  const env = setupDom();
  try {
    await renderPage(env);
    const text = env.dom.window.document.body.textContent;
    assert.ok(text.includes("Возможности системы"), "секция capability map");
    assert.ok(text.includes("Система"), "секция системы");
  } finally {
    await env.cleanup();
  }
});

test("SMOKE: Сводка рендерится без краша на пустом payload", async () => {
  const env = setupDom();
  try {
    await renderPage(env, { payload: {} });
    const text = env.dom.window.document.body.textContent;
    assert.ok(text.includes("Возможности системы"));
    assert.ok(text.includes("Всё в порядке"), "пустой attention → «Всё в порядке»");
  } finally {
    await env.cleanup();
  }
});

// ---------- Возможности системы ----------

test("capability map: рендерит домены, строки, статус-бейджи и факты", async () => {
  const env = setupDom();
  try {
    await renderPage(env);
    const doc = env.dom.window.document;
    const text = doc.body.textContent;
    assert.ok(text.includes("Канвас / BPMN-редактор"));
    assert.ok(text.includes("RAG"));
    assert.ok(text.includes("Save-пайплайн"));
    // дефолт: первая группа раскрыта
    assert.ok(text.includes("работает"), "бейдж ok");
    assert.ok(text.includes("пилот"), "бейдж pilot");
    // вторая группа свёрнута — строки не видны
    assert.equal(text.includes("Индексация"), false, "свёрнутая группа не показывает строки");
  } finally {
    await env.cleanup();
  }
});

test("capability map: accordion open/close по клику + состояние в sessionStorage", async () => {
  const env = setupDom();
  try {
    await renderPage(env);
    const doc = env.dom.window.document;
    const header = doc.querySelector('[data-testid="capability-domain-rag"]');
    assert.ok(header, "заголовок домена RAG");
    assert.equal(header.getAttribute("aria-expanded"), "false");

    await act(async () => {
      header.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    await flush();
    assert.equal(header.getAttribute("aria-expanded"), "true");
    assert.ok(doc.body.textContent.includes("Индексация"), "строки RAG видны после раскрытия");
    const stored = env.dom.window.sessionStorage.getItem("pm-admin-capability-map");
    assert.ok(stored && stored.includes("rag"), "раскрытие сохранено в sessionStorage");

    await act(async () => {
      header.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    await flush();
    assert.equal(header.getAttribute("aria-expanded"), "false");
    assert.equal(env.dom.window.document.body.textContent.includes("Индексация"), false, "повторный клик сворачивает");
  } finally {
    await env.cleanup();
  }
});

test("capability map: ссылка строки переходит по href через onNavigate", async () => {
  const env = setupDom();
  try {
    const { getNavigated } = await renderPage(env);
    const doc = env.dom.window.document;
    const link = doc.querySelector('[data-testid="capability-link-save"]');
    assert.ok(link, "ссылка capability save");
    await act(async () => {
      link.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    await flush();
    assert.equal(getNavigated(), "/admin/jobs");
  } finally {
    await env.cleanup();
  }
});

// ---------- Требует реакции ----------

test("attention: slim-плашка рендерит сигналы; пусто → «Всё в порядке»", async () => {
  const env = setupDom();
  try {
    await renderPage(env);
    const text = env.dom.window.document.body.textContent;
    assert.ok(text.includes("AutoPass: сбои запусков"));
    assert.ok(text.includes("Требует реакции"));

    const env2 = setupDom();
    try {
      await renderPage(env2, { payload: { ...DASHBOARD_PAYLOAD, attention: [] } });
      assert.ok(env2.dom.window.document.body.textContent.includes("Всё в порядке"));
    } finally {
      await env2.cleanup();
    }
  } finally {
    await env.cleanup();
  }
});

// ---------- Feature Flags (каталог) ----------

test("layout: slim-плашка → система → карта+флаги → аудит (порядок секций)", async () => {
  const env = setupDom();
  try {
    await renderPage(env, { payload: { ...DASHBOARD_PAYLOAD, attention: [] } });
    const doc = env.dom.window.document;
    const order = [
      doc.querySelector('[data-testid="attention-strip"]'),
      doc.querySelector('[data-testid="system-facts"]'),
      doc.querySelector('[data-testid="capability-domain-canvas"]'),
      doc.querySelector('[data-testid="flags-group-canvas"]'),
      doc.querySelector("table"),
    ];
    assert.ok(order.every(Boolean), "все секции в DOM");
    for (let i = 0; i < order.length - 1; i += 1) {
      const rel = order[i].compareDocumentPosition(order[i + 1]);
      assert.ok(rel & env.dom.window.Node.DOCUMENT_POSITION_FOLLOWING, `секция ${i} идёт перед секцией ${i + 1}`);
    }
  } finally {
    await env.cleanup();
  }
});

test("flags: рендерит группы каталога, бейджи зрелости и «Прочее» для unknown-флагов", async () => {
  const env = setupDom();
  try {
    await renderPage(env);
    const text = env.dom.window.document.body.textContent;
    assert.ok(text.includes("Canvas"), "группа каталога");
    assert.ok(text.includes("Hybrid Overlay V2"), "флаг с label");
    assert.ok(text.includes("stable"), "бейдж зрелости");
    assert.ok(text.includes("Прочее"), "unknown-флаги → группа «Прочее»");
    assert.ok(text.includes("custom_unknown_flag"));
  } finally {
    await env.cleanup();
  }
});

test("flags: env-флаг read-only (disabled + подсказка)", async () => {
  const env = setupDom();
  try {
    await renderPage(env);
    const doc = env.dom.window.document;
    const envToggle = doc.querySelector('[data-testid="flag-toggle-FPC_ASYNC_SUBPROCESS_SYNC"]');
    assert.ok(envToggle, "переключатель env-флага есть");
    assert.equal(envToggle.disabled, true, "env-флаг disabled");
    const row = envToggle.closest("[data-flag-row]");
    assert.ok(row, "строка флага");
    assert.ok(row.textContent.includes(ru.admin.dashboardPage.flagsEnvHint), "подсказка про env");
  } finally {
    await env.cleanup();
  }
});

test("flags: раскрытие строки показывает description + owner_contour + removal_criterion", async () => {
  const env = setupDom();
  try {
    await renderPage(env);
    const doc = env.dom.window.document;
    const expand = doc.querySelector('[data-testid="flag-expand-useBpmnExtensionOverlays"]');
    assert.ok(expand, "кнопка раскрытия строки флага");
    assert.equal(expand.getAttribute("aria-expanded"), "false", "по умолчанию свёрнуто");
    assert.equal(doc.querySelector('[data-testid="flag-owner-useBpmnExtensionOverlays"]'), null, "meta свёрнуты");

    await act(async () => {
      expand.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    await flush();
    assert.equal(expand.getAttribute("aria-expanded"), "true", "после клика раскрыто");
    const owner = doc.querySelector('[data-testid="flag-owner-useBpmnExtensionOverlays"]');
    const removal = doc.querySelector('[data-testid="flag-removal-useBpmnExtensionOverlays"]');
    assert.ok(owner, "строка владельца-контура есть");
    assert.ok(owner.textContent.includes(ru.admin.dashboardPage.featureFlags.ownerContour), "подпись из i18n");
    assert.ok(owner.textContent.includes("fix/hybrid-overlays"), "значение owner_contour из payload");
    assert.ok(removal, "строка критерия снятия есть");
    assert.ok(removal.textContent.includes(ru.admin.dashboardPage.featureFlags.removalCriterion), "подпись из i18n");
    assert.ok(removal.textContent.includes("2 недели без инцидентов"), "значение removal_criterion из payload");
    // пустое removal_criterion у env-флага не рендерит строку даже после раскрытия
    const envExpand = doc.querySelector('[data-testid="flag-expand-FPC_ASYNC_SUBPROCESS_SYNC"]');
    await act(async () => {
      envExpand.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    await flush();
    assert.equal(doc.querySelector('[data-testid="flag-removal-FPC_ASYNC_SUBPROCESS_SYNC"]'), null);
  } finally {
    await env.cleanup();
  }
});

test("flags: optimistic toggle — PATCH вызывается, значение обновляется", async () => {
  const env = setupDom();
  try {
    await renderPage(env);
    const doc = env.dom.window.document;
    const toggle = doc.querySelector('[data-testid="flag-toggle-useBpmnExtensionOverlays"]');
    assert.ok(toggle, "переключатель runtime-флага");
    assert.equal(toggle.checked, true, "исходное значение из каталога");
    await act(async () => {
      toggle.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    await flush();
    assert.equal(toggle.checked, false, "optimistic toggle");
    assert.equal(env.patchCalls.length, 1, "ровно один PATCH");
    assert.equal(env.patchCalls[0].body.flags.useBpmnExtensionOverlays, false);
  } finally {
    await env.cleanup();
  }
});

test("flags: ошибка PATCH → откат значения + inline-ошибка (без alert)", async () => {
  const env = setupDom({ patchStatus: 422, patchError: "FEATURE_FLAG_ENV_READONLY" });
  try {
    let alerted = false;
    env.dom.window.alert = () => { alerted = true; };
    globalThis.alert = () => { alerted = true; };
    await renderPage(env);
    const doc = env.dom.window.document;
    const toggle = doc.querySelector('[data-testid="flag-toggle-useBpmnExtensionOverlays"]');
    await act(async () => {
      toggle.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    await flush();
    assert.equal(toggle.checked, true, "значение откачено после ошибки PATCH");
    assert.ok(doc.body.textContent.includes(ru.admin.dashboardPage.flagsToggleError), "inline-ошибка видна");
    assert.equal(alerted, false, "нативный alert не используется");
  } finally {
    await env.cleanup();
  }
});

// ---------- Система ----------

test("system: одна строка фактов — только присутствующие значения", async () => {
  const env = setupDom();
  try {
    await renderPage(env);
    const text = env.dom.window.document.body.textContent;
    assert.ok(text.includes("ON"), "redis mode");
    assert.ok(text.includes("42 мс"), "save latency");

    const env2 = setupDom();
    try {
      await renderPage(env2, { payload: { ok: true, generated_at: "", kpis: {}, redis_health: {} } });
      const t2 = env2.dom.window.document.body.textContent;
      assert.equal(t2.includes("42 мс"), false, "отсутствующие значения не рендерятся");
    } finally {
      await env2.cleanup();
    }
  } finally {
    await env.cleanup();
  }
});

test("recent audit: actor hex-id → короткий id + title, email — целиком", async () => {
  const env = setupDom();
  try {
    await renderPage(env);
    const doc = env.dom.window.document;
    const hexActor = doc.querySelector('tbody td span[title="d1a4751e90a14f98b604066b38377bd2"]');
    assert.ok(hexActor, "hex-актор с title=полный id");
    assert.equal(hexActor.textContent, "d1a4751e", "короткий id (8 символов)");
    const emailCell = Array.from(doc.querySelectorAll("tbody td")).find((td) => td.textContent.trim() === "admin@local");
    assert.ok(emailCell, "email-актор показан целиком");
  } finally {
    await env.cleanup();
  }
});

// ---------- i18n parity новых ключей ----------
test("i18n: секции Сводки рендерятся на en при setLocale(\"en\")", async () => {
  const env = setupDom();
  try {
    await renderPage(env, { payload: { ...DASHBOARD_PAYLOAD, attention: [] }, locale: "en" });
    const doc = env.dom.window.document;
    const text = doc.body.textContent;
    assert.ok(text.includes("System capabilities"), "en-заголовок capability map");
    assert.ok(text.includes("All clear"), "en attentionAllClear");
    assert.ok(text.includes("working"), "en статус ok");
    const expand = doc.querySelector('[data-testid="flag-expand-useBpmnExtensionOverlays"]');
    await act(async () => {
      expand.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    await flush();
    assert.ok(doc.body.textContent.includes("Owner contour"), "en ownerContour в раскрытой строке");
    assert.ok(doc.body.textContent.includes("Recent Audit"), "en recentAudit.title");
  } finally {
    await env.cleanup();
  }
});

test("i18n: новые ключи admin.dashboardPage есть и в ru, и в en", () => {
  const keys = [
    "capabilitiesTitle", "attentionTitle", "attentionAllClear", "flagsTitle",
    "recentAudit.title", "recentAudit.colActor", "recentAudit.emptyTitle",
    "flagsEnvHint", "flagsToggleError", "otherGroup", "systemTitle",
    "featureFlags.ownerContour", "featureFlags.removalCriterion",
    "status.ok", "status.pilot", "status.off", "status.attention", "status.no_data",
  ];
  const get = (dict, kp) => kp.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), dict);
  for (const key of keys) {
    const ruVal = get(ru.admin?.dashboardPage, key);
    const enVal = get(en.admin?.dashboardPage, key);
    assert.ok(typeof ruVal === "string" && ruVal.length > 0, `ru dashboardPage.${key}`);
    assert.ok(typeof enVal === "string" && enVal.length > 0, `en dashboardPage.${key}`);
  }
});

// ---------- Удалённые виджеты не возвращаются ----------

test("сводка не импортирует удалённые виджеты (KpiRow/Template/EndpointCheck/SessionsActivity/RequiresAttention)", () => {
  const source = fs.readFileSync(path.join(__dirname, "AdminDashboardPage.jsx"), "utf8");
  for (const name of [
    "DashboardKpiRow", "TemplateUsageWidget", "EndpointCheckMovedCard",
    "SessionsActivityWidget", "RequiresAttentionWidget", "QueueHealthWidget",
    "AutoPassOutcomesWidget", "JobsThroughputWidget", "ReportsHealthWidget",
    "PublishGitMirrorWidget", "RedisHealthWidget", "FeatureFlagsWidget",
  ]) {
    assert.equal(source.includes(name), false, `виджет ${name} не должен импортироваться страницей Сводки`);
  }
});
