// RED-тесты контура fix/canvas-250-editing-performance (этап 1, TDD red).
//
// Контракт поведения на схеме 250+ элементов:
//   1. «Создать задачу» (контекстное меню канваса) → direct-editing открывается
//      СРАЗУ, фокус в поле ввода, печать 25 символов < 2500 мс без потери символов.
//   2. Полный путь: таска → текст → сайтбар → «Свойства» → создать и сохранить
//      свойство → вторая таска + текст — ни одной pageerror.
//   3. «Сохранить» и «Новая версия» доступны сразу после создания таски и
//      завершаются успехом.
//   4. Бюджет: ввод 25 символов < 2500 мс; правка одного элемента → прирост
//      window.__PM_DIFF_CALLS__ ≤ 1 (инструментации пока нет — допускаем ?? 0).
//
// Запуск (worktree, host без node — всё в docker):
//   dev-server:  docker run -d --name pm-canvas250-vite \
//                  -v <worktree>/frontend:/app -w /app -p 5197:5197 \
//                  -e VITE_PORT=5197 \
//                  -e VITE_API_PROXY_TARGET=http://host.docker.internal:8011 \
//                  node:20 npm run dev -- --host 0.0.0.0 --strictPort
//                  (ВАЖНО: VITE_PORT=5197 обязателен — иначе vite HMR уйдёт на
//                  дефолтный 5177 и устроит reload-loop страницы.)
//   прогон:      docker run --rm -v <worktree>:/ws -w /ws/frontend \
//                  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
//                  -e E2E_APP_BASE_URL=http://172.17.0.1:5197 \
//                  -e E2E_API_BASE_URL=http://172.17.0.1:8011 \
//                  local-playwright:v1.58.2 npx playwright test e2e/canvas-heavy-editing.spec.mjs
//
// ВАЖНО: вместо host.docker.internal используется gateway-IP 172.17.0.1 —
// vite dev server блокирует незнакомые Host-заголовки (allowedHosts), а
// IP-хосты разрешены по умолчанию.

import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";
import { makeHeavyEditingDiagramXml } from "./helpers/heavyEditingFixture.mjs";

const APP_BASE = process.env.E2E_APP_BASE_URL || "http://127.0.0.1:5177";

const TYPE_BUDGET_MS = 2500;
const DIRECT_EDITING_OPEN_BUDGET_MS = 2500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => {
    errors.push(String(err?.message || err || ""));
  });
  return errors;
}

async function bootstrapHeavySession(page, request, runId) {
  const auth = await apiLogin(request, { apiBase: API_BASE, appBaseUrl: APP_BASE });
  const fixture = await createFixture(request, runId, auth.headers, makeHeavyEditingDiagramXml());

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await setUiToken(page, auth.accessToken, {
    activeOrgId: fixture.orgId || auth.activeOrgId,
    refreshToken: auth.refreshToken,
    refreshCookie: auth.refreshCookie,
  });
  if (auth.userId) {
    await page.addInitScript((uid) => {
      window.sessionStorage.setItem(`fpc_org_choice_done:${uid}`, "1");
    }, auth.userId);
  }

  await page.goto(`/app?project=${encodeURIComponent(fixture.projectId)}&session=${encodeURIComponent(fixture.sessionId)}`);
  await page.waitForLoadState("domcontentloaded");
  await waitForDiagramReady(page, { timeout: 90_000 });
  return { auth, fixture };
}

async function expectHeavyDiagramLoaded(page) {
  // Импорт 250+ элементов идёт после появления вьюпорта — ждём через poll.
  await expect
    .poll(
      async () => page.evaluate(() => {
        const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
        if (!modeler) return 0;
        try {
          return modeler.get("elementRegistry").getAll().length;
        } catch {
          return 0;
        }
      }),
      { timeout: 90_000, message: "diagram must contain 250+ elements in elementRegistry" },
    )
    .toBeGreaterThanOrEqual(250);
}

// Правый клик по гарантированно пустой области канваса (угол вьюпорта).
// Диаграмма широкая (aspect ~7:1), после fit по ширине сверху/снизу остаются
// пустые полосы — углы хоста попадают в пустой canvas.
async function openCanvasContextMenu(page) {
  const host = page.locator(".bpmnStageHost").first();
  await expect(host).toBeVisible();
  const box = await host.boundingBox();
  expect(box).toBeTruthy();
  const candidates = [
    [24, 24],
    [box.width - 24, 24],
    [24, box.height - 24],
    [box.width - 24, box.height - 24],
    [box.width / 2, 18],
  ];
  for (let round = 0; round < 2; round += 1) {
    for (const [dx, dy] of candidates) {
      await page.mouse.click(box.x + dx, box.y + dy, { button: "right" });
      await page.waitForTimeout(300);
      const menu = page.getByTestId("bpmn-context-menu");
      // Меню элемента (правый клик по шейпу) не содержит «Создать задачу» —
      // такие меню пропускаем и идём к следующей кандидатной точке.
      const createBtn = menu.getByTestId("bpmn-context-menu-action-create_task");
      if (await createBtn.isVisible().catch(() => false)) return { menu, point: { x: box.x + dx, y: box.y + dy } };
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(200);
    }
  }
  throw new Error("canvas context menu with «Создать задачу» did not open at any candidate point");
}

