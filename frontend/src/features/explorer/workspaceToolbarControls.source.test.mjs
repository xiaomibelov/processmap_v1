import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./WorkspaceExplorer.jsx", import.meta.url), "utf8");

function between(start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("workspace toolbar has expand/collapse all control next to status menu", () => {
  const toolbar = between("const workspaceFilterToolbar = (", "<ExplorerSearchBox");

  assert.match(toolbar, /data-testid="workspace-tree-bulk-toggle"/);
  assert.match(toolbar, /aria-label=\{treeBulkToggleLabel\}/);
  assert.match(toolbar, /aria-pressed=\{treeBulkState === "expanded"/);
  assert.ok(
    toolbar.indexOf("workspace-tree-bulk-toggle") < toolbar.indexOf("Настроить статусы"),
    "bulk toggle must be adjacent before status settings menu",
  );
});

test("bulk tree action is transient and does not write explorer preferences", () => {
  const pane = between("function ExplorerPane(", "// ─── Session Row");
  const bulkHandler = between("const handleToggleAllTree = useCallback", "const headerCrumbs =");

  assert.match(pane, /bulkTreeMode/);
  assert.match(bulkHandler, /buildTreeBulkExpandedMap/);
  assert.match(bulkHandler, /ensureFolderChildrenLoaded/);
  assert.doesNotMatch(bulkHandler, /treeSaverRef\.current\?\.schedule/);
});

test("project kebab menu has a relative positioning anchor", () => {
  const projectRow = between("function ProjectRow(", "function InlineLoadingRow(");

  assert.match(projectRow, /<div className="relative flex items-center justify-end gap-1\.5">/);
  assert.match(projectRow, /<ContextMenu items=\{menuItems\} onClose=\{\(\) => setMenuOpen\(false\)\} \/>/);
});

test("row kebab menus exist for section folder project and session rows", () => {
  const folderRow = between("function FolderRow(", "// ─── Project Row");
  const projectRow = between("function ProjectRow(", "function InlineLoadingRow(");
  const sessionRow = between("function SessionRow(", "// ─── Project Pane");

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
  const contextMenu = between("function ContextMenu(", "// ─── Folder Row");

  assert.match(contextMenu, /getBoundingClientRect/);
  assert.match(contextMenu, /Math\.min\(rect\.right - menuWidth/);
  assert.match(contextMenu, /position:\s*"fixed"/);
  assert.match(contextMenu, /maxHeight:\s*"min\(320px, calc\(100vh - 16px\)\)"/);
});
