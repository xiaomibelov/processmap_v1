import test from "node:test";
import assert from "node:assert/strict";
import { readExplorerSources, from, around, betweenStable } from "../../test-utils/explorerSourceText.mjs";
// retarget(s0): WorkspaceExplorer.jsx read moved to the multifile explorer source set;
// toolbar/row slices are re-anchored at stable identifiers (data-testids, component
// names, handler names) instead of in-file positional markers.
const { text: source } = readExplorerSources();

test("workspace toolbar has expand/collapse all control next to status menu", () => {
  // retarget(s0): was between("const workspaceFilterToolbar = (", "<ExplorerSearchBox");
  // the toolbar scope is bounded by its stable data-testid and the search box component.
  const toolbar = betweenStable(source, 'data-testid="workspace-filter-toolbar"', "<ExplorerSearchBox");

  assert.match(toolbar, /data-testid="workspace-tree-bulk-toggle"/);
  assert.match(toolbar, /aria-label=\{treeBulkToggleLabel\}/);
  assert.match(toolbar, /aria-pressed=\{treeBulkState === "expanded"/);
  assert.ok(
    toolbar.indexOf("workspace-tree-bulk-toggle") < toolbar.indexOf("Настроить статусы"),
    "bulk toggle must be adjacent before status settings menu",
  );
});

test("bulk tree action is transient and does not write explorer preferences", () => {
  assert.match(source, /bulkTreeMode/);
  // retarget(s0): was between("const handleToggleAllTree = useCallback", "const headerCrumbs =")
  const bulkHandler = from(source, "const handleToggleAllTree = useCallback", 3500);

  assert.match(bulkHandler, /buildTreeBulkExpandedMap/);
  assert.match(bulkHandler, /ensureFolderChildrenLoaded/);
  assert.doesNotMatch(bulkHandler, /treeSaverRef\.current\?\.schedule/);
});

test("project kebab menu has a relative positioning anchor", () => {
  // retarget(s0): was between("function ProjectRow(", "function InlineLoadingRow(");
  // the row is located by its marquee name cell (unique to the project row markup).
  const projectRow = around(source, "<ExplorerMarqueeText text={project.name}", 3500);

  assert.match(projectRow, /<div className="relative flex items-center justify-end gap-1\.5">/);
  assert.match(projectRow, /<ContextMenu items=\{menuItems\} onClose=\{\(\) => setMenuOpen\(false\)\} \/>/);
});

test("row kebab menus exist for section folder project and session rows", () => {
  // retarget(s0): was three between() slices over FolderRow / ProjectRow / SessionRow;
  // each row is now located by a stable kebab-menu title / marquee anchor.
  const folderRow = around(source, "Действия с ${folderLabelInstrumental}", 4000);
  const projectRow = around(source, "<ExplorerMarqueeText text={project.name}", 3500);
  const sessionRow = around(source, 'title="Действия сессии"', 9500);

  assert.match(folderRow, /title=\{`Действия с \$\{folderLabelInstrumental\}`\}/);
  assert.match(folderRow, /Действия с \$\{folderLabelInstrumental\}/);
  assert.match(folderRow, /Открыть/);
  assert.match(folderRow, /Переместить/);

  assert.match(projectRow, /title="Действия с проектом"/);
  assert.match(projectRow, /Открыть/);
  assert.match(projectRow, /Переместить/);
  assert.match(projectRow, /Переименовать/);

  assert.match(sessionRow, /title="Действия сессии"/);
  assert.match(sessionRow, /Переименовать/);
  assert.match(sessionRow, /Удалить/);
});

test("context menu uses viewport-safe fixed positioning", () => {
  // retarget(s0): was between("function ContextMenu(", "// ─── Folder Row");
  // the ContextMenu positioning code is located by its stable anchor call.
  // П4: ранее якорем был первый getBoundingClientRect в файле — после добавления
  // fixed-позиционирования поповера статуса (StatusPopoverControl) он перестал
  // однозначно указывать на ContextMenu.
  const contextMenu = from(source, "function ContextMenu(", 4000);

  assert.match(contextMenu, /getBoundingClientRect/);
  assert.match(contextMenu, /Math\.min\(rect\.right - menuWidth/);
  assert.match(contextMenu, /position:\s*"fixed"/);
  assert.match(contextMenu, /maxHeight:\s*"min\(320px, calc\(100vh - 16px\)\)"/);
});
