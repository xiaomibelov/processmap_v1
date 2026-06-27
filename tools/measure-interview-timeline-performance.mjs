#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const envPath = path.join(repoRoot, ".local/processmap/stage.env");
const storageStatePath = path.join(repoRoot, ".local/processmap/playwright/stage-admin-storage-state.json");

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

async function loginByApi(env) {
  const apiBase = new URL(env.PROCESSMAP_STAGE_URL).origin;
  const loginRes = await fetch(`${apiBase}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: env.PROCESSMAP_STAGE_EMAIL,
      password: env.PROCESSMAP_STAGE_PASSWORD,
    }),
  });
  const loginText = await loginRes.text();
  let loginBody = {};
  try { loginBody = loginText ? JSON.parse(loginText) : {}; } catch {}
  if (!loginRes.ok) {
    throw new Error(`Stage login failed: status=${loginRes.status}`);
  }
  const accessToken = String(loginBody?.access_token || "").trim();
  if (!accessToken) throw new Error("No access_token in login response");

  let activeOrgId = "";
  try {
    const meRes = await fetch(`${apiBase}/api/auth/me`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (meRes.ok) {
      const meBody = await meRes.json();
      const user = meBody?.user && typeof meBody.user === "object" ? meBody.user : {};
      activeOrgId = String(user.active_org_id || user.default_org_id || "").trim();
    }
  } catch {}
  return { accessToken, activeOrgId, origin: apiBase };
}

async function ensureAuthenticatedContext(context, env) {
  const { accessToken, activeOrgId, origin } = await loginByApi(env);
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await page.evaluate(({ token, orgId }) => {
    window.localStorage.setItem("fpc_auth_access_token", token);
    if (orgId) window.localStorage.setItem("fpc_active_org_id", orgId);
  }, { token: accessToken, orgId: activeOrgId });
  await page.close();
}

async function measure() {
  const env = readEnvFile(envPath);
  for (const key of ["PROCESSMAP_STAGE_URL", "PROCESSMAP_STAGE_EMAIL", "PROCESSMAP_STAGE_PASSWORD", "PROCESSMAP_STAGE_SESSION_URL"]) {
    if (!String(env[key] || "").trim()) throw new Error(`Missing ${key}`);
  }

  const { chromium } = await importPlaywright();
  const browser = await chromium.launch({ headless: true });
  const contextOptions = {};
  if (fs.existsSync(storageStatePath)) {
    contextOptions.storageState = storageStatePath;
  }
  const context = await browser.newContext(contextOptions);
  if (!contextOptions.storageState) {
    await ensureAuthenticatedContext(context, env);
  }

  const page = await context.newPage();
  await page.goto(env.PROCESSMAP_STAGE_SESSION_URL, { waitUntil: "networkidle" });

  // Wait for the interview tab button and click it.
  const interviewTabSelector = '[data-testid="process-stage-tab-interview"], button:has-text("Анализ процессов"), button:has-text("Интервью")';
  await page.waitForSelector(interviewTabSelector, { timeout: 20000 });
  await page.click(interviewTabSelector);

  // Wait for the timeline table body.
  const tableSelector = ".interviewTable tbody";
  await page.waitForSelector(tableSelector, { timeout: 20000 });
  await page.waitForTimeout(1500);

  // Collect static metrics.
  const metrics = await page.evaluate(() => ({
    url: window.location.href,
    domElements: document.getElementsByTagName("*").length,
    timelineRows: document.querySelectorAll(".interviewStepRow").length,
    stepCount: document.querySelectorAll("[data-step-id]").length,
    userAgent: navigator.userAgent,
  }));

  // Capture frame times while scrolling the table for ~3 seconds.
  const frameData = await page.evaluate(async () => {
    const times = [];
    let rafId;
    const start = performance.now();
    await new Promise((resolve) => {
      const loop = (t) => {
        times.push(t);
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
    const p95Delta = deltas.length ? [...deltas].sort((a, b) => a - b)[Math.floor(deltas.length * 0.95)] : 0;
    const estimatedFps = avgDelta > 0 ? Math.round(1000 / avgDelta) : 0;
    return { estimatedFps, avgDelta: Math.round(avgDelta * 100) / 100, maxDelta: Math.round(maxDelta * 100) / 100, p95Delta: Math.round(p95Delta * 100) / 100, samples: times.length };
  });

  await browser.close();

  console.log(JSON.stringify({
    stageUrl: env.PROCESSMAP_STAGE_URL,
    sessionUrl: env.PROCESSMAP_STAGE_SESSION_URL,
    ...metrics,
    frameData,
  }, null, 2));
}

measure().catch((error) => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exit(1);
});
