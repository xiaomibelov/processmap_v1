// RED-тесты контура fix/canvas-editing-stability (этап 1, TDD red).
//
// Контракт стабильности сохранения (продолжение контракта perf из PR #952):
//   5. Одиночная сессия на heavy-схеме (250+): полный пользовательский путь
//      (таска → текст → сайтбар «Свойства» → BPMN-свойство → вторая таска →
//      «Сохранить» → «Новая версия») — 0 ответов HTTP 409.
//   6. Фоновая активность (presence heartbeat ~5 с, remote-session sync 30 с)
//      НЕ меняет серверную diagram_state_version: 15 с простоя — версия равна,
//      0 ответов 409.
//   7. Внешнее изменение версии (вторая вкладка = другой browser context,
//      другой client id → same-tab auto-resolve НЕ срабатывает):
//      a) «Оставить мою версию»: «Сохранить» в вкладке A → РОВНО ОДИН ответ
//         409 → модалка конфликта → overwrite успешен, правки A не потеряны,
//         серверная версия выросла.
//      b) «Загрузить версию с сервера»: после 409 → refresh → схема вкладки B
//         видна на канвасе A → повторное «Сохранить» (с новой правкой)
//         проходит БЕЗ 409 — baseVersion синхронизирован с сервером.
//
// Ожидания этапа 1 (RED): тест 5 может пасть на 409 от прямых PATCH вне очереди
// (App.jsx:2652/3190, useDraft.js:67 — без base → BASE_VERSION_REQUIRED);
// тест 7 может пасть на молчаливую перезагрузку/отсутствие модалки (кросс-таб
// синка версий пока нет — P1 из PLAN.md). Фактические причины фиксируются в
// TESTS_REPORT.md и являются входом для этапа 2.
//
// Запуск (worktree, host без node — всё в docker):
//   dev-server:  docker run -d --name pm-canvas-stab-vite \
//                  -v <worktree>/frontend:/app -w /app -p 5197:5197 \
//                  -e VITE_PORT=5197 \
//                  -e VITE_API_PROXY_TARGET=http://host.docker.internal:8011 \
//                  node:20 npm run dev -- --host 0.0.0.0 --strictPort
//   прогон:      docker run --rm -v <worktree>:/ws -w /ws/frontend \
//                  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
//                  -e E2E_APP_BASE_URL=http://172.17.0.1:5197 \
//                  -e E2E_API_BASE_URL=http://172.17.0.1:8011 \
//                  local-playwright:v1.58.2 npx playwright test \
//                  e2e/canvas-editing-stability.spec.mjs
//
// ВАЖНО: VITE_PORT=5197 обязателен (иначе HMR reload-loop, см. TESTS_REPORT
// прошлого контура); вместо host.docker.internal для тестов — gateway-IP
// 172.17.0.1 (vite allowedHosts блокирует незнакомые Host-заголовки).

import { expect, test } from "@playwright/test";

import {
  bootstrapHeavySession,
  clickCreateRevisionAndWait,
  clickToolbarSave,
  clickToolbarSaveAndWaitSaved,
  collectConflictResponses,
  collectPageErrors,
  createTaskAndType,
  expectHeavyDiagramLoaded,
  loginAndCreateHeavyFixture,
  openHeavySessionInPage,
  readServerDiagramStateVersion,
  selectElementAndAddProperty,
} from "./helpers/canvasStabilitySteps.mjs";

// ---------------------------------------------------------------------------
// Тест 5 — контракт 5: одиночная сессия, полный путь, 0×409.
// ---------------------------------------------------------------------------

