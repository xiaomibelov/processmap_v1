import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const explorerSource = readFileSync(new URL("./WorkspaceExplorer.jsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../../lib/api.js", import.meta.url), "utf8");

function between(start, end) {
  const startIndex = explorerSource.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = explorerSource.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return explorerSource.slice(startIndex, endIndex);
}

test("ProjectPane table exposes session assignees column", () => {
  const projectPaneSource = between("function ProjectPane(", "// ─── Root WorkspaceExplorer");

  assert.match(projectPaneSource, /<col className="w-\[132px\]" \/>/);
  assert.match(projectPaneSource, /<SortHeader label="Исполнители"/);
  assert.match(projectPaneSource, /showAssigneesColumn/);
  assert.match(projectPaneSource, /canAssignAssignees=\{!!permissions\?\.canAssignSessionAssignees\}/);
  assert.match(projectPaneSource, /onAssignAssignees=\{handleOpenSessionAssignees\}/);
});

test("SessionRow renders assignees cell and menu action without reusing folder/project dialog", () => {
  const sessionRowSource = between("function SessionRow({", "// ─── Session Tree Rows");

  assert.match(sessionRowSource, /SessionAssigneesCell/);
  assert.match(sessionRowSource, /getSessionAssigneesActionLabel\(session\)/);
  assert.match(sessionRowSource, /onAssignAssignees\?\.\(session\)/);
  assert.match(sessionRowSource, /canAssignAssignees/);
  assert.doesNotMatch(sessionRowSource, /AssigneeDialog|responsible_user_id|executor_user_id/);
});

test("SessionAssigneesDialog is a multi-select picker with checkboxes", () => {
  const dialogSource = between("function SessionAssigneesDialog({", "function folderMoveErrorMessage(");

  assert.match(dialogSource, /type="checkbox"/);
  assert.match(dialogSource, /filterExplorerAssignableUsers\(users, query\)/);
  assert.match(dialogSource, /onSave\(Array\.from\(selectedIds\)\)/);
  assert.match(dialogSource, /Сохранить/);
});

test("API exposes session assignees helpers", () => {
  assert.match(apiSource, /export async function apiGetSessionAssignees\(/);
  assert.match(apiSource, /export async function apiReplaceSessionAssignees\(/);
  assert.match(apiSource, /apiRoutes\.sessions\.assignees\(id\)/);
});
