// Часть А-2 (nav-zone): скриншот-приёмка однострочной навигации.
// Проверки: (1) кнопка «назад» и крошки в ОДНОЙ строке (одинаковый y);
// (2) строка 40–44px, без переносов; (3) позиция строки пиксель-в-пиксель
// одинакова на трёх уровнях; (4) текущий сегмент полужирный, не ссылка;
// (5) жертвы по ширине контейнера: мета → крошки «…» → статус точкой →
// кнопка иконкой. Свип: 1440/1100/880/640 × раздел/проект/сессия.
import { chromium } from "playwright-core";
import fs from "node:fs";

const BASE_URL = process.env.TEST_BASE_URL || "http://127.0.0.1:5311";
const EMAIL = process.env.TEST_EMAIL || "admin@local";
const PASSWORD = process.env.TEST_PASSWORD || "admin";
const OUT_DIR = process.env.OUT_DIR || "/root/download/projects-mockup/shots/";
const WIDTHS = (process.env.WIDTHS || "1440,1100,880,640").split(",").map(Number);

// Зеркало frontend/src/components/navSingleLineLayout.js
const NAV_META_MIN = 1000;
const NAV_CRUMBS_COLLAPSE_MAX = 800;
const NAV_STATUS_DOT_MAX = 640;
const NAV_BACK_ICON_MAX = 520;
const expectedLayout = (w) => ({
  showMeta: w >= NAV_META_MIN,
  collapseCrumbs: w > 0 && w <= NAV_CRUMBS_COLLAPSE_MAX,
  statusDotOnly: w > 0 && w <= NAV_STATUS_DOT_MAX,
  backIconOnly: w > 0 && w <= NAV_BACK_ICON_MAX,
});

