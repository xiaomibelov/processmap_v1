// LLM3 gate (stage) — «Помощник на Схеме» на сессии «Разогрев супа» (org_default).
// Шаги:
//  (1) блок виден на вкладке «Схема»; открытие панели НЕ вызывает ни одного
//      запроса /llm/* (проверка «никаких авто-вызовов» на живом UI);
//  (2) explain/ask disabled без выделенного шага;
//  (3) suggest-next по клику → результат/честный статус; повтор → «из кэша»;
//  (4) выделить шаг на канве → explain-step → результат или no_trace (оба честные);
//  (5) step-qa по клику → результат/честный статус.
// Артефакты → docs/llm/gate/llm3_*.png. EXIT=0 при успехе всех шагов.
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.E2E_BASE || "https://stage.processmap.ru";
const OUT = path.join(ROOT, "docs", "llm", "gate");
const PID = "c0494e0667";
const SID = "13f1f10b20"; // «Разогрев супа» (as_is, 23 шага)

fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[llm3-gate]", ...a);
const fail = (msg) => { throw new Error(msg); };

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "d.belov@automacon.ru", password: "Beelive12!" }),
  });
  const data = await res.json();
  if (!data.access_token) fail(`login: ${JSON.stringify(data).slice(0, 200)}`);
  return data.access_token;
}

const TOKEN = await login();
log("login ok");

