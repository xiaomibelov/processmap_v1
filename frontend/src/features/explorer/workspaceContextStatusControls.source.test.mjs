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

test("Explorer renders editable context status only for section and folder rows", () => {
  const folderRowSource = between("function FolderRow(", "// ─── Project Row");
  const projectRowSource = between("function ProjectRow(", "function InlineLoadingRow(");
  const sessionRowSource = between("function SessionRow(", "// ─── Project Pane");

  assert.match(folderRowSource, /ContextStatusControl/);
  assert.match(folderRowSource, /folder\.context_status/);
  assert.match(folderRowSource, /isExplorerContextStatusEditable\(folder\)/);
  assert.doesNotMatch(projectRowSource, /ContextStatusControl|context_status|as_is|to_be/);
  assert.doesNotMatch(sessionRowSource, /ContextStatusControl|context_status|as_is|to_be/);
});

test("Context status save uses existing folder update API with context_status only", () => {
  const explorerPaneSource = between("function ExplorerPane(", "// ─── Session Row");

  assert.match(explorerPaneSource, /handleFolderContextStatusChange/);
  assert.match(explorerPaneSource, /apiUpdateFolder\(workspaceId,\s*folderIdToUpdate,\s*\{\s*context_status:\s*normalizedStatus\s*\}\)/);
  assert.match(explorerPaneSource, /setMoveNotice\("Статус обновлён\."\)/);
  assert.doesNotMatch(explorerPaneSource, /context_status:\s*normalizedUserId/);
  assert.doesNotMatch(explorerPaneSource, /apiPatchProject\(.*context_status/);
});

test("Project and session status surfaces remain separate", () => {
  const projectRowSource = between("function ProjectRow(", "function InlineLoadingRow(");
  const sessionRowSource = between("function SessionRow(", "// ─── Project Pane");

  assert.match(projectRowSource, /<StatusBadge status=\{project\.status\} \/>/);
  assert.match(sessionRowSource, /MANUAL_SESSION_STATUSES/);
  assert.match(sessionRowSource, /apiPatchSession/);
});
