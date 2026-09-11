import test from "node:test";
import assert from "node:assert/strict";

import { menuItemIndexes, resolveMenuKey } from "./explorerContextMenu.js";

const ITEMS = [
  { label: "Открыть" },
  { label: "Создать TO BE" },
  { separator: true },
  { label: "Переименовать" },
  { label: "Удалить", danger: true },
];

test("menuItemIndexes пропускает separator'ы", () => {
  assert.deepEqual(menuItemIndexes(ITEMS), [0, 1, 3, 4]);
  assert.deepEqual(menuItemIndexes([{ separator: true }]), []);
  assert.deepEqual(menuItemIndexes([]), []);
  assert.deepEqual(menuItemIndexes(null), []);
});

test("resolveMenuKey: ArrowDown/ArrowUp ходят по пунктам с зацикливанием", () => {
  assert.deepEqual(resolveMenuKey(ITEMS, 0, "ArrowDown"), { index: 1 });
  // separator (индекс 2) пропускается
  assert.deepEqual(resolveMenuKey(ITEMS, 1, "ArrowDown"), { index: 3 });
  // зацикливание через последний
  assert.deepEqual(resolveMenuKey(ITEMS, 4, "ArrowDown"), { index: 0 });
  assert.deepEqual(resolveMenuKey(ITEMS, 0, "ArrowUp"), { index: 4 });
  assert.deepEqual(resolveMenuKey(ITEMS, 3, "ArrowUp"), { index: 1 });
});

test("resolveMenuKey: фокус вне пунктов — ArrowDown на первый, ArrowUp на последний", () => {
  assert.deepEqual(resolveMenuKey(ITEMS, -1, "ArrowDown"), { index: 0 });
  assert.deepEqual(resolveMenuKey(ITEMS, -1, "ArrowUp"), { index: 4 });
  assert.deepEqual(resolveMenuKey(ITEMS, 99, "ArrowDown"), { index: 0 });
});

test("resolveMenuKey: Home/End — первый/последний пункт", () => {
  assert.deepEqual(resolveMenuKey(ITEMS, 3, "Home"), { index: 0 });
  assert.deepEqual(resolveMenuKey(ITEMS, 0, "End"), { index: 4 });
});

test("resolveMenuKey: Escape закрывает меню, прочие клавиши не обрабатываются", () => {
  assert.deepEqual(resolveMenuKey(ITEMS, 1, "Escape"), { close: true });
  assert.equal(resolveMenuKey(ITEMS, 1, "Enter"), null);
  assert.equal(resolveMenuKey(ITEMS, 1, "a"), null);
  assert.equal(resolveMenuKey(ITEMS, 1, "ArrowLeft"), null);
  // Пустое меню: Escape не перехватываем — просто закрыть нечему.
  assert.equal(resolveMenuKey([], 0, "Escape"), null);
});
