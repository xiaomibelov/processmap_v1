// UXF addendum-2 (A5–A9) — приёмочная проверка (preview build → реальный stage).
// A5: «Экспорт ▾» удалён из среднего хедера; вкладки XML/DOC/DOD в центре остались.
// A6: меню TO BE — структура «Из этого процесса» / «Из проекта» / «Прочие» / футер.
// A7: иконки Сохранить/Версия слева с тултипами; TopBar без «Технолог» на /app
//     и без мёртвого «Профиль — скоро».
// A8: крошки — реальные ссылки; dock left/right с persist (видео).
// A9: rail свёрнутого сайдбара — реальные секции; клик открывает панель к секции (видео).
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
const SOUP_SID = "13f1f10b20"; // непустая AS IS (текущая)
const EMPTY_SID = "e790842747"; // пустая AS IS — строка «пустая» disabled в «Из проекта»
const PREFIX = process.env.UXF_PREFIX || "addendum2";

fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[uxf-addendum2]", ...a);
const fail = (m) => { throw new Error(m); };

const browser = await chromium.launch();

async function newPage(videoName) {
  const context = await browser.newContext({
    viewport: { width: 1680, height: 1000 },
    recordVideo: videoName ? { dir: path.join(OUT, "video_tmp"), size: { width: 1680, height: 1000 } } : undefined,
  });
  const page = await context.newPage();
  await page.addInitScript((t) => window.localStorage.setItem("fpc_auth_access_token", t), TOKEN);
  page.on("pageerror", (e) => console.log("[uxf-addendum2] pageerror:", String(e).slice(0, 300)));
  return { context, page };
}

