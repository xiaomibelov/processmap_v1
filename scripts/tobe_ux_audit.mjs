// TOBE-UX аудит (stage, read-only): факты P1–P6 для редизайна.
// Сессия: TO BE gate681 «Салат Греческий» (орг 8b89c83ea810, 221 узел AS IS).
// Скрины + DOM-замеры → docs/ux/audit/. EXIT=0 всегда (аудит, не гейт).
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.E2E_BASE || "https://stage.processmap.ru";
const OUT = path.join(ROOT, "docs", "ux", "audit");
const PID = "9f4c3f90be";
const SID = "1d3f7de3fa"; // TO BE gate681 (13956)
const ORG = "8b89c83ea810";

fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[ux-audit]", ...a);
const facts = {};

const res = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "d.belov@automacon.ru", password: "Beelive12!" }),
});
const TOKEN = (await res.json()).access_token;

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1680, height: 1000 } })).newPage();
await page.addInitScript(({ t, org }) => {
  window.localStorage.setItem("fpc_auth_access_token", t);
  window.localStorage.setItem("fpc_active_org_id", org);
  window.sessionStorage.setItem("fpc_org_choice_done:389893aa9e1e4823aa9b0f4498817655", "1");
}, { t: TOKEN, org: ORG });

await page.goto(`${BASE}/app?project=${PID}&session=${SID}`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(14000);

// вкладка «TO BE» (на всякий случай)
await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll("button")).find((x) => (x.textContent || "").trim() === "TO BE");
  b?.click();
});
await page.waitForTimeout(6000);
await page.screenshot({ path: path.join(OUT, "tobe_00_workspace_full.png"), fullPage: false });
log("tobe_00_workspace_full.png");

// ── P1: замеры канваса ──────────────────────────────────────────────
facts.p1_canvas = await page.evaluate(() => {
  const svg = document.querySelector(".bjs-container, .djs-container svg, canvas")?.closest("div");
  const candidates = Array.from(document.querySelectorAll("div")).filter((d) => {
    const r = d.getBoundingClientRect();
    return r.width > 800 && r.height > 100 && d.querySelector("svg.djs-svg, .djs-container");
  });
  const canvasHost = candidates.sort((a, b) => {
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    return ra.width * ra.height - rb.width * rb.height;
  })[0];
  const vp = { w: window.innerWidth, h: window.innerHeight };
  if (!canvasHost) return { error: "canvas host not found", viewport: vp };
  const r = canvasHost.getBoundingClientRect();
  return {
    viewport: vp,
    canvasRect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    canvasPctOfViewportH: Math.round((r.height / vp.h) * 100),
    canvasClass: canvasHost.className.slice(0, 120),
  };
});
log("P1 canvas:", JSON.stringify(facts.p1_canvas));

// зум/fit/миникарта контролы
facts.p1_controls = await page.evaluate(() => {
  const txt = (el) => (el ? (el.getAttribute("title") || el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40) : null);
  const btns = Array.from(document.querySelectorAll("button, [role=button]"));
  const zoomish = btns.map(txt).filter((t) => t && /zoom|fit|масштаб|впис|миникарт|minimap/i.test(t));
  return { zoomFitControls: zoomish, minimapNode: !!document.querySelector(".djs-minimap, .coverageMiniMap") };
});
log("P1 controls:", JSON.stringify(facts.p1_controls));

// ── P5: хедер шагов — disabled-стили ────────────────────────────────
facts.p5_steps = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll("button, [role=button], a, div"))
    .filter((el) => /Импорт AS IS|Трансформация|Конструктор|Проверка|Публикация|Пилот/.test((el.textContent || "").trim()) && (el.textContent || "").trim().length < 40);
  return all.slice(0, 12).map((el) => {
    const cs = getComputedStyle(el);
    return {
      text: (el.textContent || "").trim().slice(0, 24),
      tag: el.tagName, cls: (el.className || "").slice(0, 60),
      disabled: el.disabled === true || el.getAttribute("aria-disabled") === "true",
      color: cs.color, bg: cs.backgroundColor, opacity: cs.opacity, cursor: cs.cursor,
    };
  });
});
log("P5 steps:", JSON.stringify(facts.p5_steps, null, 1));

