import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readExplorerSources, from, around, betweenStable } from "../../test-utils/explorerSourceText.mjs";

// retarget(s0): WorkspaceExplorer.jsx read moved to the multifile explorer source set;
// component/handler slices are re-anchored at stable identifiers (component names,
// data-testids, handler names) instead of in-file positional markers. lib/api.js
// does not move and is still read directly.
const { text: explorerSource } = readExplorerSources();
const apiSource = readFileSync(new URL("../../lib/api.js", import.meta.url), "utf8");

test("Workspace session tree row exposes assignee cell", () => {
  // retarget(s0): was between("function SessionTreeRow({", "// Строки сессий раскрытого проекта")
  const sessionTreeRowSource = around(explorerSource, "title={session.name || session.title}", 4000);

  assert.match(sessionTreeRowSource, /SessionAssigneeCell/);
  assert.match(sessionTreeRowSource, /canAssign/);
  assert.match(sessionTreeRowSource, /onAssign/);
});

test("SessionAssigneeCell reads session assignees", () => {
  // retarget(s0): was between("function SessionAssigneeCell({", "function CompositionCell(")
  const assigneeCellSource = from(explorerSource, "SessionAssigneeCell", 6000);

  assert.match(assigneeCellSource, /getSessionAssignees/);
  assert.match(explorerSource, /getSessionAssigneesTooltip/);
  assert.match(explorerSource, /getSessionAssigneesTooltip,\s*\n/);
  assert.match(assigneeCellSource, /getVisibleSessionAssignees/);
});

test("ProjectSessionsRows wires session assignee permissions from workspace", () => {
  // retarget(s0): was between("function ProjectSessionsRows({", "function InlineLoadingRow(")
  const projectSessionsRowsSource = from(explorerSource, "ProjectSessionsRows", 6000);

  assert.match(projectSessionsRowsSource, /canAssign/);
  assert.match(projectSessionsRowsSource, /onAssign/);
  assert.match(projectSessionsRowsSource, /canAssign=\{canAssign\}/);
  assert.match(projectSessionsRowsSource, /onAssign=\{onAssign\}/);
});

test("ExplorerPane opens session assignee dialog with dedicated kind", () => {
  assert.match(explorerSource, /kind:\s*"session_assignees"/);
  assert.match(explorerSource, /canAssign=\{!!permissions\?\.canAssignSessionAssignees\}/);
});

test("AssigneeDialog supports session_assignees kind", () => {
  // retarget(s0): was between("function AssigneeDialog({", "function folderMoveErrorMessage(");
  // the dialog is located by a stable string literal unique to its user-search markup.
  const dialogSource = around(explorerSource, 'placeholder="Найти пользователя"', 3800);

  assert.match(dialogSource, /isSessionAssignees/);
  assert.match(dialogSource, /getSessionAssigneeIds/);
  assert.match(dialogSource, /getSessionAssigneesDialogTitle/);
  assert.match(dialogSource, /selectedUserIds/);
  assert.match(dialogSource, /type=\{isSessionAssignees \? "checkbox" : "radio"\}/);
  assert.doesNotMatch(dialogSource, /name="explorer-assignee"[\s\S]*type="radio"/);
});

test("Saving session assignees uses replace endpoint with optimistic cache update and rollback", () => {
  assert.match(explorerSource, /apiReplaceSessionAssignees/);
  assert.match(explorerSource, /projectSessionsQueryKey\(projectId\)/);
  assert.match(explorerSource, /queryClient\.setQueryData/);
  assert.match(explorerSource, /previousSessions/);
  assert.match(explorerSource, /console\.warn/);
  assert.match(explorerSource, /normalizedUserIds/);
  assert.match(explorerSource, /apiReplaceSessionAssignees\(sessionId,\s*normalizedUserIds\)/);
});

test("ProjectPane session assignee save updates only loaded row caches without refetch", () => {
  // retarget(s0): was between("function ProjectPane(", "// ─── Root WorkspaceExplorer"),
  // between("const handleSaveProjectSessionAssignees = useCallback", "const sessionTableDropZoneProps =") and
  // between("function SessionTreeRows({", "// ─── Project Pane"); the handler scope is bounded by
  // its stable declaration identifiers.
  const saveSource = betweenStable(
    explorerSource,
    "const handleSaveProjectSessionAssignees = useCallback",
    "const sessionTableDropZoneProps",
  );
  const sessionTreeRowsSource = from(explorerSource, "SessionTreeRows", 8000);

  assert.match(saveSource, /patchSessionAssigneesInList/);
  assert.match(saveSource, /setSessionChildrenCache/);
  assert.match(saveSource, /previousChildrenCache/);
  assert.match(saveSource, /setSessionChildrenCache\(previousChildrenCache\)/);
  assert.doesNotMatch(saveSource, /invalidateQueries|refetch|load\(/);
  assert.match(explorerSource, /queryClient\.setQueryData\(queryKey,\s*patchSessions\)/);
  assert.match(sessionTreeRowsSource, /canAssign=\{canAssign\}/);
  assert.match(sessionTreeRowsSource, /onAssign=\{onAssign\}/);
});

test("ProjectPane exposes session assignee column and dialog outside tree mode", () => {
  assert.match(explorerSource, /canAssignSessionAssignees/);
  assert.match(explorerSource, /kind:\s*"session_assignees"/);
  assert.match(explorerSource, /apiReplaceSessionAssignees/);
  assert.match(explorerSource, /handleSaveProjectSessionAssignees/);
  assert.match(explorerSource, /<th className="px-2 py-2">Исполнители<\/th>/);
});

test("API exposes session assignees helpers", () => {
  assert.match(apiSource, /export async function apiGetSessionAssignees\(/);
  assert.match(apiSource, /export async function apiReplaceSessionAssignees\(/);
  assert.match(apiSource, /apiRoutes\.sessions\.assignees\(id\)/);
});
