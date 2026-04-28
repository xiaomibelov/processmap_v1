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

test("Explorer renders type-aware assignee column and removes project owner from primary row", () => {
  const explorerPaneSource = between("function ExplorerPane(", "// ─── Session Row");
  const folderRowSource = between("function FolderRow(", "// ─── Project Row");
  const projectRowSource = between("function ProjectRow(", "function InlineLoadingRow(");

  assert.match(explorerPaneSource, /Ответственный \/ Исполнитель/);
  assert.match(folderRowSource, /<AssigneeCell item=\{folder\} \/>/);
  assert.match(projectRowSource, /<AssigneeCell item=\{project\} \/>/);
  assert.doesNotMatch(projectRowSource, /Owner:\s*\{project\.owner\.name \|\| project\.owner\.id\}/);
  assert.doesNotMatch(projectRowSource, /project\.owner\.id/);
});

test("Folder and project row menus expose assignment actions", () => {
  const folderRowSource = between("function FolderRow(", "// ─── Project Row");
  const projectRowSource = between("function ProjectRow(", "function InlineLoadingRow(");

  assert.match(folderRowSource, /getExplorerAssigneeActionLabel\(folder\)/);
  assert.match(folderRowSource, /onAssign\?\.\(folder,\s*folderLabel\)/);
  assert.match(projectRowSource, /getExplorerAssigneeActionLabel\(project\)/);
  assert.match(projectRowSource, /onAssign\?\.\(project\)/);
});

test("Assignee picker loads org members and filters users", () => {
  const dialogSource = between("function AssigneeDialog(", "function folderMoveErrorMessage(");
  const explorerPaneSource = between("function ExplorerPane(", "// ─── Session Row");

  assert.match(explorerSource, /apiListOrgMembers/);
  assert.match(explorerPaneSource, /apiListOrgMembers\(oid\)/);
  assert.match(dialogSource, /filterExplorerAssignableUsers\(users,\s*query\)/);
  assert.match(dialogSource, /Нет доступных пользователей для назначения/);
  assert.match(dialogSource, /Сохранить/);
  assert.match(dialogSource, /Очистить/);
});

test("Saving responsible and executor uses existing API payloads only", () => {
  const explorerPaneSource = between("function ExplorerPane(", "// ─── Session Row");

  assert.match(apiSource, /export async function apiUpdateFolder\(workspaceId,\s*folderId,\s*patch = \{\}\)/);
  assert.match(explorerPaneSource, /apiUpdateFolder\(workspaceId,\s*item\.id,\s*\{\s*responsible_user_id:\s*normalizedUserId\s*\}\)/);
  assert.match(explorerPaneSource, /apiPatchProject\(item\.id,\s*\{\s*executor_user_id:\s*normalizedUserId\s*\}\)/);
  assert.doesNotMatch(explorerPaneSource, /context_status:\s*normalizedUserId/);
});

test("Session row, search and move surfaces remain wired", () => {
  const sessionRowSource = between("function SessionRow(", "// ─── Project Pane");

  assert.match(sessionRowSource, /MANUAL_SESSION_STATUSES/);
  assert.doesNotMatch(sessionRowSource, /AssigneeDialog|responsible_user_id|executor_user_id/);
  assert.match(explorerSource, /ExplorerSearchResults model=\{searchModel\}/);
  assert.match(explorerSource, /apiMoveFolder\(workspaceId,\s*folder\.id,\s*selectedTarget\.id\)/);
  assert.match(explorerSource, /apiMoveProject\(workspaceId,\s*project\.id,\s*selectedTarget\.id\)/);
});
