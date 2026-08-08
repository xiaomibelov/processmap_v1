// LLM4 — гейт ⑨/⑫: скрины S1–S8 + контраст-probe (кнопка/шапка ≥4.5:1).
// Стек: vite dev :5178 (worktree frontend) → API :8012 (worktree backend) →
// мок DeepSeek (scripts/llm4_mock_llm.mjs на :8099, провайдер → 172.21.0.1).
// Сессия 8d8c8b7824 («Супы РТК», проект a7e0de97d0) с BPMN и steps.
// После прогона: провайдер возвращается в исходное (enabled=false, key="").
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.LLM4_GATE_BASE || "http://127.0.0.1:5178";
const API = process.env.LLM4_GATE_API || "http://127.0.0.1:8012";
const MOCK_BASE_URL = process.env.LLM4_MOCK_URL || "http://172.21.0.1:8099";
const MOCK_KEY = "sk-gate-mock";
const OUT = path.join(ROOT, "docs", "llm", "gate");
const PID = "a7e0de97d0";
const SID = "8d8c8b7824";
const PROVIDER_ID = "llmprov_deepseek_seed";
const ELEMENT_ID = "Act_transfer"; // «Перетарить суп…» — есть step с bpmn_ref
// user id admin@local — ключ пропуска org-picker
const ORG_CHOICE_KEY = "fpc_org_choice_done:7dc3fd8a0a3d4da3bbb91b1c89b816a8";

fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[llm4-gate]", ...a);
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name), fullPage: false });

// --- helpers: auth + admin-конфиг провайдера/флагов (локальный API) ---
function readDeepseekKey() {
  const env = fs.readFileSync("/opt/processmap-test/.env", "utf8");
  const m = env.match(/^DEEPSEEK_API_KEY=(.+)$/m);
  return (m?.[1] || "").trim();
}

const loginRes = await fetch(`${API}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@local", password: "admin" }),
});
const TOKEN = (await loginRes.json()).access_token;
if (!TOKEN) throw new Error("login failed");
const AUTH = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

async function api(pathname, opts = {}) {
  const r = await fetch(`${API}${pathname}`, { ...opts, headers: { ...AUTH, ...(opts.headers || {}) } });
  let body = null;
  try { body = await r.json(); } catch { /* noop */ }
  return { status: r.status, body };
}

const patchProvider = (fields) =>
  api(`/api/admin/llm/providers/${PROVIDER_ID}`, { method: "PATCH", body: JSON.stringify(fields) });

async function llmStatus() {
  const r = await api("/api/llm/status");
  return r.body;
}

async function setFlagLimit(limit) {
  return api("/api/admin/llm/features/analysis", {
    method: "PATCH",
    body: JSON.stringify({ daily_token_limit: limit }),
  });
}

// --- playwright ---
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1680, height: 1000 } })).newPage();
await page.addInitScript(({ t, orgKey }) => {
  window.localStorage.setItem("fpc_auth_access_token", t);
  window.localStorage.setItem("fpc_active_org_id", "org_default");
  window.sessionStorage.setItem(orgKey, "1");
}, { t: TOKEN, orgKey: ORG_CHOICE_KEY });

const llmCalls = [];
page.on("request", (r) => {
  const u = r.url();
  if (u.includes("/llm/")) llmCalls.push(`${r.method()} ${u}`);
});

async function openSession() {
  await page.goto(`${BASE}/app?project=${PID}&session=${SID}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(9000);
  // вкладка «Схема» воркбенча (в таб-баре — «Diagram (BPMN)»)
  await clickWorkbenchTab("Diagram");
  await page.waitForTimeout(4000);
}

async function clickWorkbenchTab(name) {
  // вкладки воркбенча — button[role=tab] (ProcessStageHeader)
  const tab = page.getByRole("tab", { name, exact: false }).first();
  await tab.click({ timeout: 10000 });
}

async function switchWorkbenchTab(name) {
  // клик + ожидание реальной активации (aria-selected), с одним повтором
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await clickWorkbenchTab(name);
    const activated = await page.waitForFunction((needle) => {
      const t = Array.from(document.querySelectorAll('[role="tab"]'))
        .find((x) => (x.textContent || "").includes(needle));
      return t?.getAttribute("aria-selected") === "true";
    }, name, { timeout: 15000 }).then(() => true).catch(() => false);
    if (activated) return true;
    log(`⚠️ вкладка «${name}» не активировалась, повтор`);
  }
  return false;
}

