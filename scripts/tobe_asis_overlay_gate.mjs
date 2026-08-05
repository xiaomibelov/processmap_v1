// Gate PR #681 (stage): вердикт C — TO BE из схемной сессии не-default орга
// показывает AS IS-слой (раньше «Сессия AS IS пуста» из-за overlay без org-контекста).
// (1) орг «Роботизация производств», TO BE из «Салат Греческий с томатами» (221 узел)
//     → canvas-asis слой с узлами, БЕЗ ws-empty карточки.
// (2) empty-state UX (орг Default, пустая AS IS «UXF probe empty AS IS»):
//     одна карточка: «Выбрать сессию» первичная + «с чистого листа» вторичная,
//     тулбар disabled с title, баннер не дублирует.
// Артефакты → docs/tobe-asis-overlay/gate_*.png. EXIT=0 при успехе.
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.E2E_BASE || "https://stage.processmap.ru";
const OUT = path.join(ROOT, "docs", "tobe-asis-overlay");
const UID = "389893aa9e1e4823aa9b0f4498817655";
const ORG_ROB = "8b89c83ea810"; // «Роботизация производств» (не-default)
const PID_ROB = "9f4c3f90be";
const SID_SALAD = "05e59e4aea"; // «Салат Греческий с томатами» (as_is, 221 узел)
const PID_DEF = "c0494e0667";
const SID_EMPTY = "e790842747"; // «UXF probe empty AS IS» (as_is, пустая)

fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[tobe-asis-gate]", ...a);
const fail = (msg) => { throw new Error(msg); };

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "d.belov@automacon.ru", password: "Beelive12!" }),
  });
  const data = await res.json();
  if (!data.access_token) fail(`login: ${JSON.stringify(data).slice(0, 200)}`);
  return data.access_token;
}

const TOKEN = await login();
log("login ok");

const browser = await chromium.launch();

async function mkPage(orgId) {
  const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
  const page = await context.newPage();
  await page.addInitScript(({ t, org, uid }) => {
    window.localStorage.setItem("fpc_auth_access_token", t);
    window.localStorage.setItem("fpc_active_org_id", org);
    window.sessionStorage.setItem(`fpc_org_choice_done:${uid}`, "1");
  }, { t: TOKEN, org: orgId, uid: UID });
  return { context, page };
}

