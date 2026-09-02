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

test("Workspace session tree row exposes assignee cell", () => {
  const sessionTreeRowSource = between("function SessionTreeRow({", "// Строки сессий раскрытого проекта");

  assert.match(sessionTreeRowSource, /SessionAssigneeCell/);
  assert.match(sessionTreeRowSource, /canAssign/);
  assert.match(sessionTreeRowSource, /onAssign/);
});

test("SessionAssigneeCell reads session assignees", () => {
  const assigneeCellSource = between("function SessionAssigneeCell({", "function CompositionCell(");

  assert.match(assigneeCellSource, /getSessionAssignees/);
  assert.match(explorerSource, /getSessionAssigneesTooltip/);
  assert.match(explorerSource, /getSessionAssigneesTooltip,\s*\n/);
  assert.match(assigneeCellSource, /getVisibleSessionAssignees/);
});

test("ProjectSessionsRows wires session assignee permissions from workspace", () => {
  const projectSessionsRowsSource = between("function ProjectSessionsRows({", "function InlineLoadingRow(");

  assert.match(projectSessionsRowsSource, /canAssign/);
  assert.match(projectSessionsRowsSource, /onAssign/);
  assert.match(projectSessionsRowsSource, /canAssign=\{canAssign\}/);
  assert.match(projectSessionsRowsSource, /onAssign=\{onAssign\}/);
});

test("ExplorerPane opens session assignee dialog with dedicated kind", () => {
  const explorerPaneSource = between("function ExplorerPane(", "// ─── Session Row");

  assert.match(explorerPaneSource, /kind:\s*"session_assignees"/);
  assert.match(explorerPaneSource, /canAssign=\{!!permissions\?\.canAssignSessionAssignees\}/);
});

test("AssigneeDialog supports session_assignees kind", () => {
  const dialogSource = between("function AssigneeDialog({", "function folderMoveErrorMessage(");

  assert.match(dialogSource, /isSessionAssignees/);
  assert.match(dialogSource, /getSessionAssigneeIds/);
  assert.match(dialogSource, /getSessionAssigneesDialogTitle/);
  assert.match(dialogSource, /selectedUserIds/);
  assert.match(dialogSource, /type=\{isSessionAssignees \? "checkbox" : "radio"\}/);
  assert.doesNotMatch(dialogSource, /name="explorer-assignee"[\s\S]*type="radio"/);
});

test("Saving session assignees uses replace endpoint with optimistic cache update and rollback", () => {
  const explorerPaneSource = between("function ExplorerPane(", "// ─── Session Row");

  assert.match(explorerPaneSource, /apiReplaceSessionAssignees/);
  assert.match(explorerPaneSource, /projectSessionsQueryKey\(projectId\)/);
  assert.match(explorerPaneSource, /queryClient\.setQueryData/);
  assert.match(explorerPaneSource, /previousSessions/);
  assert.match(explorerPaneSource, /console\.warn/);
  assert.match(explorerPaneSource, /normalizedUserIds/);
  assert.match(explorerPaneSource, /apiReplaceSessionAssignees\(sessionId,\s*normalizedUserIds\)/);
});

test("ProjectPane exposes session assignee column and dialog outside tree mode", () => {
  const projectPaneSource = between("function ProjectPane(", "// ─── Root WorkspaceExplorer");

  assert.match(projectPaneSource, /canAssignSessionAssignees/);
  assert.match(projectPaneSource, /kind:\s*"session_assignees"/);
  assert.match(projectPaneSource, /apiReplaceSessionAssignees/);
  assert.match(projectPaneSource, /handleSaveProjectSessionAssignees/);
  assert.match(projectPaneSource, /<th className="px-2 py-2">Исполнители<\/th>/);
});

test("API exposes session assignees helpers", () => {
  assert.match(apiSource, /export async function apiGetSessionAssignees\(/);
  assert.match(apiSource, /export async function apiReplaceSessionAssignees\(/);
  assert.match(apiSource, /apiRoutes\.sessions\.assignees\(id\)/);
});
