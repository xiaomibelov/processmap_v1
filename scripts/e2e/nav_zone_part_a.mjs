// Часть А (nav-zone, ревизия #730): однострочная навигационная зона.
// Приёмка на 4 ширинах × 3 уровня. Проверяем:
//  1) кнопка «назад» и крошки лежат на одной baseline (общий top y);
//  2) крошки 12–13px, внутри них нет чипов/пилюль;
//  3) статус-бейдж (если есть) не внутри строки крошек;
//  4) скриншоты всех уровней/ширин.
import { chromium } from "playwright-core";
import fs from "node:fs";

const BASE_URL = process.env.TEST_BASE_URL || "http://127.0.0.1:5311";
const EMAIL = process.env.TEST_EMAIL || "admin@local";
const PASSWORD = process.env.TEST_PASSWORD || "admin";
const PROJECT_ID = process.env.TEST_PROJECT_ID || "0715811eb7";
const OUT_DIR = process.env.OUT_DIR || new URL("./nav_zone_part_a/", import.meta.url).pathname;
const VIEWPORTS = [1440, 1100, 880, 640];

const results = [];
function check(name, ok, details = "") {
  results.push({ name, ok, details });
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${details ? ` — ${details}` : ""}`);
}

async function navZoneMetrics(page, backTestId, crumbsTestId) {
  return await page.evaluate(
    ({ backTestId, crumbsTestId }) => {
      const back = document.querySelector(`[data-testid="${backTestId}"]`);
      const crumbs = document.querySelector(`[data-testid="${crumbsTestId}"]`);
      if (!back || !crumbs) return { error: `missing: back=${!!back} crumbs=${!!crumbs}` };
      const b = back.getBoundingClientRect();
      const c = crumbs.getBoundingClientRect();
      const firstLink = crumbs.querySelector("button");
      const current = crumbs.querySelector("[data-current='true']");
      const crumbsStyle = getComputedStyle(crumbs);
      // родительский контейнер полосы — ближайший .nav-zone
      const navZone = crumbs.closest(".nav-zone");
      const navZoneWidth = navZone ? navZone.getBoundingClientRect().width : c.width;
      return {
        back: { x: b.x, y: b.y, w: b.width, h: b.height },
        crumbs: { x: c.x, y: c.y, w: c.width, h: c.height },
        navZoneWidth,
        baselineDiff: Math.abs(c.y - b.y),
        crumbFontSize: parseFloat(crumbsStyle.fontSize),
        hasLinks: !!firstLink,
        currentIsText: current ? current.tagName === "SPAN" : null,
        currentIsBold: current ? getComputedStyle(current).fontWeight >= 600 : null,
        chipsInCrumbs: crumbs.querySelectorAll(".rounded-full, [class*='border'][class*='rounded']").length,
      };
    },
    { backTestId, crumbsTestId },
  );
}

async function shot(page, name, backTestId, crumbsTestId) {
  const back = page.locator(`[data-testid="${backTestId}"]`);
  const crumbs = page.locator(`[data-testid="${crumbsTestId}"]`);
  await crumbs.waitFor({ state: "visible", timeout: 20000 });
  const box = (await crumbs.boundingBox()) || { x: 0, y: 0, width: 0, height: 0 };
  const backBox = (await back.boundingBox()) || { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.max(0, Math.min(backBox.x, box.x) - 8);
  const y = Math.max(0, backBox.y - 8);
  const width = Math.min(1440, Math.max(760, box.x + box.width + 16));
  const height = (box.y + box.height + 96) - y;
  await page.screenshot({ path: `${OUT_DIR}${name}.png`, clip: { x, y, width, height } });
  return navZoneMetrics(page, backTestId, crumbsTestId);
}

async function openSection(page) {
  console.log("DEBUG: openSection goto /app");
  await page.goto(`${BASE_URL}/app`, { timeout: 60000, waitUntil: "domcontentloaded" });
  console.log("DEBUG: openSection wait for explorer-breadcrumbs");
  await page.waitForTimeout(2000);
  await page.waitForSelector('[data-testid="explorer-breadcrumbs"]', { timeout: 20000 });
  await page.waitForTimeout(800);
  console.log("DEBUG: openSection click folder row");
  const folderRow = page.locator('table tbody tr:has-text("РАЗДЕЛ")').first();
  await folderRow.locator("td").first().click();
  await page.waitForSelector('[data-testid="explorer-back-sections"]', { timeout: 15000 });
  await page.waitForTimeout(500);
  console.log("DEBUG: openSection done");
}

async function openProject(page) {
  const projectLink = page.locator('tr:has-text("ПРОЕКТ") a', { hasText: /Открыть проект|Открыть/ }).first();
  await projectLink.waitFor({ state: "visible", timeout: 15000 });
  await projectLink.click();
  await page.waitForSelector('[data-testid="project-back-section"]', { timeout: 20000 });
  await page.waitForTimeout(800);
}

async function openSession(page, width) {
  // Нажимаем явную CTA-кнопку «Открыть сессию» в строке (secondaryBtn в
  // последней колонке): она стабильнее, чем клик по обёрнутой marquee ссылке
  // или по ancestor-tr на узких ширинах.
  const openBtn = page.locator('a.secondaryBtn[href*="session="]').first();
  await openBtn.waitFor({ state: "visible", timeout: 20000 });
  await openBtn.click();
  try {
    await page.waitForSelector('[data-testid="session-nav-strip"]', { timeout: 30000 });
  } catch (err) {
    const url = page.url();
    console.log(`DEBUG openSession@${width}: url=${url}`);
    await page.screenshot({ path: `${OUT_DIR}debug_session_${width}.png`, fullPage: true });
    throw err;
  }
  await page.waitForTimeout(1500);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (msg) => console.log(`[console ${msg.type()}]`, msg.text()));
  page.on("pageerror", (err) => console.log(`[pageerror]`, err.message));

  // login
  console.log("DEBUG: goto login");
  await page.goto(`${BASE_URL}/login`, { timeout: 30000, waitUntil: "domcontentloaded" });
  console.log("DEBUG: login page loaded");
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]', { timeout: 15000 });
  await page.waitForURL(/\/app/, { timeout: 20000 });
  await page.waitForTimeout(2500);
  try {
    await page.locator('button:has-text("Default")').first().click({ timeout: 6000 });
    await page.waitForTimeout(2500);
  } catch { /* org уже выбрана */ }

  for (const width of VIEWPORTS) {
    console.log(`\n-- viewport ${width}px --`);
    console.log("DEBUG: setViewportSize");
    await page.setViewportSize({ width, height: 900 });
    console.log("DEBUG: openSection start");

    // Уровень 1: раздел
    await openSection(page);
    const m1 = await shot(page, `section_${width}`, "explorer-back-sections", "explorer-breadcrumbs");

    // Уровень 2: проект
    await openProject(page);
    const m2 = await shot(page, `project_${width}`, "project-back-section", "project-breadcrumbs");

    // Уровень 3: сессия
    await openSession(page, width);
    const m3 = await shot(page, `session_${width}`, "topbar-back-projects", "topbar-breadcrumbs");

    for (const [label, m] of [["section", m1], ["project", m2], ["session", m3]]) {
      if (m.error) {
        check(`${label}@${width}: элементы навигационной зоны`, false, m.error);
        continue;
      }
      check(`${label}@${width}: крошки 12–13px`, m.crumbFontSize >= 12 && m.crumbFontSize <= 13, `fontSize=${m.crumbFontSize}`);
      check(`${label}@${width}: back и crumbs на одной baseline`, m.baselineDiff < 1.5, `diff=${m.baselineDiff.toFixed(1)}`);
      check(`${label}@${width}: без чипов в строке пути`, m.chipsInCrumbs === 0, `chips=${m.chipsInCrumbs}`);
      check(`${label}@${width}: текущий сегмент — текст`, m.currentIsText === true);
      check(`${label}@${width}: текущий сегмент полужирный`, m.currentIsBold === true);
    }

    // статус-бейдж рядом с текущим сегментом, не внутри крошек (проверяем на сессии)
    const statusBox = await page.locator('[data-testid="topbar-session-status"]').boundingBox();
    const crumbsBox = await page.locator('[data-testid="topbar-breadcrumbs"]').boundingBox();
    check(
      `session@${width}: статус-бейдж рядом со строкой, не внутри крошек`,
      !!statusBox && !!crumbsBox
        && Math.abs(statusBox.y - crumbsBox.y) < 8
        && statusBox.x >= crumbsBox.x + crumbsBox.width - 2,
      statusBox ? `status=(${statusBox.x},${statusBox.y}) crumbs=(${crumbsBox?.x},${crumbsBox?.y},w=${crumbsBox?.width})` : "status missing",
    );

    // на ширине < 1100 (контейнер) мета должна скрыться; < 760 — кнопка иконкой
    const backBox = await page.locator('[data-testid="topbar-back-projects"]').boundingBox();
    check(
      `session@${width}: кнопка иконкой при container < 760px`,
      width < 760 ? (backBox ? backBox.width <= 44 : false) : true,
      backBox ? `back.w=${backBox.width}` : "missing",
    );
  }

  await browser.close();

  const report = {
    baseUrl: BASE_URL,
    viewports: VIEWPORTS,
    outDir: OUT_DIR,
    results,
    summary: { total: results.length, failed: results.filter((r) => !r.ok).length },
  };
  fs.writeFileSync(`${OUT_DIR}report.json`, JSON.stringify(report, null, 2));

  console.log(`\n== ${report.summary.total - report.summary.failed}/${report.summary.total} проверок зелёные, скрины в ${OUT_DIR}`);
  process.exit(report.summary.failed ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(2);
});
