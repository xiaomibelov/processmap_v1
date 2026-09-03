import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readExplorerSources, from, around } from "../../test-utils/explorerSourceText.mjs";

// retarget(s0): WorkspaceExplorer.jsx read moved to the multifile explorer source set;
// row/dialog slices are re-anchored at stable identifiers (data-testid / component names)
// instead of in-file positional markers. explorerApi.js does not move.
const { text: explorerSource } = readExplorerSources();
const apiSource = readFileSync(new URL("./explorerApi.js", import.meta.url), "utf8");

test("project move has API wrapper and project row action only", () => {
  // retarget(s0): was between("function ProjectRow(", "function InlineLoadingRow(") /
  // between("function SessionRow(", "// ─── Project Pane")
  // retarget(s0): was between("function ProjectRow(", "function InlineLoadingRow(");
  // the row is located by its marquee name cell (unique to the project row markup).
  const projectRowSource = around(explorerSource, "<ExplorerMarqueeText text={project.name}", 3500);
  const sessionRowSource = around(explorerSource, 'title="Действия сессии"', 9500);

  assert.match(apiSource, /export async function apiMoveProject\(workspaceId,\s*projectId,\s*folderId\)/);
  assert.match(apiSource, /\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/move/);
  assert.match(projectRowSource, /label:\s*"Переместить"/);
  assert.match(projectRowSource, /icon:\s*<IcoMove \/>/);
  assert.match(projectRowSource, /action:\s*\(\) => onMove\?\.\(project\)/);
  assert.doesNotMatch(sessionRowSource, /IcoMove/);
});

test("project move dialog labels targets and calls apiMoveProject", () => {
  // retarget(s0): was between("function MoveProjectDialog(", "// ─── Workspace Sidebar")
  const dialogSource = from(explorerSource, "MoveProjectDialog", 12000);

  assert.match(dialogSource, /title="Переместить проект"/);
  assert.match(dialogSource, /Выберите раздел или папку, куда нужно переместить проект/);
  assert.match(dialogSource, /buildProjectMoveTargets\(/);
  assert.match(dialogSource, /target\.disabledReason/);
  assert.match(dialogSource, /apiMoveProject\(workspaceId,\s*project\.id,\s*selectedTarget\.id\)/);
});

test("successful project move refreshes explorer and keeps breadcrumb navigation call unchanged", () => {
  assert.match(explorerSource, /setMovingProject\(project\)/);
  assert.match(explorerSource, /load\(\{ resetInlineChildren:\s*true \}\)/);
  assert.match(explorerSource, /Проект перемещён/);
  assert.match(explorerSource, /onNavigateToProject\(project\.id,\s*\{\s*breadcrumbBase:\s*page\?\.breadcrumbs\s*\|\|\s*\[\]\s*\}\)/);
});
