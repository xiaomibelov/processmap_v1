import test from "node:test";
import assert from "node:assert/strict";
import { readExplorerSources, from, around } from "../../test-utils/explorerSourceText.mjs";

// retarget(s0): WorkspaceExplorer.jsx read moved to the multifile explorer source set;
// row/dialog slices are re-anchored at stable identifiers (data-testid / component names)
// instead of in-file positional markers.
const { text: explorerSource } = readExplorerSources();

test("folder move uses existing API wrapper and opens from folder rows", () => {
  // retarget(s0): was between("function FolderRow(", "// ─── Project Row")
  const folderRowSource = around(explorerSource, 'data-testid={`folder-navigate-', 3000);

  assert.match(explorerSource, /apiMoveFolder,/);
  assert.match(explorerSource, /import \{[^}]*buildFolderMoveTargets[^}]*\} from "\.\/explorerMoveTargets\.js";/s);
  assert.match(folderRowSource, /label:\s*"Переместить"/);
  assert.match(folderRowSource, /icon:\s*<IcoMove \/>/);
  assert.match(folderRowSource, /action:\s*\(\) => onMove\?\.\(folder\)/);
});

test("session rows do not expose move action from folder move contour", () => {
  // retarget(s0): was between("function SessionRow(", "// ─── Project Pane")
  const sessionRowSource = around(explorerSource, 'title="Действия сессии"', 9500);

  assert.doesNotMatch(sessionRowSource, /Переместить/);
  assert.doesNotMatch(sessionRowSource, /IcoMove/);
});

test("move dialog disables invalid targets and calls apiMoveFolder with selected target", () => {
  // retarget(s0): was between("function MoveFolderDialog(", "// ─── Workspace Sidebar")
  const dialogSource = from(explorerSource, "MoveFolderDialog", 12000);

  assert.match(dialogSource, /buildFolderMoveTargets\(/);
  assert.match(dialogSource, /Переместить \$\{folderLabelAccusative\}/);
  assert.match(dialogSource, /В корень workspace|targets\.map/);
  assert.match(dialogSource, /target\.disabledReason/);
  assert.match(dialogSource, /apiMoveFolder\(workspaceId,\s*folder\.id,\s*selectedTarget\.id\)/);
});

test("successful folder move refreshes explorer and preserves label aliases", () => {
  assert.match(explorerSource, /load\(\{ resetInlineChildren:\s*true \}\)/);
  assert.match(explorerSource, /folderDisplayLabel\(\{/);
  assert.match(explorerSource, /Раздел перемещён/);
  assert.match(explorerSource, /Папка перемещена/);
});