async function createTaskViaContextMenu(page) {
  const { menu } = await openCanvasContextMenu(page);
  const createBtn = menu.getByTestId("bpmn-context-menu-action-create_task");
  await expect(createBtn, "context menu must contain «Создать задачу»").toBeVisible();
  await createBtn.click();
}

async function readDiffCalls(page) {
  return page.evaluate(() => Number(window.__PM_DIFF_CALLS__ ?? 0));
}

async function readSelectedElementId(page) {
  return page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return "";
    try {
      const selected = modeler.get("selection")?.get?.() || [];
      return String(selected[0]?.id || "").trim();
    } catch {
      return "";
    }
  });
}

// Путь к свойствам выбранного элемента (актуальный UI): клик по rail-кнопке
// «Свойства» свёрнутого левого сайдбара — панель открывается сразу к секции
// «Свойства» выбранного элемента, с кнопкой «+ Добавить BPMN-свойство».
// Прежний паттерн (кнопка rail «Выбранный узел» → accordion → тоггл
// «Дополнительные BPMN-свойства») устарел: rail-секция удалена в редизайне
// сайдбара (drift с bpmn-property-pipeline-smoke, см. EXEC_REPORT).
async function openNodeProperties(page) {
  const railPropsBtn = page.locator("[data-testid='left-sidebar-handle'] button[aria-label='Свойства']");
  await expect(railPropsBtn, "rail-кнопка «Свойства» должна быть видима (сайдбар свёрнут)").toBeVisible();
  await railPropsBtn.click();

  const addBtn = page.getByRole("button", { name: /Добавить BPMN-свойство/ });
  await expect(addBtn.first(), "кнопка «Добавить BPMN-свойство» должна появиться в панели «Свойства»").toBeVisible();
}

// ---------------------------------------------------------------------------
// Тест 1 — контракт 1: «Создать задачу» → direct-editing сразу, фокус, печать.
// ---------------------------------------------------------------------------

