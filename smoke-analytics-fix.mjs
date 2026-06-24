import { chromium } from "playwright";
import { execSync } from "node:child_process";
import fs from "fs";

const base = process.env.SMOKE_BASE_URL || "http://clearvestnic.ru:5177";
const workspace = "ws_org_default_main";
const project = "b1c8a56b6e";
const session = "03db107ebb";
const user = "0217a3f745ae4bb6b72a336dd356f0d8";
const outDir = "/root/processmap_v1/smoke-screenshots-fix";
fs.mkdirSync(outDir, { recursive: true });

function getToken() {
  const script = `from app.auth import create_access_token\nprint(create_access_token("${user}"))\n`;
  const local = `/tmp/smoke_token_${Date.now()}.py`;
  const container = `/tmp/smoke_token.py`;
  fs.writeFileSync(local, script);
  execSync(`docker cp ${local} processmap_v1-api-1:${container}`);
  const out = execSync(
    `docker exec processmap_v1-api-1 bash -c "cd /app/backend && PYTHONPATH=/app/backend python -u ${container}"`,
    { encoding: "utf8" }
  );
  return out.trim().split("\n").pop().trim();
}

async function timeApi(url, token) {
  const start = performance.now();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  const ms = performance.now() - start;
  return { ms, status: res.status, len: text.length };
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => { errors.push(`pageerror: ${e.message}`); console.log("PAGEERROR", e.message); });
page.on("console", (msg) => {
  const text = msg.text();
  if (/error|fail|cannot|undefined|TypeError|white/i.test(text)) {
    errors.push(`console: ${text}`);
    console.log("CONSOLE", msg.type(), text);
  }
});
page.on("response", (res) => {
  if (res.status() >= 400 && res.url().includes("/api/analytics/")) {
    console.log("API ERROR", res.status(), res.url());
  }
});

const token = getToken();
await ctx.addInitScript((t) => {
  localStorage.setItem("fpc_auth_access_token", t.token);
  localStorage.setItem("fpc_active_org_id", "org_default");
  try { sessionStorage.setItem(`fpc_org_choice_done:${t.uid}`, "1"); } catch {}
}, { token, uid: user });

await page.goto(`${base}/analytics/session/${session}/properties`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
const defaultOrg = page.locator('button:has-text("Default")').first();
if (await defaultOrg.isVisible().catch(() => false)) await defaultOrg.click();
await page.waitForTimeout(2000);

async function countRows() { return await page.locator('[data-testid^="property-row-"]').count(); }
async function clickTab(tab) {
  const btn = page.locator(`button:has-text("${tab}")`).first();
  if (await btn.isVisible().catch(() => false)) await btn.click();
  await page.waitForTimeout(1500);
}

console.log("initial rows:", await countRows());
await page.screenshot({ path: `${outDir}/01-initial.png`, fullPage: true });

const tabs = ["Обзор", "Действия", "Свойства", "Дашборды"];
for (let i = 0; i < 10; i++) {
  for (const tab of tabs) await clickTab(tab);
}
await clickTab("Свойства");
console.log("rows after 10 cycles:", await countRows());
await page.screenshot({ path: `${outDir}/02-after-10-cycles.png`, fullPage: true });

// Scroll table
for (let i = 0; i < 5; i++) {
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(300);
}
await clickTab("Действия");
await clickTab("Свойства");
console.log("rows after scroll:", await countRows());
await page.screenshot({ path: `${outDir}/03-after-scroll.png`, fullPage: true });

// Click Excel on properties
await clickTab("Свойства");
const excelBtn = page.locator('button:has-text("Excel всех")').first();
if (await excelBtn.isVisible().catch(() => false)) {
  const [download] = await Promise.all([page.waitForEvent("download"), excelBtn.click()]);
  const path = `${outDir}/properties.xlsx`;
  await download.saveAs(path);
  console.log("downloaded", path, fs.statSync(path).size, "bytes");
}

await browser.close();

// Backend cache timing
const url = `${base}/api/analytics/dashboard?scope=session&scope_id=${session}`;
const first = await timeApi(url, token);
const second = await timeApi(url, token);
console.log("\nAPI timing:", { first: `${first.ms.toFixed(1)}ms`, second: `${second.ms.toFixed(1)}ms`, status: first.status });

console.log("\nerrors:", errors.length ? errors : "none");
if (errors.length) process.exit(1);
console.log("SMOKE OK");
