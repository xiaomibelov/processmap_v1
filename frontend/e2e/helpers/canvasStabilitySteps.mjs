// Общие шаги E2E контура fix/canvas-editing-stability.
//
// Шаги выделены из зелёного canvas-heavy-editing.spec.mjs (PR #952) дословно,
// чтобы новый спек стабильности использовал те же проверенные селекторы,
// не дублируя их внутри spec-файла. Существующий спек НЕ меняется.

import { expect } from "@playwright/test";

import { apiLogin, setUiToken } from "./e2eAuth.mjs";
import { API_BASE, createFixture } from "./processFixture.mjs";
import { waitForDiagramReady } from "./diagramReady.mjs";
import { makeHeavyEditingDiagramXml } from "./heavyEditingFixture.mjs";

export const APP_BASE = process.env.E2E_APP_BASE_URL || "http://127.0.0.1:5177";

const DIRECT_EDITING_OPEN_BUDGET_MS = 2500;

// ---------------------------------------------------------------------------
// Коллекторы событий страницы
// ---------------------------------------------------------------------------

export function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => {
    errors.push(String(err?.message || err || ""));
  });
  return errors;
}

// Сетевые ответы со статусом 409 (DIAGRAM_STATE_CONFLICT / BASE_VERSION_REQUIRED
// и любые другие). Возвращает массив { url, status } — наполняется по ходу теста.
export function collectConflictResponses(page) {
  const conflicts = [];
  page.on("response", (response) => {
    if (response.status() === 409) {
      conflicts.push({ url: response.url(), status: response.status() });
    }
  });
  return conflicts;
}

// ---------------------------------------------------------------------------
// Бутстрап сессии
// ---------------------------------------------------------------------------

export async function loginAndCreateHeavyFixture(request, runId) {
  const auth = await apiLogin(request, { apiBase: API_BASE, appBaseUrl: APP_BASE });
  const fixture = await createFixture(request, runId, auth.headers, makeHeavyEditingDiagramXml());
  return { auth, fixture };
}

// Открывает heavy-сессию в уже созданной странице (page привязана к контексту).
export async function openHeavySessionInPage(page, auth, fixture) {
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
}

export async function bootstrapHeavySession(page, request, runId) {
  const { auth, fixture } = await loginAndCreateHeavyFixture(request, runId);
  await openHeavySessionInPage(page, auth, fixture);
  return { auth, fixture };
}

// ---------------------------------------------------------------------------
// Канвас: создание тасок, печать, диаграмма
// ---------------------------------------------------------------------------

export async function expectHeavyDiagramLoaded(page) {
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

export function readElementCount(page) {
  return page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return 0;
    try {
      return modeler.get("elementRegistry").getAll().length;
    } catch {
      return 0;
    }
  });
}

export function readSelectedElementId(page) {
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

// Правый клик по гарантированно пустой области канваса (угол вьюпорта).
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
      const createBtn = menu.getByTestId("bpmn-context-menu-action-create_task");
      if (await createBtn.isVisible().catch(() => false)) return { menu };
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(200);
    }
  }
  throw new Error("canvas context menu with «Создать задачу» did not open at any candidate point");
}

export async function createTaskViaContextMenu(page) {
  const { menu } = await openCanvasContextMenu(page);
  const createBtn = menu.getByTestId("bpmn-context-menu-action-create_task");
  await expect(createBtn, "context menu must contain «Создать задачу»").toBeVisible();
  await createBtn.click();
}

// Полный шаг «создать задачу и подписать»: контекстное меню → direct-editing →
// печать → клик в пустой угол (закрыть редактор). Возвращает id созданного элемента.
export async function createTaskAndType(page, text) {
  await createTaskViaContextMenu(page);
  const editor = page.locator(".djs-direct-editing-content").first();
  await expect(editor, "direct-editing must open after «Создать задачу»").toBeVisible({
    timeout: DIRECT_EDITING_OPEN_BUDGET_MS,
  });
  await editor.pressSequentially(text, { delay: 15 });
  await page.mouse.click(24, 24);
  await expect(editor).toBeHidden();
  const elementId = await readSelectedElementId(page);
  expect(elementId, "created task must stay selected after label commit").not.toBe("");
  return elementId;
}

