import test from "node:test";
import assert from "node:assert/strict";
import {
  sortExplorerChildItemsByFolder,
  sortExplorerItems,
  sortProjectSessions,
  toggleExplorerSort,
} from "./explorerSortModel.js";

test("sorts explorer rows by name asc and desc without mutating input", () => {
  const rows = [
    { id: "p2", type: "project", name: "Яблоко" },
    { id: "f1", type: "folder", name: "Аптека" },
    { id: "p1", type: "project", name: "Бета" },
  ];
  const original = rows.slice();

  assert.deepEqual(sortExplorerItems(rows, { key: "name", direction: "asc" }).map((row) => row.id), ["f1", "p1", "p2"]);
  assert.deepEqual(sortExplorerItems(rows, { key: "name", direction: "desc" }).map((row) => row.id), ["p2", "p1", "f1"]);
  assert.deepEqual(rows, original);
});

test("sorts explorer rows by type asc and desc", () => {
  const rows = [
    { id: "p1", type: "project", name: "Проект" },
    { id: "f1", type: "folder", name: "Раздел" },
    { id: "f2", type: "folder", name: "Папка", parent_id: "f1" },
  ];

  assert.deepEqual(sortExplorerItems(rows, { key: "type", direction: "asc" }, { isRoot: true }).map((row) => row.id), ["f2", "p1", "f1"]);
  assert.deepEqual(sortExplorerItems(rows, { key: "type", direction: "desc" }, { isRoot: true }).map((row) => row.id), ["f1", "p1", "f2"]);
});

test("sorts status and business assignee with missing values last", () => {
  const rows = [
    { id: "missing", type: "folder", name: "Без статуса" },
    { id: "folder", type: "folder", name: "Folder", status: "ready", responsible_user: { display_name: "Борис Ответственный" } },
    { id: "ready", type: "project", name: "Ready", status: "ready", executor_user: { display_name: "Яна Исполнитель" } },
    { id: "draft", type: "project", name: "Draft", status: "draft", owner: { name: "Анна Owner" }, executor_user: { display_name: "Анна Исполнитель" } },
  ];

  assert.deepEqual(sortExplorerItems(rows, { key: "status", direction: "asc" }).map((row) => row.id), ["draft", "folder", "ready", "missing"]);
  assert.deepEqual(sortExplorerItems(rows, { key: "status", direction: "desc" }).map((row) => row.id), ["folder", "ready", "draft", "missing"]);
  assert.deepEqual(sortExplorerItems(rows, { key: "assignee", direction: "asc" }).map((row) => row.id), ["draft", "folder", "ready", "missing"]);
  assert.deepEqual(sortExplorerItems(rows, { key: "assignee", direction: "desc" }).map((row) => row.id), ["ready", "folder", "draft", "missing"]);
  assert.deepEqual(sortExplorerItems(rows, { key: "owner", direction: "asc" }).map((row) => row.id), ["draft", "folder", "ready", "missing"]);
});

test("sorts explorer rows by updated date desc and asc", () => {
  const rows = [
    { id: "old", type: "project", name: "Old", updated_at: 10 },
    { id: "missing", type: "project", name: "Missing" },
    { id: "new", type: "folder", name: "New", rollup_activity_at: 30, updated_at: 20 },
  ];

  assert.deepEqual(sortExplorerItems(rows, { key: "updatedAt", direction: "desc" }).map((row) => row.id), ["new", "old", "missing"]);
  assert.deepEqual(sortExplorerItems(rows, { key: "updatedAt", direction: "asc" }).map((row) => row.id), ["old", "new", "missing"]);
});

test("sorts loaded child folders independently", () => {
  const childItemsByFolder = {
    f1: [
      { id: "b", type: "project", name: "Бета" },
      { id: "a", type: "project", name: "Альфа" },
    ],
  };

  const sorted = sortExplorerChildItemsByFolder(childItemsByFolder, { key: "name", direction: "asc" });
  assert.deepEqual(sorted.f1.map((row) => row.id), ["a", "b"]);
  assert.deepEqual(childItemsByFolder.f1.map((row) => row.id), ["b", "a"]);
});

test("sorts sessions by status, stage, owner, and updated date", () => {
  // Колонка «Стадия» рендерит контур AS IS/TO BE (stage_badges), а не
  // session.stage — сортировка по ключу "stage" идёт по badges
  // (fallback process_layer), пропуски — в конец.
  const sessions = [
    { id: "s1", name: "Суп", status: "ready", stage_badges: ["as_is"], owner: { name: "Яна" }, updated_at: 10 },
    { id: "s2", name: "Каша", status: "draft", stage_badges: ["to_be"], owner: { name: "Анна" }, updated_at: 20 },
    { id: "s3", name: "Пирог", status: "", stage_badges: [], process_layer: "as_is", updated_at: 0 },
    { id: "s4", name: "Борщ", status: "ready", stage_badges: ["as_is", "to_be"], updated_at: 30 },
  ];

  assert.deepEqual(sortProjectSessions(sessions, { key: "status", direction: "asc" }).map((row) => row.id), ["s2", "s4", "s1", "s3"]);
  // asc: "as_is"-группа (s3 через fallback process_layer, tie с s1 → имя asc:
  //       Пирог раньше Супа) < "as_is to_be" (s4) < "to_be" (s2);
  // desc: "to_be" (s2) < "as_is to_be" (s4) < "as_is"-группа; tie-break по
  //       имени остаётся asc в обе стороны → Пирог (s3) перед Супом (s1).
  assert.deepEqual(sortProjectSessions(sessions, { key: "stage", direction: "asc" }).map((row) => row.id), ["s3", "s1", "s4", "s2"]);
  assert.deepEqual(sortProjectSessions(sessions, { key: "stage", direction: "desc" }).map((row) => row.id), ["s2", "s4", "s3", "s1"]);
  assert.deepEqual(sortProjectSessions(sessions, { key: "owner", direction: "asc" }).map((row) => row.id), ["s2", "s1", "s4", "s3"]);
  assert.deepEqual(sortProjectSessions(sessions, { key: "updatedAt", direction: "desc" }).map((row) => row.id), ["s4", "s2", "s1", "s3"]);
});

test("toggleExplorerSort uses text asc first and updated desc first", () => {
  assert.deepEqual(toggleExplorerSort(null, "name"), { key: "name", direction: "asc" });
  assert.deepEqual(toggleExplorerSort({ key: "name", direction: "asc" }, "name"), { key: "name", direction: "desc" });
  assert.deepEqual(toggleExplorerSort(null, "updatedAt"), { key: "updatedAt", direction: "desc" });
});