// первый Activity_* из живой сессии (для explain/qa и клика по канве)
async function firstStepId() {
  const res = await fetch(`${BASE}/api/sessions/${SID}/bpmn?raw=1`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const xml = await res.text();
  const m = xml.match(/id="(Activity_[^"]+)"/) || xml.match(/id="((?:task|Task)[^"]+)"/);
  return m ? m[1] : "";
}
const STEP_ID = await firstStepId();
log("step для explain/qa:", STEP_ID || "(не найден — explain/qa через UI-клик пропущу)");
if (!STEP_ID) fail("не удалось извлечь element_id из bpmn сессии");

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
const page = await context.newPage();
await page.addInitScript((t) => {
  window.localStorage.setItem("fpc_auth_access_token", t);
  window.localStorage.setItem("fpc_active_org_id", "org_default");
  window.sessionStorage.setItem("fpc_org_choice_done:389893aa9e1e4823aa9b0f4498817655", "1");
}, TOKEN);

// счётчик запросов к LLM3-эндпоинтам — до кликов должен быть 0
let llmCalls = 0;
page.on("request", (r) => {
  if (/\/api\/sessions\/[^/]+\/llm\/(suggest-next|explain-step|step-qa)/.test(r.url())) llmCalls += 1;
});

const settled = async (kind, timeoutMs = 120000) => {
  await page.waitForSelector(
    `[data-testid="schema-assistant-${kind}-result"], [data-testid="schema-assistant-block"] div[style*="b91c1c"]`,
    { timeout: timeoutMs },
  );
};
const statusLine = (kind) => page.evaluate((k) => {
  const el = document.querySelector(`[data-testid="schema-assistant-${k}-result"] .muted.small`);
  return (el?.textContent || "").trim();
}, kind);

try {
  await page.goto(`${BASE}/app?project=${PID}&session=${SID}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(12000);

  // вкладка «Схема»
  const tabBtn = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button"))
      .find((x) => (x.textContent || "").trim() === "Схема");
    if (b) { b.click(); return true; }
    return false;
  });
  log("вкладка «Схема» clicked:", tabBtn);
  await page.waitForTimeout(5000);

  // (1) блок виден; открытие панели — без авто-вызовов
  await page.waitForSelector('[data-testid="schema-assistant-block"]', { timeout: 60000 });
  const block = await page.$('[data-testid="schema-assistant-block"]');
  await block.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "llm3_gate1_block.png"), fullPage: false });
  log("gate1: скрин блока → llm3_gate1_block.png");

  const callsBefore = llmCalls;
  await page.click('[data-testid="schema-assistant-toggle"]');
  await page.waitForSelector('[data-testid="schema-assistant-panel"]', { timeout: 10000 });
  await page.waitForTimeout(3000);
  if (llmCalls !== callsBefore) fail(`открытие панели вызвало ${llmCalls - callsBefore} LLM-запросов — авто-вызов!`);
  log("gate1: открытие панели — 0 LLM-запросов (auto-call free)");
  await page.screenshot({ path: path.join(OUT, "llm3_gate2_panel.png"), fullPage: false });

  // (2) explain/ask disabled без выделенного шага
  const explainDisabled = await page.$eval('[data-testid="schema-assistant-explain"]', (b) => b.disabled);
  const askDisabled = await page.$eval('[data-testid="schema-assistant-ask"]', (b) => b.disabled);
  log("gate2: explain disabled:", explainDisabled, "| ask disabled:", askDisabled);
  if (!explainDisabled || !askDisabled) fail("explain/ask должны быть disabled без выделенного шага");

  // (3) suggest-next по клику
  await page.click('[data-testid="schema-assistant-suggest"]');
  log("gate3: suggest-next запущен (жду LLM)…");
  await settled("suggest");
  await page.waitForTimeout(500);
  const sug1 = await statusLine("suggest");
  log("gate3: suggest, бейдж:", JSON.stringify(sug1));
  await page.screenshot({ path: path.join(OUT, "llm3_gate3_suggest.png"), fullPage: false });

  // повтор → кэш (если первый был ok; если честный статус — фиксируем и идём дальше)
  const sugResult = await page.$('[data-testid="schema-assistant-suggest-result"]');
  if (sugResult) {
    await page.click('[data-testid="schema-assistant-suggest"]');
    await settled("suggest", 60000);
    await page.waitForTimeout(500);
    const sug2 = await statusLine("suggest");
    log("gate3: повтор suggest, бейдж:", JSON.stringify(sug2));
    if (!sug2.includes("из кэша")) fail(`повтор suggest НЕ из кэша: ${sug2}`);
    await page.screenshot({ path: path.join(OUT, "llm3_gate4_suggest_cached.png"), fullPage: false });
  } else {
    log("gate3: suggest → честный статус ошибки (no_provider/rate_limited) — скрин сделан, кэш-проверка пропущена");
  }

  // (4) выделить шаг на канве → explain-step
  const clicked = await page.evaluate((eid) => {
    const el = document.querySelector(`[data-element-id="${eid}"]`);
    const hit = el?.querySelector(".djs-hit, .djs-outline") || el;
    if (!hit) return false;
    hit.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return true;
  }, STEP_ID);
  log("gate4: клик по шагу", STEP_ID, "→", clicked);
  await page.waitForTimeout(1500);
  const explainDisabled2 = await page.$eval('[data-testid="schema-assistant-explain"]', (b) => b.disabled);
  if (explainDisabled2) fail("explain всё ещё disabled после выделения шага");
  await page.click('[data-testid="schema-assistant-explain"]');
  log("gate4: explain-step запущен (жду LLM)…");
  await settled("explain");
  await page.waitForTimeout(500);
  const expState = await page.evaluate(() => {
    const res = document.querySelector('[data-testid="schema-assistant-explain-result"]');
    if (res) return `result: ${(res.querySelector(".muted.small")?.textContent || "").trim()}`;
    const err = Array.from(document.querySelectorAll('[data-testid="schema-assistant-block"] div[style*="b91c1c"]'))
      .map((d) => d.textContent.trim()).join(" | ");
    return `honest-status: ${err}`;
  });
  log("gate4: explain →", expState);
  await page.screenshot({ path: path.join(OUT, "llm3_gate5_explain.png"), fullPage: false });

  // (5) step-qa
  await page.fill('[data-testid="schema-assistant-question"]', "Что делает этот шаг и зачем он нужен?");
  await page.click('[data-testid="schema-assistant-ask"]');
  log("gate5: step-qa запущен (жду LLM)…");
  await settled("qa");
  await page.waitForTimeout(500);
  const qaState = await page.evaluate(() => {
    const res = document.querySelector('[data-testid="schema-assistant-qa-result"]');
    if (res) return `result: ${(res.querySelector(".small:not(.muted)")?.textContent || "").trim().slice(0, 120)}`;
    const err = Array.from(document.querySelectorAll('[data-testid="schema-assistant-block"] div[style*="b91c1c"]'))
      .map((d) => d.textContent.trim()).join(" | ");
    return `honest-status: ${err}`;
  });
  log("gate5: qa →", qaState);
  await page.screenshot({ path: path.join(OUT, "llm3_gate6_qa.png"), fullPage: false });

  log("ALL GATES PASSED");
} catch (e) {
  await page.screenshot({ path: path.join(OUT, "llm3_gate_FAIL.png"), fullPage: false }).catch(() => {});
  console.error("[llm3-gate] FAIL:", e?.message || e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
