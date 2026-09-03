import test from "node:test";
import assert from "node:assert/strict";
import { readExplorerSources, around } from "../../test-utils/explorerSourceText.mjs";

// retarget(s0): WorkspaceExplorer.jsx read moved to the multifile explorer source set;
// row-scoped slices are re-anchored at stable per-row identifiers (data-testid /
// kebab-menu title strings) instead of in-file positional markers.
const { text: explorerSource } = readExplorerSources();

test("Explorer renders editable status popover only for section/folder and tree session rows", () => {
  // retarget(s0): was between("function FolderRow(", "// ─── Project Row")
  const folderRowSource = around(explorerSource, 'data-testid={`folder-navigate-', 3000);
  // retarget(s0): was between("function ProjectRow(", "function InlineLoadingRow(");
  // the row is located by its marquee name cell (unique to the project row markup).
  const projectRowSource = around(explorerSource, "<ExplorerMarqueeText text={project.name}", 3500);
  // retarget(s0): was between("function SessionRow(", "// ─── Project Pane")
  const sessionRowSource = around(explorerSource, 'title="Действия сессии"', 4000);

  assert.match(folderRowSource, /StatusPopoverControl/);
  assert.match(folderRowSource, /folder\.context_status/);
  assert.match(folderRowSource, /isExplorerContextStatusEditable\(folder\)/);
  assert.match(projectRowSource, /<StatusDotBadge domain="project" value=\{project\.status\} \/>/);
  // retarget(s0): was asserted on the ProjectRow→InlineLoadingRow slice (which also spanned
  // SessionTreeRow); the session-domain popover lives in the tree session row markup.
  assert.match(explorerSource, /<StatusPopoverControl\s+domain="session"/);
  assert.doesNotMatch(projectRowSource, /ContextStatusControl|context_status|as_is|to_be/);
  assert.doesNotMatch(sessionRowSource, /ContextStatusControl|context_status|as_is|to_be/);
});

test("Context status save uses existing folder update API with context_status only", () => {
  assert.match(explorerSource, /handleFolderContextStatusChange/);
  assert.match(explorerSource, /apiUpdateFolder\(workspaceId,\s*folderIdToUpdate,\s*\{\s*context_status:\s*normalizedStatus\s*\}\)/);
  assert.match(explorerSource, /setMoveNotice\("Статус обновлён\."\)/);
  assert.doesNotMatch(explorerSource, /context_status:\s*normalizedUserId/);
  assert.doesNotMatch(explorerSource, /apiPatchProject\(.*context_status/);
});

test("Tree session status change uses apiPatchSession with base version and invalidates project sessions", () => {
  assert.match(explorerSource, /handleTreeSessionStatusChange/);
  assert.match(explorerSource, /apiGetSession\(sessionId\)/);
  assert.match(explorerSource, /base_diagram_state_version:\s*baseVersion/);
  assert.match(explorerSource, /projectSessionsQueryKey\(session\?\.project_id\)/);
  assert.doesNotMatch(explorerSource, /window\.alert/);
});

test("Project and session status surfaces remain separate", () => {
  // retarget(s0): was between("function ProjectRow(", "function InlineLoadingRow(")
  const projectRowSource = around(explorerSource, "<ExplorerMarqueeText text={project.name}", 3500);
  // retarget(s0): was between("function SessionRow(", "// ─── Project Pane")
  const sessionRowSource = around(explorerSource, 'title="Действия сессии"', 4000);

  assert.match(projectRowSource, /<StatusDotBadge domain="project" value=\{project\.status\} \/>/);
  assert.doesNotMatch(explorerSource, /<StatusBadge status=\{project\.status\} \/>/);
  assert.match(sessionRowSource, /StatusPopoverControl/);
  assert.match(sessionRowSource, /onSessionStatusChange/);
});
