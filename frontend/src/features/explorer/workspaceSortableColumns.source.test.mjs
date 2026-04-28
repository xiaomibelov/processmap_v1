import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const explorerSource = readFileSync(new URL("./WorkspaceExplorer.jsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("./explorerApi.js", import.meta.url), "utf8");
const sortModelSource = readFileSync(new URL("./explorerSortModel.js", import.meta.url), "utf8");

function between(start, end) {
  const startIndex = explorerSource.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = explorerSource.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return explorerSource.slice(startIndex, endIndex);
}

test("Explorer sortable columns are frontend-only", () => {
  assert.match(explorerSource, /sortExplorerItems/);
  assert.match(explorerSource, /sortProjectSessions/);
  assert.match(sortModelSource, /sortExplorerChildItemsByFolder/);
  assert.doesNotMatch(apiSource, /sort_by|sortKey|sort_dir|order_by|orderBy/);
  assert.doesNotMatch(sortModelSource, /apiGetExplorerPage|apiRequest|fetch\(/);
});

test("ExplorerPane renders sortable headers and leaves action column unsorted", () => {
  const explorerPaneSource = between("function ExplorerPane(", "// ─── Session Row");

  assert.match(explorerPaneSource, /const \[explorerSort,\s*setExplorerSort\]/);
  assert.match(explorerPaneSource, /toggleExplorerSort\(prev,\s*key\)/);
  assert.match(explorerPaneSource, /preserveItemOrder:\s*Boolean\(explorerSort\)/);
  assert.match(explorerPaneSource, /<SortHeader label="Название" sortKey="name"/);
  assert.match(explorerPaneSource, /<SortHeader label="Тип" sortKey="type"/);
  assert.match(explorerPaneSource, /<SortHeader label="Контекст" sortKey="owner"/);
  assert.match(explorerPaneSource, /<SortHeader label="Статус" sortKey="status"/);
  assert.match(explorerPaneSource, /<SortHeader label="Обновлён" sortKey="updatedAt"/);
  assert.match(explorerPaneSource, /aria-sort=/);
  assert.match(explorerPaneSource, /<th className="px-2 py-2 w-8" \/>/);
});

test("ProjectPane renders sortable session headers", () => {
  const projectPaneSource = between("function ProjectPane(", "// ─── Root WorkspaceExplorer");

  assert.match(projectPaneSource, /const \[sessionSort,\s*setSessionSort\]/);
  assert.match(projectPaneSource, /sortProjectSessions\(sessions,\s*sessionSort\)/);
  assert.match(projectPaneSource, /<SortHeader label="Название" sortKey="name"/);
  assert.match(projectPaneSource, /<SortHeader label="Статус" sortKey="status"/);
  assert.match(projectPaneSource, /<SortHeader label="Стадия" sortKey="stage"/);
  assert.match(projectPaneSource, /<SortHeader label="Owner" sortKey="owner"/);
  assert.match(projectPaneSource, /<SortHeader label="Обновлена" sortKey="updatedAt"/);
  assert.match(projectPaneSource, /sortedSessions\.map/);
});

test("Search, project move, and breadcrumbs remain wired", () => {
  assert.match(explorerSource, /ExplorerSearchResults model=\{searchModel\}/);
  assert.match(explorerSource, /filterExplorerSearchResults\(searchIndex,\s*searchQuery\)/);
  assert.match(explorerSource, /apiMoveProject\(workspaceId,\s*project\.id,\s*selectedTarget\.id\)/);
  assert.match(explorerSource, /onNavigateToProject\(project\.id,\s*\{\s*breadcrumbBase:\s*page\?\.breadcrumbs\s*\|\|\s*\[\]\s*\}\)/);
});

test("Active sort indicator renders arrows", () => {
  const sortHeaderSource = between("function SortHeader(", "function StatusBadge(");

  assert.match(sortHeaderSource, /direction === "desc" \? "↓" : "↑"/);
  assert.match(sortHeaderSource, /aria-label=\{`Сортировать/);
});
