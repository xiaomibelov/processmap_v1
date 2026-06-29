#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const envPath = path.join(repoRoot, ".local/processmap/stage.env");

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing env file: ${path.relative(repoRoot, filePath)}`);
  }
  const parsed = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

async function importPlaywright() {
  const req = (await import("node:module")).createRequire(path.join(repoRoot, "frontend/package.json"));
  return import(req.resolve("playwright"));
}

async function authenticatePage(page, env) {
  await page.goto(env.PROCESSMAP_STAGE_URL, { waitUntil: "domcontentloaded" });
  const emailInput = page.locator('input[type="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  const loginBtn = page.locator('button:has-text("Войти")').first();
  try {
    await emailInput.waitFor({ state: "visible", timeout: 10000 });
    await emailInput.fill(env.PROCESSMAP_STAGE_EMAIL);
    await passwordInput.fill(env.PROCESSMAP_STAGE_PASSWORD);
    await loginBtn.click();
    await page.waitForURL(/\/app/, { timeout: 30000 });
  } catch {
    // already authenticated
  }
  const orgCard = page.locator('text=Роботизация производств').first();
  if (await orgCard.count() > 0) {
    await orgCard.click();
    await page.waitForLoadState("networkidle");
  }
}

async function measure() {
  const env = readEnvFile(envPath);
  for (const key of ["PROCESSMAP_STAGE_URL", "PROCESSMAP_STAGE_EMAIL", "PROCESSMAP_STAGE_PASSWORD", "PROCESSMAP_STAGE_SESSION_URL"]) {
    if (!String(env[key] || "").trim()) throw new Error(`Missing ${key}`);
  }

  const playwrightMod = await importPlaywright();
  const { chromium } = playwrightMod.default || playwrightMod;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await authenticatePage(page, env);
  await page.goto(env.PROCESSMAP_STAGE_SESSION_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // Debug: dump page state before tab lookup
  await page.screenshot({ path: "/tmp/measure_before_tab.png", fullPage: true });
  fs.writeFileSync("/tmp/measure_before_tab.html", await page.content());

  // Click the interview tab
  const interviewTab = page.locator('[role="tab"]:has-text("Анализ")').first();
  await interviewTab.waitFor({ state: "visible", timeout: 20000 });
  await interviewTab.click();

  // Wait for table body
  const tableSelector = ".interviewTable tbody";
  await page.waitForSelector(tableSelector, { timeout: 20000 });
  await page.waitForTimeout(1500);

  // Static metrics
  const metrics = await page.evaluate(() => ({
    url: window.location.href,
    domElements: document.getElementsByTagName("*").length,
    timelineRows: document.querySelectorAll(".interviewStepRow").length,
    stepCount: document.querySelectorAll("[data-step-id]").length,
  }));

  // Scroll the table while sampling rAF to estimate FPS
  const frameData = await page.evaluate(async () => {
    const wrap = document.querySelector(".interviewTableWrap");
    const times = [];
    const start = performance.now();
    let rafId;
    await new Promise((resolve) => {
      const loop = (t) => {
        times.push(t);
        if (wrap && times.length % 3 === 0) {
          wrap.scrollTop = (Math.sin((t - start) / 400) + 1) * 100;
        }
        if (t - start < 3000) {
          rafId = requestAnimationFrame(loop);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(loop);
    });
    const deltas = [];
    for (let i = 1; i < times.length; i += 1) deltas.push(times[i] - times[i - 1]);
    const avgDelta = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
    const maxDelta = deltas.length ? Math.max(...deltas) : 0;
    const sorted = [...deltas].sort((a, b) => a - b);
    const p95Delta = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const p99Delta = sorted[Math.floor(sorted.length * 0.99)] || 0;
    return {
      estimatedFps: avgDelta > 0 ? Math.round(1000 / avgDelta) : 0,
      avgDelta: Math.round(avgDelta * 100) / 100,
      maxDelta: Math.round(maxDelta * 100) / 100,
      p95Delta: Math.round(p95Delta * 100) / 100,
      p99Delta: Math.round(p99Delta * 100) / 100,
      samples: times.length,
    };
  });

  // Long tasks via PerformanceObserver are only available in the browser during runtime;
  // collect the Long Task API entries if any are buffered.
  const longTasks = await page.evaluate(() => {
    if (typeof performance === "undefined" || !performance.getEntriesByType) return [];
    return performance.getEntriesByType("longtask").map((entry) => ({
      duration: Math.round(entry.duration * 100) / 100,
      startTime: Math.round(entry.startTime * 100) / 100,
    }));
  });

  await browser.close();

  console.log(JSON.stringify({
    stageUrl: env.PROCESSMAP_STAGE_URL,
    sessionUrl: env.PROCESSMAP_STAGE_SESSION_URL,
    ...metrics,
    frameData,
    longTasks,
  }, null, 2));
}

measure().catch((error) => {
  console.error(JSON.stringify({ error: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});
