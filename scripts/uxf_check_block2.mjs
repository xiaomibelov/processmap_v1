// UXF — приёмочная проверка Блока 2 (ux_concept.md v1.1):
// 1) сегмент «Схема | TO BE» в шапке; 2) точка входа «Создать/Открыть TO BE»
//    в тулбаре диаграммы; 3) левая панель TO BE (контекст + зеркало шагов +
//    панель параметров), аналитические секции хоста СКРЫТЫ;
// 4) возврат в «Схему» одним кликом; 5) дизайн-токены определены.
// Прогон: локальный build (preview) + stage API.
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.UXF_BASE || "http://127.0.0.1:5198";
const OUT = path.join(ROOT, "docs", "uxf");
const TOKEN = process.env.W4_TOKEN;
const PID = "c0494e0667"; // проект на РЕАЛЬНОМ stage (stage.processmap.ru)
const SOUP_SID = "13f1f10b20"; // «Разогрев супа» — as_is с существующим TO BE
const PREFIX = process.env.UXF_PREFIX || "block2";

fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[uxf-block2]", ...a);
const fail = (m) => { throw new Error(m); };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
const page = await context.newPage();
await page.addInitScript((t) => window.localStorage.setItem("fpc_auth_access_token", t), TOKEN);
page.on("pageerror", (e) => console.log("[uxf-block2] pageerror:", String(e).slice(0, 300)));
const shot = (n) => page.screenshot({ path: path.join(OUT, `${PREFIX}_${n}.png`) });

const modeState = () => page.evaluate(() => {
  const seg = document.querySelector('[data-testid="mode-switch"]');
  const schema = document.querySelector('[data-testid="mode-switch-schema"]');
  const tobe = document.querySelector('[data-testid="mode-switch-tobe"]');
  return {
    seg: Boolean(seg),
    schemaSelected: schema?.getAttribute("aria-selected") === "true",
    tobeSelected: tobe?.getAttribute("aria-selected") === "true",
    tobeDisabled: tobe?.disabled === true,
  };
});

