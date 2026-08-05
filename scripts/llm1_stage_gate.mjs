// LLM1 gate (stage): (2) скрин кнопки во вкладке «Анализ процессов»;
// (3) живой прогон анализа + повтор → cached=true (0 токенов — проверяется
// отдельно через /api/admin/llm/usage); (4) force с inline-confirm.
// Артефакты → docs/llm/gate/llm1_*.png. EXIT=0 при успехе всех шагов.
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
const log = (...a) => console.log("[llm1-gate]", ...a);
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

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
const page = await context.newPage();
await page.addInitScript((t) => {
  window.localStorage.setItem("fpc_auth_access_token", t);
  window.localStorage.setItem("fpc_active_org_id", "org_default");
  window.sessionStorage.setItem("fpc_org_choice_done:389893aa9e1e4823aa9b0f4498817655", "1");
}, TOKEN);

async function waitBlockSettled(timeoutMs = 90000) {
  // результат, ошибка или partial — любое конечное состояние после клика
  await page.waitForSelector(
    '[data-testid="llm-analysis-result"], [data-testid="llm-analysis-error"]',
    { timeout: timeoutMs },
  );
}

try {
  await page.goto(`${BASE}/app?project=${PID}&session=${SID}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(12000);

  // вкладка «Анализ процессов» (interview — дефолт; клик на всякий случай, если таб виден)
  const tabBtn = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button"))
      .find((x) => (x.textContent || "").includes("Анализ процессов"));
    if (b) { b.click(); return true; }
    return false;
  });
  log("tab «Анализ процессов» clicked:", tabBtn);
  await page.waitForTimeout(3000);

  // (2) скрин кнопки
  await page.waitForSelector('[data-testid="llm-analysis-block"]', { timeout: 30000 });
  const block = await page.$('[data-testid="llm-analysis-block"]');
  await block.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "llm1_gate2_button.png"), fullPage: false });
  log("gate2: скрин кнопки → llm1_gate2_button.png");

  // (3a) первый живой прогон
  await page.click('[data-testid="llm-analysis-run"]');
  log("gate3: первый прогон запущен (жду LLM)…");
  await waitBlockSettled(120000);
  await page.waitForTimeout(500);
  const firstErr = await page.$('[data-testid="llm-analysis-error"]');
  if (firstErr) {
    const txt = await firstErr.textContent();
    await page.screenshot({ path: path.join(OUT, "llm1_gate3_error.png") });
    fail(`первый прогон → ошибка: ${txt}`);
  }
  const firstInfo = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="llm-analysis-result"] .muted.small');
    return (el?.textContent || "").trim();
  });
  log("gate3: первый прогон ok, бейдж:", JSON.stringify(firstInfo));
  if (firstInfo.includes("из кэша")) log("gate3: первый прогон уже из кэша (ранний прогон кем-то сделан) — допустимо");
  await page.screenshot({ path: path.join(OUT, "llm1_gate3_first.png"), fullPage: false });

  // (3b) повтор → cached (0 токенов)
  await page.click('[data-testid="llm-analysis-run"]');
  log("gate3: повторный прогон (ожидаю кэш)…");
  await waitBlockSettled(60000);
  await page.waitForTimeout(500);
  const secondInfo = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="llm-analysis-result"] .muted.small');
    return (el?.textContent || "").trim();
  });
  log("gate3: повтор, бейдж:", JSON.stringify(secondInfo));
  if (!secondInfo.includes("из кэша")) fail(`повтор НЕ из кэша: ${secondInfo}`);
  await page.screenshot({ path: path.join(OUT, "llm1_gate3_cached.png"), fullPage: false });

  // (4) force с inline-confirm
  await page.click('[data-testid="llm-analysis-refresh"]');
  await page.waitForSelector('[data-testid="llm-analysis-confirm"]', { timeout: 10000 });
  await page.screenshot({ path: path.join(OUT, "llm1_gate4_confirm.png"), fullPage: false });
  log("gate4: inline-confirm показан → llm1_gate4_confirm.png");
  await page.evaluate(() => {
    const row = document.querySelector('[data-testid="llm-analysis-confirm"]');
    const yes = Array.from(row.querySelectorAll("button")).find((b) => (b.textContent || "").includes("Да, обновить"));
    yes?.click();
  });
  log("gate4: force-прогон (жду LLM)…");
  // force → результат перерендерится; ждём исчезновения confirm и появления свежего результата
  await page.waitForSelector('[data-testid="llm-analysis-confirm"]', { state: "detached", timeout: 10000 });
  await page.waitForSelector('[data-testid="llm-analysis-result"]', { timeout: 120000 });
  await page.waitForTimeout(500);
  const forceInfo = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="llm-analysis-result"] .muted.small');
    return (el?.textContent || "").trim();
  });
  log("gate4: force-прогон ok, бейдж:", JSON.stringify(forceInfo));
  if (forceInfo.includes("из кэша")) fail("force-прогон вернул кэш — обход не сработал");
  await page.screenshot({ path: path.join(OUT, "llm1_gate4_forced.png"), fullPage: false });

  log("ВСЕ ШАГИ GATE OK");
} finally {
  await browser.close();
}