async function createTobeAndEnter(page, projectId, asisSid, name, tag) {
  await page.goto(`${BASE}/app?project=${projectId}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.join(OUT, `debug_${tag}_1_project.png`) }).catch(() => {});
  await page.click('button:has-text("Новая сессия")');
  await page.waitForSelector('[data-testid="session-create-modal"]', { timeout: 20000 });
  await page.waitForTimeout(1500);
  // TO BE радио — по тексту (стабильнее testid при ре-рендерах)
  await page.click('[data-testid="session-create-modal"] label:has-text("TO BE")');
  await page.waitForSelector('[data-testid="session-asis-select"]', { timeout: 15000 });
  await page.selectOption('[data-testid="session-asis-select"]', asisSid);
  await page.fill('[data-testid="session-create-name"]', name);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `debug_${tag}_2_modal.png`) }).catch(() => {});
  await page.click('[data-testid="session-create-submit"]');
  await page.waitForTimeout(4000);
  // если модал остался/переоткрылся — закрыть и войти кликом по строке сессии
  await page.keyboard.press("Escape").catch(() => {});
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) => (x.textContent || "").trim() === "Отмена");
    if (b) b.click();
  }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.evaluate((nm) => {
    const rows = Array.from(document.querySelectorAll("tr, [role='row']"));
    const row = rows.find((x) => (x.textContent || "").includes(nm));
    (row?.querySelector("button, a") || row)?.click();
  }, name);
  try {
    await page.waitForSelector('[data-testid="canvas-overlay"], [data-testid="ws-empty"]', { timeout: 90000 });
  } catch (e) {
    await page.screenshot({ path: path.join(OUT, `debug_${tag}_3_stuck.png`) }).catch(() => {});
    const dump = await page.evaluate(() => Array.from(document.querySelectorAll("[data-testid]")).slice(0, 60).map((x) => x.getAttribute("data-testid")).join(",")).catch(() => "n/a");
    log(`debug ${tag} testids:`, dump);
    throw e;
  }
  await page.waitForTimeout(6000); // загрузка AS IS + import-bpmn
}

try {
  // ── (1) вердикт C: схемная AS IS в не-default орге → слой виден
  const { context: ctx1, page: p1 } = await mkPage(ORG_ROB);
  await createTobeAndEnter(p1, PID_ROB, SID_SALAD, `TO BE gate681: Салат Греческий (${Date.now() % 100000})`, "g1");
  const r1 = await p1.evaluate(() => ({
    asisNodes: document.querySelectorAll('[data-testid="canvas-asis"] g[data-element-id]:not(.graph-canvas__lane)').length,
    asisLabel: document.querySelector('[data-testid="canvas-overlay"] .ws__canvas-label')?.textContent || "",
    emptyCard: !!document.querySelector('[data-testid="ws-empty"]'),
    notice: document.querySelector('[data-testid="ws-notice"]')?.textContent || "",
  }));
  log("gate1:", JSON.stringify(r1));
  await p1.screenshot({ path: path.join(OUT, "gate1_asid_layer_visible.png") });
  if (r1.asisNodes < 50) fail(`gate1: AS IS-слой пуст (${r1.asisNodes} узлов) — регрессия вердикта C`);
  if (r1.emptyCard) fail("gate1: показана карточка «Сессия AS IS пуста» при живом источнике");
  await ctx1.close();
  log("gate1 OK: AS IS-слой виден, узлов:", r1.asisNodes);

  // ── (2) empty-state UX: одна карточка, один набор действий, тулбар disabled
  const { context: ctx2, page: p2 } = await mkPage("org_default");
  await createTobeAndEnter(p2, PID_DEF, SID_EMPTY, `TO BE gate681: empty (${Date.now() % 100000})`, "g2");
  await p2.waitForSelector('[data-testid="ws-empty"]', { timeout: 60000 });
  const r2 = await p2.evaluate(() => {
    const pick = document.querySelector('[data-testid="ws-pick-session"]');
    const blank = document.querySelector('[data-testid="ws-blank-start"]');
    const action = document.querySelector('[data-testid="ws-action"]');
    return {
      pickExists: !!pick,
      pickPrimary: pick?.className.includes("primary") || false,
      pickText: pick?.textContent || "",
      blankExists: !!blank,
      blankPrimary: blank?.className.includes("primary") || false,
      actionDisabled: action?.disabled || false,
      actionTitle: action?.getAttribute("title") || "",
      noticeText: document.querySelector('[data-testid="ws-notice"]')?.textContent || "",
      oldBackBtn: !!document.querySelector('[data-testid="ws-empty-back"]'),
      oldTransformDisabledBtn: !!document.querySelector('[data-testid="ws-transform-disabled"]'),
    };
  });
  log("gate2:", JSON.stringify(r2));
  await p2.screenshot({ path: path.join(OUT, "gate2_empty_state_single_cta.png") });
  if (!r2.pickExists || !r2.pickPrimary) fail("gate2: «Выбрать сессию» отсутствует или не первичная");
  if (!r2.blankExists || r2.blankPrimary) fail("gate2: «с чистого листа» отсутствует или не вторичная");
  if (!r2.actionDisabled || !r2.actionTitle) fail("gate2: тулбар не disabled с title-причиной");
  if (r2.noticeText.includes("пуста")) fail("gate2: баннер дублирует empty-state сообщение");
  if (r2.oldBackBtn || r2.oldTransformDisabledBtn) fail("gate2: старые дубли на месте");
  await ctx2.close();
  log("gate2 OK: empty-state без дублей");

  log("GATE PASSED");
  process.exitCode = 0;
} catch (e) {
  console.error("[tobe-asis-gate] FAIL:", e?.message || e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