try {
  // ---- 1. Режим «Схема»: сегмент + точка входа ----
  await page.goto(`${BASE}/app?project=${PID}&session=${SOUP_SID}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector('[data-testid="mode-switch"]', { timeout: 30000 });
  await page.waitForTimeout(6000);

  let ms = await modeState();
  log("1. сегмент (схема):", JSON.stringify(ms));
  if (!ms.seg || !ms.schemaSelected || ms.tobeSelected) fail("сегмент: режим «Схема» не активен");
  if (ms.tobeDisabled) fail("сегмент: TO BE недоступен для сессии с BPMN");

  // addendum-4 B2: кнопка «Создать TO BE» удалена из тулбара — вход через сегмент «Схема|TO BE»
  const entry = await page.evaluate(() => {
    const gone = !document.querySelector('[data-testid="diagram-toolbar-tobe-entry"]');
    const seg = document.querySelector('.diagramToolbarSlot--center [data-testid="mode-switch-tobe"]');
    return { gone, segShown: Boolean(seg), segEnabled: seg ? !seg.disabled : false };
  });
  log("1. вход TO BE (addendum-4):", JSON.stringify(entry));
  if (!entry.gone) fail("B2: «Создать TO BE» всё ещё в тулбаре диаграммы");
  if (!entry.segShown || !entry.segEnabled) fail("сегмент TO BE не показан/недоступен в группе представлений");

  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      trace: cs.getPropertyValue("--graph-canvas-trace-color").trim(),
      asisOpacity: cs.getPropertyValue("--graph-canvas-asis-opacity").trim(),
      asisSaturation: cs.getPropertyValue("--graph-canvas-asis-saturation").trim(),
      stepDone: cs.getPropertyValue("--ws-step-done").trim(),
    };
  });
  log("1. токены:", JSON.stringify(tokens));
  if (!tokens.trace) fail("токен --graph-canvas-trace-color не определён");
  if (!tokens.asisSaturation) fail("токен --graph-canvas-asis-saturation не определён");
  if (!tokens.stepDone) fail("токен --ws-step-done не определён");
  await shot("1_schema_entry_and_segment");

  // ---- 2. Вход в TO BE через сегмент ----
  await page.click('[data-testid="mode-switch-tobe"]');
  await page.waitForSelector('[data-testid="session-step-bar"]', { timeout: 30000 });
  await page.waitForTimeout(6000);

  ms = await modeState();
  log("2. сегмент (TO BE):", JSON.stringify(ms));
  if (!ms.tobeSelected || ms.schemaSelected) fail("сегмент: режим «TO BE» не активен после входа");

  const leftPanel = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="tobe-left-panel"]');
    const sidebarText = (document.querySelector(".workspaceLeftContent")?.textContent || "");
    const hostSections = ["Свойства", "AI-вопросы", "Execution Bridge", "Пути и последовательность", "Заметки"]
      .filter((s) => sidebarText.includes(s));
    return {
      panel: Boolean(panel),
      back: Boolean(document.querySelector('[data-testid="tobe-left-back"]')),
      context: (document.querySelector(".tobeLeft__title")?.textContent || "").trim(),
      stepsMirror: document.querySelectorAll("[data-testid^='tobe-steps-mirror-']").length,
      paramsSidebar: Boolean(document.querySelector('[data-testid="tobe-params-sidebar"]')),
      hostSections,
    };
  });
  log("2. левая панель TO BE:", JSON.stringify(leftPanel));
  if (!leftPanel.panel || !leftPanel.back) fail("левая панель TO BE не показана");
  if (!/TO BE из «/.test(leftPanel.context)) fail(`контекст панели неожиданный: «${leftPanel.context}»`);
  if (leftPanel.stepsMirror !== 7) fail(`зеркало шагов: ожидалось 7, получено ${leftPanel.stepsMirror}`);
  if (!leftPanel.paramsSidebar) fail("панель параметров (портал) не на месте");
  if (leftPanel.hostSections.length) fail(`аналитические секции хоста НЕ скрыты: ${leftPanel.hostSections.join(", ")}`);

  const hostTabs = await page.evaluate(() => Boolean(document.querySelector(".processHeader")));
  log("2. табы хоста скрыты:", !hostTabs);
  if (hostTabs) fail("табы хоста (Diagram/XML/DOC/DOD) видны в TO BE-режиме");
  await shot("2_tobe_mode_left_panel");

  // ---- 3. Возврат в «Схему» одним кликом по сегменту ----
  await page.click('[data-testid="mode-switch-schema"]');
  await page.waitForSelector(".processHeader", { timeout: 30000 });
  await page.waitForTimeout(4000);
  ms = await modeState();
  const backState = await page.evaluate(() => ({
    leftPanelGone: !document.querySelector('[data-testid="tobe-left-panel"]'),
    headerBack: Boolean(document.querySelector(".processHeader")),
  }));
  log("3. возврат в схему:", JSON.stringify({ ...ms, ...backState }));
  if (!ms.schemaSelected || !backState.leftPanelGone || !backState.headerBack) fail("возврат в «Схему» за 1 клик не сработал");
  await shot("3_back_to_schema");

  // ---- 4. Вход через сегмент «TO BE» в группе представлений (addendum-4) ----
  await page.click('.diagramToolbarSlot--center [data-testid="mode-switch-tobe"]');
  await page.waitForSelector('[data-testid="session-step-bar"]', { timeout: 30000 });
  await page.waitForTimeout(6000);
  const ctx2 = await page.evaluate(() => (document.querySelector(".tobeLeft__title")?.textContent || "").trim());
  log("4. вход из тулбара, контекст:", ctx2);
  if (!/TO BE из «/.test(ctx2)) fail(`вход из тулбара: контекст неожиданный «${ctx2}»`);
  await shot("4_toolbar_entry_tobe");

  // ---- 5. Возврат кнопкой «← К схеме» левой панели ----
  await page.click('[data-testid="tobe-left-back"]');
  await page.waitForSelector(".processHeader", { timeout: 30000 });
  await page.waitForTimeout(2000);
  ms = await modeState();
  log("5. возврат «← К схеме»:", JSON.stringify(ms));
  if (!ms.schemaSelected) fail("«← К схеме» не вернул режим «Схема»");

  log("OK: все проверки Блока 2 зелёные");
  process.exitCode = 0;
} catch (e) {
  console.error("[uxf-block2] FAIL:", e?.message || e);
  try { await shot("fail_state"); } catch {}
  process.exitCode = 1;
} finally {
  await browser.close();
}
