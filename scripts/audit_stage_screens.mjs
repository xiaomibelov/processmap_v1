// Аудит stage: каждый экран technologist — статус, консоль, скрин. Read-only.
import { createRequire } from "node:module";
const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");
import fs from "node:fs";

const OUT = "/root/pm-e3/app/docs/audit/stage";
fs.mkdirSync(OUT, { recursive: true });
const TOKEN = process.env.STAGE_TOKEN;

const SCREENS = [
  ["app_main", "/app"],
  ["catalog", "/technologist/catalog"],
  ["import", "/technologist/import-bpmn"],
  ["transform", "/technologist/transform"],
  ["constructor", "/technologist/constructor"],
  ["recipes", "/technologist/recipes"],
  ["pilots", "/technologist/pilots"],
  ["audit", "/technologist/audit"],
];

const browser = await chromium.launch();
const report = [];
for (const [name, path] of SCREENS) {
  const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
  const consoleErrors = [];
  const failedReqs = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 200)));
  page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + String(e).slice(0, 200)));
  page.on("response", (r) => { if (r.status() >= 500) failedReqs.push(`${r.status()} ${r.url()}`); });
  await page.addInitScript((t) => window.localStorage.setItem("fpc_auth_access_token", t), TOKEN);
  let status = "ok";
  try {
    await page.goto(`https://stage.processmap.ru${path}`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(2500);
  } catch (e) { status = "NAV-FAIL: " + e.message.slice(0, 120); }
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const title = await page.locator("h1, h2").first().textContent().catch(() => "?");
  report.push({ name, path, status, title: (title || "").trim().slice(0, 60), consoleErrors, failedReqs });
  await page.close();
  console.log(`[${name}] ${status} title="${(title || "").trim().slice(0, 50)}" consoleErr=${consoleErrors.length} failedReq=${failedReqs.length}`);
  failedReqs.forEach((f) => console.log(`   REQ-FAIL: ${f}`));
  consoleErrors.slice(0, 3).forEach((c) => console.log(`   CONSOLE: ${c}`));
}
fs.writeFileSync(`${OUT}/screens_report.json`, JSON.stringify(report, null, 2));
await browser.close();
console.log("done");
