import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readExplorerSources } from "../../test-utils/explorerSourceText.mjs";

// retarget(s0): WorkspaceExplorer.jsx read moved to the multifile explorer source set.
// Sort-model pins on explorerSortModel.js are behaviorally covered by
// explorerSortModel.test.mjs; the remaining pins are globally unique identifiers.
const { text: explorerSource } = readExplorerSources();
const apiSource = readFileSync(new URL("./explorerApi.js", import.meta.url), "utf8");
const sortModelSource = readFileSync(new URL("./explorerSortModel.js", import.meta.url), "utf8");

test("Explorer sortable columns are frontend-only", () => {
  assert.match(explorerSource, /sortExplorerItems/);
  assert.match(explorerSource, /sortProjectSessions/);
  assert.match(sortModelSource, /sortExplorerChildItemsByFolder/);
  assert.doesNotMatch(apiSource, /sort_by|sortKey|sort_dir|order_by|orderBy/);
  assert.doesNotMatch(sortModelSource, /apiGetExplorerPage|apiRequest|fetch\(/);
});

test("ExplorerPane renders sortable headers and leaves action column unsorted", () => {
  // retarget(s0): was between("function ExplorerPane(", "// ─── Session Row");
  // ExplorerPane-local state/handlers and the exact SortHeader set are unique
  // identifiers, so the pins hold globally over the explorer source set.
  assert.match(explorerSource, /const \[explorerSort,\s*setExplorerSort\]/);
  assert.match(explorerSource, /toggleExplorerSort\(prev,\s*key\)/);
  assert.match(explorerSource, /preserveItemOrder:\s*Boolean\(explorerSort\)/);
  assert.match(explorerSource, /<SortHeader label="Название" sortKey="name"/);
  assert.match(explorerSource, /<SortHeader label="Обновлено" sortKey="updatedAt"/);
  assert.doesNotMatch(explorerSource, /<SortHeader label="Тип" sortKey="type"\/>/);
  assert.doesNotMatch(explorerSource, /<SortHeader label="Ответственный" sortKey="assignee"/);
  assert.doesNotMatch(explorerSource, /<SortHeader label="Статус" sortKey="status"\/>/);
  assert.match(explorerSource, /aria-sort=/);
  assert.match(explorerSource, /<th className="px-2 py-2 w-8" \/>/);
});

test("ProjectPane renders sortable session headers", () => {
  assert.match(explorerSource, /const \[sessionSort,\s*setSessionSort\]/);
  assert.match(explorerSource, /sortProjectSessions\(sessions,\s*sessionSort\)/);
  assert.match(explorerSource, /<SortHeader label="Название" sortKey="name"/);
  assert.match(explorerSource, /<SortHeader label="Статус" sortKey="status"/);
  assert.match(explorerSource, /<SortHeader label="Стадия" sortKey="stage"/);
  assert.match(explorerSource, /<SortHeader label="Owner" sortKey="owner"/);
  assert.match(explorerSource, /<SortHeader label="Обновлена" sortKey="updatedAt"/);
  assert.match(explorerSource, /sortedSessions\.map/);
});

test("Search, project move, and breadcrumbs remain wired", () => {
  assert.match(explorerSource, /ExplorerSearchResults model=\{searchModel\}/);
  assert.match(explorerSource, /filterExplorerSearchResults\(searchIndex,\s*searchQuery\)/);
  assert.match(explorerSource, /apiMoveProject\(workspaceId,\s*project\.id,\s*selectedTarget\.id\)/);
  assert.match(explorerSource, /onNavigateToProject\(project\.id,\s*\{\s*breadcrumbBase:\s*page\?\.breadcrumbs\s*\|\|\s*\[\]\s*\}\)/);
});

test("Active sort indicator renders arrows", () => {
  // retarget(s0): was between("function SortHeader(", "function StatusBadge(");
  // both pins are unique to the SortHeader markup and hold globally.
  assert.match(explorerSource, /direction === "desc" \? "↓" : "↑"/);
  assert.match(explorerSource, /aria-label=\{`Сортировать/);
});
