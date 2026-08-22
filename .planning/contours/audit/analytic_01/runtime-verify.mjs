import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const require = createRequire("/opt/processmap-test/frontend/package.json");
const { chromium } = require("playwright");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseUrl = "http://localhost:5177";
const evidenceDir = path.resolve(__dirname, "evidence");

const surfaces = [
  { name: "analytics", url: "/app?surface=analytics", expectActive: "analytics" },
  { name: "product-actions-registry", url: "/app?surface=product-actions-registry", expectActive: "product-actions-registry" },
  { name: "process-properties-registry", url: "/app?surface=process-properties-registry", expectActive: "process-properties-registry" },
  { name: "dashboards", url: "/app?surface=dashboards", expectActive: "dashboards" },
];

async function run() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const consoleErrors = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push({ url: page.url(), type: msg.type(), text: msg.text() });
    }
  });

  page.on("pageerror", (err) => {
    consoleErrors.push({ url: page.url(), type: "pageerror", text: err.message });
  });

  const results = [];

  for (const surface of surfaces) {
    await page.goto(`${baseUrl}${surface.url}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const screenshotPath = path.join(evidenceDir, `surface-${surface.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    const activeText = await page.evaluate(() => {
      const active = document.querySelector('[data-testid="topbar-analytics-tab"].active, [data-testid="topbar-analytics-tab"][aria-current="page"], .topBarAnalytics.active, .topBarAnalytics[aria-current="true"]');
      return active ? active.textContent?.trim() || active.getAttribute("data-testid") : null;
    });

    results.push({
      surface: surface.name,
      url: page.url(),
      screenshot: screenshotPath,
      activeIndicator: activeText,
      expectActive: surface.expectActive,
    });
  }

  await page.goto(`${baseUrl}/app?surface=analytics`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  const historyTest = [];
  historyTest.push({ step: "start", url: page.url(), hasSurface: page.url().includes("surface=analytics") });

  await page.goto(`${baseUrl}/app?surface=product-actions-registry`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  historyTest.push({ step: "navigate-forward", url: page.url(), hasSurface: page.url().includes("surface=product-actions-registry") });

  await page.goBack({ waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  historyTest.push({ step: "back", url: page.url(), hasSurface: page.url().includes("surface=analytics") });

  await page.goForward({ waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  historyTest.push({ step: "forward", url: page.url(), hasSurface: page.url().includes("surface=product-actions-registry") });

  const backForwardScreenshot = path.join(evidenceDir, "back-forward-final.png");
  await page.screenshot({ path: backForwardScreenshot, fullPage: false });

  await browser.close();

  const report = {
    timestamp: new Date().toISOString(),
    baseUrl,
    consoleErrors,
    surfaceResults: results,
    historyTest,
    backForwardScreenshot,
  };

  fs.writeFileSync(path.join(evidenceDir, "runtime-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