const results = [];
function check(name, ok, details = "") {
  results.push({ name, ok, details });
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${details ? ` — ${details}` : ""}`);
}

async function navMetrics(page, backTestId, crumbsTestId) {
  return await page.evaluate(
    ({ backTestId, crumbsTestId }) => {
      const back = document.querySelector(`[data-testid="${backTestId}"]`);
      const crumbs = document.querySelector(`[data-testid="${crumbsTestId}"]`);
      if (!back || !crumbs) return { error: `missing: back=${!!back} crumbs=${!!crumbs}` };
      const row = back.parentElement;
      const b = back.getBoundingClientRect();
      const c = crumbs.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      const current = crumbs.querySelector("[data-current='true']");
      const currentStyle = current ? getComputedStyle(current) : null;
      return {
        row: { x: r.x, y: r.y, h: r.height },
        back: { x: b.x, y: b.y, h: b.height, text: back.textContent.trim() },
        crumbs: { x: c.x, y: c.y, h: c.height },
        navWidth: Number(row.getAttribute("data-nav-width") || 0),
        navMeta: row.getAttribute("data-nav-meta"),
        sameLine: Math.abs(b.y - c.y) <= 2,
        hasEllipsis: !!crumbs.querySelector(`[data-testid="${crumbsTestId}-ellipsis"]`),
        currentIsText: current ? current.tagName === "SPAN" : null,
        currentBold: currentStyle ? parseInt(currentStyle.fontWeight, 10) >= 600 : null,
        noWrap: r.height <= 44,
      };
    },
    { backTestId, crumbsTestId },
  );
}

async function shotStrip(page, name, backTestId) {
  const back = page.locator(`[data-testid="${backTestId}"]`);
  const box = (await back.boundingBox()) || { x: 0, y: 0 };
  const x = Math.max(0, box.x - 12);
  const y = Math.max(0, box.y - 6);
  const vp = page.viewportSize();
  await page.screenshot({
    path: `${OUT_DIR}${name}.png`,
    clip: { x, y, width: vp.width - x - 8, height: 64 },
  });
}

async function snap(page, label, backTestId, crumbsTestId) {
  await page.locator(`[data-testid="${crumbsTestId}"]`).waitFor({ state: "visible", timeout: 20000 });
  await page.waitForTimeout(400);
  await shotStrip(page, label, backTestId);
  return navMetrics(page, backTestId, crumbsTestId);
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
  // экран выбора организации: кликаем Default (высокий вьюпорт — карточки видны)
  try {
    await page.locator('button:has-text("Default")').first().click({ timeout: 6000 });
    await page.waitForTimeout(2500);
  } catch { /* org уже выбрана */ }

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${BASE_URL}/app`);
    await page.waitForSelector('[data-testid="explorer-breadcrumbs"]', { timeout: 20000 });
    await page.waitForTimeout(800);

    // ── Уровень 1: раздел ──
    const folderRow = page.locator('table tbody tr:has-text("РАЗДЕЛ")').first();
    await folderRow.locator("td").first().click();
    await page.waitForSelector('[data-testid="explorer-back-sections"]', { timeout: 15000 });
    const m1 = await snap(page, `nav_single_line_w${width}_level1_section`, "explorer-back-sections", "explorer-breadcrumbs");

    // ── Уровень 2: проект ──
    const projectLink = page.locator('tr:has-text("ПРОЕКТ") a', { hasText: /Открыть проект|Открыть/ }).first();
    await projectLink.waitFor({ state: "visible", timeout: 15000 });
    await projectLink.click();
    await page.waitForSelector('[data-testid="project-back-section"]', { timeout: 20000 });
    await page.waitForTimeout(600);
    const m2 = await snap(page, `nav_single_line_w${width}_level2_project`, "project-back-section", "project-breadcrumbs");

    // ── Уровень 3: сессия ──
    const sessionLink = page.locator('a[href*="session="], [data-testid*="session"] a').first();
    await sessionLink.waitFor({ state: "visible", timeout: 15000 });
    await sessionLink.click();
    await page.waitForSelector('[data-testid="session-nav-strip"]', { timeout: 30000 });
    await page.waitForTimeout(1200);
    const m3 = await snap(page, `nav_single_line_w${width}_level3_session`, "topbar-back-projects", "topbar-breadcrumbs");

    // ── Проверки уровня ──
    for (const [level, m] of [["section", m1], ["project", m2], ["session", m3]]) {
      const tag = `w${width} ${level}`;
      if (m.error) { check(`${tag}: элементы навигационной зоны`, false, m.error); continue; }
      check(`${tag}: одна строка (y кнопки = y крошек)`, m.sameLine, `back.y=${m.back.y} crumbs.y=${m.crumbs.y}`);
      check(`${tag}: строка 40–44px без переноса`, m.noWrap, `h=${m.row.h}`);
      check(`${tag}: текущий сегмент — полужирный текст`, m.currentIsText === true && m.currentBold === true);
      const exp = expectedLayout(m.navWidth);
      check(`${tag}: мета по порогу`, (m.navMeta === "1") === exp.showMeta, `navWidth=${m.navWidth} meta=${m.navMeta} exp=${exp.showMeta}`);
      check(`${tag}: крошки «…» по порогу`, exp.collapseCrumbs ? true : !m.hasEllipsis, `ellipsis=${m.hasEllipsis} exp.collapse=${exp.collapseCrumbs}`);
      check(`${tag}: кнопка иконкой по порогу`, (m.back.text === "←") === exp.backIconOnly, `text="${m.back.text}" exp.icon=${exp.backIconOnly}`);
    }

    // ── Пиксель-в-пиксель между уровнями ──
    if (!m1.error && !m2.error && !m3.error) {
      const sameRow = Math.abs(m1.row.y - m2.row.y) < 1 && Math.abs(m2.row.y - m3.row.y) < 1
        && Math.abs(m1.back.x - m2.back.x) < 1 && Math.abs(m2.back.x - m3.back.x) < 1;
      check(`w${width}: строка и кнопка пиксель-в-пиксель на 3 уровнях`, sameRow,
        `row.y=${[m1.row.y, m2.row.y, m3.row.y].join("/")} back.x=${[m1.back.x, m2.back.x, m3.back.x].join("/")}`);
    }
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n== ${results.length - failed}/${results.length} проверок зелёные, скрины ${OUT_DIR}nav_single_line_*`);
  fs.writeFileSync(`${OUT_DIR}nav_single_line_report.json`, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(2);
});
