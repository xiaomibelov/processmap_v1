import test from "node:test";
import assert from "node:assert/strict";
import { buildVisibleRows } from "./work3TreeState.js";

test("buildVisibleRows keeps default folder-first order", () => {
  const rows = buildVisibleRows({
    rootItems: [
      { id: "p1", type: "project", name: "Проект" },
      { id: "f1", type: "folder", name: "Папка" },
    ],
    expandedByFolder: {},
    childItemsByFolder: {},
    loadingByFolder: {},
    loadErrorByFolder: {},
  });

  assert.deepEqual(rows.map((row) => row.node.id), ["f1", "p1"]);
});

test("buildVisibleRows can preserve sorted sibling order", () => {
  const rows = buildVisibleRows({
    rootItems: [
      { id: "p1", type: "project", name: "А-проект" },
      { id: "f1", type: "folder", name: "Я-папка" },
    ],
    expandedByFolder: {},
    childItemsByFolder: {},
    loadingByFolder: {},
    loadErrorByFolder: {},
    preserveItemOrder: true,
  });

  assert.deepEqual(rows.map((row) => row.node.id), ["p1", "f1"]);
});

// ── P2 [Б]: раскрытие проектов (сессии 3-м уровнем) ──

test("buildVisibleRows: проект с сессиями expandable, раскрытие даёт project-sessions placeholder", () => {
  const rows = buildVisibleRows({
    rootItems: [
      { id: "p1", type: "project", name: "С сессиями", trackable_sessions_count: 3 },
      { id: "p2", type: "project", name: "Без сессий", trackable_sessions_count: 0 },
    ],
    expandedByFolder: { p1: true },
    childItemsByFolder: {},
    loadingByFolder: {},
    loadErrorByFolder: {},
  });

  assert.deepEqual(
    rows.map((row) => [row.rowType, row.parentId || row.node.id, row.depth]),
    [["project", "p1", 0], ["project-sessions", "p1", 1], ["project", "p2", 0]],
  );
  assert.equal(rows[0].expandable, true);
  assert.equal(rows[0].expanded, true);
  assert.equal(rows[2].expandable, false);
  assert.equal(rows[2].expanded, false);
});

test("buildVisibleRows: свёрнутый проект не даёт project-sessions строку; fallback на sessions_count", () => {
  const rows = buildVisibleRows({
    rootItems: [
      { id: "p1", type: "project", name: "Старый контракт", sessions_count: 2 },
    ],
    expandedByFolder: {},
    childItemsByFolder: {},
    loadingByFolder: {},
    loadErrorByFolder: {},
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].expandable, true);
  assert.equal(rows[0].expanded, false);
});

test("buildVisibleRows: сессии проекта не глубже 3-го уровня (раздел → проект → сессии)", () => {
  const rows = buildVisibleRows({
    rootItems: [{ id: "f1", type: "folder", name: "Раздел", child_project_count: 1 }],
    expandedByFolder: { f1: true, p1: true },
    childItemsByFolder: { f1: [{ id: "p1", type: "project", name: "Проект", trackable_sessions_count: 1 }] },
    loadingByFolder: {},
    loadErrorByFolder: {},
  });

  assert.deepEqual(
    rows.map((row) => [row.rowType, row.depth]),
    [["folder", 0], ["project", 1], ["project-sessions", 2]],
  );
});
