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
const targetTab = String(process.argv[2] || "").trim().toLowerCase();

const tabNames = {
  analysis: ["Анализ процессов", "Analysis"],
  diagram: ["Diagram", "BPMN"],
  xml: ["XML"],
  doc: ["DOC"],
  dod: ["DOD"],
};

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

async function selectOrgIfPrompted(page, orgName) {
  const name = String(orgName || "").trim();
  if (!name) return false;
  const orgLocator = page.getByText(name, { exact: true }).first();
  try {
    await orgLocator.waitFor({ state: "visible", timeout: 2500 });
    await orgLocator.click();
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

async function clickTargetTab(page, tabKey) {
  if (!tabKey) return { requested: "", clicked: false, label: "" };
  const labels = tabNames[tabKey];
  if (!labels) {
    throw new Error(`Unknown tab argument: ${tabKey}. Use analysis|diagram|xml|doc|dod.`);
  }
  for (const label of labels) {
    const locators = [
      page.getByRole("tab", { name: label }).first(),
      page.getByRole("button", { name: label }).first(),
      page.getByText(label, { exact: true }).first(),
    ];
    for (const locator of locators) {
      try {
        await locator.waitFor({ state: "visible", timeout: 2000 });
        await locator.click();
        await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(500);
        return { requested: tabKey, clicked: true, label };
      } catch {
        // Try next locator.
      }
    }
  }
  return { requested: tabKey, clicked: false, label: labels.join("|") };
}

async function collectProof(page, tabProof, consoleErrors) {
  const markers = await page.evaluate(() => {
    const text = document.body?.innerText || "";
    const selectedTabs = Array.from(document.querySelectorAll('[role="tab"][aria-selected="true"]'))
      .map((node) => node.textContent?.trim())
      .filter(Boolean);
    const activeButtons = Array.from(document.querySelectorAll(".active, .is-active, [aria-current='page']"))
      .map((node) => node.textContent?.trim())
      .filter(Boolean)
      .slice(0, 8);
    return {
      selectedTabs,
      activeButtons,
      hasDiagram: text.includes("Diagram"),
      hasAnalysis: text.includes("Анализ процессов") || text.includes("Product Actions"),
      hasXml: text.includes("XML"),
      hasDoc: text.includes("DOC"),
      hasDod: text.includes("DOD"),
    };
  });
  const hasErrorBoundary = await page.locator("text=/error boundary|ошибка приложения|что-то пошло не так/i").count()
    .then((count) => count > 0)
    .catch(() => false);
  return {
    loaded: !hasErrorBoundary,
    url: page.url(),
    hasErrorBoundary,
    activeTabMarkers: markers,
    tabProof,
    consoleErrorCount: consoleErrors.length,
    consoleErrorsBrief: consoleErrors.slice(0, 5).map((line) => String(line || "").slice(0, 300)),
  };
}

async function main() {
  const env = readEnvFile(envPath);
  requireKeys(env, [
    "PROCESSMAP_STAGE_SESSION_URL",
    "PROCESSMAP_STAGE_ORG_NAME",
  ]);
  if (!fs.existsSync(storageStatePath)) {
    throw new Error(`Missing storage state: ${path.relative(repoRoot, storageStatePath)}. Run tools/stage-auth-save-storage-state.mjs first.`);
  }

  const { chromium } = await importPlaywright();
  const consoleErrors = [];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: storageStatePath });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(error.message);
  });

  await page.goto(env.PROCESSMAP_STAGE_SESSION_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await selectOrgIfPrompted(page, env.PROCESSMAP_STAGE_ORG_NAME);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  const tabProof = await clickTargetTab(page, targetTab);
  const proof = await collectProof(page, tabProof, consoleErrors);
  await browser.close();
  console.log(JSON.stringify(proof));
}

main().catch((error) => {
  console.error(JSON.stringify({
    loaded: false,
    error: error.message,
  }));
  process.exit(1);
});
