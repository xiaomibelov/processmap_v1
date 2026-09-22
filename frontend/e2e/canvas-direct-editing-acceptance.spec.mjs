// Приёмочная батарея контура fix/canvas-direct-editing-click-commits.
//
// Живой браузер (Chromium), реальная мышь/клавиатура. Базовый контракт
// (клик в слово → каретка, editing активен) зафиксирован в
// canvas-direct-editing-click.spec.mjs; здесь регрессионная батарея вокруг него:
//   1. Мышиное редактирование: клики в разные слова, drag-выделение, коммит внешним кликом.
//   2. Burst quick-таски (серия создать+подписать через контекстное меню).
//   3. Свойства элемента через сайдбар «Свойства».
//   4. Undo/redo после мышиной правки подписи.
//   5. Зум-инвариантность: 75% / 100% / 150% — клик в слово ставит каретку.
//   6. 0 pageerrors во всех сценариях.
//
// Запуск:
//   E2E_APP_BASE_URL=http://127.0.0.1:5198 E2E_API_BASE_URL=http://127.0.0.1:8011 \
//     npx playwright test e2e/canvas-direct-editing-acceptance.spec.mjs

import { expect, test } from "@playwright/test";

import {
  collectPageErrors,
  createTaskViaContextMenu,
  openHeavySessionInPage,
  selectElementAndAddProperty,
  APP_BASE,
} from "./helpers/canvasStabilitySteps.mjs";
import { apiLogin } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture, seedXml } from "./helpers/processFixture.mjs";

const EDITOR = ".djs-direct-editing-content";

async function bootstrapLightSession(page, request, runId) {
  const auth = await apiLogin(request, { apiBase: API_BASE, appBaseUrl: APP_BASE });
  const fixture = await createFixture(request, runId, auth.headers, seedXml({ taskName: "Базовая задача" }));
  // Тот же бутстрап, что и в зелёном heavy-спеке (#952): init-scripts E2E-режима,
  // org-choice gate (admin имеет десятки org от чужих прогонов — без
  // fpc_org_choice_done страница встаёт на «Выберите организацию»), токены.
  await openHeavySessionInPage(page, auth, fixture);
  await expect
    .poll(
      async () => page.evaluate(() => {
        const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
        try {
          return modeler ? modeler.get("elementRegistry").getAll().length : 0;
        } catch {
          return 0;
        }
      }),
      { timeout: 90_000, message: "diagram must load (elementRegistry non-empty)" },
    )
    .toBeGreaterThan(0);
  return { auth, fixture };
}

function readEditingState(page) {
  return page.evaluate(() => {
    const content = document.querySelector(".djs-direct-editing-content");
    if (!content) return { active: false, anchorOffset: null, text: null };
    const sel = window.getSelection();
    return {
      active: content.isConnected,
      anchorOffset: sel?.anchorNode && content.contains(sel.anchorNode) ? sel.anchorOffset : null,
      text: content.textContent,
    };
  });
}

function wordCenter(page, wordIndex) {
  return page.evaluate((index) => {
    const content = document.querySelector(".djs-direct-editing-content");
    if (!content) return null;
    const textNode = [...content.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (!textNode) return null;
    const words = textNode.textContent.split(" ").filter(Boolean);
    if (index < 0 || index >= words.length) return null;
    let offset = 0;
    for (let i = 0; i < index; i += 1) offset += words[i].length + 1;
    const range = document.createRange();
    range.setStart(textNode, offset);
    range.setEnd(textNode, offset + words[index].length);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, word: words[index] };
  }, wordIndex);
}

async function openEditingWithLabel(page, label) {
  await createTaskViaContextMenu(page);
  const editor = page.locator(EDITOR).first();
  await expect(editor, "direct-editing must open").toBeVisible({ timeout: 5_000 });
  await editor.pressSequentially(label, { delay: 10 });
  return editor;
}

async function setZoom(page, level) {
  await page.evaluate((value) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    modeler?.get?.("canvas")?.zoom?.(value);
  }, level);
  await page.waitForTimeout(150);
}

// ---------------------------------------------------------------------------
// 1. Мышиное редактирование: клики по словам, drag-выделение, внешний коммит.
// ---------------------------------------------------------------------------

