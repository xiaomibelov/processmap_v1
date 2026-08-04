// P-1 (регрессия): мёртвая сессия — нет 404-каскада, есть экран «Сессия удалена».
//
// Сценарий (два браузерных контекста на одну sandbox-сессию):
//   A: открыта сессия (presence + remote-poll работают)
//   B: удаляет сессию через API (DELETE /api/sessions/{sid})
//   A: save в старой вкладке (клик по «Сохранить») → ожидания:
//     1. Ровно ≤1 PUT /bpmn → 404, НОЛЬ ретраев (entry-гейт saveCoordinator);
//     2. Экран мёртвой сессии: data-testid="dead-session-modal"
//        (кнопки «К списку сессий» / «Создать новую» / «Восстановить черновик»);
//     3. Конфликт-модал (409) НЕ показывается;
//     4. НЕТ серии 404 на /presence|/bpmn/versions|/meta после первого
//        (порог: ≤2 на endpoint — первый 404 + гонка in-flight);
//     5. «Восстановить черновик» создаёт новую сессию из локальной копии
//        и открывает её (после проверки sandbox-восстановленная сессия
//        удаляется через API — чистим за собой).
//
// Запуск (НЕ против stage без апрува координатора):
//   BASE_URL=https://stage.processmap.ru W4_TOKEN=<token> PID=<projectId> SID=<sandboxSessionId> \
//     node scripts/fix-p1/dead_session_check.mjs
// ВНИМАНИЕ: скрипт УДАЛЯЕТ сессию SID — использовать ТОЛЬКО sandbox-копию.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.BASE_URL || "http://localhost:8080";
const OUT = process.env.OUT_DIR || path.join(ROOT, "docs", "fix-p1");
const TOKEN = process.env.W4_TOKEN || "";
const PID = process.env.PID || "";
const SID = process.env.SID || "";
const RESULTS = [];
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[dead-p1]", ...a);
const record = (id, name, status, evidence) => {
  RESULTS.push({ id, name, status, evidence });
  log(`${id} [${status}] ${name} :: ${evidence}`);
};

if (!TOKEN || !PID || !SID) {
  console.error("Нужны env: W4_TOKEN, PID, SID (BASE_URL опционально)");
  process.exit(2);
}

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
const page = await context.newPage();
await page.addInitScript((t) => window.localStorage.setItem("fpc_auth_access_token", t), TOKEN);

// Счётчик 404 по endpoint'ам ПОСЛЕ удаления + счётчик PUT /bpmn (ретраи save).
const notFoundCounts = { presence: 0, versions: 0, meta: 0, session_get: 0 };
const putBpmn = { count: 0, statuses: [] };
let deletionDone = false;
page.on("response", (r) => {
  const u = r.url();
  if (deletionDone && r.request().method() === "PUT" && u.endsWith(`/api/sessions/${SID}/bpmn`)) {
    putBpmn.count += 1;
    putBpmn.statuses.push(r.status());
  }
  if (!deletionDone || r.status() !== 404) return;
  if (u.includes(`/api/sessions/${SID}/presence`)) notFoundCounts.presence += 1;
  else if (u.includes(`/api/sessions/${SID}/bpmn/versions`)) notFoundCounts.versions += 1;
  else if (u.includes(`/api/sessions/${SID}/meta`)) notFoundCounts.meta += 1;
  else if (u.endsWith(`/api/sessions/${SID}`)) notFoundCounts.session_get += 1;
});

