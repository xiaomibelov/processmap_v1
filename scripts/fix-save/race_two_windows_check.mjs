// C1 (регрессия P1 / F1): гонка сохранений из двух окон — конфликт-UX.
//
// Сценарий (два браузерных контекста на одну сессию):
//   A: правка → save → 200 (rev+1)
//   B: правка → save со stale base → 409
// Ожидание (трек A):
//   1. B видит конфликт-модал (data-testid="diagram-save-conflict-modal");
//   2. фронт B НЕ делает молчаливый авто-PUT 200 после 409 (чужие правки A
//      не перезаписаны без выбора пользователя);
//   3. «Перезаписать мои изменения» — осознанный force: PUT 200 с
//      source_action=manual_save_overwrite_conflict.
//
// Запуск (НЕ против stage без апрува координатора):
//   BASE_URL=https://stage.processmap.ru W4_TOKEN=<token> PID=<projectId> SID=<sessionId> \
//     node scripts/fix-save/race_two_windows_check.mjs
// Локально: поднять backend+frontend (docker-compose.local / vite preview),
// создать sandbox-сессию и передать её SID. Скрипт деструктивен для сессии
// (двигает узел и перезаписывает её) — использовать ТОЛЬКО sandbox-копию.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.BASE_URL || "http://localhost:8080";
const OUT = process.env.OUT_DIR || path.join(ROOT, "docs", "fix-save");
const TOKEN = process.env.W4_TOKEN || "";
const PID = process.env.PID || "";
const SID = process.env.SID || "";
const RESULTS = [];
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[race-ui]", ...a);
const record = (id, name, status, evidence) => {
  RESULTS.push({ id, name, status, evidence });
  log(`${id} [${status}] ${name} :: ${evidence}`);
};

if (!TOKEN || !PID || !SID) {
  console.error("Нужны env: W4_TOKEN, PID, SID (BASE_URL опционально, default http://localhost:8080)");
  process.exit(2);
}

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
async function api(method, p, body) {
  const r = await fetch(`${BASE}${p}`, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}
const getRev = async (sid) => (await api("GET", `/api/sessions/${sid}`)).json?.diagram_state_version;

const browser = await chromium.launch();

async function newWindow(label) {
  const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
  const page = await context.newPage();
  await page.addInitScript((t) => window.localStorage.setItem("fpc_auth_access_token", t), TOKEN);
  const track = { label, putBpmn: [] };
  page.on("response", (r) => {
    const u = r.url();
    if (u.includes(`/api/sessions/${SID}/bpmn`) && r.request().method() === "PUT") {
      const body = r.request().postData() || "";
      let sourceAction = "";
      try { sourceAction = JSON.parse(body)?.source_action || ""; } catch {}
      track.putBpmn.push({ status: r.status(), sourceAction });
    }
  });
  page.on("pageerror", (e) => log(`[${label}] pageerror:`, String(e).slice(0, 200)));
  return { context, page, track };
}

async function openSession(page) {
  await page.goto(`${BASE}/app?project=${PID}&session=${SID}`, { waitUntil: "domcontentloaded", timeout: 90000 });
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
  const xml = (await api("GET", `/api/sessions/${sid}/bpmn?raw=1`)).text;
  const re = new RegExp(`<dc:Bounds[^>]*id="${elementId}_di"[^>]*x="([0-9.]+)"`, "i");
  const alt = new RegExp(`bpmnElement="${elementId}"[^>]*>[\\s\\S]{0,200}?x="([0-9.]+)"`, "i");
  const m = xml.match(re) || xml.match(alt);
  return m ? Number(m[1]) : null;
}

// Правка узла мышью. NB (C2/F9): Playwright mouse-drag по канвасу bpmn.io —
// нестабилен (артефакт инструмента, drag-механика modeler'а исправна — см.
// c2_modeler_move_check.mjs), поэтому правка проверяется по серверному XML
// после save и при необходимости повторяется.
async function dragTask(page, task, dx) {
  await page.mouse.move(task.x, task.y);
  await page.mouse.down();
  await page.mouse.move(task.x + dx, task.y, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(1500);
}

// A: правка + save → ждём подтверждения по серверному XML (x сместился на dx).
async function editAndSaveVerified(win, dx) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const task = await firstTaskBox(win.page);
    if (!task) return { ok: false, error: "no task on canvas" };
    const x0 = await taskXmlX(SID, task.id);
    await dragTask(win.page, task, dx);
    await win.page.click('[data-testid="diagram-toolbar-save"]');
    await win.page.waitForTimeout(5000);
    const x1 = await taskXmlX(SID, task.id);
    if (x0 !== null && x1 !== null && Math.abs(x1 - x0 - dx) < 8) {
      return { ok: true, id: task.id, x0, x1, attempt };
    }
    log(`[${win.track.label}] drag/save не подтверждён (attempt ${attempt}): x ${x0}→${x1}`);
  }
  return { ok: false, error: "drag not registered after 3 attempts (Playwright mouse artifact)" };
}

