import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const explorerSource = readFileSync(new URL("./WorkspaceExplorer.jsx", import.meta.url), "utf8");

function between(start, end) {
  const startIndex = explorerSource.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = explorerSource.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return explorerSource.slice(startIndex, endIndex);
}

test("folder move uses existing API wrapper and opens from folder rows", () => {
  const folderRowSource = between("function FolderRow(", "// ─── Project Row");

  assert.match(explorerSource, /apiMoveFolder,/);
  assert.match(explorerSource, /import \{ buildFolderMoveTargets \} from "\.\/explorerMoveTargets\.js";/);
  assert.match(folderRowSource, /label:\s*"Переместить"/);
  assert.match(folderRowSource, /icon:\s*<IcoMove \/>/);
  assert.match(folderRowSource, /action:\s*\(\) => onMove\?\.\(folder\)/);
});

test("project and session rows do not expose move action", () => {
  const projectRowSource = between("function ProjectRow(", "function InlineLoadingRow(");
  const sessionRowSource = between("function SessionRow(", "// ─── Project Pane");

  assert.doesNotMatch(projectRowSource, /Переместить/);
  assert.doesNotMatch(projectRowSource, /IcoMove/);
  assert.doesNotMatch(sessionRowSource, /Переместить/);
  assert.doesNotMatch(sessionRowSource, /IcoMove/);
});

test("move dialog disables invalid targets and calls apiMoveFolder with selected target", () => {
  const dialogSource = between("function MoveFolderDialog(", "// ─── Workspace Sidebar");

  assert.match(dialogSource, /buildFolderMoveTargets\(/);
  assert.match(dialogSource, /Переместить \$\{folderLabelAccusative\}/);
  assert.match(dialogSource, /В корень workspace|targets\.map/);
  assert.match(dialogSource, /target\.disabledReason/);
  assert.match(dialogSource, /apiMoveFolder\(workspaceId,\s*folder\.id,\s*selectedTarget\.id\)/);
});

test("successful folder move refreshes explorer and preserves label aliases", () => {
  const explorerPaneSource = between("function ExplorerPane(", "// ─── Root WorkspaceExplorer");

  assert.match(explorerPaneSource, /load\(\{ resetInlineChildren:\s*true \}\)/);
  assert.match(explorerPaneSource, /folderDisplayLabel\(\{/);
  assert.match(explorerPaneSource, /Раздел перемещён/);
  assert.match(explorerPaneSource, /Папка перемещена/);
});