async function openSchemaSession(page, sid) {
  await page.goto(`${BASE}/app?project=${PID}&session=${sid}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(10000);
  const handle = await page.$('[data-testid="left-sidebar-handle"] button.leftSidebarHandleOpenBtn');
  if (handle) { await handle.click(); await page.waitForTimeout(1200); }
}

async function openTobeAccordion(page) {
  for (let i = 0; i < 3; i += 1) {
    const st = await page.evaluate(() => {
      const r = document.querySelector('[data-testid="tobe-section"] .tobeRow');
      return { visible: r ? r.getBoundingClientRect().height > 0 : false };
    });
    if (st.visible) return;
    await page.evaluate(() => {
      const acc = Array.from(document.querySelectorAll("button"))
        .find((b) => (b.textContent || "").trim().startsWith("TO BE") && (b.textContent || "").includes("Рабочее место технолога"));
      acc?.click();
    });
    await page.waitForTimeout(1200);
  }
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
  // ============ КОНТЕКСТ 1: A5/A6/A7/A8 (+ видео dock toggle) ============
  const { context: ctx1, page } = await newPage("dock_toggle");
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${PREFIX}_${n}.png`) });
  await openSchemaSession(page, SOUP_SID);

  // ---- A5: export-menu удалён, вкладки XML/DOC/DOD на месте ----
  const a5 = await page.evaluate(() => ({
    exportMenu: Boolean(document.querySelector('[data-testid="diagram-toolbar-export-menu"]')),
    tabs: Array.from(document.querySelectorAll(".diagramToolbarSlot--center .segBtn")).map((b) => (b.textContent || "").trim()),
  }));
  log("A5:", JSON.stringify(a5));
  if (a5.exportMenu) fail("A5: «Экспорт ▾» не удалён из среднего хедера");
  for (const t of ["XML", "DOC", "DOD"]) {
    if (!a5.tabs.some((x) => x.toUpperCase().includes(t))) fail(`A5: вкладка ${t} пропала из центральной группы`);
  }
  await shot("a5_header_no_export");

  // ---- A7: иконки слева с тултипами; TopBar без дублей/мёртвых пунктов ----
  const a7 = await page.evaluate(() => {
    const save = document.querySelector('[data-testid="diagram-toolbar-save"]');
    const create = document.querySelector('[data-testid="diagram-toolbar-create-revision"]');
    const leftOrder = Array.from(document.querySelectorAll(".diagramToolbarSlot--left [data-testid]"))
      .map((el) => el.getAttribute("data-testid"));
    return {
      leftOrder,
      saveTitle: save?.getAttribute("title") || "",
      saveAria: save?.getAttribute("aria-label") || "",
      saveHasSvg: Boolean(save?.querySelector("svg")),
      createTitle: create?.getAttribute("title") || "",
      createHasSvg: Boolean(create?.querySelector("svg")),
      technologistBtn: Boolean(document.querySelector('[data-testid="topbar-technologist-button"]')),
      modeSwitch: Boolean(document.querySelector('[data-testid="mode-switch"]')),
    };
  });
  log("A7:", JSON.stringify(a7));
  const seq = ["diagram-toolbar-save", "diagram-toolbar-create-revision", "diagram-toolbar-version-chip"];
  const pos = seq.map((t) => a7.leftOrder.indexOf(t));
  if (pos.some((p) => p < 0) || !(pos[0] < pos[1] && pos[1] < pos[2])) fail(`A7: порядок слева неверный: ${a7.leftOrder.join(",")}`);
  if (!a7.saveHasSvg || !a7.createHasSvg) fail("A7: действия не иконки (нет SVG)");
  if (!/Сохранить/.test(a7.saveTitle + a7.saveAria)) fail("A7: нет тултипа «Сохранить сессию»");
  if (!/верси/i.test(a7.createTitle)) fail("A7: нет тултипа «Создать версию BPMN»");
  if (a7.technologistBtn) fail("A7: кнопка «Технолог» показана на /app (дубль текущего местоположения)");
  if (!a7.modeSwitch) fail("A7: сегмент режимов пропал из TopBar");
  // мёртвый пункт «Профиль — скоро» отсутствует в меню аккаунта
  await page.click('[data-testid="topbar-account-button"]');
  await page.waitForTimeout(600);
  const profileSoon = await page.evaluate(() => Boolean(document.querySelector('[data-testid="topbar-account-profile-soon"]')));
  if (profileSoon) fail("A7: мёртвый пункт «Профиль — скоро» не убран");
  await shot("a7_topbar_account_menu");
  // Закрываем меню повторным кликом (НЕ Escape — он сворачивает левый сайдбар
  // через глобальный обработчик SidebarShell).
  await page.click('[data-testid="topbar-account-button"]');
  await page.waitForTimeout(400);

  // ---- A6: структура меню TO BE ----
  const hiddenHandle = await page.$('[data-testid="left-sidebar-handle"] button.leftSidebarHandleOpenBtn');
  if (hiddenHandle) { await hiddenHandle.click(); await page.waitForTimeout(1200); }
  await openTobeAccordion(page);
  const a6 = await page.evaluate(() => {
    const cur = document.querySelector('[data-testid="tobe-current-process"]');
    const curRows = cur ? Array.from(cur.querySelectorAll(".tobeRow")) : [];
    const proj = document.querySelector('[data-testid="tobe-project-list"]');
    const projRows = proj ? Array.from(proj.querySelectorAll(".tobeRow")) : [];
    const rowInfo = projRows.slice(0, 8).map((r) => {
      const st = r.querySelector(".tobeRow__status");
      return {
        h: Math.round(r.getBoundingClientRect().height),
        rightGap: Math.round(r.getBoundingClientRect().right - (st?.getBoundingClientRect().right || 0)),
        status: (st?.textContent || "").trim(),
        disabled: r.disabled === true,
      };
    });
    const emptyRow = document.querySelector(`[data-testid="tobe-open-e790842747"]`);
    const other = document.querySelector('[data-testid="tobe-other"]');
    const blank = document.querySelector('[data-testid="tobe-open-blank"]');
    return {
      currentRows: curRows.length,
      currentStatus: (curRows[0]?.querySelector(".tobeRow__status")?.textContent || "").trim(),
      currentPrimary: curRows[0]?.classList.contains("tobeRow--primary") === true,
      captions: Array.from(document.querySelectorAll(".tobeSection__caption")).map((c) => (c.textContent || "").trim()),
      rowInfo,
      emptyDisabled: emptyRow ? emptyRow.disabled === true : null,
      emptyStatus: (emptyRow?.querySelector(".tobeRow__status")?.textContent || "").trim(),
      otherCollapsed: other ? !other.hasAttribute("open") : null,
      otherCounter: (other?.querySelector("summary")?.textContent || "").trim(),
      blankIcon: (blank?.querySelector(".tobeRow__icon")?.textContent || "").trim(),
      blankPrimary: blank?.classList.contains("tobeRow--primary") === true,
      blankInFooter: Boolean(blank?.closest(".tobeSection__footer")),
    };
  });
  log("A6:", JSON.stringify(a6));
  if (a6.currentRows !== 1) fail(`A6: «Из этого процесса» не 1 строка: ${a6.currentRows}`);
  if (!/^(Создать|Открыть) TO BE/.test(a6.currentStatus)) fail(`A6: действие текущего процесса неверное: «${a6.currentStatus}»`);
  if (!a6.captions.includes("Из этого процесса") || !a6.captions.includes("Из проекта")) fail(`A6: нет заголовков секций: ${a6.captions}`);
  if (a6.rowInfo.some((r) => r.h !== 34)) fail(`A6: высота строк не единая 34px: ${JSON.stringify(a6.rowInfo.map((r) => r.h))}`);
  if (a6.rowInfo.some((r) => r.rightGap > 16)) fail(`A6: статус не выровнен вправо: ${JSON.stringify(a6.rowInfo.map((r) => r.rightGap))}`);
  if (a6.emptyDisabled !== true || a6.emptyStatus !== "пустая") fail(`A6: пустой источник не disabled/«пустая»: disabled=${a6.emptyDisabled} status=«${a6.emptyStatus}»`);
  if (a6.otherCollapsed === false) fail("A6: «Прочие» не свёрнуты");
  if (a6.otherCollapsed === true && !/\d+/.test(a6.otherCounter)) fail(`A6: у «Прочих» нет счётчика: «${a6.otherCounter}»`);
  if (!a6.blankPrimary || !a6.blankInFooter || !a6.blankIcon) fail("A6: футер «с чистого листа» неверен");
  await shot("a6_tobe_structure");

  // ---- A8: крошки — проект ведёт на список сессий; сессия — текст ----
  const a8c = await page.evaluate(() => ({
    projectIsButton: document.querySelector('[data-testid="breadcrumb-project"]')?.tagName === "BUTTON",
    sessionIsText: document.querySelector('[data-testid="breadcrumb-session"]')?.tagName === "SPAN",
    deadProcessCrumb: Array.from(document.querySelectorAll(".sidebarBreadcrumbBtn")).some((b) => (b.textContent || "").trim() === "Процесс"),
  }));
  log("A8 крошки:", JSON.stringify(a8c));
  if (!a8c.projectIsButton) fail("A8: крошка проекта не ссылка");
  if (!a8c.sessionIsText) fail("A8: текущая сессия должна быть текстом, не ссылкой");
  if (a8c.deadProcessCrumb) fail("A8: мёртвая крошка «Процесс» не убрана");
  await shot("a8_breadcrumbs");
  await page.click('[data-testid="breadcrumb-project"]');
  await page.waitForTimeout(5000);
  const afterCrumb = await page.evaluate(() => ({
    url: window.location.href,
    sessionGone: !window.location.search.includes("session="),
    hasNewSessionBtn: (document.body.textContent || "").includes("Новая сессия"),
    stepBarGone: !document.querySelector('[data-testid="session-step-bar"]'),
  }));
  log("A8 после крошки «проект»:", JSON.stringify(afterCrumb));
  if (!afterCrumb.sessionGone && !afterCrumb.hasNewSessionBtn) fail("A8: крошка «проект» не ведёт на список сессий");
  await shot("a8_breadcrumb_target");

  // ---- A8: dock left/right + persist (видео) ----
  await openSchemaSession(page, SOUP_SID);
  const before = await page.evaluate(() => ({
    dockRight: document.querySelector(".workspace")?.classList.contains("workspace--dockRight") === true,
    leftX: Math.round(document.querySelector(".workspaceLeft")?.getBoundingClientRect().x || 0),
    mainX: Math.round(document.querySelector(".workspaceMain")?.getBoundingClientRect().x || 0),
  }));
  log("A8 dock до:", JSON.stringify(before));
  if (before.dockRight || before.leftX >= before.mainX) fail("A8: стартовое положение не слева");
  await page.click('[data-testid="sidebar-dock-toggle"]');
  await page.waitForTimeout(1200);
  const docked = await page.evaluate(() => ({
    dockRight: document.querySelector(".workspace")?.classList.contains("workspace--dockRight") === true,
    leftX: Math.round(document.querySelector(".workspaceLeft")?.getBoundingClientRect().x || 0),
    mainX: Math.round(document.querySelector(".workspaceMain")?.getBoundingClientRect().x || 0),
    stored: window.localStorage.getItem("ui.sidebar.dock_side"),
  }));
  log("A8 dock после toggle:", JSON.stringify(docked));
  if (!docked.dockRight || docked.leftX <= docked.mainX) fail("A8: панель не переместилась направо");
  if (docked.stored !== "right") fail(`A8: dock_side не сохранён в localStorage: ${docked.stored}`);
  await shot("a8_dock_right");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(10000);
  const persisted = await page.evaluate(() => ({
    dockRight: document.querySelector(".workspace")?.classList.contains("workspace--dockRight") === true,
  }));
  log("A8 dock после reload:", JSON.stringify(persisted));
  if (!persisted.dockRight) fail("A8: положение dock не пережило reload (persist сломан)");
  const handle2 = await page.$('[data-testid="left-sidebar-handle"] button.leftSidebarHandleOpenBtn');
  if (handle2) { await handle2.click(); await page.waitForTimeout(1200); }
  await page.click('[data-testid="sidebar-dock-toggle"]');
  await page.waitForTimeout(1200);
  const backLeft = await page.evaluate(() => ({
    dockRight: document.querySelector(".workspace")?.classList.contains("workspace--dockRight") === true,
    stored: window.localStorage.getItem("ui.sidebar.dock_side"),
  }));
  log("A8 dock назад:", JSON.stringify(backLeft));
  if (backLeft.dockRight || backLeft.stored !== "left") fail("A8: возврат налево не сработал");
  await shot("a8_dock_left_back");
  await saveVideo(ctx1, page, "dock_toggle");

  // ============ КОНТЕКСТ 2: A9 rail → секция (видео) ============
  const { context: ctx2, page: page2 } = await newPage("rail_section");
  const shot2 = (n) => page2.screenshot({ path: path.join(OUT, `${PREFIX}_${n}.png`) });
  await openSchemaSession(page2, SOUP_SID);
  // сворачиваем панель (⟨ «Скрыть панель»)
  await page2.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button.sidebarIconBtn"))
      .find((b) => (b.getAttribute("title") || "") === "Скрыть панель");
    btn?.click();
  });
  await page2.waitForTimeout(1200);
  const rail = await page2.evaluate(() => ({
    railVisible: Boolean(document.querySelector('[data-testid="left-sidebar-handle"]')),
    items: Array.from(document.querySelectorAll(".leftSidebarHandleMini")).map((b) => ({
      title: b.getAttribute("title") || "",
      muted: b.disabled,
      glyph: Boolean(b.querySelector("svg")),
    })),
  }));
  log("A9 rail:", JSON.stringify(rail));
  if (!rail.railVisible) fail("A9: rail свёрнутого сайдбара не показан");
  const want = ["TO BE", "Свойства", "Пути", "Время шага", "Robot Meta", "Заметки", "AI-вопросы", "Шаблоны"];
  const got = rail.items.map((x) => x.title);
  if (want.some((w, i) => got[i] !== w)) fail(`A9: набор/порядок иконок неверный: ${got.join(",")}`);
  if (rail.items.some((x) => !x.glyph)) fail("A9: не у всех иконок есть глиф");
  await shot2("a9_rail_icons");
  // клик по «Свойства» — панель открывается сразу к секции «Свойства»
  await page2.evaluate(() => {
    const btn = Array.from(document.querySelectorAll(".leftSidebarHandleMini"))
      .find((b) => (b.getAttribute("title") || "") === "Свойства");
    btn?.click();
  });
  await page2.waitForTimeout(2500);
  const opened = await page2.evaluate(() => ({
    panelVisible: Boolean(document.querySelector(".leftSidebarBody")) && (document.querySelector(".leftSidebarBody")?.getBoundingClientRect().width || 0) > 100,
    propertiesOpen: document.querySelector('section[data-section-id="properties"] button')?.getAttribute("aria-expanded") === "true",
    tobeOpen: document.querySelector('section[data-section-id="tobe"] button')?.getAttribute("aria-expanded") === "true",
  }));
  log("A9 после клика «Свойства»:", JSON.stringify(opened));
  if (!opened.panelVisible) fail("A9: панель не развернулась по клику на иконку");
  if (!opened.propertiesOpen) fail("A9: секция «Свойства» не открыта после клика по иконке");
  if (opened.tobeOpen) fail("A9: открыта не та секция (tobe вместо properties)");
  await shot2("a9_section_properties_open");
  // повтор: свернуть → клик «TO BE»
  await page2.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button.sidebarIconBtn"))
      .find((b) => (b.getAttribute("title") || "") === "Скрыть панель");
    btn?.click();
  });
  await page2.waitForTimeout(1200);
  await page2.evaluate(() => {
    const btn = Array.from(document.querySelectorAll(".leftSidebarHandleMini"))
      .find((b) => (b.getAttribute("title") || "") === "TO BE");
    btn?.click();
  });
  await page2.waitForTimeout(2500);
  const opened2 = await page2.evaluate(() => ({
    tobeOpen: document.querySelector('section[data-section-id="tobe"] button')?.getAttribute("aria-expanded") === "true",
  }));
  log("A9 после клика «TO BE»:", JSON.stringify(opened2));
  if (!opened2.tobeOpen) fail("A9: секция «TO BE» не открыта после клика по иконке");
  await shot2("a9_section_tobe_open");
  await saveVideo(ctx2, page2, "rail_section");

  log("OK: все проверки addendum-2 зелёные");
  process.exitCode = 0;
} catch (e) {
  console.error("[uxf-addendum2] FAIL:", e?.message || e);
  process.exitCode = 1;
} finally {
  try { fs.rmSync(path.join(OUT, "video_tmp"), { recursive: true, force: true }); } catch {}
  await browser.close();
}