async function clickCanvasElement(elementId) {
  await page.evaluate((eid) => {
    const el = document.querySelector(`[data-element-id="${eid}"]`);
    const hit = el?.querySelector(".djs-hit, .djs-outline") || el;
    hit?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  }, elementId);
  await page.waitForTimeout(1200);
}

async function openPanel() {
  await page.click('[data-testid="diagram-action-processman"]');
  await page.waitForSelector('[data-testid="processman-panel"]', { timeout: 15000 });
  await page.waitForTimeout(600);
}

async function probeContrast() {
  return page.evaluate(() => {
    const grab = (el) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { color: cs.color, bg: cs.backgroundColor, text: (el.textContent || "").trim().slice(0, 40) };
    };
    // эффективный фон с композитингом полупрозрачных слоёв (rgba/color(srgb /a))
    const parseColor = (str) => {
      const s = String(str || "").trim();
      if (!s || s === "transparent") return [0, 0, 0, 0];
      let m = s.match(/^rgba?\(([^)]+)\)$/);
      if (m) {
        const p = m[1].split(",").map((x) => parseFloat(x));
        return [p[0] || 0, p[1] || 0, p[2] || 0, p.length > 3 ? p[3] : 1];
      }
      m = s.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/);
      if (m) return [Number(m[1]) * 255, Number(m[2]) * 255, Number(m[3]) * 255, m[4] !== undefined ? Number(m[4]) : 1];
      return [0, 0, 0, 0];
    };
    const alphaOver = (top, under) => {
      const [tr, tg, tb, ta] = top;
      const [ur, ug, ub, ua] = under;
      const a = ta + ua * (1 - ta);
      if (a === 0) return [0, 0, 0, 0];
      return [
        (tr * ta + ur * ua * (1 - ta)) / a,
        (tg * ta + ug * ua * (1 - ta)) / a,
        (tb * ta + ub * ua * (1 - ta)) / a,
        a,
      ];
    };
    const effectiveBg = (el) => {
      // собираем слои снизу вверх: body (белый fallback) → … → элемент
      const layers = [[255, 255, 255, 1]];
      const chain = [];
      let node = el;
      while (node && node !== document.documentElement) { chain.unshift(node); node = node.parentElement; }
      for (const n of chain) layers.push(parseColor(getComputedStyle(n).backgroundColor));
      let acc = layers[0];
      for (let i = 1; i < layers.length; i += 1) acc = alphaOver(layers[i], acc);
      return `rgb(${Math.round(acc[0])}, ${Math.round(acc[1])}, ${Math.round(acc[2])})`;
    };
    const btn = document.querySelector('[data-testid="diagram-action-processman"]');
    const title = document.querySelector(".pm-processman__title");
    const btnLabel = btn?.querySelector(".diagramActionBtnLabel") || btn;
    return {
      button: grab(btnLabel),
      buttonBgFrom: btn ? effectiveBg(btn) : null,
      panelTitle: grab(title),
      panelTitleBgFrom: title ? effectiveBg(title) : null,
    };
  });
}