// ── P6: тулбар — подписи кнопок ─────────────────────────────────────
facts.p6_toolbar = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button"))
    .map((b) => ({
      text: (b.textContent || "").trim().slice(0, 30),
      title: (b.getAttribute("title") || "").slice(0, 60),
      aria: (b.getAttribute("aria-label") || "").slice(0, 60),
      visible: b.offsetParent !== null,
    }))
    .filter((b) => b.visible && /Связать|AS IS|Связи происхождения|Свойства|Проверить|Опубликовать|Экспорт/.test(b.text + b.title + b.aria));
  return btns;
});
log("P6 toolbar:", JSON.stringify(facts.p6_toolbar, null, 1));

// ── P3: вкладки панели параметров ───────────────────────────────────
facts.p3_tabs = await page.evaluate(() => {
  const tabs = Array.from(document.querySelectorAll("[role=tab], button, a"))
    .map((el) => (el.textContent || "").trim())
    .filter((t) => /^(Шаг|Блок|Поток|Шаблон|Сущности|Решения|Замечания|Рецепт|Версии|История|Пилот)$/.test(t));
  return { count: new Set(tabs).size, tabs: [...new Set(tabs)] };
});
log("P3 tabs:", JSON.stringify(facts.p3_tabs));

// клик по узлу канваса → панель параметров видна
await page.evaluate(() => {
  const el = document.querySelector('[data-element-id^="Activity_"]');
  const hit = el?.querySelector(".djs-hit, .djs-outline") || el;
  hit?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
});
await page.waitForTimeout(2000);
await page.screenshot({ path: path.join(OUT, "tobe_01_node_selected_params.png"), fullPage: false });
log("tobe_01_node_selected_params.png");

// ── P2: панель «Замечания» ──────────────────────────────────────────
const remarksTab = await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll("button, [role=tab], a")).find((x) => (x.textContent || "").trim() === "Замечания");
  if (b) { b.click(); return true; }
  return false;
});
await page.waitForTimeout(3000);
await page.screenshot({ path: path.join(OUT, "tobe_02_remarks_panel.png"), fullPage: false });
log("tobe_02_remarks_panel.png (tab found:", remarksTab, ")");

facts.p2_remarks = await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll("div, li"))
    .filter((el) => el.children.length > 0 && el.offsetParent !== null)
    .filter((el) => /ошиб|error|warn|предупр/i.test(el.textContent || "") && (el.textContent || "").length < 500 && (el.textContent || "").length > 20)
    .slice(0, 6)
    .map((el) => ({ cls: (el.className || "").slice(0, 50), text: (el.textContent || "").trim().slice(0, 120) }));
  const groupHeaders = Array.from(document.querySelectorAll("div, h3, h4"))
    .filter((el) => el.offsetParent !== null && (el.textContent || "").trim().length < 60)
    .map((el) => (el.textContent || "").trim())
    .filter((t) => /групп|правил|импорт|трансформац|dry-run|проверк/i.test(t))
    .slice(0, 8);
  return { sampleCards: cards, groupHeaders };
});
log("P2 remarks:", JSON.stringify(facts.p2_remarks, null, 1));

// ── P4: шаг ↔ рабочая область ───────────────────────────────────────
const stepClick = async (name) => page.evaluate((n) => {
  const el = Array.from(document.querySelectorAll("button, [role=button], a, div"))
    .find((x) => (x.textContent || "").trim() === n);
  if (!el) return false;
  el.click();
  return true;
}, name);

const recipeClicked = await stepClick("Рецепт");
await page.waitForTimeout(4000);
facts.p4_recipe_step = await page.evaluate(() => {
  const hasRecipeForm = !!Array.from(document.querySelectorAll("input, select, form"))
    .find((el) => el.offsetParent !== null && /рецепт|блюд|sku|техкарт/i.test((el.getAttribute("placeholder") || "") + (el.getAttribute("name") || "") + (el.closest("div")?.textContent || "").slice(0, 80)));
  const canvasVisible = !!document.querySelector(".djs-container svg, .bjs-container");
  return { recipeFormVisible: !!hasRecipeForm, canvasStillVisible: canvasVisible };
});
await page.screenshot({ path: path.join(OUT, "tobe_03_step_recipe.png"), fullPage: false });
log("tobe_03_step_recipe.png (clicked:", recipeClicked, ")", JSON.stringify(facts.p4_recipe_step));

// вернуться на шаг «Конструктор» для финального скрина
await stepClick("Конструктор");
await page.waitForTimeout(3000);

fs.writeFileSync(path.join(OUT, "tobe_audit_facts.json"), JSON.stringify(facts, null, 2));
log("facts → docs/ux/audit/tobe_audit_facts.json");
await browser.close();
log("AUDIT DONE");
