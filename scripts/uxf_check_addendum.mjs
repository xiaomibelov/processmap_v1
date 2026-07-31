// UXF addendum A1–A4 — приёмочная проверка (preview build → реальный stage).
// A1: меню TO BE — одна строка (иконка·имя·статус), «Прочие» свёрнуты,
//     primary «с чистого листа», заголовка «AS IS — процесс из ProcessMap:» нет.
// A2: «Доп. информация» — сводка процесса; ee_time «нет данных» на сессии
//     без тегов; расчёт на сессии с тегами (UXF_EE_SID, если задан).
// A3: сегмент «Схема|TO BE» в хедере на всех экранах пути.
// A4: средний хедер — слева только V/Rev; справа Сохранить(primary)+Версия+Экспорт▾.
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
const PID = "c0494e0667";
const SOUP_SID = "13f1f10b20"; // схема есть, ee_time НЕТ
const EE_SID = process.env.UXF_EE_SID || ""; // сессия с ee_time-тегами (если есть)
const PREFIX = process.env.UXF_PREFIX || "addendum";

fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[uxf-addendum]", ...a);
const fail = (m) => { throw new Error(m); };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
const page = await context.newPage();
await page.addInitScript((t) => window.localStorage.setItem("fpc_auth_access_token", t), TOKEN);
page.on("pageerror", (e) => console.log("[uxf-addendum] pageerror:", String(e).slice(0, 300)));
const shot = (n) => page.screenshot({ path: path.join(OUT, `${PREFIX}_${n}.png`) });

