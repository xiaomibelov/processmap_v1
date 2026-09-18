// E2E-спека среза fix/canvas-overlays-preferences-409 (F2) — единый
// version-tracker preferences + auth-retry с актуальной base_version
// (audit H1, CONFIRMED).
//
// Симулированный 401 — route-инъекция 401 на ближайший PATCH preferences
// (прецедент инъекции 409 — overlays-restore-after-reimport.spec.mjs); refresh
// реальный (refresh-cookie контекста валиден), retry идёт на живой сервер с
// version-CAS. Два контекста = две независимые «вкладки» (прецедент двух
// контекстов — async-save-multiuser.spec.mjs).
//
// Сценарии:
//   1. forced 401 на PATCH статус-фильтра → refresh → retry со свежей
//      base_version → 0 повторных 409; UI без raw errors (inline-alert нет).
//   2. два контекста: вкладка B подняла версию → у A forced 401 → retry со
//      stale base → ровно один 409 (LWW-ретрай) → 200; затем flush treeSaver
//      у A идёт с синхронизированной версией → новых 409 нет; обе правки в
//      финальном документе.
//
// Скриншоты до/после: frontend/test-results/preferences-409/<scenario>-*.png.

import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture } from "./helpers/processFixture.mjs";

const SHOTS_DIR = path.resolve("test-results", "preferences-409");
const PREFS_URL = /\/api\/users\/me\/preferences$/;
const HIDDEN_KEY = "explorer.status_filters.hidden";
const WORKSPACE_NAME = "Main Workspace";
const WORKSPACE_ID = "ws_org_default_main";
const PREFS_SCOPE = `org_default::${WORKSPACE_ID}`;
const FLUSH_WAIT_MS = 15_000;

function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => {
    errors.push(String(err?.message || err || ""));
  });
  return errors;
}

/** Журнал PATCH preferences: статусы + тела ответов + base_version запросов. */
function trackPrefsPatches(page) {
  const stats = { count401: 0, count409: 0, count200: 0, requestBaseVersions: [], responseDocs: [] };
  page.on("request", (request) => {
    if (!PREFS_URL.test(request.url()) || request.method() !== "PATCH") return;
    try {
      const body = JSON.parse(request.postData() || "{}");
      stats.requestBaseVersions.push(Number(body?.base_version ?? -1));
    } catch {
      stats.requestBaseVersions.push(-1);
    }
  });
  page.on("response", (response) => {
    if (!PREFS_URL.test(response.url()) || response.request().method() !== "PATCH") return;
    const status = response.status();
    if (status === 401) stats.count401 += 1;
    else if (status === 409) stats.count409 += 1;
    else if (status === 200) stats.count200 += 1;
    response.json().then((doc) => stats.responseDocs.push({ status, doc })).catch(() => {});
  });
  return stats;
}

function trackRefresh(page) {
  const stats = { count: 0 };
  page.on("response", (response) => {
    if (response.url().includes("/api/auth/refresh") && response.request().method() === "POST") {
      stats.count += 1;
    }
  });
  return stats;
}

async function screenshotStep(page, name) {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: false });
}

async function bootWorkspaceExplorer(page, request, runId, auth) {
  const fixture = await createFixture(request, runId, auth.headers);
  const projectTitle = `E2E save ${runId}`;
  await openWorkspaceExplorer(page, auth, projectTitle);
  return { fixture, projectTitle };
}

/** Открывает /app и дожидается ExplorerPane workspace с фикстурным проектом. */
async function openWorkspaceExplorer(page, auth, projectTitle) {
  await setUiToken(page, auth.accessToken, { activeOrgId: auth.activeOrgId });
  await page.goto("/app");
  // Орг-пикер (если active_org не подхватился) — как в overlays-спеке.
  const chooser = page.getByText("Выберите организацию").first();
  for (let i = 0; i < 40; i += 1) {
    if (await chooser.isVisible().catch(() => false)) {
      await page.getByRole("button", { name: /Default/i }).first().click();
      break;
    }
    if (await page.getByTestId("workspace-filter-toolbar").isVisible().catch(() => false)) break;
    await page.waitForTimeout(500);
  }
  const workspaceItem = page.getByText(WORKSPACE_NAME, { exact: true }).first();
  await expect(workspaceItem).toBeVisible({ timeout: 30_000 });
  await workspaceItem.click();
  await expect(page.getByTestId("workspace-filter-toolbar")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(projectTitle, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
}

async function openStatusMenu(page) {
  await page.getByRole("button", { name: "Настроить статусы" }).click();
  const checkboxes = page.getByRole("checkbox");
  await expect(checkboxes.first()).toBeVisible({ timeout: 10_000 });
  return checkboxes;
}

/** Одиночная инъекция 401 на ближайший PATCH preferences; дальше — continue. */
async function injectNextPatch401(page) {
  let injected = false;
  await page.route(PREFS_URL, async (route) => {
    if (!injected && route.request().method() === "PATCH") {
      injected = true;
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "missing_bearer" }),
      });
    }
    return route.continue();
  });
  return async () => {
    await page.unroute(PREFS_URL).catch(() => {});
  };
}

