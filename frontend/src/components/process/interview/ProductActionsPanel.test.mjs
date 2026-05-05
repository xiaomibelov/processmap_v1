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
