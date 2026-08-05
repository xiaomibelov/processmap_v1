// T3#4 — поиск/группировка палитры (paletteUtils, чистые функции).
// Запуск: node --test src/features/technologist/constructor/paletteUtils.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { filterOperations, groupOperations } from "./paletteUtils.js";

const CATALOG = [
  { code: "move", name: "Move", name_ru: "Перемещение", category: "logistics" },
  { code: "hold", name: "Hold", name_ru: "Выдержка", category: "process" },
  { code: "transfer", name: "Transfer", name_ru: "Перелив", category: "logistics" },
  { code: "check", name: "Check", name_ru: "Проверка", category: "" },
];

test("пустой запрос → весь каталог", () => {
  assert.equal(filterOperations(CATALOG, "").length, 4);
  assert.equal(filterOperations(CATALOG, "   ").length, 4);
});

test("фильтр по name_ru / name / code, case-insensitive", () => {
  assert.deepEqual(filterOperations(CATALOG, "пере").map((o) => o.code), ["move", "transfer"]);
  assert.deepEqual(filterOperations(CATALOG, "MOVE").map((o) => o.code), ["move"]);
  assert.deepEqual(filterOperations(CATALOG, "hold").map((o) => o.code), ["hold"]);
  assert.equal(filterOperations(CATALOG, "несуществующее").length, 0);
});

test("группировка по category: сортировка групп, безкатегорийная последняя", () => {
  const groups = groupOperations(CATALOG);
  assert.deepEqual(groups.map((g) => g.category), ["logistics", "process", ""]);
  assert.deepEqual(groups[0].items.map((o) => o.code), ["move", "transfer"]); // порядок внутри сохранён
});

test("группировка после фильтра — только видимые", () => {
  const groups = groupOperations(filterOperations(CATALOG, "выдержка"));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].category, "process");
});

test("пустой каталог → пустые группы, не падение", () => {
  assert.deepEqual(groupOperations(filterOperations(null, "x")), []);
});