async function openSchemaSession(sid) {
  await page.goto(`${BASE}/app?project=${PID}&session=${sid}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(10000);
  const handle = await page.$('[data-testid="left-sidebar-handle"] button.leftSidebarHandleOpenBtn');
  if (handle) { await handle.click(); await page.waitForTimeout(1200); }
}

async function openTobeAccordion() {
  for (let i = 0; i < 3; i += 1) {
    const st = await page.evaluate(() => {
      const r = document.querySelector(".tobeRow");
      const head = Array.from(document.querySelectorAll("button"))
        .find((b) => (b.textContent || "").includes("Рабочее место технолога"));
      return { visible: r ? r.getBoundingClientRect().height > 0 : false, expanded: head?.getAttribute("aria-expanded") };
    });
    log("accordion state:", JSON.stringify(st));
    if (st.visible) return;
    await page.evaluate(() => {
      const acc = Array.from(document.querySelectorAll("button"))
        .find((b) => (b.textContent || "").trim().startsWith("TO BE") && (b.textContent || "").includes("Рабочее место технолога"));
      acc?.click();
    });
    await page.waitForTimeout(1500);
  }
}

try {
  await openSchemaSession(SOUP_SID);

  // ---- A3 (на экране «Схема») ----
  const seg1 = await page.evaluate(() => Boolean(document.querySelector('[data-testid="mode-switch"]')));
  if (!seg1) fail("A3: сегмент режимов не виден на экране «Схема»");
  log("A3 схема: сегмент виден");

  // ---- A4 ----
  const header = await page.evaluate(() => {
    const left = document.querySelector(".diagramToolbarSlot--left");
    const right = document.querySelector(".diagramToolbarRightActions");
    const order = right ? Array.from(right.querySelectorAll("[data-testid]")).map((el) => el.getAttribute("data-testid")) : [];
    const save = document.querySelector('[data-testid="diagram-toolbar-save"]');
    return {
      leftHasSave: Boolean(left?.querySelector('[data-testid="diagram-toolbar-save"]')),
      leftHasCreate: Boolean(left?.querySelector('[data-testid="diagram-toolbar-create-revision"]')),
      leftChips: Boolean(left?.querySelector('[data-testid="diagram-toolbar-version-chip"]')),
      order,
      saveClipped: save ? save.scrollWidth > save.clientWidth + 2 : null,
    };
  });
  log("A4 хедер:", JSON.stringify(header));
  if (header.leftHasSave || header.leftHasCreate) fail("A4: слева остались кнопки действий (должны быть только V/Rev)");
  if (!header.leftChips) fail("A4: слева нет версионных чипов");
  const seq = ["diagram-toolbar-tobe-entry", "diagram-toolbar-save", "diagram-toolbar-create-revision", "diagram-toolbar-export-menu"];
  const pos = seq.map((t) => header.order.indexOf(t));
  if (pos.some((p) => p < 0) || !(pos[0] < pos[1] && pos[1] < pos[2] && pos[2] < pos[3])) {
    fail(`A4: порядок справа неверный: ${header.order.join(",")}`);
  }
  if (header.saveClipped) fail("A4: кнопка «Сохранить» обрезана");
  // «Экспорт ▾» — меню с XML/DOC/DOD
  await page.click('[data-testid="diagram-toolbar-export-menu"]');
  await page.waitForTimeout(400);
  const exportItems = await page.evaluate(() =>
    ["diagram-toolbar-export-xml", "diagram-toolbar-export-zip", "diagram-toolbar-export-doc", "diagram-toolbar-export-dod"]
      .map((t) => Boolean(document.querySelector(`[data-testid="${t}"]`))));
  if (!exportItems.every(Boolean)) fail(`A4: меню экспорта неполное: ${exportItems}`);
  await shot("a4_header_export_menu");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  // Страховка: Escape не должен прятать левую панель (app-фикс capture+stopPropagation),
  // но если спрятал — переоткрываем, чтобы замеры A1 шли по видимым строкам.
  const hiddenHandle = await page.$('[data-testid="left-sidebar-handle"] button.leftSidebarHandleOpenBtn');
  if (hiddenHandle) { await hiddenHandle.click(); await page.waitForTimeout(1200); }

  // ---- A1 ----
  await openTobeAccordion();
  const a1 = await page.evaluate(() => {
    const section = document.querySelector('[data-testid="tobe-section"]');
    const rows = Array.from(document.querySelectorAll(".tobeRow"));
    const heights = rows.slice(0, 6).map((r) => r.getBoundingClientRect().height);
    const other = document.querySelector('[data-testid="tobe-other"]');
    const blank = document.querySelector('[data-testid="tobe-open-blank"]');
    const statuses = rows.slice(0, 5).map((r) => (r.querySelector(".tobeRow__status")?.textContent || "").trim());
    return {
      noLegacyHeader: section ? !(section.textContent || "").includes("AS IS — процесс из ProcessMap") : false,
      rowCount: rows.length,
      heights,
      otherCollapsed: other ? !other.hasAttribute("open") : null,
      blankPrimary: blank?.classList.contains("tobeRow--primary") === true,
      statuses,
    };
  });
  log("A1 список:", JSON.stringify(a1));
  if (!a1.noLegacyHeader) fail("A1: заголовок «AS IS — процесс из ProcessMap:» не убран");
  if (!a1.rowCount) fail("A1: нет строк .tobeRow");
  if (a1.heights.some((h) => h <= 0)) fail(`A1: строки не отрисованы (панель скрыта?): heights=${a1.heights}`);
  if (a1.heights.some((h) => h > 44)) fail(`A1: многострочные кнопки-плашки: heights=${a1.heights}`);
  if (a1.otherCollapsed === false) fail("A1: «Прочие» не свёрнуты");
  if (!a1.blankPrimary) fail("A1: «TO BE с чистого листа» не primary");
  await shot("a1_tobe_action_list");

  // ---- A2 (сессия БЕЗ ee_time) ----
  const a2 = await page.evaluate(() => ({
    summary: Boolean(document.querySelector('[data-testid="process-summary"]')),
    status: (document.querySelector('[data-testid="ps-status"]')?.textContent || "").trim(),
    composition: (document.querySelector('[data-testid="ps-composition"]')?.textContent || "").trim(),
    lanes: (document.querySelector('[data-testid="ps-lanes"]')?.textContent || "").trim(),
    eeEmpty: (document.querySelector('[data-testid="ps-eetime-empty"]')?.textContent || "").trim(),
    techCollapsed: !document.querySelector('[data-testid="ps-tech-details"]')?.hasAttribute("open"),
  }));
  log("A2 сводка (без ee_time):", JSON.stringify(a2));
  if (!a2.summary) fail("A2: нет сводки процесса");
  if (!/задачи \d+/.test(a2.composition)) fail(`A2: состав не заполнен: «${a2.composition}»`);
  if (!/3: /.test(a2.lanes)) fail(`A2: дорожки не заполнены: «${a2.lanes}»`);
  if (a2.eeEmpty !== "нет данных ee_time") fail(`A2: состояние «нет данных ee_time» отсутствует: «${a2.eeEmpty}»`);
  if (!a2.techCollapsed) fail("A2: «Технические детали» не свёрнуты");
  await shot("a2_summary_no_eetime");

  // ---- A2 (сессия С ee_time, если задана) ----
  if (EE_SID) {
    await openSchemaSession(EE_SID);
    const a2ee = await page.evaluate(() => ({
      ee: (document.querySelector('[data-testid="ps-eetime"]')?.textContent || "").trim(),
      split: (document.querySelector('[data-testid="ps-eetime-split"]')?.textContent || "").trim(),
      emptyShown: Boolean(document.querySelector('[data-testid="ps-eetime-empty"]')),
    }));
    log("A2 сводка (с ee_time):", JSON.stringify(a2ee));
    if (!/Σ \d/.test(a2ee.ee) || !/крит\. путь \d/.test(a2ee.ee)) fail(`A2: расчёт ee_time не показан: «${a2ee.ee}»`);
    if (!/ручное \d/.test(a2ee.split) || !/оборудование \d/.test(a2ee.split)) fail(`A2: разрез не показан: «${a2ee.split}»`);
    if (a2ee.emptyShown) fail("A2: «нет данных» показано на сессии С тегами");
    await shot("a2_summary_with_eetime");
    await openSchemaSession(SOUP_SID); // вернуться для A3-входа
  }

  // ---- A3 (в режиме TO BE) ----
  await page.click('[data-testid="mode-switch-tobe"]');
  await page.waitForSelector('[data-testid="session-step-bar"]', { timeout: 30000 });
  await page.waitForTimeout(4000);
  const seg2 = await page.evaluate(() => ({
    seg: Boolean(document.querySelector('[data-testid="mode-switch"]')),
    tobeOn: document.querySelector('[data-testid="mode-switch-tobe"]')?.getAttribute("aria-selected") === "true",
  }));
  if (!seg2.seg || !seg2.tobeOn) fail("A3: сегмент не виден/не активен в режиме TO BE");
  log("A3 TO BE: сегмент виден и активен");
  await shot("a3_mode_switch_tobe");

  log("OK: все проверки addendum зелёные");
  process.exitCode = 0;
} catch (e) {
  console.error("[uxf-addendum] FAIL:", e?.message || e);
  try { await shot("fail_state"); } catch {}
  process.exitCode = 1;
} finally {
  await browser.close();
}
