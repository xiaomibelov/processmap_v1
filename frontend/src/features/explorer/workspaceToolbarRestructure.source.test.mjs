import test from "node:test";
import assert from "node:assert/strict";
import { readExplorerSources, betweenStable } from "../../test-utils/explorerSourceText.mjs";

// retarget(s0): WorkspaceExplorer.jsx read moved to the multifile explorer source set;
// header scoping is bounded by stable data-testids instead of in-file const-declaration
// markers ("const explorerHeader = (", ...).
const { text: explorerSource } = readExplorerSources();

test("workspace has one toolbar row with chips, counter, search and create actions", () => {
  assert.doesNotMatch(explorerSource, /data-testid="workspace-explorer-toolbar"/);
  assert.match(explorerSource, /data-testid="workspace-filter-toolbar"/);

  assert.match(explorerSource, /statusFilterOptions\.map/);
  assert.match(explorerSource, /visibleRows\.filter/);
  assert.match(explorerSource, /workspace-explorer-tree-search/);
  assert.match(explorerSource, /setCreatingFolder\(true\)/);
  assert.match(explorerSource, /setCreatingProject\(true\)/);
  assert.match(explorerSource, /aria-label="Настроить статусы"/);
});

test("workspace actions are not rendered in a separate row before filter chips", () => {
  // retarget(s0): was between("return (", "{/* Modals */}"); {workspaceToolbar} no longer
  // exists anywhere (global negative), statusFilterChips was never extracted as a variable.
  assert.doesNotMatch(explorerSource, /\{workspaceToolbar\}/);
  assert.match(explorerSource, /\{workspaceFilterToolbar\}/);
  assert.doesNotMatch(explorerSource, /\{workspaceFilterToolbar\}\s*\{statusFilterChips\}/);
});

test("global explorer header breadcrumbs include organization before workspace path", () => {
  assert.match(explorerSource, /currentOrgName/);
  assert.match(explorerSource, /workspaceName/);
  // retarget(s0): header negative was between("const explorerHeader = (", "const workspaceFilterToolbar = (");
  // the header scope is bounded by stable data-testids.
  const headerSource = betweenStable(
    explorerSource,
    'data-testid="explorer-header"',
    'data-testid="workspace-filter-toolbar"',
  );

  assert.match(headerSource, /dataTestId="explorer-breadcrumbs"/);
  assert.match(headerSource, /maxVisible=\{6\}/);
  assert.doesNotMatch(headerSource, /workspace-explorer-tree-search|setCreatingFolder|setCreatingProject/);
});

test("sidebar starts with workspaces and no longer duplicates organization name", () => {
  // retarget(s0): was between("function WorkspaceSidebar({", "// ─── Context Menu");
  // the sidebar body is located by its stable "Workspaces" label anchor.
  const start = explorerSource.indexOf(">Workspaces<");
  assert.notEqual(start, -1, "missing Workspaces sidebar label");
  const sidebarSource = explorerSource.slice(Math.max(0, start - 4000), start + 6000);

  assert.doesNotMatch(sidebarSource, /organizationName/);
  assert.doesNotMatch(sidebarSource, /Organization/);
  assert.doesNotMatch(sidebarSource, /title=\{organizationName/);
  assert.match(sidebarSource, />Workspaces</);
});

test("hiding active status filter resets it to all and hidden menu shows checkbox state", () => {
  assert.match(explorerSource, /hiddenStatusKeys/);
  assert.match(explorerSource, /setStatusFilter\("all"\)/);
  assert.match(explorerSource, /type="checkbox"/);
  assert.match(explorerSource, /checked=\{!hiddenStatusKeySet\.has\(option\.key\)\}/);
});
