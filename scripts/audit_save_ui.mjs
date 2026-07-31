// АУДИТ save-pipeline — UI-сценарии против stage (воспроизведение, код не меняется).
// S1-UI-1: правка→save→Rev+1→reload→данные на месте (+ S5-UXF: иконка = тот же PUT /bpmn)
// S1-UI-2: два окна, save со stale base → что видит пользователь (409 UX)
// S2-UI: повторный вход в TO BE — дубликаты?
// S5: #627 («Сохранение не завершено»), OL1 md5-инвариант AS IS
import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = "https://stage.processmap.ru";
const OUT = path.join(ROOT, "docs", "audit");
const TOKEN = process.env.W4_TOKEN;
const PID = "c0494e0667";
const SOUP = "13f1f10b20";
const RESULTS = [];
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[audit-ui]", ...a);
const record = (id, name, status, evidence, severity = "") => {
  RESULTS.push({ id, name, status, evidence, severity });
  log(`${id} [${status}] ${name} :: ${evidence}`);
};

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
async function api(method, p, body) {
  const r = await fetch(`${BASE}${p}`, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}
const getRev = async (sid) => (await api("GET", `/api/sessions/${sid}`)).json?.diagram_state_version;
const getXml = async (sid) => (await api("GET", `/api/sessions/${sid}/bpmn?raw=1`)).text;
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");

const browser = await chromium.launch();

async function newPage(track) {
  const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
  const page = await context.newPage();
  await page.addInitScript((t) => window.localStorage.setItem("fpc_auth_access_token", t), TOKEN);
  if (track) {
    track.requests = [];
    page.on("response", (r) => {
      const u = r.url();
      if (u.includes("/api/sessions/") && ["PUT", "PATCH", "POST", "DELETE"].includes(r.request().method())) {
        track.requests.push(`${r.request().method()} ${u.replace(BASE, "")} → ${r.status()}`);
      }
    });
  }
  page.on("pageerror", (e) => console.log("[audit-ui] pageerror:", String(e).slice(0, 200)));
  return { context, page, track };
}

async function openSoup(page) {
  await page.goto(`${BASE}/app?project=${PID}&session=${SOUP}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector('[data-testid="diagram-toolbar-save"]', { timeout: 60000 });
  await page.waitForTimeout(8000);
}

async function firstTaskBox(page) {
  return page.evaluate(() => {
    const el = document.querySelector('g[data-element-id^="Task_"], g[data-element-id^="Activity_"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { id: el.getAttribute("data-element-id"), x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
}

async function taskXmlX(sid, elementId) {
  const xml = await getXml(sid);
  const re = new RegExp(`<dc:Bounds[^>]*id="${elementId}_di"[^>]*x="([0-9.]+)"`, "i");
  const alt = new RegExp(`bpmnElement="${elementId}"[^>]*>[\\s\\S]{0,200}?x="([0-9.]+)"`, "i");
  const m = xml.match(re) || xml.match(alt);
  return m ? Number(m[1]) : null;
}

// ================= S1-UI-1 (+ S5-UXF) =================
async function s1_basic() {
  const { context, page, track } = await newPage({ requests: [] });
  await openSoup(page);
  const rev0 = await getRev(SOUP);
  const task = await firstTaskBox(page);
  if (!task) { record("S1-UI-1", "базовое сохранение", "БЛОК", "нет task на канвасе", "блокер"); await context.close(); return; }
  const x0 = await taskXmlX(SOUP, task.id);
  // drag узла на +96px по X
  await page.mouse.move(task.x, task.y);
  await page.mouse.down();
  await page.mouse.move(task.x + 96, task.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(1500);
  await page.click('[data-testid="diagram-toolbar-save"]');
  await page.waitForTimeout(5000);
  const rev1 = await getRev(SOUP);
  const x1 = await taskXmlX(SOUP, task.id);
  // reload → данные на месте?
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="diagram-toolbar-save"]', { timeout: 60000 });
  await page.waitForTimeout(8000);
  const x1r = await taskXmlX(SOUP, task.id);
  const putBpmn = track.requests.filter((r) => r.includes("PUT") && r.includes("/bpmn"));
  record("S1-UI-1", "правка→save→Rev+1→reload→позиция сохранена",
    rev1 === rev0 + 1 && x1 !== null && x0 !== null && Math.abs(x1 - x0 - 96) < 8 && x1r === x1 ? "OK" : "БАГ",
    `rev ${rev0}→${rev1} x ${x0}→${x1}→(reload)${x1r} node=${task.id}`, "блокер");
  record("S5-UXF", "иконка «Сохранить» вызывает тот же PUT /bpmn (обработчик не потерян)",
    putBpmn.length > 0 && putBpmn.every((r) => r.endsWith("→ 200")) ? "OK" : "БАГ",
    `network=[${putBpmn.join(" | ")}]`, "серьёзная");
  // вернуть узел назад
  const task2 = await firstTaskBox(page);
  await page.mouse.move(task2.x, task2.y);
  await page.mouse.down();
  await page.mouse.move(task2.x - 96, task2.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(1500);
  await page.click('[data-testid="diagram-toolbar-save"]');
  await page.waitForTimeout(5000);
  const x2 = await taskXmlX(SOUP, task.id);
  log("restore: x =", x2, "(исходная", x0, ")");
  await context.close();
}

// ================= S1-UI-2: два окна =================
async function s1_two_windows() {
  const A = await newPage({ requests: [] });
  const B = await newPage({ requests: [] });
  await openSoup(A.page);
  await openSoup(B.page);
  const rev0 = await getRev(SOUP);
  // A: правка + save
  const tA = await firstTaskBox(A.page);
  await A.page.mouse.move(tA.x, tA.y);
  await A.page.mouse.down();
  await A.page.mouse.move(tA.x + 40, tA.y + 40, { steps: 8 });
  await A.page.mouse.up();
  await A.page.waitForTimeout(1200);
  await A.page.click('[data-testid="diagram-toolbar-save"]');
  await A.page.waitForTimeout(5000);
  const revA = await getRev(SOUP);
  // B (stale base): правка + save → ожидаем конфликт UX
  const tB = await firstTaskBox(B.page);
  await B.page.mouse.move(tB.x, tB.y);
  await B.page.mouse.down();
  await B.page.mouse.move(tB.x - 40, tB.y - 40, { steps: 8 });
  await B.page.mouse.up();
  await B.page.waitForTimeout(1200);
  await B.page.click('[data-testid="diagram-toolbar-save"]');
  await B.page.waitForTimeout(6000);
  const revB = await getRev(SOUP);
  const bNet = B.track.requests.join(" | ");
  const bUi = await B.page.evaluate(() => {
    const conflict = document.querySelector('[data-testid*="conflict"], .conflictModal, [class*="conflict"]');
    const toasts = Array.from(document.querySelectorAll('[role="alert"], .toast, [data-testid*="toast"], [data-testid*="save"]'))
      .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim()).filter((t) => t && t.length < 200).slice(0, 5);
    const chip = document.querySelector('[data-testid="diagram-toolbar-diagram-state-version-chip"]');
    return {
      conflictVisible: conflict ? conflict.getBoundingClientRect().height > 0 : false,
      conflictText: conflict ? (conflict.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160) : "",
      toasts,
      chipText: (chip?.textContent || "").trim(),
      chipClass: chip?.className || "",
    };
  });
  await B.page.screenshot({ path: path.join(OUT, "s1_two_windows_B_after_save.png") });
  const saw409 = bNet.includes("→ 409");
  const conflictShown = bUi.conflictVisible || /конфликт|conflict|новая версия/i.test(bUi.conflictText + " " + bUi.toasts.join(" "));
  const stable = revB === revA; // B не должен перезаписать
  record("S1-UI-2", "два окна: save со stale base → 409 + понятный UX, данных A не потеряны",
    saw409 && stable ? (conflictShown ? "OK" : "БАГ(UX)") : "БАГ",
    `rev ${rev0}→A:${revA}→B:${revB} B.net=[${bNet}] conflictUI=${JSON.stringify(bUi).slice(0, 300)}`,
    saw409 && stable ? (conflictShown ? "" : "серьёзная") : "блокер");
  // восстановление: B reload → узел вернуть в исходное через A
  await A.context.close();
  await B.context.close();
  // вернуть позицию узла: drag +40/+40 обратно
  const R = await newPage(null);
  await openSoup(R.page);
  const tR = await firstTaskBox(R.page);
  await R.page.mouse.move(tR.x, tR.y);
  await R.page.mouse.down();
  await R.page.mouse.move(tR.x - 40, tR.y - 40, { steps: 8 });
  await R.page.mouse.up();
  await R.page.waitForTimeout(1200);
  await R.page.click('[data-testid="diagram-toolbar-save"]');
  await R.page.waitForTimeout(5000);
  await R.context.close();
}

// ================= S2-UI: повторный вход в TO BE =================
async function countTobeSessions() {
  const r = await api("GET", `/api/projects/${PID}/sessions?limit=200`);
  const items = r.json?.items || r.json?.sessions || (Array.isArray(r.json) ? r.json : []);
  return {
    total: items.length,
    tobe: items.filter((s) => /TO BE/i.test(s.title || "")).map((s) => `${s.id}:${(s.title || "").slice(0, 40)}`),
  };
}

async function s2_tobe_reentry() {
  const before = await countTobeSessions();
  const { context, page } = await newPage(null);
  await openSoup(page);
  let toastSeen = "";
  page.on("console", (m) => { if (/Сохранение не завершено/i.test(m.text())) toastSeen = m.text(); });
  // вход #1 через сегмент
  await page.click('.diagramToolbarSlot--center [data-testid="mode-switch-tobe"]');
  await page.waitForSelector('[data-testid="tobe-left-panel"]', { timeout: 60000 });
  await page.waitForTimeout(8000);
  // сразу выход (быстрый вход-выход — проверка «Сохранение не завершено»)
  await page.click('[data-testid="tobe-left-panel"] [data-testid="mode-switch-schema"]');
  await page.waitForSelector('.diagramToolbarSlot--center [data-testid="mode-switch"]', { timeout: 60000 });
  await page.waitForTimeout(3000);
  const toast1 = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('[role="alert"], [data-testid*="toast"], [class*="toast"]'));
    return els.map((e) => (e.textContent || "").replace(/\s+/g, " ").trim()).filter((t) => /сохранен/i.test(t)).slice(0, 3);
  });
  // вход #2
  await page.click('.diagramToolbarSlot--center [data-testid="mode-switch-tobe"]');
  await page.waitForSelector('[data-testid="tobe-left-panel"]', { timeout: 60000 });
  await page.waitForTimeout(6000);
  const ctxTitle = await page.evaluate(() => (document.querySelector(".tobeLeft__title")?.textContent || "").trim());
  await page.click('[data-testid="tobe-left-panel"] [data-testid="mode-switch-schema"]');
  await page.waitForTimeout(4000);
  await context.close();
  const after = await countTobeSessions();
  const newTobe = after.tobe.filter((t) => !before.tobe.includes(t));
  record("S2-UI", "повторный вход в TO BE из той же AS IS — без дубликатов",
    newTobe.length === 0 ? "OK" : "БАГ",
    `tobe before=${before.tobe.length} after=${after.tobe.length} new=[${newTobe}] ctx=«${ctxTitle}»`,
    newTobe.length === 0 ? "" : "серьёзная");
  record("S5-#627", "быстрый вход/выход TO BE — нет застрявшего «Сохранение не завершено»",
    toast1.length === 0 && !toastSeen ? "OK" : "БАГ",
    `toasts=${JSON.stringify(toast1)} console=${toastSeen.slice(0, 120)}`, "серьёзная");
}

// ================= S5-OL1: md5 инвариант AS IS =================
async function s5_ol1_md5() {
  const xmlNow = await getXml(SOUP);
  const h = md5(xmlNow);
  const expected = "54211b88a54d"; // префикс инварианта из контекста трека
  record("S5-OL1", "md5 AS IS XML супа — инвариант read-only",
    h.startsWith(expected) ? "OK" : "ФАКТ",
    `md5=${h} bytes=${xmlNow.length} expectedPrefix=${expected}*`,
    h.startsWith(expected) ? "" : "серьёзная");
}

// ================= S5-W4: шаг «Конструктор» done только после реального сохранения =================
async function s5_w4() {
  const { context, page } = await newPage({ requests: [] });
  await openSoup(page);
  await page.click('.diagramToolbarSlot--center [data-testid="mode-switch-tobe"]');
  await page.waitForSelector('[data-testid="tobe-left-panel"]', { timeout: 60000 });
  await page.waitForTimeout(8000);
  const steps = await page.evaluate(() => {
    const slot = document.querySelector('[data-testid="tobe-steps-slot"]');
    return (slot?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240);
  });
  const stepStates = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('[data-testid="tobe-steps-slot"] [class*="step"], [data-testid^="session-step"]'));
    return items.map((el) => ({
      text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
      done: /done|complete|success/i.test(el.className || "") || el.getAttribute("data-state") === "done",
    })).slice(0, 10);
  });
  const bpmnPuts = (await newPage({ requests: [] })).track; // not used
  record("S5-W4", "состояния шагов W4 (наблюдение)",
    "ФАКТ", `steps="${steps}" states=${JSON.stringify(stepStates).slice(0, 300)}`, "");
  await page.screenshot({ path: path.join(OUT, "s5_w4_tobe_steps.png") });
  await context.close();
}

const t0 = Date.now();
log("старт UI-аудита");
await s1_basic();
await s1_two_windows();
await s2_tobe_reentry();
await s5_ol1_md5();
await s5_w4();
log(`готово за ${((Date.now() - t0) / 1000).toFixed(0)}s`);
fs.writeFileSync("/tmp/audit_ui_results.json", JSON.stringify(RESULTS, null, 2));
await browser.close();
console.log(JSON.stringify(RESULTS, null, 2));
process.exit(0);