// контраст WCAG: (L1+0.05)/(L2+0.05)
function lum(rgb) {
  const m = String(rgb || "").match(/(\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  const f = (v) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(m[1]) + 0.7152 * f(m[2]) + 0.0722 * f(m[3]);
}
function contrastRatio(fg, bg) {
  const l1 = lum(fg); const l2 = lum(bg);
  if (l1 === null || l2 === null) return null;
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const results = { screenshots: [], probes: {}, checks: [] };
const check = (name, ok, detail = "") => {
  results.checks.push({ name, ok: !!ok, detail });
  log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

try {
  // ============ S1: disabled без ключа (configured=false) ============
  log("S1: провайдер enabled без ключа → configured=false");
  await patchProvider({ enabled: true, api_key: "" });
  log("  status:", JSON.stringify(await llmStatus()));
  await openSession();
  const s1 = await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="diagram-action-processman"]');
    if (!btn) return null;
    return {
      ariaDisabled: btn.getAttribute("aria-disabled"),
      title: btn.getAttribute("title"),
      ariaLabel: btn.getAttribute("aria-label"),
      focusable: btn.tabIndex >= 0,
    };
  });
  check("S1 кнопка aria-disabled при has_api_key=false", s1?.ariaDisabled === "true", JSON.stringify(s1));
  check("S1 тултип про настройку провайдера", /админ-панели/.test(s1?.title || ""), s1?.title);
  check("S1 aria-label из i18n", (s1?.ariaLabel || "").includes("PROCESSMAN"), s1?.ariaLabel);
  check("S1 тултип доступен с клавиатуры (фокусируемая кнопка)", s1?.focusable === true);
  // клик не открывает панель
  await page.click('[data-testid="diagram-action-processman"]').catch(() => {});
  await page.waitForTimeout(800);
  check("S1 панель не открывается", (await page.$('[data-testid="processman-panel"]')) === null);
  await shot(page, "llm4_s1_no_key.png");
  results.screenshots.push("llm4_s1_no_key.png");

  // ============ включаем провайдера с мок-ключом (S2–S5, S3) ============
  await patchProvider({ enabled: true, api_key: MOCK_KEY, base_url: MOCK_BASE_URL, priority: 100 });
  log("  status:", JSON.stringify(await llmStatus()));

  await openSession();
  await openPanel();

  // S2: пустое состояние (шаг не выбран)
  const hasEmpty = await page.$('[data-testid="processman-tobe-empty"]');
  check("S2 пустое состояние (шаг не выбран)", !!hasEmpty);
  await shot(page, "llm4_s2_empty.png");
  results.screenshots.push("llm4_s2_empty.png");

  // фокус в панели при открытии (клавиатура §10)
  const focusInPanel = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="processman-panel"]');
    return panel && (document.activeElement === panel || panel.contains(document.activeElement));
  });
  check("клавиатура: фокус в панели при открытии", !!focusInPanel);

  // выбор узла канвы → действия активны
  await clickCanvasElement(ELEMENT_ID);
  const suggestEnabled = await page.evaluate(() => !document.querySelector('[data-testid="processman-action-suggest"]')?.disabled);
  check("выбор узла активирует действия", suggestEnabled);

  // S4: загрузка — skeleton >300ms (мок отвечает ~1500ms)
  const llmBefore = llmCalls.length;
  await page.click('[data-testid="processman-action-suggest"]');
  await page.waitForTimeout(600);
  const skeletonVisible = await page.$('[data-testid="processman-answer-loading"]');
  check("S4 skeleton при загрузке >300ms", !!skeletonVisible);
  if (skeletonVisible) {
    await shot(page, "llm4_s4_loading.png");
    results.screenshots.push("llm4_s4_loading.png");
  }
  // анти-даблклик: кнопка disabled во время загрузки
  const antiDouble = await page.evaluate(() => document.querySelector('[data-testid="processman-action-suggest"]')?.disabled === true);
  check("S4 анти-даблклик (disabled во время запроса)", antiDouble);

  // S5: ответ (время, ↻, 👍👎, бейдж «новый запрос»)
  await page.waitForSelector('[data-testid="processman-answer-ok"], [data-testid="processman-answer-error"]', { timeout: 60000 });
  const answerOk = await page.$('[data-testid="processman-answer-ok"]');
  check("S5 ответ показан", !!answerOk);
  if (answerOk) {
    check("S5 время ответа", !!(await page.$('[data-testid="processman-answer-time"]')));
    check("S5 ↻ Обновить", !!(await page.$('[data-testid="processman-answer-refresh"]')));
    check("S5 👍/👎 в футере", !!(await page.$('[data-testid="processman-feedback-up"]')));
    const badge = await page.evaluate(() => document.querySelector('[data-testid="processman-cache-badge"]')?.textContent.trim());
    check("S5 бейдж «новый запрос»", badge === "новый запрос", badge);
    await shot(page, "llm4_s5_answer.png");
    results.screenshots.push("llm4_s5_answer.png");

    // 👍 → feedback в llm_usage без LLM-вызова
    const fbBefore = llmCalls.filter((u) => u.includes("suggest-next")).length;
    await page.click('[data-testid="processman-feedback-up"]');
    await page.waitForTimeout(1200);
    check("👍 записан (thanks)", !!(await page.$('[data-testid="processman-feedback-thanks"]')));
    const fbCalls = llmCalls.filter((u) => u.includes("/api/llm/feedback"));
    check("👍 → POST /api/llm/feedback (не LLM-gateway)", fbCalls.length === 1, fbCalls.join(";"));
    const fbRows = await api("/api/admin/llm/usage?feature=processman_feedback&limit=1");
    log("  llm_usage feedback:", JSON.stringify(fbRows.body).slice(0, 200));
  }

  // S3: повторный клик suggest → из in-memory кэша (0 новых вызовов)
  const beforeSecond = llmCalls.filter((u) => u.includes("suggest-next")).length;
  await page.click('[data-testid="processman-action-suggest"]');
  await page.waitForTimeout(1000);
  const afterSecond = llmCalls.filter((u) => u.includes("suggest-next")).length;
  check("S3 повтор = 0 вызовов (in-memory кэш)", afterSecond === beforeSecond, `${beforeSecond}→${afterSecond}`);
  const badgeCached = await page.evaluate(() => document.querySelector('[data-testid="processman-cache-badge"]')?.textContent.trim());
  check("S3 бейдж «из кэша · 0 токенов»", badgeCached === "из кэша · 0 токенов", badgeCached);
  await shot(page, "llm4_s3_cached.png");
  results.screenshots.push("llm4_s3_cached.png");

  // вкладка «Анализ процессов» — панель НЕ закрывается, контекст «Анализ»
  const analysisTabOk = await switchWorkbenchTab("Анализ процессов");
  await page.waitForTimeout(2500);
  check("вкладка «Анализ процессов» активирована", analysisTabOk);
  check("П.1 панель не закрывается при смене вкладки", !!(await page.$('[data-testid="processman-panel"]')));
  check("контекст «Анализ» при tab=interview", !!(await page.$('[data-testid="processman-analysis"]')));
  await shot(page, "llm4_context_analysis.png");
  results.screenshots.push("llm4_context_analysis.png");

  // вкладка XML → нейтральное состояние
  await switchWorkbenchTab("XML");
  await page.waitForTimeout(2500);
  check("нейтральное состояние (AS IS/Отчёты/прочие)", !!(await page.$('[data-testid="processman-neutral"]')));
  await shot(page, "llm4_context_neutral.png");
  results.screenshots.push("llm4_context_neutral.png");

  // Esc закрывает панель
  await switchWorkbenchTab("Diagram");
  await page.waitForTimeout(2500);
  await page.click('[data-testid="processman-panel"]', { position: { x: 100, y: 100 } }).catch(() => {});
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  check("Esc закрывает панель", (await page.$('[data-testid="processman-panel"]')) === null);

  // ============ S8: fallback-провайдер (primary падает → secondary отвечает) ============
  log("S8: primary bad key + secondary good key → fallback=true");
  await patchProvider({ api_key: "sk-bad", priority: 10 });
  const created = await api("/api/admin/llm/providers", {
    method: "POST",
    body: JSON.stringify({ org_id: "org_default", name: "llm4-gate-secondary", base_url: MOCK_BASE_URL, model: "deepseek-chat", api_key: MOCK_KEY, priority: 20, enabled: true }),
  });
  const secondaryId = created.body?.item?.id || created.body?.id || "";
  log("  secondary:", secondaryId ? "создан" : JSON.stringify(created.body).slice(0, 120));

  await openSession();
  await openPanel();
  await clickCanvasElement(ELEMENT_ID);
  await page.click('[data-testid="processman-action-explain"]');
  await page.waitForSelector('[data-testid="processman-answer-ok"], [data-testid="processman-answer-error"]', { timeout: 60000 });
  check("S8 бейдж fallback-провайдера", !!(await page.$('[data-testid="processman-answer-fallback"]')));
  await shot(page, "llm4_s8_fallback.png");
  results.screenshots.push("llm4_s8_fallback.png");

  // ============ S6: ошибка (все провайдеры недоступны) + [Повторить] ============
  log("S6: единственный провайдер с bad key → error");
  if (secondaryId) await api(`/api/admin/llm/providers/${secondaryId}`, { method: "DELETE" });
  // primary остаётся bad key → error
  await openSession();
  await openPanel();
  await clickCanvasElement(ELEMENT_ID);
  await page.click('[data-testid="processman-action-explain"]');
  await page.waitForSelector('[data-testid="processman-answer-error"]', { timeout: 60000 });
  const errText = await page.evaluate(() => document.querySelector('[data-testid="processman-answer-error"]')?.textContent || "");
  check("S6 ошибка человекочитаемо (RU)", /Ошибка при обращении|провайдер не настроен|не удалось/i.test(errText), errText.slice(0, 120));
  check("S6 кнопка [Повторить]", !!(await page.$('[data-testid="processman-answer-retry"]')));
  await shot(page, "llm4_s6_error.png");
  results.screenshots.push("llm4_s6_error.png");

  // ============ S7: лимит по quota ============
  log("S7: usage по feature=analysis + daily_token_limit=1 → exhausted");
  // quota считается по feature "analysis" — фиксируем usage напрямую
  // (вызовы suggest/explain пишут schema_assistant, analysis не вызывался)
  execSync(`docker exec processmap_v1-postgres-1 psql -U fpc -d processmap -c "INSERT INTO llm_usage (org_id, feature, model, prompt_tokens, completion_tokens, cached, status, ts) VALUES ('org_default','analysis','mock-gate',60,40,false,'ok',${Math.floor(Date.now() / 1000)})"`);
  await patchProvider({ api_key: MOCK_KEY, priority: 100 }); // good key обратно
  const flag = await setFlagLimit(1);
  log("  flag:", JSON.stringify(flag.body).slice(0, 160));
  await openSession();
  await openPanel();
  // статус LLM грузится асинхронно (1× на сессию) — ждём quota-состояние
  const quotaState = await page.waitForSelector('[data-testid="processman-tobe-quota"]', { timeout: 10000 }).catch(() => null);
  check("S7 состояние исчерпания quota", !!quotaState);
  await clickCanvasElement(ELEMENT_ID);
  const s7disabled = await page.evaluate(() => document.querySelector('[data-testid="processman-action-suggest"]')?.disabled === true);
  check("S7 действия disabled при exhausted (даже с выбранным шагом)", s7disabled);
  await shot(page, "llm4_s7_quota.png");
  results.screenshots.push("llm4_s7_quota.png");

  // ============ контраст-probe (Z0-4): кнопка + шапка панели ============
  const probe = await probeContrast();
  results.probes = probe;
  const btnRatio = probe?.button && probe?.buttonBgFrom ? contrastRatio(probe.button.color, probe.buttonBgFrom) : null;
  const titleRatio = probe?.panelTitle && probe?.panelTitleBgFrom ? contrastRatio(probe.panelTitle.color, probe.panelTitleBgFrom) : null;
  results.contrast = {
    button: { ...probe?.button, bg: probe?.buttonBgFrom, ratio: btnRatio },
    panelTitle: { ...probe?.panelTitle, bg: probe?.panelTitleBgFrom, ratio: titleRatio },
  };
  check("контраст кнопки ≥ 4.5:1", btnRatio !== null && btnRatio >= 4.5, btnRatio?.toFixed(2));
  check("контраст заголовка панели ≥ 4.5:1", titleRatio !== null && titleRatio >= 4.5, titleRatio?.toFixed(2));
} catch (e) {
  await shot(page, "llm4_gate_FAIL.png").catch(() => {});
  console.error("[llm4-gate] FAIL:", e?.message || e);
  process.exitCode = 1;
} finally {
  // восстановление исходного runtime-состояния
  await patchProvider({ enabled: false, api_key: "", base_url: "https://api.deepseek.com", priority: 100 }).catch(() => {});
  await setFlagLimit(200000).catch(() => {});
  log("провайдер возвращён в исходное (enabled=false), limit=200000");
  fs.writeFileSync(path.join(OUT, "llm4_gate_probe.json"), JSON.stringify(results, null, 2));
  await browser.close();
}

const failed = results.checks.filter((c) => !c.ok);
log(`итог: ${results.checks.length - failed.length}/${results.checks.length} проверок зелёные; скринов: ${results.screenshots.length}`);
if (failed.length > 0 || process.exitCode === 1) {
  console.error("[llm4-gate] GATE FAILED:", failed.map((c) => c.name).join("; "));
  process.exitCode = 1;
} else {
  log("LLM4 GATE (S1–S8 + контраст) PASSED");
}