async function main() {
  const rev0 = await getRev(SID);
  const A = await newWindow("A");
  const B = await newWindow("B");
  await openSession(A.page);
  await openSession(B.page);

  // A: правка + save → 200
  const editA = await editAndSaveVerified(A, 96);
  if (!editA.ok) {
    record("C1-0", "A: правка+save подтверждена по XML", "БЛОК", editA.error);
    await browser.close();
    process.exit(2);
  }
  const revA = await getRev(SID);

  // B: правка + save со stale base → 409 → конфликт-модал.
  // Перетаскиваем узел и сохраняем; если PUT не ушёл (drag не зарегистрирован
  // modeler'ом — артефакт мыши), повторяем до 3 раз.
  let conflictSeen = false;
  for (let attempt = 1; attempt <= 3 && !conflictSeen; attempt += 1) {
    const task = await firstTaskBox(B.page);
    if (!task) break;
    await dragTask(B.page, task, 48);
    await B.page.click('[data-testid="diagram-toolbar-save"]');
    await B.page.waitForTimeout(6000);
    conflictSeen = B.track.putBpmn.some((r) => r.status === 409);
    if (!conflictSeen) {
      log(`[B] 409 не получен (attempt ${attempt}), PUTs=${JSON.stringify(B.track.putBpmn)}`);
    }
  }

  const modalVisible = await B.page.locator('[data-testid="diagram-save-conflict-modal"]').isVisible().catch(() => false);
  const overwriteBtn = B.page.locator('[data-testid="diagram-save-conflict-modal-overwrite"]');
  const overwriteVisible = modalVisible && await overwriteBtn.isVisible().catch(() => false);
  const bPutStatuses = B.track.putBpmn.map((r) => r.status);
  const silentAutoOverwrite = B.track.putBpmn.some((r, i) => i > 0 && r.status === 200);

  await B.page.screenshot({ path: path.join(OUT, "race_B_conflict_modal.png") }).catch(() => {});

  record("C1-1", "B: save со stale base → 409", bPutStatuses.includes(409) ? "OK" : "БАГ",
    `PUT /bpmn statuses=[${bPutStatuses.join(",")}]`);
  record("C1-2", "B: конфликт-модал показан (механика конфликта явная)",
    modalVisible && overwriteVisible ? "OK" : "БАГ",
    `modal=${modalVisible} overwriteBtn=${overwriteVisible}`);
  record("C1-3", "B: НЕТ молчаливого авто-overwrite после 409 (чужие правки не перезаписаны)",
    !silentAutoOverwrite ? "OK" : "БАГ",
    `rev ${rev0}→${revA}, PUTs=${JSON.stringify(B.track.putBpmn)}`);

  // Пользователь выбирает «Перезаписать мои изменения» — осознанный force.
  if (overwriteVisible) {
    await overwriteBtn.click();
    await B.page.waitForTimeout(5000);
    const revAfterOverwrite = await getRev(SID);
    const overwritePut = B.track.putBpmn.find((r) => r.sourceAction === "manual_save_overwrite_conflict" && r.status === 200);
    record("C1-4", "«Перезаписать мои изменения» → force PUT 200 с audit source_action",
      overwritePut && revAfterOverwrite === revA + 1 ? "OK" : "БАГ",
      `overwritePut=${JSON.stringify(overwritePut || null)} rev ${revA}→${revAfterOverwrite}`);
  }

  fs.writeFileSync(path.join(OUT, "race_two_windows_results.json"), JSON.stringify(RESULTS, null, 2));
  const failed = RESULTS.filter((r) => r.status === "БАГ").length;
  log(`done: ${RESULTS.length - failed}/${RESULTS.length} OK, results → ${path.join(OUT, "race_two_windows_results.json")}`);
  await A.context.close();
  await B.context.close();
  await browser.close();
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("[race-ui] ERROR:", error?.stack || error);
  process.exit(1);
});
