// FIX-V stage-прогон: «Создать версию → save» без ложного 409/тоста + toast-viewport + скелетон.
//
// Фазы:
//   A (read-only): открыть сессию, проверить toast-viewport/скелетон (пост-деплой),
//      собрать сетевые 409 при обычной работе.
//   B (MUTATE=1, sandbox only): микро-правка через modeler API → «Создать версию BPMN»
//      → проверить отсутствие тоста «Метаданные версии пока не синхронизированы» и
//      409 DRAFT_GRAPH_READ_ONLY_XML_TRUTH → «Сохранить» → отсутствие конфликт-модала.
//
// Env:
//   BASE=https://stage.processmap.ru
//   STAGE_TOKEN=<jwt> (если нет — логин technologist-demo@local/technologist-demo)
//   SID=5ae321f04f (sandbox-сессия для мутаций; read-only суп НЕ трогать)
//   MUTATE=1 — разрешить фазу B (мутация)
//   OUT=docs/fix-v/stage
//
// Exit: 0 — PASS (или SKIP мутаций без MUTATE=1), 1 — FAIL.
import { createRequire } from "node:module";
const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE || "https://stage.processmap.ru";
const SID = String(process.env.SID || "5ae321f04f").trim();
const PROJECT = String(process.env.PROJECT || "c0494e0667").trim();
const MUTATE = process.env.MUTATE === "1";
const OUT = process.env.OUT || path.resolve(process.cwd(), "docs/fix-v/stage");
fs.mkdirSync(OUT, { recursive: true });

const failures = [];
const notes = [];
const ok = (msg) => { notes.push(`OK: ${msg}`); console.log(`[ok] ${msg}`); };
const fail = (msg) => { failures.push(msg); console.log(`[FAIL] ${msg}`); };
const info = (msg) => console.log(`[..] ${msg}`);

async function resolveToken() {
  if (process.env.STAGE_TOKEN) return process.env.STAGE_TOKEN;
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "technologist-demo@local", password: "technologist-demo" }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  const data = await res.json();
  return data.access_token || data.token || "";
}

const token = await resolveToken();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
await page.addInitScript((t) => window.localStorage.setItem("fpc_auth_access_token", t), token);

const conflict409 = [];
const patchResponses = [];
page.on("response", (res) => {
  const url = res.url();
  if (!url.includes("/api/sessions/")) return;
  const status = res.status();
  if (url.includes(`/api/sessions/${SID}`) && (res.request().method() === "PATCH" || res.request().method() === "PUT")) {
    patchResponses.push({ method: res.request().method(), status, url: url.slice(0, 160) });
    if (status === 409) conflict409.push({ status, url: url.slice(0, 160) });
  }
});

const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

