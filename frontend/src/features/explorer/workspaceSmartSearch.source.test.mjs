import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readExplorerSources } from "../../test-utils/explorerSourceText.mjs";

// retarget(s0): WorkspaceExplorer.jsx read moved to the multifile explorer source set.
// explorerApi.js / explorerSearchModel.js do not move and are still read directly.
// Search-model pins on explorerSearchModel.js are behaviorally covered by
// explorerSearchModel.test.mjs; the remaining pins are globally unique strings.
const { text: explorerSource } = readExplorerSources();
const apiSource = readFileSync(new URL("./explorerApi.js", import.meta.url), "utf8");
const searchModelSource = readFileSync(new URL("./explorerSearchModel.js", import.meta.url), "utf8");

test("Explorer search keeps loaded fallback and adds backend global search wrapper", () => {
  assert.match(explorerSource, /buildExplorerSearchIndex/);
  assert.match(explorerSource, /buildExplorerGlobalSearchModel/);
  assert.match(explorerSource, /buildProjectSessionSearchIndex/);
  assert.match(explorerSource, /filterExplorerSearchResults/);
  assert.match(apiSource, /apiSearchExplorer/);
  assert.match(apiSource, /\/api\/explorer\/search/);
  assert.doesNotMatch(searchModelSource, /apiGetExplorerPage|apiRequest|fetch\(/);
});

test("ExplorerPane renders workspace search and keeps loaded fallback instead of mutating rows", () => {
  assert.match(explorerSource, /placeholder = "Поиск"/);
  assert.match(explorerSource, /title="Поиск по workspace"/);
  assert.match(explorerSource, /apiSearchExplorer\(workspaceId,\s*query,\s*\{\s*limit:\s*50\s*\}\)/);
  assert.match(explorerSource, /query\.length < 2/);
  assert.match(explorerSource, /setTimeout\(\(\) => \{/);
  assert.match(explorerSource, /data-testid="workspace-filter-toolbar"/);
  assert.doesNotMatch(explorerSource, /data-testid="workspace-explorer-toolbar"/);
  assert.match(explorerSource, /className="w-\[160px\] 2xl:w-\[280px\]"/);
  assert.match(explorerSource, /visibleSearchModel\.active \? \(/);
  assert.match(explorerSource, /onNavigateToFolder\(target\.folderId\)/);
  assert.match(explorerSource, /onNavigateToProject\(target\.projectId,\s*\{\s*breadcrumbBase:/);
  assert.match(explorerSource, /target\.kind === "session"/);
  assert.match(explorerSource, /onOpenSession\?\.\(\{/);
  assert.match(explorerSource, /onNavigateToProject\(project\.id,\s*\{\s*breadcrumbBase:\s*page\?\.breadcrumbs\s*\|\|\s*\[\]\s*\}\)/);
});

test("ProjectPane search opens sessions through the existing open handler", () => {
  assert.match(explorerSource, /buildProjectSessionSearchIndex\(/);
  assert.match(explorerSource, /handleOpenSessionRequest\(\{/);
  assert.match(explorerSource, /project_id:\s*projectId/);
  assert.match(explorerSource, /workspace_id:\s*workspaceId/);
});

test("Search results include required grouping and empty-state copy", () => {
  // retarget(s0): was between("function ExplorerSearchResults(", "// ─── Workspace Sidebar");
  // all pins are unique strings of the search-results markup and hold globally.
  assert.match(explorerSource, /Найдено:/);
  assert.match(explorerSource, /group\.label/);
  assert.match(explorerSource, /Идёт поиск/);
  assert.match(explorerSource, /Не удалось выполнить поиск/);
  assert.match(explorerSource, /Ничего не найдено во всей рабочей области/);
  assert.match(explorerSource, /Ничего не найдено в текущей области/);
  assert.match(explorerSource, /Ищет разделы, папки, проекты и сессии во всей рабочей области/);
});

test("Project move and section labels remain present", () => {
  assert.match(explorerSource, /Переместить проект/);
  assert.match(explorerSource, /apiMoveProject\(workspaceId,\s*project\.id,\s*selectedTarget\.id\)/);
  assert.match(explorerSource, /folderDisplayLabel\(\{/);
});
