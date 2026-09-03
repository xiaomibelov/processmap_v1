import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const explorerSource = readFileSync(new URL("./WorkspaceExplorer.jsx", import.meta.url), "utf8");

function between(start, end) {
  const startIndex = explorerSource.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = explorerSource.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return explorerSource.slice(startIndex, endIndex);
}

test("workspace has one toolbar row with chips, counter, search and create actions", () => {
  assert.doesNotMatch(explorerSource, /data-testid="workspace-explorer-toolbar"/);
  assert.match(explorerSource, /data-testid="workspace-filter-toolbar"/);

  const toolbarSource = between("function ExplorerPane(", "// ─── Session Row");
  assert.match(toolbarSource, /statusFilterOptions\.map/);
  assert.match(toolbarSource, /visibleRows\.filter/);
  assert.match(toolbarSource, /workspace-explorer-tree-search/);
  assert.match(toolbarSource, /setCreatingFolder\(true\)/);
  assert.match(toolbarSource, /setCreatingProject\(true\)/);
  assert.match(toolbarSource, /aria-label="Настроить статусы"/);
});

test("workspace actions are not rendered in a separate row before filter chips", () => {
  const renderSource = between("return (", "{/* Modals */}");
  assert.doesNotMatch(renderSource, /\{workspaceToolbar\}/);
  assert.match(renderSource, /\{workspaceFilterToolbar\}/);
  assert.doesNotMatch(renderSource, /\{workspaceFilterToolbar\}\s*\{statusFilterChips\}/);
});

test("global explorer header breadcrumbs include organization before workspace path", () => {
  const crumbsSource = between("const currentOrgName =", "const parentHeaderCrumb =");
  const headerSource = between("const explorerHeader = (", "const workspaceFilterToolbar = (");

  assert.match(crumbsSource, /currentOrgName/);
  assert.match(crumbsSource, /workspaceName/);
  assert.match(headerSource, /dataTestId="explorer-breadcrumbs"/);
  assert.match(headerSource, /maxVisible=\{6\}/);
  assert.doesNotMatch(headerSource, /workspace-explorer-tree-search|setCreatingFolder|setCreatingProject/);
});

test("sidebar starts with workspaces and no longer duplicates organization name", () => {
  const sidebarSource = between("function WorkspaceSidebar({", "// ─── Context Menu");

  assert.doesNotMatch(sidebarSource, /organizationName/);
  assert.doesNotMatch(sidebarSource, /Organization/);
  assert.doesNotMatch(sidebarSource, /title=\{organizationName/);
  assert.match(sidebarSource, />Workspaces</);
});

test("hiding active status filter resets it to all and hidden menu shows checkbox state", () => {
  const paneSource = between("function ExplorerPane(", "// ─── Session Row");

  assert.match(paneSource, /hiddenStatusKeys/);
  assert.match(paneSource, /setStatusFilter\("all"\)/);
  assert.match(paneSource, /type="checkbox"/);
  assert.match(paneSource, /checked=\{!hiddenStatusKeySet\.has\(option\.key\)\}/);
});