test("acceptance: mouse editing — word clicks, drag selection, outside commit", async ({ page, request }) => {
  test.setTimeout(180_000);
  const pageErrors = collectPageErrors(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootstrapLightSession(page, request, runId);

  const label = `Первое второе третье ${runId.slice(-4)}`;
  const editor = await openEditingWithLabel(page, label);

  // Клик в первое слово → каретка там, editing активен.
  const w0 = await wordCenter(page, 0);
  await page.mouse.click(w0.x, w0.y);
  await page.waitForTimeout(150);
  let state = await readEditingState(page);
  expect(state.active, `editing must stay active after word-1 click: ${JSON.stringify(state)}`).toBe(true);
  expect(state.anchorOffset).toBeGreaterThanOrEqual(0);
  expect(state.anchorOffset).toBeLessThanOrEqual(w0.word.length);

  // Клик в третье слово → каретка переехала.
  const w2 = await wordCenter(page, 2);
  await page.mouse.click(w2.x, w2.y);
  await page.waitForTimeout(150);
  state = await readEditingState(page);
  const thirdStart = label.indexOf(w2.word);
  expect(state.active, `editing must stay active after word-3 click: ${JSON.stringify(state)}`).toBe(true);
  expect(state.anchorOffset, `caret must be inside word-3: ${JSON.stringify(state)}`).toBeGreaterThanOrEqual(thirdStart);
  expect(state.anchorOffset).toBeLessThan(thirdStart + w2.word.length + 1);

  // Drag-выделение от слова 1 до слова 3 → несвёрнутый selection внутри content.
  await page.mouse.move(w0.x, w0.y);
  await page.mouse.down();
  await page.mouse.move(w2.x, w2.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const selection = await page.evaluate(() => {
    const sel = window.getSelection();
    const content = document.querySelector(".djs-direct-editing-content");
    return {
      inside: !!(content && sel?.anchorNode && content.contains(sel.anchorNode)),
      collapsed: sel?.isCollapsed !== false,
    };
  });
  expect(selection.inside, "drag-selection must live inside direct-editing content").toBe(true);
  expect(selection.collapsed, "drag-selection must be non-collapsed").toBe(false);

  // Внешний клик — коммит (UX-контракт #952).
  await page.mouse.click(24, 24);
  await expect(editor, "outside click must commit editing").toBeHidden({ timeout: 5_000 });
  await expect(
    page.locator(".bpmnStageHost .djs-container").getByText(label).first(),
    "committed label must be visible on canvas",
  ).toBeVisible();

  expect(pageErrors, `zero pageerrors expected: ${JSON.stringify(pageErrors)}`).toEqual([]);
});

// ---------------------------------------------------------------------------
// 2. Burst quick-таски.
// ---------------------------------------------------------------------------

test("acceptance: burst quick tasks — 5 create+label via context menu", async ({ page, request }) => {
  test.setTimeout(300_000);
  const pageErrors = collectPageErrors(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootstrapLightSession(page, request, runId);

  const names = [];
  for (let i = 1; i <= 5; i += 1) {
    const name = `Быстрая задача ${i} ${runId.slice(-4)}`;
    const editor = await openEditingWithLabel(page, name);
    await page.mouse.click(24, 24);
    await expect(editor).toBeHidden({ timeout: 5_000 });
    names.push(name);
  }
  for (const name of names) {
    await expect(
      page.locator(".bpmnStageHost .djs-container").getByText(name).first(),
      `burst task '${name}' must be visible`,
    ).toBeVisible();
  }
  expect(pageErrors, `zero pageerrors expected: ${JSON.stringify(pageErrors)}`).toEqual([]);
});

// ---------------------------------------------------------------------------
// 3. Свойства через сайдбар.
// ---------------------------------------------------------------------------

test("acceptance: element properties via sidebar", async ({ page, request }) => {
  test.setTimeout(180_000);
  const pageErrors = collectPageErrors(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootstrapLightSession(page, request, runId);

  const name = `Задача со свойством ${runId.slice(-4)}`;
  const elementId = await (async () => {
    const editor = await openEditingWithLabel(page, name);
    await page.mouse.click(24, 24);
    await expect(editor).toBeHidden({ timeout: 5_000 });
    return page.evaluate(() => {
      const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
      const selected = modeler?.get?.("selection")?.get?.() || [];
      return String(selected[0]?.id || "");
    });
  })();
  expect(elementId).not.toBe("");

  await selectElementAndAddProperty(page, elementId, { name: "priority", value: "high" });
  expect(pageErrors, `zero pageerrors expected: ${JSON.stringify(pageErrors)}`).toEqual([]);
});

// ---------------------------------------------------------------------------
// 4. Undo/redo после мышиной правки подписи.
// ---------------------------------------------------------------------------

test("acceptance: undo/redo after mouse-driven label edit", async ({ page, request }) => {
  test.setTimeout(180_000);
  const pageErrors = collectPageErrors(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootstrapLightSession(page, request, runId);

  // Rename существующей таски: двойной клик (путь владельца) → editing открыт
  // с текущим текстом → мышиный клик в слово → правка → внешний коммит.
  const before = "Базовая задача";
  const after = `Исправленная задача ${runId.slice(-4)}`;
  const shape = page.locator('g[data-element-id="Task_1"]').first();
  await expect(shape).toBeVisible();
  const bb = await shape.boundingBox();
  await page.mouse.dblclick(bb.x + bb.width / 2, bb.y + bb.height / 2);
  const editor = page.locator(EDITOR).first();
  await expect(editor, "double click must open direct editing").toBeVisible({ timeout: 5_000 });

  const w1 = await wordCenter(page, 0);
  await page.mouse.click(w1.x, w1.y);
  await page.waitForTimeout(150);
  let state = await readEditingState(page);
  expect(state.active, `editing must stay active after word click: ${JSON.stringify(state)}`).toBe(true);

  // Удаляем старый текст: End + Backspace×N (Ctrl+A в contenteditable неясен —
  // глобальные хоткеи приложения могут перехватывать; End/Backspace детерминированы).
  await page.keyboard.press("End");
  for (let i = 0; i < before.length + 4; i += 1) await page.keyboard.press("Backspace");
  await page.keyboard.type(after);
  await page.mouse.click(24, 24);
  await expect(editor).toBeHidden({ timeout: 5_000 });

  const readLabel = () => page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const task = modeler?.get?.("elementRegistry")?.get?.("Task_1");
    return task ? String(task.businessObject?.name || "") : null;
  });

  await expect.poll(readLabel, { timeout: 10_000, message: "edited label must be committed" }).toBe(after);

  // Фокус на канвас: bpmn-js keyboard (ctrl+z/y) живёт на canvas-контейнере.
  // Клик по гарантированно пустой области (правый нижний сектор, как в
  // openCanvasContextMenu — углы после fit-viewport пустые).
  const host = await page.locator(".bpmnStageHost").first().boundingBox();
  expect(host).toBeTruthy();
  await page.mouse.click(host.x + host.width - 60, host.y + host.height - 60);
  await page.waitForTimeout(200);

  // Undo — исходная подпись возвращается.
  await page.keyboard.press("Control+z");
  await expect.poll(readLabel, { timeout: 10_000, message: "Ctrl+Z must revert the label" }).toBe(before);

  // Redo — правка возвращается.
  await page.keyboard.press("Control+y");
  await expect.poll(readLabel, { timeout: 10_000, message: "Ctrl+Y must re-apply the label" }).toBe(after);

  expect(pageErrors, `zero pageerrors expected: ${JSON.stringify(pageErrors)}`).toEqual([]);
});

// ---------------------------------------------------------------------------
// 5. Зум-инвариантность клика в слово: 75% / 100% / 150%.
// ---------------------------------------------------------------------------

for (const zoom of [0.75, 1.0, 1.5]) {
  test(`acceptance: caret click works at zoom ${zoom * 100}%`, async ({ page, request }) => {
    test.setTimeout(180_000);
    const pageErrors = collectPageErrors(page);
    const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await bootstrapLightSession(page, request, runId);
    await setZoom(page, zoom);

    const label = `Зум проверка слово ${runId.slice(-4)}`;
    const editor = await openEditingWithLabel(page, label);
    const w1 = await wordCenter(page, 1);
    expect(w1, `word-1 rect must be measurable at zoom ${zoom}`).toBeTruthy();
    await page.mouse.click(w1.x, w1.y);
    await page.waitForTimeout(150);
    const state = await readEditingState(page);
    expect(state.active, `editing must stay active at zoom ${zoom}: ${JSON.stringify(state)}`).toBe(true);
    expect(state.anchorOffset, `caret must be placed at zoom ${zoom}: ${JSON.stringify(state)}`).toBeGreaterThanOrEqual(0);
    expect(state.anchorOffset).toBeLessThanOrEqual(label.length);

    await page.mouse.click(24, 24);
    await expect(editor).toBeHidden({ timeout: 5_000 });
    expect(pageErrors, `zero pageerrors expected: ${JSON.stringify(pageErrors)}`).toEqual([]);
  });
}