test("single session: full editing path on heavy diagram produces zero 409 responses", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const pageErrors = collectPageErrors(page);
  const conflicts409 = collectConflictResponses(page);
  const { } = await bootstrapHeavySession(page, request, runId);
  await expectHeavyDiagramLoaded(page);

  // 1. Первая таска + текст.
  const firstId = await createTaskAndType(page, "Шаг стабильности первый");

  // 2. Сайтбар rail «Свойства» → добавить и сохранить BPMN-свойство.
  await selectElementAndAddProperty(page, firstId, { name: "priority", value: "high" });

  // 3. Вторая таска + текст.
  await createTaskAndType(page, "Шаг стабильности второй");

  // 4. «Сохранить» → «Новая версия».
  await clickToolbarSaveAndWaitSaved(page);
  await clickCreateRevisionAndWait(page);

  expect(
    conflicts409,
    `full single-session path must produce zero 409 responses, got: ${JSON.stringify(conflicts409)}`,
  ).toEqual([]);
  expect(pageErrors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Тест 6 — контракт 6: фоновая активность ≠ запись. 15 с простоя — версия
// сервера не меняется, 0×409.
// ---------------------------------------------------------------------------

test("background activity (presence heartbeat, remote sync) does not bump server diagram_state_version", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const pageErrors = collectPageErrors(page);
  const conflicts409 = collectConflictResponses(page);
  const { auth, fixture } = await bootstrapHeavySession(page, request, runId);
  await expectHeavyDiagramLoaded(page);

  const versionBefore = await readServerDiagramStateVersion(page, fixture.sessionId, auth.headers);

  // Канвас открыт и пульсирует presence (~5 с интервал); remote sync 30 с.
  await page.waitForTimeout(15_000);

  const versionAfter = await readServerDiagramStateVersion(page, fixture.sessionId, auth.headers);

  expect(
    versionAfter,
    `server diagram_state_version must stay ${versionBefore} during 15s idle, got ${versionAfter}`,
  ).toEqual(versionBefore);
  expect(
    conflicts409,
    `idle window must produce zero 409 responses, got: ${JSON.stringify(conflicts409)}`,
  ).toEqual([]);
  expect(pageErrors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Конфликт-сценарий: две вкладки (два browser context = два client id).
// Общий бутстрап для обоих вариантов разрешения.
// ---------------------------------------------------------------------------

const TASK_A_NAME = "Правка вкладки А";
const TASK_B_NAME = "Правка вкладки B";

async function bootstrapTwoTabs(browser, request, runId) {
  // Один логин/фикстура — обе вкладки смотрят в одну сессию от одного пользователя.
  const { auth, fixture } = await loginAndCreateHeavyFixture(request, runId);

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();

  const close = async () => {
    await contextA.close().catch(() => {});
    await contextB.close().catch(() => {});
  };

  try {
    await openHeavySessionInPage(pageA, auth, fixture);
    await expectHeavyDiagramLoaded(pageA);
    await openHeavySessionInPage(pageB, auth, fixture);
    await expectHeavyDiagramLoaded(pageB);
  } catch (error) {
    await close();
    throw error;
  }

  return { auth, fixture, pageA, pageB, close };
}

// Внешнее изменение из вкладки B: таска + текст + «Сохранить» (PUT bpmn) →
// серверная версия +1. Возвращает версию сервера после записи B.
async function externalChangeFromTabB(pageB, auth, fixture) {
  await createTaskAndType(pageB, TASK_B_NAME);
  await clickToolbarSaveAndWaitSaved(pageB);
  const versionAfterB = await readServerDiagramStateVersion(pageB, fixture.sessionId, auth.headers);
  return versionAfterB;
}

// ---------------------------------------------------------------------------
// Тест 7a — «Оставить мою версию»: ровно один 409, модалка, overwrite,
// правки вкладки A не потеряны.
// ---------------------------------------------------------------------------

test("external change: exactly one 409, conflict modal, «Оставить мою версию» keeps my edits", async ({ browser, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { auth, fixture, pageA, pageB, close } = await bootstrapTwoTabs(browser, request, runId);
  try {
    // a) Вкладка A: таска + текст, НЕ сохранять.
    await createTaskAndType(pageA, TASK_A_NAME);

    // b) Вкладка B: внешнее изменение → версия сервера +1.
    const versionAfterB = await externalChangeFromTabB(pageB, auth, fixture);

    // c) Вкладка A: «Сохранить» → ровно один 409 → модалка конфликта
    //    (не серия 409, не молчаливая перезагрузка).
    const conflictsA = collectConflictResponses(pageA);
    await clickToolbarSave(pageA);

    const modal = pageA.getByTestId("diagram-save-conflict-modal");
    await expect(
      modal,
      "conflict modal must appear after external version bump (cross-client mode)",
    ).toBeVisible({ timeout: 30_000 });
    expect(
      conflictsA,
      `save in tab A must produce exactly one 409 response, got: ${JSON.stringify(conflictsA)}`,
    ).toHaveLength(1);

    // d) «Оставить мою версию» → сохранение успешно, правки A не потеряны.
    await pageA.getByTestId("diagram-save-conflict-modal-overwrite").click();
    await expect(
      pageA.getByText(/версия сохранена поверх серверной/i),
    ).toBeVisible({ timeout: 30_000 });

    await expect(
      pageA.locator(".bpmnStageHost .djs-container").getByText(TASK_A_NAME).first(),
      "my task must survive the overwrite resolution",
    ).toBeVisible();

    // Доказательство durable-записи: серверная версия выросла ровно на 1.
    const versionAfterOverwrite = await readServerDiagramStateVersion(pageA, fixture.sessionId, auth.headers);
    expect(versionAfterOverwrite).toEqual(versionAfterB + 1);
  } finally {
    await close();
  }
});

// ---------------------------------------------------------------------------
// Тест 7b — «Загрузить версию с сервера»: после 409 → refresh → схема B видна,
// повторное «Сохранить» (с новой правкой) проходит БЕЗ 409 — baseVersion
// синхронизирован с сервером.
// ---------------------------------------------------------------------------

test("external change: «Загрузить версию с сервера» syncs baseVersion — re-save has no 409", async ({ browser, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { auth, fixture, pageA, pageB, close } = await bootstrapTwoTabs(browser, request, runId);
  try {
    // a) Вкладка A: таска + текст, НЕ сохранять.
    await createTaskAndType(pageA, TASK_A_NAME);

    // b) Вкладка B: внешнее изменение → версия сервера +1.
    await externalChangeFromTabB(pageB, auth, fixture);

    // c) Вкладка A: «Сохранить» → ровно один 409 → модалка.
    const conflictsA = collectConflictResponses(pageA);
    await clickToolbarSave(pageA);

    const modal = pageA.getByTestId("diagram-save-conflict-modal");
    await expect(modal, "conflict modal must appear after external version bump").toBeVisible({
      timeout: 30_000,
    });
    expect(
      conflictsA,
      `save in tab A must produce exactly one 409 response, got: ${JSON.stringify(conflictsA)}`,
    ).toHaveLength(1);

    // e-variant: «Загрузить версию с сервера».
    await pageA.getByTestId("diagram-save-conflict-modal-refresh").click();
    await expect(
      pageA.getByText(/сессия обновлена с сервера/i),
    ).toBeVisible({ timeout: 30_000 });

    // Схема обновлена с сервера: таска из вкладки B видна на канвасе A.
    await expectHeavyDiagramLoaded(pageA);
    await expect(
      pageA.locator(".bpmnStageHost .djs-container").getByText(TASK_B_NAME).first(),
      "server-side task from tab B must be visible after refresh",
    ).toBeVisible();

    // Ключевое утверждение: baseVersion синхронизирован — новая правка +
    // «Сохранить» проходят без 409.
    conflictsA.length = 0;
    await createTaskAndType(pageA, "Шаг после обновления с сервера");
    await clickToolbarSaveAndWaitSaved(pageA);

    expect(
      conflictsA,
      `re-save after refresh must produce zero 409 responses (baseVersion synced), got: ${JSON.stringify(conflictsA)}`,
    ).toEqual([]);
  } finally {
    await close();
  }
});
