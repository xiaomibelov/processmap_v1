import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const explorerSource = readFileSync(new URL("./WorkspaceExplorer.jsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("./explorerApi.js", import.meta.url), "utf8");
const searchModelSource = readFileSync(new URL("./explorerSearchModel.js", import.meta.url), "utf8");

function between(start, end) {
  const startIndex = explorerSource.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = explorerSource.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return explorerSource.slice(startIndex, endIndex);
}

test("Explorer search is frontend-only and does not add API wrappers", () => {
  assert.match(explorerSource, /buildExplorerSearchIndex/);
  assert.match(explorerSource, /buildProjectSessionSearchIndex/);
  assert.match(explorerSource, /filterExplorerSearchResults/);
  assert.doesNotMatch(apiSource, /apiSearch|\/search/);
  assert.doesNotMatch(searchModelSource, /apiGetExplorerPage|apiRequest|fetch\(/);
});

test("ExplorerPane renders loaded-structure search and grouped results instead of mutating rows", () => {
  const explorerPaneSource = between("function ExplorerPane(", "// ─── Session Row");

  assert.match(explorerPaneSource, /Поиск по загруженной структуре/);
  assert.match(explorerSource, /Раздел, папка, проект или сессия/);
  assert.match(explorerPaneSource, /searchModel\.active \? \(/);
  assert.match(explorerPaneSource, /onNavigateToFolder\(target\.folderId\)/);
  assert.match(explorerPaneSource, /onNavigateToProject\(target\.projectId,\s*\{\s*breadcrumbBase:/);
  assert.match(explorerPaneSource, /onNavigateToProject\(project\.id,\s*\{\s*breadcrumbBase:\s*page\?\.breadcrumbs\s*\|\|\s*\[\]\s*\}\)/);
});

test("ProjectPane search opens sessions through the existing open handler", () => {
  const projectPaneSource = between("function ProjectPane(", "// ─── Root WorkspaceExplorer");

  assert.match(projectPaneSource, /buildProjectSessionSearchIndex\(/);
  assert.match(projectPaneSource, /handleOpenSessionRequest\(\{/);
  assert.match(projectPaneSource, /project_id:\s*projectId/);
  assert.match(projectPaneSource, /workspace_id:\s*workspaceId/);
});

test("Search results include required grouping and empty-state copy", () => {
  const searchResultsSource = between("function ExplorerSearchResults(", "// ─── Workspace Sidebar");

  assert.match(searchResultsSource, /Найдено:/);
  assert.match(searchResultsSource, /group\.label/);
  assert.match(searchResultsSource, /Ничего не найдено в текущей области/);
  assert.match(searchResultsSource, /серверный индекс/);
});

test("Project move and section labels remain present", () => {
  assert.match(explorerSource, /Переместить проект/);
  assert.match(explorerSource, /apiMoveProject\(workspaceId,\s*project\.id,\s*selectedTarget\.id\)/);
  assert.match(explorerSource, /folderDisplayLabel\(\{/);
});