test("create task opens direct editing immediately with focus and lossless typing (<2500 ms for 25 chars)", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const pageErrors = collectPageErrors(page);
  await bootstrapHeavySession(page, request, runId);
  await expectHeavyDiagramLoaded(page);

  await createTaskViaContextMenu(page);

  const editor = page.locator(".djs-direct-editing-content").first();
  await expect(
    editor,
    "direct-editing must open immediately after «Создать задачу»",
  ).toBeVisible({ timeout: DIRECT_EDITING_OPEN_BUDGET_MS });
  await expect(editor, "focus must be inside the direct-editing field").toBeFocused();

  const text = "Проверка скорости набора текста"; // 31 символ ≥ 25
  const startedAt = Date.now();
  await editor.pressSequentially(text, { delay: 15 });
  const typeMs = Date.now() - startedAt;

  expect(typeMs, `typing ${text.length} chars took ${typeMs} ms`).toBeLessThan(TYPE_BUDGET_MS);
  await expect(editor).toHaveText(text);

  await page.mouse.click(24, 24);
  await expect(editor).toBeHidden();
  expect(pageErrors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Тест 2 — контракт 2: полный путь таска → текст → свойства → сохранить →
// вторая таска, без pageerror.
// ---------------------------------------------------------------------------

test("full editing path (task → text → sidebar properties → save → second task) has no pageerrors", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const pageErrors = collectPageErrors(page);
  await bootstrapHeavySession(page, request, runId);
  await expectHeavyDiagramLoaded(page);

  // 1. Первая таска + текст.
  await createTaskViaContextMenu(page);
  const editor = page.locator(".djs-direct-editing-content").first();
  await expect(editor).toBeVisible({ timeout: DIRECT_EDITING_OPEN_BUDGET_MS });
  await editor.pressSequentially("Шаг первый", { delay: 15 });
  await page.mouse.click(24, 24);
  await expect(editor).toBeHidden();

  const firstId = await readSelectedElementId(page);
  expect(firstId).not.toBe("");

  // 2. Сайтбар → «Свойства» → создать и сохранить свойство.
  const firstShape = page.locator(`g[data-element-id="${firstId}"]`).first();
  await expect(firstShape).toBeVisible();
  await firstShape.click();

  await openNodeProperties(page);

  const rows = page.locator(".sidebarBpmnPropertyItem");
  await expect(rows).toHaveCount(0);

  const addBtn = page.getByRole("button", { name: /Добавить BPMN-свойство/ });
  await expect(addBtn).toBeVisible();
  await addBtn.click();
  await expect(rows).toHaveCount(1);

  const row = rows.first();
  await row.click();
  const inputs = row.locator("input.sidebarInput");
  await expect(inputs).toHaveCount(2);
  await inputs.nth(0).fill("priority");
  await inputs.nth(1).fill("high");
  await inputs.nth(1).press("Enter");

  const saveBtn = page.locator(".sidebarGlobalFooter").getByRole("button", { name: "Сохранить", exact: true });
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();
  await expect(page.locator(".sidebarGlobalFooter")).toHaveCount(0, { timeout: 30_000 });

  // 3. Вторая таска + текст.
  await createTaskViaContextMenu(page);
  const editor2 = page.locator(".djs-direct-editing-content").first();
  await expect(editor2).toBeVisible({ timeout: DIRECT_EDITING_OPEN_BUDGET_MS });
  await editor2.pressSequentially("Шаг второй", { delay: 15 });
  await page.mouse.click(24, 24);
  await expect(editor2).toBeHidden();

  const secondId = await readSelectedElementId(page);
  expect(secondId).not.toBe("");
  expect(secondId).not.toBe(firstId);

  expect(pageErrors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Тест 3 — контракт 3: «Сохранить» и «Новая версия» enabled сразу и успешны.
// ---------------------------------------------------------------------------

test("save and create-version are enabled right after task creation and succeed", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const pageErrors = collectPageErrors(page);
  await bootstrapHeavySession(page, request, runId);
  await expectHeavyDiagramLoaded(page);

  await createTaskViaContextMenu(page);
  const editor = page.locator(".djs-direct-editing-content").first();
  await expect(editor).toBeVisible({ timeout: DIRECT_EDITING_OPEN_BUDGET_MS });
  await editor.pressSequentially("Задача на сохранение", { delay: 15 });
  await page.mouse.click(24, 24);
  await expect(editor).toBeHidden();

  const saveBtn = page.getByTestId("diagram-toolbar-save");
  const versionBtn = page.getByTestId("diagram-toolbar-create-revision");

  await expect(saveBtn, "«Сохранить» must be enabled right after task creation").toBeEnabled();
  await expect(versionBtn, "«Новая версия» must be enabled right after task creation").toBeEnabled();

  // Сохранение завершается успехом (слот статуса возвращается в saved).
  await saveBtn.click();
  const statusSlot = page.getByTestId("diagram-toolbar-save-status-slot");
  await expect
    .poll(async () => statusSlot.getAttribute("data-state"), { timeout: 30_000 })
    .toBe("saved");

  // Создание версии завершается успехом (чип версии становится V. 1).
  await expect(versionBtn).toBeEnabled();
  await versionBtn.click();
  const versionChip = page.getByTestId("diagram-toolbar-version-chip");
  await expect
    .poll(async () => (await versionChip.textContent())?.trim(), { timeout: 30_000 })
    .toMatch(/^V\.\s*1$/);

  expect(pageErrors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Тест 4 — контракт 4: бюджет diff — прирост __PM_DIFF_CALLS__ ≤ 1 на правку
// одного элемента (инструментации пока нет: ?? 0 допустимо, проверка — обязательна).
// ---------------------------------------------------------------------------

test("single element edit adds at most 1 to window.__PM_DIFF_CALLS__", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const pageErrors = collectPageErrors(page);
  await bootstrapHeavySession(page, request, runId);
  await expectHeavyDiagramLoaded(page);

  const diffBefore = await readDiffCalls(page);

  await createTaskViaContextMenu(page);
  const editor = page.locator(".djs-direct-editing-content").first();
  await expect(editor).toBeVisible({ timeout: DIRECT_EDITING_OPEN_BUDGET_MS });
  await editor.pressSequentially("Одна правка", { delay: 15 });

  const diffAfter = await readDiffCalls(page);
  const diffDelta = diffAfter - diffBefore;
  expect(
    diffDelta,
    `one element edit must add ≤ 1 to __PM_DIFF_CALLS__ (before=${diffBefore}, after=${diffAfter})`,
  ).toBeLessThanOrEqual(1);

  expect(pageErrors).toEqual([]);
});
