// UXF addendum-4 — приёмочная проверка (preview build → реальный stage).
// B1: пары [Сохранить+Rev] / [Версия+V] — единый паттерн «иконка+счётчик» слева.
// B2: «Создать TO BE» удалена из среднего хедера; входы — сегмент + сайдбар.
// B3: бейджи «in progress» на «Анализ процессов»/«TO BE»/«DOC»/«DOD»
//     (внутри кнопки, слева сверху); «Diagram (BPMN)»/«XML» — без.
// B4: undo/redo/⋯ — статус зафиксирован (реальные действия, оставлены).
// Регрессия: переключение «Схема/TO BE» без перезагрузки; пустые вкладки — скрины.
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
const SOUP_SID = "13f1f10b20";
const PREFIX = process.env.UXF_PREFIX || "addendum4";

fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[uxf-addendum4]", ...a);
const fail = (m) => { throw new Error(m); };

const browser = await chromium.launch();

async function newPage(withVideo) {
  const context = await browser.newContext({
    viewport: { width: 1680, height: 1000 },
    recordVideo: withVideo ? { dir: path.join(OUT, "video_tmp"), size: { width: 1680, height: 1000 } } : undefined,
  });
  const page = await context.newPage();
  await page.addInitScript((t) => {
    window.localStorage.setItem("fpc_auth_access_token", t);
    window.__uxfNavCount = 0;
    window.addEventListener("beforeunload", () => { window.__uxfNavCount = -1; });
  }, TOKEN);
  page.on("pageerror", (e) => console.log("[uxf-addendum4] pageerror:", String(e).slice(0, 300)));
  return { context, page };
}

