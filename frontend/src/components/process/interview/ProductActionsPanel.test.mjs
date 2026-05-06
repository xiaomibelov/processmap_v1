import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, "ProductActionsPanel.jsx"), "utf8");

test("ProductActionsPanel exposes MVP product action fields in Analysis UI", () => {
  [
    "Действия с продуктом",
    "Сохранено:",
    "Товар",
    "Группа товара",
    "Тип действия",
    "Этап",
    "Объект",
    "Категория объекта",
    "Способ",
    "Сохранить действие",
  ].forEach((label) => {
    assert.equal(source.includes(label), true, `missing label: ${label}`);
  });
});

test("ProductActionsPanel uses explicit analysis persistence and does not call generic Interview autosave", () => {
  assert.equal(source.includes("saveProductActionForStep"), true);
  assert.equal(source.includes("deleteProductActionForStep"), true);
  assert.equal(source.includes("useInterviewSyncLifecycle"), false);
  assert.equal(source.includes("patchStep("), false);
  assert.equal(source.includes("onChange("), false);
});

test("ProductActionsPanel preserves draft during rerenders and blocks empty save", () => {
  assert.equal(source.includes("lastDraftResetKeyRef"), true);
  assert.equal(source.includes("draftResetKey"), true);
  assert.match(
    source,
    /if \(lastDraftResetKeyRef\.current === draftResetKey\) return;/,
    "draft reset must be guarded by stable step/action key",
  );
  assert.equal(source.includes("hasMeaningfulProductActionDraft"), true);
  assert.equal(source.includes("disabled={saving || !canSaveDraft}"), true);
  assert.equal(source.includes("Заполните хотя бы одно поле действия с продуктом."), true);
});

test("ProductActionsPanel makes saved actions primary and keeps editor collapsed", () => {
  assert.equal(source.includes('data-testid="product-actions-list"'), true);
  assert.equal(source.includes('data-testid="product-action-card"'), true);
  assert.equal(source.includes("productActionCard"), true);
  assert.equal(source.includes("Неполное действие"), true);
  assert.equal(source.includes("Неполное"), true);
  assert.equal(source.includes("Редактировать"), true);
  assert.equal(source.includes("editorOpen"), true);
  assert.equal(source.includes('{!editorOpen ? null : ('), true);
  assert.equal(source.includes('data-testid="product-actions-editor"'), true);
  assert.equal(source.includes("Новое действие с продуктом"), true);
  assert.equal(source.includes("Редактирование действия"), true);
});

test("ProductActionsPanel shows selected step context and binding metadata", () => {
  assert.equal(source.includes('data-testid="product-actions-step-context"'), true);
  assert.equal(source.includes("Действий по шагу"), true);
  assert.equal(source.includes("BPMN:"), true);
  assert.equal(source.includes("Роль:"), true);
  assert.equal(source.includes("ID шага:"), true);
});

test("ProductActionsPanel stays visible with a useful empty state when there are no steps", () => {
  assert.equal(source.includes("return null"), false);
  assert.equal(source.includes("product-actions-empty-state"), true);
  assert.equal(source.includes("Добавьте шаг процесса, чтобы описать действия с продуктом."), true);
  assert.equal(source.includes("disabled={!steps.length}"), true);
});
