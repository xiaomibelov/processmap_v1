import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const explorerSource = readFileSync(new URL("./WorkspaceExplorer.jsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("./explorerApi.js", import.meta.url), "utf8");

function between(start, end) {
  const startIndex = explorerSource.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = explorerSource.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return explorerSource.slice(startIndex, endIndex);
}

test("project move has API wrapper and project row action only", () => {
  const projectRowSource = between("function ProjectRow(", "function InlineLoadingRow(");
  const sessionRowSource = between("function SessionRow(", "// ─── Project Pane");

  assert.match(apiSource, /export async function apiMoveProject\(workspaceId,\s*projectId,\s*folderId\)/);
  assert.match(apiSource, /\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/move/);
  assert.match(projectRowSource, /label:\s*"Переместить"/);
  assert.match(projectRowSource, /icon:\s*<IcoMove \/>/);
  assert.match(projectRowSource, /action:\s*\(\) => onMove\?\.\(project\)/);
  assert.doesNotMatch(sessionRowSource, /IcoMove/);
});

test("project move dialog labels targets and calls apiMoveProject", () => {
  const dialogSource = between("function MoveProjectDialog(", "// ─── Workspace Sidebar");

  assert.match(dialogSource, /title="Переместить проект"/);
  assert.match(dialogSource, /Выберите раздел или папку, куда нужно переместить проект/);
  assert.match(dialogSource, /buildProjectMoveTargets\(/);
  assert.match(dialogSource, /target\.disabledReason/);
  assert.match(dialogSource, /apiMoveProject\(workspaceId,\s*project\.id,\s*selectedTarget\.id\)/);
});

test("successful project move refreshes explorer and keeps breadcrumb navigation call unchanged", () => {
  const explorerPaneSource = between("function ExplorerPane(", "// ─── Session Row");

  assert.match(explorerPaneSource, /setMovingProject\(project\)/);
  assert.match(explorerPaneSource, /load\(\{ resetInlineChildren:\s*true \}\)/);
  assert.match(explorerPaneSource, /Проект перемещён/);
  assert.match(explorerPaneSource, /onNavigateToProject\(project\.id,\s*\{\s*breadcrumbBase:\s*page\?\.breadcrumbs\s*\|\|\s*\[\]\s*\}\)/);
});
