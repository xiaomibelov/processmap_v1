import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const explorerSource = readFileSync(new URL("./WorkspaceExplorer.jsx", import.meta.url), "utf8");
const displayLabelSource = readFileSync(new URL("./workspaceDisplayLabels.js", import.meta.url), "utf8");

test("ProjectPane keeps breadcrumb trail and moves session count to sidebar", () => {
  assert.match(explorerSource, /buildProjectBreadcrumbTrail\(backCrumbs,\s*proj\?\.title\s*\|\|\s*proj\?\.name\s*\|\|\s*""\)/);
  assert.doesNotMatch(explorerSource, /sessionCountersFull\s*=\s*`Сессии: \$\{sessionCount\}`/);
  assert.doesNotMatch(explorerSource, /data-testid="project-meta"/);
  assert.doesNotMatch(explorerSource, /SummaryPill label="Owner"/);
  assert.doesNotMatch(explorerSource, /SummaryPill label="Активность"/);
  assert.doesNotMatch(explorerSource, /SummaryPill label="DoD"/);
});

test("project header is single-line and sessions table renders directly below it", () => {
  assert.match(explorerSource, /data-testid="project-header"/);
  assert.doesNotMatch(explorerSource, /<span className="text-xs font-semibold uppercase tracking-wide text-muted">Сессии<\/span>/);
  assert.match(explorerSource, /sortedSessions\.map\(\(s\) =>/);
});

test("explorer header is single-line", () => {
  assert.match(explorerSource, /data-testid="explorer-header"/);
  assert.match(explorerSource, /getWorkspaceHeaderLayout\(explorerNavWidth\)/);
  assert.match(explorerSource, /getWorkspaceHeaderLayout\(projectNavWidth\)/);
});

test("workspace root create copy is section while nested copy remains folder", () => {
  assert.match(displayLabelSource, /createLabel:\s*"Создать раздел"/);
  assert.match(displayLabelSource, /modalTitle:\s*"Новый раздел"/);
  assert.match(displayLabelSource, /createLabel:\s*"Создать папку"/);
  assert.match(displayLabelSource, /modalTitle:\s*"Новая папка"/);
});

test("ExplorerPane uses display-only section labels without changing backend creation payload", () => {
  assert.match(explorerSource, /folderDisplayLabel\(\{\s*folder,\s*depth,\s*currentFolderId\s*\}\)/);
  assert.match(explorerSource, /<TypeTag type=\{depth === 0 && !folder\.parent_id \? "section" : "folder"\} label=\{folderLabel\} \/>/);
  assert.match(explorerSource, /apiCreateFolder\(workspaceId,\s*\{\s*name,\s*parent_id:\s*folderId\s*\|\|\s*""\s*\}\)/);
});
