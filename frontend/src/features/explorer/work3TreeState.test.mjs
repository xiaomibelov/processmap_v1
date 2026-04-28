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
