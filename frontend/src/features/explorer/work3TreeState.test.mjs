import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTreeBulkExpandedMap,
  buildVisibleRows,
  collectExpandableTreeIds,
  getTreeBulkExpansionState,
} from "./work3TreeState.js";

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

test("collectExpandableTreeIds: собирает разделы, папки и проекты из загруженного дерева", () => {
  const ids = collectExpandableTreeIds({
    rootItems: [
      { id: "section-1", type: "folder", child_folder_count: 1 },
      { id: "project-root", type: "project", trackable_sessions_count: 2 },
      { id: "empty-folder", type: "folder", child_folder_count: 0, child_project_count: 0 },
    ],
    childItemsByFolder: {
      "section-1": [
        { id: "folder-1", type: "folder", child_project_count: 1 },
        { id: "project-child", type: "project", sessions_count: 1 },
      ],
      "folder-1": [
        { id: "project-deep", type: "project", trackable_sessions_count: 0 },
      ],
    },
  });

  assert.deepEqual(ids, ["section-1", "folder-1", "project-child", "project-root"]);
});

test("getTreeBulkExpansionState: различает раскрыто, свёрнуто и смешанное состояние", () => {
  const ids = ["section-1", "folder-1", "project-1"];
  assert.equal(getTreeBulkExpansionState(ids, {}), "collapsed");
  assert.equal(getTreeBulkExpansionState(ids, { "section-1": true, "folder-1": true, "project-1": true }), "expanded");
  assert.equal(getTreeBulkExpansionState(ids, { "section-1": true }), "mixed");
  assert.equal(getTreeBulkExpansionState([], { "section-1": true }), "collapsed");
});

test("buildTreeBulkExpandedMap: массовое действие не мутирует текущую expanded map", () => {
  const current = { persisted: true, "section-1": false };
  const expanded = buildTreeBulkExpandedMap(current, ["section-1", "project-1"], true);
  const collapsed = buildTreeBulkExpandedMap(current, ["section-1", "project-1"], false);

  assert.deepEqual(current, { persisted: true, "section-1": false });
  assert.deepEqual(expanded, { persisted: true, "section-1": true, "project-1": true });
  assert.deepEqual(collapsed, { persisted: true, "section-1": false, "project-1": false });
});

test("bulk helpers: дерево 100+ узлов считается линейно без рекурсивной мутации", () => {
  const rootItems = Array.from({ length: 50 }, (_, i) => ({
    id: `section-${i}`,
    type: "folder",
    child_folder_count: 1,
    child_project_count: 1,
  }));
  const childItemsByFolder = Object.fromEntries(rootItems.map((section, i) => [
    section.id,
    [
      { id: `folder-${i}`, type: "folder", child_project_count: 1 },
      { id: `project-${i}`, type: "project", trackable_sessions_count: 1 },
    ],
  ]));
  for (let i = 0; i < 50; i += 1) {
    childItemsByFolder[`folder-${i}`] = [
      { id: `project-deep-${i}`, type: "project", trackable_sessions_count: 1 },
    ];
  }

  const startedAt = performance.now();
  const ids = collectExpandableTreeIds({ rootItems, childItemsByFolder });
  const expanded = buildTreeBulkExpandedMap({}, ids, true);
  const elapsed = performance.now() - startedAt;

  assert.equal(ids.length, 200);
  assert.equal(Object.keys(expanded).length, 200);
  assert.ok(elapsed < 50, `bulk helpers should stay lightweight, got ${elapsed}ms`);
  assert.equal(getTreeBulkExpansionState(ids, expanded), "expanded");
});
