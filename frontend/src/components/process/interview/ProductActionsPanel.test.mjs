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

test("ProductActionsPanel stays visible with a useful empty state when there are no steps", () => {
  assert.equal(source.includes("return null"), false);
  assert.equal(source.includes("product-actions-empty-state"), true);
  assert.equal(source.includes("Добавьте шаг процесса, чтобы описать действия с продуктом."), true);
  assert.equal(source.includes("disabled={!steps.length}"), true);
});
