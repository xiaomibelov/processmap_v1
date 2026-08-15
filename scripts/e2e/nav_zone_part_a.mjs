// Часть А (nav-zone): скриншот-приёмка трёх уровней.
// Проверки: (1) в навигационной зоне только кнопка «назад» + строка пути;
// (2) позиция кнопки пиксель-в-пиксель одинакова; (3) крошки 12–13px,
// отступ под кнопкой 4–6px; (4) статус-бейдж рядом с H1, не в строке пути.
import { chromium } from "playwright-core";
import fs from "node:fs";

const BASE_URL = process.env.TEST_BASE_URL || "http://127.0.0.1:5199";
const EMAIL = process.env.TEST_EMAIL || "admin@local";
const PASSWORD = process.env.TEST_PASSWORD || "admin";
const PROJECT_ID = process.env.TEST_PROJECT_ID || "0715811eb7";
const OUT_DIR = process.env.OUT_DIR || new URL("./nav_zone_part_a/", import.meta.url).pathname;

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
      return {
        back: { x: b.x, y: b.y, w: b.width, h: b.height },
        crumbs: { x: c.x, y: c.y },
        gap: c.y - (b.y + b.height),
        crumbFontSize: parseFloat(crumbsStyle.fontSize),
        hasLinks: !!firstLink,
        currentIsText: current ? current.tagName === "SPAN" : null,
        // в зоне крошек не должно быть чипов/пилюль
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
  const box = await (await crumbs.boundingBox()) || {};
  const backBox = (await back.boundingBox()) || { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.max(0, Math.min(backBox.x, box.x ?? backBox.x) - 8);
  const y = Math.max(0, backBox.y - 8);
  const width = 760;
  const height = (box.y ?? 0) + (box.height ?? 0) + 96 - y;
  await page.screenshot({ path: `${OUT_DIR}${name}.png`, clip: { x, y, width, height } });
  return navZoneMetrics(page, backTestId, crumbsTestId);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 5200 } });

  // login
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]', { timeout: 15000 });
  await page.waitForURL(/\/app/, { timeout: 20000 });
  await page.waitForTimeout(2500);
  // экран выбора организации: кликаем Default (высокий вьюпорт — карточки в зоне видимости)
  try {
    await page.locator('button:has-text("Default")').first().click({ timeout: 6000 });
    await page.waitForTimeout(2500);
  } catch { /* org уже выбрана */ }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/app`);
  await page.waitForTimeout(2000);
  // ── Уровень 1: раздел (входим в первый раздел explorer) ──
  await page.waitForSelector('[data-testid="explorer-breadcrumbs"]', { timeout: 20000 });
  await page.waitForTimeout(800);
  const folderRow = page.locator('table tbody tr:has-text("РАЗДЕЛ")').first();
  await folderRow.locator("td").first().click();
  await page.waitForSelector('[data-testid="explorer-back-sections"]', { timeout: 15000 });
  await page.waitForTimeout(500);
  const m1 = await shot(page, "level1_section", "explorer-back-sections", "explorer-breadcrumbs");

  // ── Уровень 2: проект (переход из раздела — полный трейл крошек) ──
  const projectLink = page.locator('tr:has-text("ПРОЕКТ") a', { hasText: /Открыть проект|Открыть/ }).first();
  await projectLink.waitFor({ state: "visible", timeout: 15000 });
  await projectLink.click();
  await page.waitForSelector('[data-testid="project-back-section"]', { timeout: 20000 });
  await page.waitForTimeout(800);
  const m2 = await shot(page, "level2_project", "project-back-section", "project-breadcrumbs");

  // ── Уровень 3: сессия (первая сессия проекта) ──
  const sessionLink = page.locator('a[href*="session="], [data-testid*="session"] a').first();
  await sessionLink.waitFor({ state: "visible", timeout: 15000 });
  await sessionLink.click();
  await page.waitForSelector('[data-testid="session-nav-strip"]', { timeout: 30000 });
  await page.waitForTimeout(1500);
  const m3 = await shot(page, "level3_session", "topbar-back-projects", "topbar-breadcrumbs");

  // ── Сводные проверки ──
  for (const [label, m] of [["section", m1], ["project", m2], ["session", m3]]) {
    if (m.error) { check(`${label}: элементы навигационной зоны`, false, m.error); continue; }
    check(`${label}: крошки 12–13px`, m.crumbFontSize >= 12 && m.crumbFontSize <= 13, `fontSize=${m.crumbFontSize}`);
    check(`${label}: отступ кнопка→крошки 4–6px`, m.gap >= 3.5 && m.gap <= 6.5, `gap=${m.gap.toFixed(1)}`);
    check(`${label}: без чипов в строке пути`, m.chipsInCrumbs === 0, `chips=${m.chipsInCrumbs}`);
    check(`${label}: текущий сегмент — текст`, m.currentIsText === true);
  }
  if (!m1.error && !m2.error && !m3.error) {
    const sameXY = Math.abs(m1.back.x - m2.back.x) < 1 && Math.abs(m1.back.y - m2.back.y) < 1
      && Math.abs(m2.back.x - m3.back.x) < 1 && Math.abs(m2.back.y - m3.back.y) < 1;
    check("кнопка «назад» пиксель-в-пиксель на всех уровнях", sameXY,
      `s=(${m1.back.x},${m1.back.y}) p=(${m2.back.x},${m2.back.y}) sess=(${m3.back.x},${m3.back.y})`);
  }

  // статус-бейдж рядом с H1 на странице сессии (не в строке пути)
  const statusBox = await page.locator('[data-testid="topbar-session-status"]').boundingBox();
  const titleBox = await page.locator('[data-testid="session-nav-title"]').boundingBox();
  const crumbsBox = await page.locator('[data-testid="topbar-breadcrumbs"]').boundingBox();
  check(
    "сессия: статус-бейдж рядом с H1, не в строке пути",
    !!statusBox && !!titleBox && !!crumbsBox
      && Math.abs(statusBox.y - titleBox.y) < 8
      && Math.abs(statusBox.y - crumbsBox.y) > 8,
    statusBox ? `status.y=${statusBox.y} h1.y=${titleBox?.y} crumbs.y=${crumbsBox?.y}` : "status missing",
  );

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n== ${results.length - failed}/${results.length} проверок зелёные, скрины в ${OUT_DIR}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(2);
});
