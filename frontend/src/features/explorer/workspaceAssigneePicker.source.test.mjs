import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readExplorerSources, around } from "../../test-utils/explorerSourceText.mjs";

// retarget(s0): WorkspaceExplorer.jsx-scoped reads moved to the multifile explorer source
// set; between() slices anchored at in-file markers are replaced by global assertions and
// windows around stable anchors (component names / string literals).
const { text: explorerSource } = readExplorerSources();
const apiSource = readFileSync(new URL("./explorerApi.js", import.meta.url), "utf8");

test("Explorer renders type-aware assignee column and removes project owner from primary row", () => {
  assert.match(explorerSource, /Ответственный \/ Исполнитель/);
  assert.match(explorerSource, /<AssigneeCell item=\{folder\}[\s\S]*\/>/);
  assert.match(explorerSource, /<AssigneeCell item=\{project\}[\s\S]*\/>/);
  assert.doesNotMatch(explorerSource, /Owner:\s*\{project\.owner\.name \|\| project\.owner\.id\}/);
  assert.doesNotMatch(explorerSource, /project\.owner\.id/);
});

test("Folder and project row menus expose assignment actions", () => {
  assert.match(explorerSource, /getExplorerAssigneeActionLabel\(folder\)/);
  assert.match(explorerSource, /onAssign\?\.\(folder,\s*folderLabel\)/);
  assert.match(explorerSource, /getExplorerAssigneeActionLabel\(project\)/);
  assert.match(explorerSource, /canAssign = false/);
  assert.match(explorerSource, /\.\.\.\(canAssign \? \[\{ label: assigneeActionLabel/);
  assert.match(explorerSource, /onAssign\?\.\(project\)/);
  assert.match(explorerSource, /kind:\s*"responsible"/);
  assert.match(explorerSource, /folderLabel:\s*targetLabel/);
  assert.match(explorerSource, /kind:\s*"executor"/);
  assert.match(explorerSource, /canAssign=\{!!permissions\?\.canRenameProject\}/);
  assert.match(explorerSource, /currentUser=\{user\}/);
  assert.match(explorerSource, /orgs=\{orgs\}/);
});

test("Assignee picker loads assignable users, filters users, and has bounded loading states", () => {
  // retarget(s0): dialog pins were sliced via between("function AssigneeDialog(", "function folderMoveErrorMessage(");
  // the dialog is now located by a stable string literal unique to its user-search markup.
  const dialogSource = around(explorerSource, 'placeholder="Найти пользователя"', 3800);

  assert.match(explorerSource, /apiListOrgAssignableUsers/);
  assert.doesNotMatch(explorerSource, /apiListOrgMembers/);
  assert.match(explorerSource, /mergeExplorerAssignableCurrentUser/);
  assert.match(explorerSource, /getExplorerAssignableUserId/);
  assert.match(explorerSource, /Promise\.race\(\[\s*apiListOrgAssignableUsers\(oid\),\s*assigneeMembersLoadTimeout\(\),\s*\]\)/);
  assert.match(explorerSource, /normalizeExplorerAssignableUsersResponse\(resp\)/);
  assert.match(explorerSource, /\}, \[activeOrgId,\s*assigneeDialog\]\);/);
  assert.doesNotMatch(explorerSource, /\}, \[[^\]]*assigneeMembersState\.(?:loaded|loading|orgId)[^\]]*\]\);/);
  assert.match(explorerSource, /loading:\s*false,\s*loaded:\s*true,\s*error:\s*normalized\.error/s);
  assert.match(explorerSource, /const responsibleAssigneeUsers = useMemo\(/);
  assert.match(explorerSource, /assigneeDialog\.kind === "responsible" \? responsibleAssigneeUsers : assigneeMembersState\.items/);
  assert.match(explorerSource, /catch\(\(e\) => \{[\s\S]*loading:\s*false,[\s\S]*error:\s*"Не удалось загрузить пользователей\."/);
  assert.match(dialogSource, /filterExplorerAssignableUsers\(users,\s*query\)/);
  assert.match(dialogSource, /Загрузка пользователей\.\.\./);
  assert.match(dialogSource, /Нет доступных пользователей для назначения/);
  assert.match(dialogSource, /usersError/);
  assert.match(dialogSource, /Сохранить/);
  assert.match(dialogSource, /Очистить/);
});

test("Saving responsible and executor uses existing API payloads only", () => {
  assert.match(apiSource, /export async function apiUpdateFolder\(workspaceId,\s*folderId,\s*patch = \{\}\)/);
  assert.match(explorerSource, /const normalizedUserId = String\(userIdOrIds \|\| ""\)\.trim\(\) \|\| null/);
  assert.match(explorerSource, /apiUpdateFolder\(workspaceId,\s*item\.id,\s*\{\s*responsible_user_id:\s*normalizedUserId\s*\}\)/);
  assert.match(explorerSource, /apiPatchProject\(item\.id,\s*\{\s*executor_user_id:\s*normalizedUserId\s*\}\)/);
  assert.doesNotMatch(explorerSource, /owner_user_id:\s*normalizedUserId/);
  assert.doesNotMatch(explorerSource, /context_status:\s*normalizedUserId/);
});

test("Session row, search and move surfaces remain wired", () => {
  // retarget(s0): was sliced via between("function SessionRow(", "// ─── Project Pane");
  // the session row is now located by its stable kebab-menu title string.
  const sessionRowSource = around(explorerSource, 'title="Действия сессии"', 4000);

  assert.match(sessionRowSource, /StatusPopoverControl/);
  assert.match(sessionRowSource, /onSessionStatusChange/);
  assert.doesNotMatch(sessionRowSource, /AssigneeDialog|responsible_user_id|executor_user_id/);
  assert.match(explorerSource, /ExplorerSearchResults model=\{searchModel\}/);
  assert.match(explorerSource, /apiMoveFolder\(workspaceId,\s*folder\.id,\s*selectedTarget\.id\)/);
  assert.match(explorerSource, /apiMoveProject\(workspaceId,\s*project\.id,\s*selectedTarget\.id\)/);
});