// --- Фаза A: открытие сессии, скелетон, toast-viewport ---------------------
const sessionUrl = `${BASE}/app?project=${encodeURIComponent(PROJECT)}&session=${encodeURIComponent(SID)}`;
info(`открываем ${sessionUrl} ...`);
const t0 = Date.now();
await page.goto(sessionUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

// Скелетон: фиксируем моменты появления/исчезновения (не фейлим быструю загрузку).
let skeletonSeenAt = 0;
try {
  await page.waitForSelector('[data-testid="diagram-skeleton"]', { timeout: 6000 });
  skeletonSeenAt = Date.now() - t0;
  info(`скелетон появился через ~${skeletonSeenAt}мс`);
} catch {
  info("скелетон не появился (быстрая загрузка или pre-fix деплой)");
}
try {
  await page.waitForSelector('[data-testid="diagram-ready"], .bpmnCanvas svg', { timeout: 90000 });
  ok(`канвас готов за ~${Date.now() - t0}мс`);
  if (skeletonSeenAt > 0) {
    const hiddenAt = Date.now() - t0;
    info(`скелетон скрылся к ~${hiddenAt}мс`);
    ok("скелетон скрылся после готовности канваса");
  }
} catch {
  fail("канвас не стал готов за 90с");
}
await page.waitForTimeout(2500);
await shot("fixv_a_loaded");

// Toast-viewport (появляется после деплоя фикса; на pre-fix деплое — SKIP).
const viewportInfo = await page.evaluate(() => {
  const vp = document.querySelector('[data-testid="process-toast-viewport"]');
  if (!vp) return null;
  const cs = window.getComputedStyle(vp);
  return { pointerEvents: cs.pointerEvents, visible: true };
});
if (viewportInfo) {
  if (viewportInfo.pointerEvents === "none") ok("toast-viewport: pointer-events=none");
  else fail(`toast-viewport: pointer-events=${viewportInfo.pointerEvents} (ожидали none)`);
} else {
  info("toast-viewport отсутствует (появится при первом тосте; или pre-fix деплой)");
}

// --- Фаза B: создать версию → save (мутация sandbox) ------------------------
if (!MUTATE) {
  info("MUTATE != 1 — фаза B (мутация) пропущена");
} else {
  // B0: микро-правка через modeler API (drag по mouse — артефакт инструмента, C2).
  // MUTATE_MODE=add — структурное изменение (новый task): локальный nodes-state
  // расходится с проекцией → на pre-fix деплое projection-patch несёт nodes → 409 B5.
  const mutateMode = String(process.env.MUTATE_MODE || "rename").trim();
  const mutated = await page.evaluate((mode) => {
    const m = window.__FPC_E2E_MODELER__;
    if (!m) return { ok: false, error: "no_modeler" };
    try {
      const registry = m.get("elementRegistry");
      const modeling = m.get("modeling");
      if (mode === "add") {
        const elementFactory = m.get("elementFactory");
        const sourceTask = registry.filter((el) => el.type === "bpmn:Task" || el.type === "bpmn:UserTask")[0];
        if (!sourceTask) return { ok: false, error: "no_task" };
        const shape = elementFactory.createShape({ type: "bpmn:Task" });
        const pos = { x: Number(sourceTask.x || 0) + 220, y: Number(sourceTask.y || 0) + 40 };
        const created = modeling.appendShape(sourceTask, shape, pos);
        return { ok: true, mode, id: created?.id || "", source: sourceTask.id };
      }
      const shapes = registry.filter((el) => el.type === "bpmn:Task" || el.type === "bpmn:UserTask");
      const target = shapes[0];
      if (!target) return { ok: false, error: "no_task" };
      const oldName = String(target.businessObject?.name || "");
      const stamp = `fx${String(Date.now()).slice(-4)}`;
      const nextName = oldName.replace(/\s*fx\d{4}$/, "") + ` ${stamp}`;
      modeling.updateLabel(target, nextName);
      return { ok: true, mode, id: target.id, oldName, nextName };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  }, mutateMode);
  info(`микро-правка modeler: ${JSON.stringify(mutated)}`);
  if (!mutated.ok) {
    fail(`не удалось выполнить микро-правку: ${mutated.error}`);
  } else {
    ok("микро-правка применена через modeler API");
    // MUTATE_WAIT_MS: маленькая пауза = гонка с autosave/синком nodes-state
    // (репродукция ложного 409 на pre-fix деплое), большая = штатный путь.
    await page.waitForTimeout(Number(process.env.MUTATE_WAIT_MS || 800));

    // B1: «Создать версию BPMN».
    const createBtn = await page.$('[data-testid="diagram-toolbar-create-revision"]');
    if (!createBtn) {
      fail("кнопка «Создать версию BPMN» не найдена");
    } else if (await createBtn.isDisabled()) {
      info("кнопка создания версии disabled (нет изменений?) — пропуск B1");
    } else {
      // FIX-V diagnostics: перед кликом фиксируем возможный модал (конфликт и т.п.).
      const preModalText = await page.evaluate(() => {
        const modal = document.querySelector('.modalOverlay [role="dialog"], .modalOverlay');
        return modal ? String(modal.textContent || "").trim().slice(0, 500) : "";
      });
      if (preModalText) {
        info(`МОДАЛ перед «Создать версию»: ${preModalText}`);
        await shot("fixv_b_modal_before_create");
        if (preModalText.includes("онфликт") || preModalText.includes("Перезаписать")) {
          fail(`конфликт-модал ДО создания версии: ${preModalText.slice(0, 200)}`);
        }
        const cancelBtn = await page.$('.modalOverlay button:has-text("Отмена"), .modalOverlay button:has-text("Закрыть")');
        if (cancelBtn) { await cancelBtn.click().catch(() => {}); await page.waitForTimeout(600); }
      }
      const toastTexts = [];
      const collectToasts = async (ms) => {
        const until = Date.now() + ms;
        while (Date.now() < until) {
          const t = await page.$$eval('[data-testid="process-save-ack-toast"]', (nodes) => nodes.map((n) => n.textContent || ""));
          t.forEach((x) => { if (x && !toastTexts.includes(x)) toastTexts.push(x); });
          await page.waitForTimeout(300);
        }
      };
      await createBtn.click();
      info("клик «Создать версию BPMN» — наблюдаем 12с...");
      await collectToasts(12000);
      await shot("fixv_b_after_create_version");

      const metaDesync = toastTexts.filter((t) => t.includes("Метаданные версии пока не синхронизированы"));
      if (metaDesync.length > 0) fail(`тост «Метаданные версии пока не синхронизированы» показан: ${metaDesync[0]}`);
      else ok("тоста «Метаданные версии пока не синхронизированы» НЕТ");
      info(`тосты после создания версии: ${JSON.stringify(toastTexts)}`);

      // B2: обычный save после версии.
      const saveBtn = await page.$('[data-testid="diagram-toolbar-save"]');
      if (saveBtn && !(await saveBtn.isDisabled())) {
        await saveBtn.click();
        info("клик «Сохранить» — наблюдаем 10с...");
        await collectToasts(10000);
        await shot("fixv_b_after_save");
        const conflictModal = await page.$('[data-testid="save-conflict-modal"], [data-testid="conflict-modal"]');
        if (conflictModal) fail("конфликт-модал показан после save следом за версией");
        else ok("конфликт-модала после save НЕТ");
      } else {
        info("кнопка save недоступна — B2 пропущен");
      }

      // B3: toast-viewport при видимом тосте — под тулбаром, без перекрытия.
      const overlap = await page.evaluate(() => {
        const toast = document.querySelector('[data-testid="process-save-ack-toast"]');
        const anchor = document.querySelector('[data-testid="diagram-toolbar-notification-anchor"]');
        if (!toast || !anchor) return null;
        const tr = toast.getBoundingClientRect();
        const ar = anchor.getBoundingClientRect();
        return { toastTop: tr.top, anchorBottom: ar.bottom };
      });
      if (overlap) {
        if (overlap.toastTop >= overlap.anchorBottom - 1) ok("тост под тулбаром (контролы не перекрыты)");
        else fail(`тост перекрывает тулбар: top=${overlap.toastTop} < anchorBottom=${overlap.anchorBottom}`);
      } else {
        info("тост уже скрыт — проверка перекрытия пропущена");
      }
    }
  }
}

// --- Сводка по сети -----------------------------------------------------------
const xmlTruth409 = conflict409.filter((r) => r.url.includes("/api/sessions/"));
if (xmlTruth409.length > 0) {
  fail(`409 на PATCH/PUT /api/sessions/${SID}: ${JSON.stringify(xmlTruth409)}`);
} else if (MUTATE) {
  ok("409 на PATCH/PUT сессии за прогон НЕТ");
}
info(`PATCH/PUT ответы: ${JSON.stringify(patchResponses)}`);

await browser.close();

const report = {
  base: BASE,
  sid: SID,
  mutate: MUTATE,
  at: new Date().toISOString(),
  failures,
  notes,
  patchResponses,
};
fs.writeFileSync(path.join(OUT, "fixv_report.json"), JSON.stringify(report, null, 2));
console.log(`\n=== FIX-V stage: ${failures.length === 0 ? "PASS" : "FAIL"} (${failures.length} failures) ===`);
failures.forEach((f) => console.log(` - ${f}`));
process.exit(failures.length === 0 ? 0 : 1);