async function fetchServerPrefs(request, auth) {
  const res = await request.get(`${API_BASE}/api/users/me/preferences`, { headers: auth.headers });
  expect(res.ok(), `GET preferences: ${res.status()}`).toBeTruthy();
  return res.json();
}

/** Сбрасывает hidden-статуса для scope теста — детерминизм между прогонами. */
async function resetHiddenScope(request, auth) {
  const doc = await fetchServerPrefs(request, auth);
  const value = { ...(doc?.preferences?.[HIDDEN_KEY] || {}) };
  delete value[PREFS_SCOPE];
  const res = await request.patch(`${API_BASE}/api/users/me/preferences`, {
    headers: auth.headers,
    data: { base_version: Number(doc?.version || 0), set: { [HIDDEN_KEY]: value }, unset: [] },
  });
  expect(res.ok(), `reset hidden scope: ${res.status()}`).toBeTruthy();
}

async function waitForCondition(check, timeoutMs = FLUSH_WAIT_MS, stepMs = 100) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  throw new Error("wait_for_condition_timeout");
}

// ---------------------------------------------------------------------------
// Сценарий 1: forced 401 на PATCH → refresh → retry → 0 повторных 409
// ---------------------------------------------------------------------------

test("preferences auth-retry: forced 401 на PATCH статус-фильтра → refresh → retry → 0 повторных 409, UI без raw errors", async ({ page, request }) => {
  const runId = `prefs401_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  await resetHiddenScope(request, auth);
  const pageErrors = collectPageErrors(page);
  const patches = trackPrefsPatches(page);
  const refresh = trackRefresh(page);

  const { projectTitle } = await bootWorkspaceExplorer(page, request, runId, auth);
  await screenshotStep(page, "1-forced401-before");

  // Шаг A: раскрытие проекта → treeSaver flush (PATCH #1, 200) — успех treeSaver
  // обязан синхронизировать query cache, иначе следующий писатель получит 409.
  await page.getByRole("button", { name: `Показать сессии проекта ${projectTitle}` }).click();
  await page.getByText(`E2E save session ${runId}`, { exact: true }).waitFor({ timeout: 20_000 });
  await waitForCondition(() => patches.count200 >= 1);
  const docAfterTree = patches.responseDocs.filter((r) => r.status === 200).at(-1)?.doc;
  expect(docAfterTree?.preferences?.["explorer.tree.expanded"], "treeSaver flush применён на сервере").toBeTruthy();

  // Шаг B: статус-фильтр без 401 (PATCH #2, 200, свежая версия из трекера).
  const checkboxes = await openStatusMenu(page);
  await checkboxes.nth(1).click(); // «Готово» → скрыть
  await waitForCondition(() => patches.count200 >= 2);
  expect(patches.count409, "до инъекции 409 не было").toBe(0);
  const versionBefore401 = patches.responseDocs.filter((r) => r.status === 200).at(-1)?.doc?.version;

  // Шаг C: forced 401 на следующий PATCH → apiCore refresh → retry.
  const removeInjection = await injectNextPatch401(page);
  try {
    await checkboxes.nth(2).click(); // «Черновик» → скрыть
    await waitForCondition(() => patches.count401 >= 1 && patches.count200 >= 3);
  } finally {
    await removeInjection();
  }

  expect(patches.count401, "инъекция дала ровно один 401").toBe(1);
  expect(refresh.count, "refresh после 401").toBeGreaterThanOrEqual(1);
  expect(patches.count409, "0 повторных 409 после auth-retry").toBe(0);
  const retryBase = patches.requestBaseVersions.at(-1);
  expect(retryBase, "retry со свежей base_version из трекера").toBe(Number(versionBefore401));

  // UI: чекбокс «Черновик» стал скрыт (unchecked), inline-alert отсутствует,
  // ни одного необработанного pageerror.
  await expect(checkboxes.nth(2)).not.toBeChecked();
  await expect(page.getByTestId("status-prefs-save-error")).toHaveCount(0);
  expect(pageErrors, `pageerrors: ${pageErrors.join(" | ")}`).toEqual([]);

  // Серверный финал: оба статуса скрыты, версия продвинулась тремя записями.
  const finalDoc = await fetchServerPrefs(request, auth);
  const hiddenValue = finalDoc?.preferences?.[HIDDEN_KEY] || {};
  const hidden = hiddenValue[PREFS_SCOPE] || hiddenValue[WORKSPACE_ID] || [];
  expect(hidden, `hidden=${JSON.stringify(hiddenValue)}`).toEqual(expect.arrayContaining(["done", "draft"]));

  await screenshotStep(page, "1-forced401-after");
});

// ---------------------------------------------------------------------------
// Сценарий 2: два контекста — гонка версий → максимум один 409 (LWW)
// ---------------------------------------------------------------------------

test("preferences race: вкладка B подняла версию → у A forced 401 → ровно один 409 (LWW) → обе правки сохранены", async ({ page, request, browser }) => {
  const runId = `prefs409_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  await resetHiddenScope(request, auth);

  const pageErrorsA = collectPageErrors(page);
  const patchesA = trackPrefsPatches(page);
  const refreshA = trackRefresh(page);
  const { projectTitle } = await bootWorkspaceExplorer(page, request, runId, auth);

  // Вкладка B: второй независимый контекст (свои storage/cookies).
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  try {
    const pageErrorsB = collectPageErrors(pageB);
    const patchesB = trackPrefsPatches(pageB);
    await openWorkspaceExplorer(pageB, auth, projectTitle);

    // B скрывает «Готово» → версия уходит вперёд без ведома A.
    const checkboxesB = await openStatusMenu(pageB);
    await checkboxesB.nth(1).click();
    await waitForCondition(() => patchesB.count200 >= 1);

    // A: forced 401 + PATCH со stale base (A не знает версию B) → refresh →
    // retry со stale base → ровно один 409 → LWW-ретрай со снапшотом → 200.
    await screenshotStep(page, "2-race-before");
    const removeInjection = await injectNextPatch401(page);
    let checkboxesA = null;
    try {
      checkboxesA = await openStatusMenu(page);
      await checkboxesA.nth(2).click(); // «Черновик» → скрыть
      await waitForCondition(() => patchesA.count401 >= 1 && patchesA.count200 >= 1, 20_000);
    } finally {
      await removeInjection();
    }

    expect(patchesA.count401, "ровно один инъектированный 401").toBe(1);
    expect(patchesA.count409, "максимум один 409 на гонку (LWW-ретрай дал 200)").toBe(1);
    expect(patchesA.count200, "retry после 409 завершился успехом").toBe(1);
    expect(refreshA.count, "refresh после 401").toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId("status-prefs-save-error")).toHaveCount(0);
    expect(pageErrorsA, `pageerrors A: ${pageErrorsA.join(" | ")}`).toEqual([]);

    // A: теперь flush treeSaver (раскрытие проекта) — версия уже синхронна
    // через adopt LWW-снапшота → новых 409 быть не должно.
    await page.getByRole("button", { name: `Показать сессии проекта ${projectTitle}` }).click();
    await page.getByText(`E2E save session ${runId}`, { exact: true }).waitFor({ timeout: 20_000 });
    await waitForCondition(() => patchesA.count200 >= 2);
    expect(patchesA.count409, "treeSaver flush после LWW — без новых 409").toBe(1);

    // Финальный документ: обе правки на месте.
    // Финальный документ: LWW — победила последняя успешная запись (A):
    // «draft» скрыт, «done» перезаписан (A не видел правку B — осознанная
    // семантика LWW на уровне scoped-ключа, audit H1 её не меняет).
    const finalDoc = await fetchServerPrefs(request, auth);
    const hiddenValue = finalDoc?.preferences?.[HIDDEN_KEY] || {};
    const hidden = hiddenValue[PREFS_SCOPE] || hiddenValue[WORKSPACE_ID] || [];
    expect(hidden, `hidden=${JSON.stringify(hiddenValue)}`).toEqual(["draft"]);
    expect(finalDoc?.version).toBeGreaterThanOrEqual(2);

    // UI B не пострадал: чекбокс «Готово» остался скрытым, raw errors нет.
    await expect(checkboxesB.nth(1)).not.toBeChecked();
    expect(pageErrorsB, `pageerrors B: ${pageErrorsB.join(" | ")}`).toEqual([]);

    await screenshotStep(page, "2-race-after");
    await screenshotStep(pageB, "2-race-tabB");
  } finally {
    await contextB.close();
  }
});
