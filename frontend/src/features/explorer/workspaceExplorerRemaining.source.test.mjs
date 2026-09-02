import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const explorerSource = readFileSync(new URL("./WorkspaceExplorer.jsx", import.meta.url), "utf8");
const persistenceSource = readFileSync(new URL("./explorerTreePersistence.js", import.meta.url), "utf8");

function between(start, end, source = explorerSource) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("ExplorerPane assignment saves patch only the affected row without resetting tree children", () => {
  const saveSource = between("const handleSaveAssignee = useCallback", "const handleFolderContextStatusChange = useCallback");

  assert.match(saveSource, /patchExplorerItemInCaches/);
  assert.doesNotMatch(saveSource, /load\(\{ resetInlineChildren: true \}\)/);
  assert.doesNotMatch(saveSource, /invalidateQueries/);
});

test("workspace success feedback is a fixed toast overlay with auto-dismiss", () => {
  const toastSource = between("function WorkspaceExplorerToast(", "function ExplorerSearchBox(");
  const renderSource = between("{moveNotice ? (", "{activeTab === \"analytics\"");

  assert.match(toastSource, /fixed bottom-5 right-5/);
  assert.match(toastSource, /role="status"/);
  assert.match(toastSource, /aria-live="polite"/);
  assert.match(toastSource, /setTimeout\(\(\) => onClose\?\.\(\),\s*3500\)/);
  assert.doesNotMatch(renderSource, /border-b border-border/);
});

test("workspace actions live in workspace toolbar, not in portaled header", () => {
  const headerSource = between("const explorerHeader = (", "const workspaceToolbar = (");
  const toolbarSource = between("const workspaceToolbar = (", "return (");

  assert.doesNotMatch(headerSource, /workspace-explorer-tree-search|setCreatingFolder|setCreatingProject/);
  assert.match(toolbarSource, /data-testid="workspace-explorer-toolbar"/);
  assert.match(toolbarSource, /workspace-explorer-tree-search/);
  assert.match(toolbarSource, /setCreatingFolder\(true\)/);
  assert.match(toolbarSource, /setCreatingProject\(true\)/);
});

test("workspace search uses a standard 16px icon component instead of text glyph", () => {
  const searchBoxSource = between("function ExplorerSearchBox(", "function SearchResultRow(");

  assert.match(explorerSource, /function IcoSearch\(/);
  assert.match(searchBoxSource, /<IcoSearch className="h-4 w-4/);
  assert.doesNotMatch(searchBoxSource, />⌕</);
});

test("tree persistence is scoped by org and workspace with legacy collapsed-key compatibility", () => {
  assert.match(persistenceSource, /treeScopeKey\(orgId,\s*workspaceId\)/);
  assert.match(persistenceSource, /expandedIdsFromPreferences\(preferences,\s*workspaceId,\s*orgId/);
  assert.match(persistenceSource, /treeExpandedWithExpandedIds/);
  assert.match(persistenceSource, /EXPLORER_TREE_EXPANDED_KEY/);
  assert.match(persistenceSource, /EXPLORER_TREE_COLLAPSED_KEY/);
});