try {
  // 1. Открываем сессию в окне A.
  await page.goto(`${BASE}/app?project=${PID}&session=${SID}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector('[data-testid="diagram-toolbar-save"]', { timeout: 60000 });
  await page.waitForTimeout(8000); // presence + remote-poll стартовали

  // 2. Удаляем сессию (окно B = API от имени того же пользователя).
  const del = await fetch(`${BASE}/api/sessions/${SID}`, { method: "DELETE", headers: H });
  record("P1-0", "DELETE sandbox-сессии", del.status === 200 || del.status === 204 ? "OK" : "БАГ", `status=${del.status}`);
  deletionDone = true;

  // 3. Save в старой вкладке ПОСЛЕ удаления: ровно один PUT → 404, без ретраев.
  //    (entry-гейт: после пометки мёртвой save short-circuit'ится без транспорта.)
  await page.locator('[data-testid="diagram-toolbar-save"]').first().click({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(10000);
  // Вторая попытка save — уже НЕ должна уходить в транспорт вообще.
  await page.locator('[data-testid="diagram-toolbar-save"]').first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(5000);
  const putOk = putBpmn.count <= 1 && (putBpmn.count === 0 || putBpmn.statuses.every((s) => s === 404));
  record(
    "P1-1",
    "Save в старой вкладке: ≤1 PUT /bpmn → 404, 0 ретраев",
    putOk ? "OK" : "БАГ",
    `putCount=${putBpmn.count} statuses=${JSON.stringify(putBpmn.statuses)}`,
  );

  // 4. Экран мёртвой сессии (детект через save-404 или presence/poll — до 2 циклов presence 45с + запас).
  let modalVisible = false;
  for (let i = 0; i < 20 && !modalVisible; i += 1) {
    await page.waitForTimeout(5000);
    modalVisible = await page.locator('[data-testid="dead-session-modal"]').isVisible().catch(() => false);
  }
  await page.screenshot({ path: path.join(OUT, "dead_session_modal.png"), fullPage: false });
  record("P1-2", "Экран мёртвой сессии показан", modalVisible ? "OK" : "БАГ", `dead-session-modal visible=${modalVisible} (скрин dead_session_modal.png)`);

  const conflictVisible = await page.locator('[data-testid="diagram-save-conflict-modal"]').isVisible().catch(() => false);
  record("P1-3", "Конфликт-модал (409) НЕ показывается на 404", conflictVisible ? "БАГ" : "OK", `conflictVisible=${conflictVisible}`);

  // 5. Каскад 404: после первого детекта серия должна прекратиться.
  const cascade = Object.values(notFoundCounts).some((n) => n > 2);
  record("P1-4", "Нет 404-каскада поллеров (≤2 на endpoint)", cascade ? "БАГ" : "OK", JSON.stringify(notFoundCounts));

  if (modalVisible) {
    // 6. Кнопки экрана мёртвой сессии.
    const backVisible = await page.locator('[data-testid="dead-session-back-to-list"]').isVisible().catch(() => false);
    const restoreVisible = await page.locator('[data-testid="dead-session-restore-draft"]').isVisible().catch(() => false);
    record(
      "P1-5",
      "Кнопки «К списку сессий» и «Восстановить черновик» доступны",
      backVisible && restoreVisible ? "OK" : "БАГ",
      `back=${backVisible} restore=${restoreVisible}`,
    );

    // 7. «Восстановить черновик»: создаёт новую сессию из локальной копии и открывает её.
    if (restoreVisible) {
      await page.locator('[data-testid="dead-session-restore-draft"]').click();
      let restoredSid = "";
      let restoredStage = false;
      for (let i = 0; i < 12 && !restoredStage; i += 1) {
        await page.waitForTimeout(5000);
        restoredStage = await page.locator('[data-testid="diagram-toolbar-save"]').isVisible().catch(() => false);
        const m = /[?&]session=([0-9a-zA-Z_-]+)/.exec(page.url());
        if (m && m[1] && m[1] !== SID) restoredSid = m[1];
        if (restoredStage && restoredSid) break;
      }
      await page.screenshot({ path: path.join(OUT, "dead_session_restored.png"), fullPage: false });
      record(
        "P1-6",
        "«Восстановить черновик» открывает новую живую сессию",
        restoredStage && restoredSid ? "OK" : "БАГ",
        `restoredStage=${restoredStage} restoredSid=${restoredSid || "n/a"} (скрин dead_session_restored.png)`,
      );
      // Чистим sandbox: восстановленная копия не нужна после проверки.
      if (restoredSid) {
        const cleanup = await fetch(`${BASE}/api/sessions/${restoredSid}`, { method: "DELETE", headers: H });
        log(`cleanup restored session ${restoredSid}: status=${cleanup.status}`);
      }
    } else {
      record("P1-6", "«Восстановить черновик» открывает новую живую сессию", "БАГ", "кнопка restore не показана — локальный черновик не найден");
    }
  } else {
    record("P1-5", "Кнопки «К списку сессий» и «Восстановить черновик» доступны", "БАГ", "модал не показан — действия недоступны");
    record("P1-6", "«Восстановить черновик» открывает новую живую сессию", "БАГ", "модал не показан — действие недоступно");
  }
} finally {
  fs.writeFileSync(path.join(OUT, "dead_session_results.json"), JSON.stringify(RESULTS, null, 1));
  await browser.close();
}
const failed = RESULTS.filter((r) => r.status === "БАГ");
log(`ИТОГ: ${RESULTS.length - failed.length}/${RESULTS.length} OK`);
process.exit(failed.length ? 1 : 0);
