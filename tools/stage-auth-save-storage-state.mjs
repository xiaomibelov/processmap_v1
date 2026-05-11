#!/usr/bin/env node
import { createRequire } from "node:module";
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

function requireKeys(env, keys) {
  const missing = keys.filter((key) => !String(env[key] || "").trim());
  if (missing.length) {
    throw new Error(`Missing required env keys in .local/processmap/stage.env: ${missing.join(", ")}`);
  }
}

function resolveStageApiBase(stageUrl) {
  return new URL(stageUrl).origin;
}

async function importPlaywright() {
  const candidates = [
    createRequire(import.meta.url),
    createRequire(path.join(repoRoot, "frontend/package.json")),
  ];
  const errors = [];
  for (const req of candidates) {
    for (const packageName of ["@playwright/test", "playwright"]) {
      try {
        const resolved = req.resolve(packageName);
        return await import(resolved);
      } catch (error) {
        errors.push(`${packageName}: ${error.message}`);
      }
    }
  }
  throw new Error(`Playwright is not installed or not resolvable. Install frontend dependencies first. ${errors[0] || ""}`);
}

async function loginByApi(env) {
  const apiBase = resolveStageApiBase(env.PROCESSMAP_STAGE_URL);
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
  try {
    loginBody = loginText ? JSON.parse(loginText) : {};
  } catch {
    loginBody = {};
  }
  if (!loginRes.ok) {
    throw new Error(`Stage login failed: status=${loginRes.status} endpoint=/api/auth/login`);
  }
  const accessToken = String(loginBody?.access_token || "").trim();
  if (!accessToken) {
    throw new Error("Stage login succeeded but response did not include access_token");
  }

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
  } catch {
    activeOrgId = "";
  }

  return { accessToken, activeOrgId };
}

async function main() {
  const env = readEnvFile(envPath);
  requireKeys(env, [
    "PROCESSMAP_STAGE_URL",
    "PROCESSMAP_STAGE_EMAIL",
    "PROCESSMAP_STAGE_PASSWORD",
  ]);

  const { chromium } = await importPlaywright();
  const { accessToken, activeOrgId } = await loginByApi(env);
  const origin = resolveStageApiBase(env.PROCESSMAP_STAGE_URL);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await page.evaluate(({ token, orgId }) => {
    window.localStorage.setItem("fpc_auth_access_token", token);
    if (orgId) window.localStorage.setItem("fpc_active_org_id", orgId);
  }, { token: accessToken, orgId: activeOrgId });
  await page.goto(env.PROCESSMAP_STAGE_SESSION_URL || origin, { waitUntil: "domcontentloaded" });

  fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });
  await context.storageState({ path: storageStatePath });
  await browser.close();

  console.log(JSON.stringify({
    saved: true,
    storageStatePath: path.relative(repoRoot, storageStatePath),
    stageUrl: origin,
    hasActiveOrgId: Boolean(activeOrgId),
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({
    saved: false,
    error: error.message,
  }));
  process.exit(1);
});