async function openSchemaSession(page, sid) {
  await page.goto(`${BASE}/app?project=${PID}&session=${sid}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(10000);
}

async function saveVideo(context, page, name) {
  const video = page.video();
  await context.close();
  if (!video) return;
  const src = await video.path();
  const dst = path.join(OUT, `${PREFIX}_${name}.webm`);
  fs.copyFileSync(src, dst);
  log("видео:", dst);
}

try {
  // ============ КОНТЕКСТ 1 (видео): B1/B2/B3 + переключение ============
  const { context: ctx1, page } = await newPage(true);
  await openSchemaSession(page, SOUP_SID);

  // ---- B1: пары «иконка+счётчик» единым паттерном ----
  const b1 = await page.evaluate(() => {
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), h: Math.round(r.height) };
    };
    const pair = (pairSel, btnSel, chipSel) => {
      const p = document.querySelector(pairSel);
      return p ? { hasBtn: Boolean(p.querySelector(btnSel)), hasChip: Boolean(p.querySelector(chipSel)), title: p.getAttribute("title") || "" } : null;
    };
    const savePair = pair('[data-testid="diagram-toolbar-save-pair"]', '[data-testid="diagram-toolbar-save"]', '[data-testid="diagram-toolbar-diagram-state-version-chip"]');
    const versionPair = pair('[data-testid="diagram-toolbar-version-pair"]', '[data-testid="diagram-toolbar-create-revision"]', '[data-testid="diagram-toolbar-version-chip"]');
    const sp = rect('[data-testid="diagram-toolbar-save-pair"]');
    const vp = rect('[data-testid="diagram-toolbar-version-pair"]');
    return {
      savePair, versionPair,
      sameHeight: sp && vp && sp.h === vp.h ? sp.h : null,
      orderOk: sp && vp && sp.x < vp.x,
    };
  });
  log("B1:", JSON.stringify(b1));
  if (!b1.savePair?.hasBtn || !b1.savePair?.hasChip) fail("B1: пара «Сохранить+Rev» не собрана");
  if (!b1.versionPair?.hasBtn || !b1.versionPair?.hasChip) fail("B1: пара «Версия+V» не собрана");
  if (!/^Сохранить · ревизия /.test(b1.savePair.title)) fail(`B1: тултип пары сохранения «${b1.savePair.title}»`);
  if (!/^Новая версия · текущая /.test(b1.versionPair.title)) fail(`B1: тултип пары версии «${b1.versionPair.title}»`);
  if (!b1.sameHeight) fail("B1: пары разной высоты — паттерн не единый");
  if (!b1.orderOk) fail("B1: порядок пар неверен (Сохранить → Версия)");
  const leftSlot = await page.$(".diagramToolbarSlot--left");
  await leftSlot.screenshot({ path: path.join(OUT, `${PREFIX}_b1_pairs_closeup.png`) });

  // ---- B2/B4: «Создать TO BE» удалена; undo/redo/⋯ — реальные, оставлены ----
  const b2 = await page.evaluate(() => {
    const t = (id) => Boolean(document.querySelector(`[data-testid="${id}"]`));
    const undo = document.querySelector('[data-testid="diagram-toolbar-undo"]');
    const redo = document.querySelector('[data-testid="diagram-toolbar-redo"]');
    return {
      tobeEntryGone: !t("diagram-toolbar-tobe-entry"),
      undo: t("diagram-toolbar-undo"), redo: t("diagram-toolbar-redo"), overflow: t("diagram-toolbar-overflow-toggle"),
      undoTitle: undo?.getAttribute("title") || "", redoTitle: redo?.getAttribute("title") || "",
    };
  });
  log("B2/B4:", JSON.stringify(b2));
  if (!b2.tobeEntryGone) fail("B2: «Создать TO BE» всё ещё в среднем хедере");
  if (!b2.undo || !b2.redo || !b2.overflow) fail("B4: undo/redo/⋯ пропали (реальные действия — должны остаться)");
  if (!b2.undoTitle || !b2.redoTitle) fail("B4: у стрелок нет тултипов");
  const rightSlot = await page.$(".diagramToolbarRightActions");
  await rightSlot.screenshot({ path: path.join(OUT, `${PREFIX}_b2_right_actions.png`) });

  // ---- B3: бейджи «in progress» ----
  const b3 = await page.evaluate(() => {
    const badgeInfo = (testid) => {
      const badge = document.querySelector(`[data-testid="${testid}"]`);
      const btn = badge?.closest("button") || null;
      if (!badge || !btn) return { badge: Boolean(badge), btn: Boolean(btn) };
      const br = badge.getBoundingClientRect();
      const tr = btn.getBoundingClientRect();
      return {
        badge: true, btn: true,
        inside: br.top >= tr.top - 2 && br.left >= tr.left - 2 && br.bottom <= tr.bottom + 2 && br.right <= tr.right + 2,
        topLeft: (br.left - tr.left) < 14 && (br.top - tr.top) < 8,
        title: badge.getAttribute("title") || "",
      };
    };
    const noBadge = (label) => {
      const btn = Array.from(document.querySelectorAll(".diagramToolbarSlot--center .segBtn")).find((b) => (b.textContent || "").trim() === label);
      return btn ? !btn.querySelector('[data-testid^="tab-in-progress"]') : null;
    };
    return {
      interview: badgeInfo("tab-in-progress-interview"),
      doc: badgeInfo("tab-in-progress-doc"),
      dod: badgeInfo("tab-in-progress-dod"),
      tobe: badgeInfo("tab-in-progress-tobe"),
      diagramClean: noBadge("Diagram (BPMN)"),
      xmlClean: noBadge("XML"),
      schemaClean: (() => { const b = document.querySelector('[data-testid="mode-switch-schema"]'); return b ? !b.querySelector('[data-testid^="tab-in-progress"]') : null; })(),
    };
  });
  log("B3:", JSON.stringify(b3));
  for (const k of ["interview", "doc", "dod", "tobe"]) {
    const v = b3[k];
    if (!v.badge || !v.btn) fail(`B3: нет бейджа/кнопки для ${k}`);
    if (!v.inside || !v.topLeft) fail(`B3: бейдж ${k} не внутри кнопки слева сверху: ${JSON.stringify(v)}`);
    if (!v.title.includes("в разработке")) fail(`B3: у бейджа ${k} нет поясняющего тултипа`);
  }
  if (b3.diagramClean !== true || b3.xmlClean !== true || b3.schemaClean !== true) {
    fail("B3: пометка стоит на готовом представлении (Diagram/XML/Схема)");
  }
  // скрин группы представлений крупным планом + hover на бейдж (видео)
  await page.hover('[data-testid="tab-in-progress-doc"]');
  await page.waitForTimeout(1600);
  const centerSlot = await page.$(".diagramToolbarSlot--center");
  await centerSlot.screenshot({ path: path.join(OUT, `${PREFIX}_b3_tabs_in_progress.png`) });

  // ---- Вкладки открываются (не блокируются); фиксация пустоты ----
  const tabStates = [];
  for (const tabName of ["Анализ процессов", "DOC", "DOD"]) {
    await page.evaluate((name) => {
      const btn = Array.from(document.querySelectorAll(".diagramToolbarSlot--center .segBtn")).find((b) => (b.textContent || "").trim() === name);
      btn?.click();
    }, tabName);
    await page.waitForTimeout(5000);
    const st = await page.evaluate(() => {
      const main = document.querySelector(".workspaceMain");
      const text = (main?.textContent || "").replace(/\s+/g, " ").trim();
      return { len: text.length, head: text.slice(0, 120) };
    });
    tabStates.push({ tab: tabName, ...st });
    await page.screenshot({ path: path.join(OUT, `${PREFIX}_tab_${tabName === "Анализ процессов" ? "interview" : tabName.toLowerCase()}.png`) });
  }
  log("tabs:", JSON.stringify(tabStates));

  // назад на Diagram
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll(".diagramToolbarSlot--center .segBtn")).find((b) => (b.textContent || "").trim() === "Diagram (BPMN)");
    btn?.click();
  });
  await page.waitForTimeout(6000);

  // ---- Регрессия: переключение без перезагрузки; TO BE из сегмента ----
  await page.click('.diagramToolbarSlot--center [data-testid="mode-switch-tobe"]');
  await page.waitForTimeout(6000);
  const tobe = await page.evaluate(() => ({
    navCount: window.__uxfNavCount,
    panel: Boolean(document.querySelector('[data-testid="tobe-left-panel"]')),
    tobeSelected: document.querySelector('[data-testid="tobe-left-panel"] [data-testid="mode-switch-tobe"]')?.getAttribute("aria-selected") === "true",
    tobeBadge: Boolean(document.querySelector('[data-testid="tobe-left-panel"] [data-testid="tab-in-progress-tobe"]')),
  }));
  log("tobe:", JSON.stringify(tobe));
  if (!tobe.panel || tobe.navCount !== 0 || !tobe.tobeSelected) fail("регрессия: вход в TO BE из сегмента сломан");
  if (!tobe.tobeBadge) fail("B3: в TO BE-панели у сегмента нет бейджа «in progress»");
  await page.screenshot({ path: path.join(OUT, `${PREFIX}_tobe_mode.png`) });
  await page.click('[data-testid="tobe-left-panel"] [data-testid="mode-switch-schema"]');
  await page.waitForTimeout(5000);
  const back = await page.evaluate(() => ({
    navCount: window.__uxfNavCount,
    seg: Boolean(document.querySelector('.diagramToolbarSlot--center [data-testid="mode-switch"]')),
  }));
  if (back.navCount !== 0 || !back.seg) fail("регрессия: возврат в «Схему» сломан");
  await saveVideo(ctx1, page, "b3_in_progress_hover");

  // ============ КОНТЕКСТ 2: вход из сайдбара (B2) ============
  const { context: ctx2, page: p2 } = await newPage(false);
  await openSchemaSession(p2, SOUP_SID);
  const handle = await p2.$('[data-testid="left-sidebar-handle"] button.leftSidebarHandleOpenBtn');
  if (handle) { await handle.click(); await p2.waitForTimeout(1200); }
  for (let i = 0; i < 3; i += 1) {
    const visible = await p2.evaluate(() => {
      const r = document.querySelector('[data-testid="tobe-section"]');
      return r ? r.getBoundingClientRect().height > 0 : false;
    });
    if (visible) break;
    await p2.evaluate(() => {
      const acc = Array.from(document.querySelectorAll("button"))
        .find((b) => (b.textContent || "").trim().startsWith("TO BE") && (b.textContent || "").includes("Рабочее место технолога"));
      acc?.click();
    });
    await p2.waitForTimeout(1200);
  }
  const sidebarEntry = await p2.evaluate(() => {
    const sec = document.querySelector('[data-testid="tobe-section"]');
    const row = sec?.querySelector('[data-testid="tobe-current-process"] [data-testid^="tobe-open-"]')
      || sec?.querySelector('[data-testid^="tobe-open-"]');
    return { section: Boolean(sec), entry: row ? (row.textContent || "").replace(/\s+/g, " ").trim() : null };
  });
  log("sidebar:", JSON.stringify(sidebarEntry));
  if (!sidebarEntry.section || !sidebarEntry.entry) fail("B2: вход TO BE из сайдбара не найден");
  await p2.screenshot({ path: path.join(OUT, `${PREFIX}_b2_sidebar_entry.png`) });
  await ctx2.close();

  log("OK: addendum-4 приёмка пройдена");
  await browser.close();
  process.exit(0);
} catch (e) {
  console.error("[uxf-addendum4] FAIL:", e?.message || e);
  await browser.close();
  process.exit(1);
}