// ---------------------------------------------------------------------------
// Сайтбар «Свойства»: добавить и сохранить BPMN-свойство выбранного элемента
// ---------------------------------------------------------------------------

async function openNodeProperties(page) {
  const railPropsBtn = page.locator("[data-testid='left-sidebar-handle'] button[aria-label='Свойства']");
  await expect(railPropsBtn, "rail-кнопка «Свойства» должна быть видима (сайдбар свёрнут)").toBeVisible();
  await railPropsBtn.click();

  const addBtn = page.getByRole("button", { name: /Добавить BPMN-свойство/ });
  await expect(addBtn.first(), "кнопка «Добавить BPMN-свойство» должна появиться в панели «Свойства»").toBeVisible();
}

export async function selectElementAndAddProperty(page, elementId, { name, value }) {
  const shape = page.locator(`g[data-element-id="${elementId}"]`).first();
  await expect(shape).toBeVisible();
  await shape.click();

  await openNodeProperties(page);

  const rows = page.locator(".sidebarBpmnPropertyItem");
  await expect(rows).toHaveCount(0);

  const addBtn = page.getByRole("button", { name: /Добавить BPMN-свойство/ });
  await addBtn.click();
  await expect(rows).toHaveCount(1);

  const row = rows.first();
  await row.click();
  const inputs = row.locator("input.sidebarInput");
  await expect(inputs).toHaveCount(2);
  await inputs.nth(0).fill(name);
  await inputs.nth(1).fill(value);
  await inputs.nth(1).press("Enter");

  const saveBtn = page.locator(".sidebarGlobalFooter").getByRole("button", { name: "Сохранить", exact: true });
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();
  await expect(page.locator(".sidebarGlobalFooter")).toHaveCount(0, { timeout: 30_000 });
}

// ---------------------------------------------------------------------------
// Тулбар: «Сохранить» / «Новая версия»
// ---------------------------------------------------------------------------

export async function clickToolbarSave(page) {
  const saveBtn = page.getByTestId("diagram-toolbar-save");
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();
}

export async function waitSaveStatusSaved(page, { timeout = 30_000 } = {}) {
  const statusSlot = page.getByTestId("diagram-toolbar-save-status-slot");
  await expect
    .poll(async () => statusSlot.getAttribute("data-state"), { timeout })
    .toBe("saved");
}

export async function clickToolbarSaveAndWaitSaved(page) {
  await clickToolbarSave(page);
  await waitSaveStatusSaved(page);
}

export async function clickCreateRevisionAndWait(page) {
  const versionBtn = page.getByTestId("diagram-toolbar-create-revision");
  await expect(versionBtn).toBeEnabled();
  await versionBtn.click();
  const versionChip = page.getByTestId("diagram-toolbar-version-chip");
  await expect
    .poll(async () => (await versionChip.textContent())?.trim(), { timeout: 30_000 })
    .toMatch(/^V\.\s*1$/);
}

// ---------------------------------------------------------------------------
// Серверная версия схемы (источник истины — backend)
// ---------------------------------------------------------------------------

export async function readServerDiagramStateVersion(page, sessionId, headers) {
  const res = await page.request.get(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}`, {
    headers,
  });
  const body = await res.json().catch(() => ({}));
  const session = body?.session && typeof body.session === "object" ? body.session : body;
  const version = Number(session?.diagram_state_version);
  if (!res.ok() || !Number.isFinite(version)) {
    throw new Error(`readServerDiagramStateVersion failed: status=${res.status()} body=${JSON.stringify(body).slice(0, 300)}`);
  }
  return version;
}
