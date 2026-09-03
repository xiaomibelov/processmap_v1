import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readExplorerSources, from, around } from "../../test-utils/explorerSourceText.mjs";

// retarget(s0): WorkspaceExplorer.jsx read moved to the multifile explorer source set;
// handler/component slices are re-anchored at stable identifiers (handler names,
// data-testids) instead of in-file positional markers.
const { text: explorerSource } = readExplorerSources();
const persistenceSource = readFileSync(new URL("./explorerTreePersistence.js", import.meta.url), "utf8");

test("ExplorerPane assignment saves patch only the affected row without resetting tree children", () => {
  // retarget(s0): was between("const handleSaveAssignee = useCallback", "const handleFolderContextStatusChange = useCallback")
  const saveSource = from(explorerSource, "const handleSaveAssignee = useCallback", 4500);

  assert.match(saveSource, /patchExplorerItemInCaches/);
  assert.doesNotMatch(saveSource, /load\(\{ resetInlineChildren: true \}\)/);
  assert.doesNotMatch(saveSource, /invalidateQueries/);
});

test("workspace success feedback is a fixed toast overlay with auto-dismiss", () => {
  // retarget(s0): toast pins were between("function WorkspaceExplorerToast(", "function ExplorerSearchBox(");
  // the toast markup is located by its stable role/positioning strings.
  const toastSource = around(explorerSource, 'className="pointer-events-none fixed bottom-5 right-5', 4000);
  // retarget(s0): render-site negative was between("{moveNotice ? (", "{activeTab === \"analytics\"")
  const renderSource = from(explorerSource, "{moveNotice ? (", 1200);

  assert.match(toastSource, /fixed bottom-5 right-5/);
  assert.match(toastSource, /role="status"/);
  assert.match(toastSource, /aria-live="polite"/);
  assert.match(toastSource, /setTimeout\(\(\) => onClose\?\.\(\),\s*3500\)/);
  assert.doesNotMatch(renderSource, /border-b border-border/);
});

test("workspace actions live in workspace filter toolbar, not in portaled header", () => {
  // retarget(s0): header negative was between("const explorerHeader = (", "const workspaceFilterToolbar = (");
  // header scope is now bounded by stable data-testids.
  const headerSource = (() => {
    const start = explorerSource.indexOf('data-testid="explorer-header"');
    assert.notEqual(start, -1, "missing explorer-header testid");
    const end = explorerSource.indexOf('data-testid="workspace-filter-toolbar"', start);
    assert.notEqual(end, -1, "missing workspace-filter-toolbar testid");
    return explorerSource.slice(start, end);
  })();

  assert.doesNotMatch(headerSource, /workspace-explorer-tree-search|setCreatingFolder|setCreatingProject/);
  assert.match(explorerSource, /data-testid="workspace-filter-toolbar"/);
  assert.doesNotMatch(explorerSource, /data-testid="workspace-explorer-toolbar"/);
  assert.match(explorerSource, /workspace-explorer-tree-search/);
  assert.match(explorerSource, /setCreatingFolder\(true\)/);
  assert.match(explorerSource, /setCreatingProject\(true\)/);
});

test("workspace search uses a standard 16px icon component instead of text glyph", () => {
  assert.match(explorerSource, /function IcoSearch\(/);
  assert.match(explorerSource, /<IcoSearch className="h-4 w-4/);
  assert.doesNotMatch(explorerSource, />⌕</);
});

test("tree persistence is scoped by org and workspace with legacy collapsed-key compatibility", () => {
  assert.match(persistenceSource, /treeScopeKey\(orgId,\s*workspaceId\)/);
  assert.match(persistenceSource, /expandedIdsFromPreferences\(preferences,\s*workspaceId,\s*orgId/);
  assert.match(persistenceSource, /treeExpandedWithExpandedIds/);
  assert.match(persistenceSource, /EXPLORER_TREE_EXPANDED_KEY/);
  assert.match(persistenceSource, /EXPLORER_TREE_COLLAPSED_KEY/);
});
