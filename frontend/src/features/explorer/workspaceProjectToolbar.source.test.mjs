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

test("project global header contains only tabs, breadcrumbs, and status", () => {
  const headerSource = between("const projectHeader = (", "const projectToolbar = (");

  assert.match(headerSource, /data-testid="project-header"/);
  assert.match(headerSource, /dataTestId="project-breadcrumbs"/);
  assert.match(headerSource, /StatusPopoverControl/);
  assert.doesNotMatch(headerSource, /workspace-explorer-project-search|setCreating\(true\)|createSessionLabel/);
});

test("project search and create actions live in the context toolbar row", () => {
  const toolbarSource = between("const projectToolbar = (", "return (");

  assert.match(toolbarSource, /data-testid="project-filter-toolbar"/);
  assert.match(toolbarSource, /workspace-explorer-project-search/);
  assert.match(toolbarSource, /setCreating\(true\)/);
  assert.match(toolbarSource, /visibleProjectItemCount/);
});

test("project render keeps toolbar before search results and table header", () => {
  const renderSource = between("return (", "{creating && permissions?.canCreate");

  assert.match(renderSource, /\{projectToolbar\}/);
  assert.match(renderSource, /\{projectToolbar\}[\s\S]*<ExplorerSearchResults/);
  assert.match(renderSource, /\{projectToolbar\}[\s\S]*<thead className="sticky top-0 z-10">/);
});
