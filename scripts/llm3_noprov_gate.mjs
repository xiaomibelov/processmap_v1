// LLM3 no_provider-негатив: провайдер выключен → explain-step по НЕкэшированному
// шагу (Activity_171znbt) → панель показывает честный статус (не 500, не зависание).
// Скрин → docs/llm/gate/llm3_gate7_no_provider.png
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");

const ROOT = "/root/processmap_v1_worktrees/feat-llm3-schema-assistant";
const BASE = process.env.E2E_BASE || "https://stage.processmap.ru";
const OUT = path.join(ROOT, "docs", "llm", "gate");
const PID = "c0494e0667";
const SID = "13f1f10b20";
const STEP = "Activity_171znbt"; // не вызывался — кэша нет

fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[llm3-noprov]", ...a);

const res = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "d.belov@automacon.ru", password: "Beelive12!" }),
});
const TOKEN = (await res.json()).access_token;

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1680, height: 1000 } })).newPage();
await page.addInitScript((t) => {
  window.localStorage.setItem("fpc_auth_access_token", t);
  window.localStorage.setItem("fpc_active_org_id", "org_default");
  window.sessionStorage.setItem("fpc_org_choice_done:389893aa9e1e4823aa9b0f4498817655", "1");
}, TOKEN);

let http500 = 0;
page.on("response", (r) => { if (r.status() >= 500 && r.url().includes("/llm/")) http500 += 1; });

try {
  await page.goto(`${BASE}/app?project=${PID}&session=${SID}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(12000);
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) => (x.textContent || "").trim() === "Схема");
    b?.click();
  });
  await page.waitForTimeout(5000);
  await page.waitForSelector('[data-testid="schema-assistant-block"]', { timeout: 60000 });
  await page.click('[data-testid="schema-assistant-toggle"]');
  await page.waitForSelector('[data-testid="schema-assistant-panel"]', { timeout: 10000 });

  await page.evaluate((eid) => {
    const el = document.querySelector(`[data-element-id="${eid}"]`);
    const hit = el?.querySelector(".djs-hit, .djs-outline") || el;
    hit?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  }, STEP);
  await page.waitForTimeout(1500);

  await page.click('[data-testid="schema-assistant-explain"]');
  log("explain-step запущен при выключенном провайдере…");
  // ждём честную строку ошибки (красный текст), НЕ 500/зависание
  await page.waitForFunction(() => {
    const els = Array.from(document.querySelectorAll('[data-testid="schema-assistant-block"] div'));
    return els.some((d) => /rgb\(185, 28, 28\)/.test(d.style.color || "") || (d.style.color || "").includes("b91c1c"));
  }, { timeout: 60000 });
  const errText = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="schema-assistant-block"] div'))
      .filter((d) => /rgb\(185, 28, 28\)/.test(d.style.color || "") || (d.style.color || "").includes("b91c1c"))
      .map((d) => d.textContent.trim()).join(" | "));
  log("честный статус в UI:", JSON.stringify(errText));
  if (!/провайдер не настроен|no enabled LLM providers/i.test(errText))
    throw new Error(`ожидал no_provider-текст (RU-friendly или raw), получил: ${errText}`);
  if (http500 > 0) throw new Error(`было ${http500} ответов 5xx на /llm/ — недопустимо`);
  await page.screenshot({ path: path.join(OUT, "llm3_gate7_no_provider.png"), fullPage: false });
  log("скрин → llm3_gate7_no_provider.png; 5xx =", http500);
  log("NO_PROVIDER GATE PASSED");
} catch (e) {
  await page.screenshot({ path: path.join(OUT, "llm3_gate7_FAIL.png"), fullPage: false }).catch(() => {});
  console.error("[llm3-noprov] FAIL:", e?.message || e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
