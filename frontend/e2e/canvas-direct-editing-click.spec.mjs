// RED→GREEN e2e контура fix/canvas-direct-editing-click-commits.
//
// Дефект (подтверждён владельцем): двойной клик по таске открывает редактирование
// текста; клик МЫШЬЮ внутрь текста (на конкретное слово) НЕ переносит каретку —
// редактирование завершается как по Enter (коммит). Стрелки клавиатуры работают.
//
// RC: wireBpmnStageRuntimeEvents.js (#952) — document-capture mousedown коммитит
// directEditing по любому клику вне '.djs-direct-editing-overlay'; этого класса нет
// в DOM diagram-js-direct-editing@3.3.0 (реально: .djs-direct-editing-parent >
// .djs-direct-editing-content) → guard не срабатывает → complete() на ЛЮБОЙ mousedown.
//
// Контракт теста:
//   1. Клик мышью в середину второго слова многословной подписи: редактирование
//      ОСТАЁТСЯ активным, каретка — в точке клика (anchorOffset внутри второго слова).
//   2. Регресс-контракт #952: клик вне оверлея (угол канваса) по-прежнему коммитит.
//
// RED: на origin/main тест 1 падает (editing завершается до установки каретки).
// GREEN: после замены селектора на реальные классы DOM — зелёный.
//
// Запуск (свой vite dev-server из worktree, чужой стек не трогаем):
//   E2E_APP_BASE_URL=http://127.0.0.1:5198 E2E_API_BASE_URL=http://127.0.0.1:8011 \
//     npx playwright test e2e/canvas-direct-editing-click.spec.mjs

import { expect, test } from "@playwright/test";

import {
  bootstrapHeavySession,
  collectPageErrors,
  createTaskViaContextMenu,
  expectHeavyDiagramLoaded,
  APP_BASE,
} from "./helpers/canvasStabilitySteps.mjs";
import { API_BASE } from "./helpers/processFixture.mjs";

const EDITOR_SELECTOR = ".djs-direct-editing-content";

// Координаты центра слова с индексом wordIndex (0-based) внутри активного
// direct-editing contenteditable. Считаем внутри страницы через Range, чтобы не
// зависеть от зума/переносов строк. Возвращает null, если слово не нашлось.
function findWordCenterInPage(page, wordIndex) {
  return page.evaluate((index) => {
    const content = document.querySelector(".djs-direct-editing-content");
    if (!content) return null;
    const textNode = [...content.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (!textNode) return null;
    const words = textNode.textContent.split(" ").filter(Boolean);
    if (index < 0 || index >= words.length) return null;
    let offset = 0;
    for (let i = 0; i < index; i += 1) offset += words[i].length + 1;
    const start = offset;
    const end = offset + words[index].length;
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, end);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, word: words[index] };
  }, wordIndex);
}

// Состояние direct-editing: активен ли редактор и где каретка.
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

async function openEditingWithMultiwordLabel(page, label) {
  await createTaskViaContextMenu(page);
  const editor = page.locator(EDITOR_SELECTOR).first();
  await expect(editor, "direct-editing must open after «Создать задачу»").toBeVisible({
    timeout: 5_000,
  });
  await editor.pressSequentially(label, { delay: 15 });
  return editor;
}

test("mouse click inside label text moves caret to the clicked word (editing stays active)", async ({ page, request }) => {
  test.setTimeout(180_000);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const pageErrors = collectPageErrors(page);
  expect(APP_BASE && API_BASE).toBeTruthy();

  await bootstrapHeavySession(page, request, runId);
  await expectHeavyDiagramLoaded(page);

  const label = `Альфа бета гамма ${runId.slice(-4)}`;
  const editor = await openEditingWithMultiwordLabel(page, label);

  // Клик реальной мышью в середину ВТОРОГО слова («бета»).
  const target = await findWordCenterInPage(page, 1);
  expect(target, "second word rect must be measurable inside direct-editing content").toBeTruthy();
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(200);

  const state = await readEditingState(page);
  expect(state.active, `editing must STAY ACTIVE after mouse click inside the label (rc: click committed editing; state=${JSON.stringify(state)})`).toBe(true);
  expect(
    state.anchorOffset,
    `caret must be placed at the clicked word «${target.word}» (anchorOffset inside word bounds), got ${JSON.stringify(state)}`,
  ).toBeGreaterThan(label.indexOf("бета"));
  expect(state.anchorOffset, `caret must stay inside the word end, got ${JSON.stringify(state)}`).toBeLessThan(
    label.indexOf("бета") + target.word.length + 1,
  );

  // Клавиатура всё ещё дописывает в точку каретки — регресс-контроль стрелок/печати.
  await page.keyboard.type("X");
  const afterType = await readEditingState(page);
  expect(afterType.text, "typed char must land at caret position").toContain(`беXта`);

  // Регресс-контракт #952: клик ВНЕ оверлея (пустой угол канваса) коммитит editing.
  await page.mouse.click(24, 24);
  await expect(editor, "outside click must commit editing (UX contract from #952)").toBeHidden({ timeout: 5_000 });

  // Подпись закоммичена на канвас.
  await expect(
    page.locator(".bpmnStageHost .djs-container").getByText(/беXта/).first(),
    "committed label with caret-positioned insertion must be visible on canvas",
  ).toBeVisible();

  expect(pageErrors, `page must produce zero pageerrors, got: ${JSON.stringify(pageErrors)}`).toEqual([]);
});
