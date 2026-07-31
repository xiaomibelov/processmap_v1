// UXF addendum-3 — приёмочная проверка (preview build → реальный stage).
// 1) «Схема|TO BE» убран из верхнего хедера → сегмент в среднем хедере
//    справа от «Diagram (BPMN)»; переключение без перезагрузки (видео).
// 2) Верхний хедер — тонкий контекстный бар: лого · назад · крошки
//    (проект=ссылка, сессия=текст, тултипы) · статус информативно ·
//    справа ORG/Админ/аватар.
// 3) «Админ-панель» под technologist скрыта (RBAC).
// 4) Бейдж аватара — реальные уведомления (консистентность бейдж↔меню).
// 5) Регрессия: TO BE вход/выход без моргания, сегмент на виду в TO BE.
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
const PREFIX = process.env.UXF_PREFIX || "addendum3";

fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[uxf-addendum3]", ...a);
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
  page.on("pageerror", (e) => console.log("[uxf-addendum3] pageerror:", String(e).slice(0, 300)));
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
  // ============ КОНТЕКСТ 1 (видео): верхний хедер + сегмент + переключение ============
  const { context: ctx1, page } = await newPage(true);
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${PREFIX}_${n}.png`) });
  await openSchemaSession(page, SOUP_SID);

  // ---- К1/К2/К5: верхний хедер — тонкий контекстный бар, без mode-switch ----
  const top = await page.evaluate(() => {
    const bar = document.querySelector(".topbar");
    const rect = bar?.getBoundingClientRect();
    const crumbs = document.querySelector('[data-testid="topbar-breadcrumbs"]');
    const projCrumb = document.querySelector('[data-testid="topbar-crumb-project"]');
    const sessCrumb = document.querySelector('[data-testid="topbar-crumb-session"]');
    const status = document.querySelector('[data-testid="topbar-session-status"]');
    return {
      height: rect ? Math.round(rect.height) : 0,
      modeSwitchInTopbar: Boolean(bar?.querySelector('[data-testid="mode-switch"]')),
      removedPills: [
        "topbar-project-actions-button",
        "topbar-session-actions-button",
        "topbar-status-change-menu",
        "topbar-project-title",
        "topbar-session-title",
      ].filter((id) => Boolean(document.querySelector(`[data-testid="${id}"]`))),
      brand: Boolean(document.querySelector('[data-testid="topbar-brand-text"]')),
      back: Boolean(document.querySelector('[data-testid="topbar-back-projects"]')),
      crumbs: Boolean(crumbs),
      projCrumbTag: projCrumb?.tagName || "",
      projCrumbTitle: projCrumb?.getAttribute("title") || "",
      projCrumbText: (projCrumb?.textContent || "").trim(),
      sessCrumbTag: sessCrumb?.tagName || "",
      sessCrumbTitle: sessCrumb?.getAttribute("title") || "",
      sessCrumbText: (sessCrumb?.textContent || "").trim(),
      statusTag: status?.tagName || "",
      statusText: (status?.textContent || "").trim(),
      statusInCenter: Boolean(status?.closest(".topCenter")),
      adminBtn: Boolean(document.querySelector('[data-testid="topbar-admin-button"]')),
      org: Boolean(document.querySelector('[data-testid="topbar-org-switcher"]')) || Boolean(document.querySelector(".topbarNavRight .topGroup")),
      avatar: Boolean(document.querySelector('[data-testid="topbar-account-button"]')),
    };
  });
  log("topbar:", JSON.stringify(top));
  if (top.modeSwitchInTopbar) fail("К1: mode-switch всё ещё в верхнем хедере");
  if (top.removedPills.length) fail(`К2/К5: капсулы/меню не убраны: ${top.removedPills.join(",")}`);
  if (!top.brand || !top.back || !top.crumbs) fail("К2: нет лого/назад/крошек");
  if (top.projCrumbTag !== "BUTTON") fail("К2: крошка проекта не кликабельна");
  if (top.sessCrumbTag === "BUTTON") fail("К2: крошка сессии должна быть текстом");
  if (!top.projCrumbTitle.includes(top.projCrumbText.slice(0, 8))) fail("К2: у крошки проекта нет тултипа с полным именем");
  if (!top.sessCrumbTitle.includes(top.sessCrumbText.slice(0, 8))) fail("К2: у крошки сессии нет тултипа с полным именем");
  if (top.statusTag === "BUTTON") fail("К2: статус должен быть информационным (не кнопка)");
  if (!top.statusInCenter || !top.statusText) fail("К2: статус не в центре или пуст");
  if (top.adminBtn) fail("К3: «Админ-панель» видна technologist (RBAC)");
  if (!top.org || !top.avatar) fail("К2: справа нет ORG/аватара");
  if (top.height === 0 || top.height > 48) fail(`К5: хедер не тонкий (height=${top.height}px)`);
  await shot("topbar_thin_context_bar");

  // ---- К4: бейдж аватара — консистентность с реальными уведомлениями ----
  const badge = await page.evaluate(() => {
    const b = document.querySelector('[data-testid="topbar-account-notification-count"]');
    return b ? (b.textContent || "").trim() : null;
  });
  await page.click('[data-testid="topbar-account-button"]');
  await page.waitForTimeout(1200);
  const notif = await page.evaluate(() => {
    const summary = (document.querySelector('[data-testid="topbar-notification-summary"]')?.textContent || "").trim();
    const empty = Boolean(document.querySelector('[data-testid="topbar-notification-empty"]'));
    const rows = document.querySelectorAll('[data-testid="topbar-notification-preview-row"]').length;
    return { summary, empty, rows };
  });
  log("badge:", badge, "menu:", JSON.stringify(notif));
  if (badge && (notif.empty || notif.rows === 0)) fail("К4: бейдж есть, но уведомлений нет — шум");
  if (!badge && !notif.empty && notif.rows > 0) fail("К4: уведомления есть, но бейдж не показан");
  await shot("account_badge_notifications");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // ---- К1: сегмент в среднем хедере справа от Diagram ----
  const seg = await page.evaluate(() => {
    const center = document.querySelector(".diagramToolbarSlot--center");
    const sw = center?.querySelector('[data-testid="mode-switch"]');
    if (!sw) return { found: false };
    const tabs = Array.from(center.querySelectorAll(".segBtn"));
    const idx = (testid) => tabs.findIndex((b) => b.getAttribute("data-testid") === testid || (b.textContent || "").trim().startsWith(testid));
    const diagramTab = tabs.find((b) => (b.textContent || "").trim() === "Diagram (BPMN)");
    const xmlTab = tabs.find((b) => (b.textContent || "").trim() === "XML");
    const schemaBtn = sw.querySelector('[data-testid="mode-switch-schema"]');
    const tobeBtn = sw.querySelector('[data-testid="mode-switch-tobe"]');
    const after = (a, b) => a && b && Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    return {
      found: true,
      afterDiagram: after(diagramTab, sw),
      beforeXml: after(sw, xmlTab),
      schemaSelected: schemaBtn?.getAttribute("aria-selected") === "true",
      tobeEnabled: tobeBtn && !tobeBtn.disabled,
      focusable: schemaBtn?.tagName === "BUTTON" && tobeBtn?.tagName === "BUTTON",
    };
  });
  log("segment:", JSON.stringify(seg));
  if (!seg.found) fail("К1: сегмента нет в среднем хедере");
  if (!seg.afterDiagram || !seg.beforeXml) fail("К1: сегмент не между Diagram и XML");
  if (!seg.schemaSelected) fail("К1: «Схема» не активна в режиме схемы");
  if (!seg.tobeEnabled) fail("К1: «TO BE» недоступен для непустой сессии");
  if (!seg.focusable) fail("К1: сегмент не клавиатурно-доступен");
  await shot("segment_after_diagram_tab");

  // ---- К1/К6: переключение в TO BE без перезагрузки; сегмент на виду в TO BE ----
  await page.click('[data-testid="mode-switch-tobe"]');
  await page.waitForTimeout(6000);
  const tobe = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="tobe-left-panel"]');
    const sw = panel?.querySelector('[data-testid="mode-switch"]');
    const steps = document.querySelector('[data-testid="tobe-steps-slot"]');
    return {
      panel: Boolean(panel),
      navCount: window.__uxfNavCount,
      segInPanel: Boolean(sw),
      tobeSelected: sw?.querySelector('[data-testid="mode-switch-tobe"]')?.getAttribute("aria-selected") === "true",
      stepsNonEmpty: Boolean(steps && steps.children.length > 0),
    };
  });
  log("tobe:", JSON.stringify(tobe));
  if (!tobe.panel) fail("К6: TO BE рабочее место не открылось из сегмента");
  if (tobe.navCount !== 0) fail("К1: переключение ушло в полную перезагрузку");
  if (!tobe.segInPanel || !tobe.tobeSelected) fail("К1: в TO BE сегмент не на виду / не активен");
  await shot("tobe_mode_switch_visible");

  // назад в «Схему» из сегмента
  await page.click('[data-testid="tobe-left-panel"] [data-testid="mode-switch-schema"]');
  await page.waitForTimeout(5000);
  const back = await page.evaluate(() => ({
    navCount: window.__uxfNavCount,
    segInHeader: Boolean(document.querySelector('.diagramToolbarSlot--center [data-testid="mode-switch"]')),
    schemaSelected: document.querySelector('.diagramToolbarSlot--center [data-testid="mode-switch-schema"]')?.getAttribute("aria-selected") === "true",
  }));
  log("back:", JSON.stringify(back));
  if (back.navCount !== 0) fail("К1: возврат в «Схему» ушёл в перезагрузку");
  if (!back.segInHeader || !back.schemaSelected) fail("К1: после возврата сегмент не в хедере/не активен");
  await shot("back_to_schema_segment");
  await saveVideo(ctx1, page, "mode_switch");

  // ============ КОНТЕКСТ 2: крошка проекта ведёт на реальную страницу ============
  const { context: ctx2, page: p2 } = await newPage(false);
  await openSchemaSession(p2, SOUP_SID);
  await p2.click('[data-testid="topbar-crumb-project"]');
  await p2.waitForTimeout(6000);
  const crumbNav = await p2.evaluate(() => ({
    url: location.href,
    onAppStage: Boolean(document.querySelector(".diagramToolbarSlot--center")),
  }));
  log("crumbNav:", JSON.stringify(crumbNav));
  if (crumbNav.onAppStage && crumbNav.url.includes(`session=${SOUP_SID}`)) {
    fail("К2: крошка проекта никуда не ведёт (остались на той же сессии)");
  }
  await p2.screenshot({ path: path.join(OUT, `${PREFIX}_crumb_project_target.png`) });
  await ctx2.close();

  log("OK: addendum-3 приёмка пройдена");
  await browser.close();
  process.exit(0);
} catch (e) {
  console.error("[uxf-addendum3] FAIL:", e?.message || e);
  await browser.close();
  process.exit(1);
}
