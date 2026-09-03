import test from "node:test";
import assert from "node:assert/strict";
import { readExplorerSources, betweenStable } from "../../test-utils/explorerSourceText.mjs";

// retarget(s0): WorkspaceExplorer.jsx read moved to the multifile explorer source set;
// header/toolbar scoping is bounded by stable data-testids instead of in-file
// const-declaration markers ("const projectHeader = (", ...).
const { text: explorerSource } = readExplorerSources();

test("project global header contains only tabs, breadcrumbs, and status", () => {
  // retarget(s0): was between("const projectHeader = (", "const projectToolbar = (")
  const headerSource = betweenStable(
    explorerSource,
    'data-testid="project-header"',
    'data-testid="project-filter-toolbar"',
  );

  assert.match(headerSource, /data-testid="project-header"/);
  assert.match(headerSource, /dataTestId="project-breadcrumbs"/);
  assert.match(headerSource, /StatusPopoverControl/);
  assert.doesNotMatch(headerSource, /workspace-explorer-project-search|setCreating\(true\)|createSessionLabel/);
});

test("project search and create actions live in the context toolbar row", () => {
  assert.match(explorerSource, /data-testid="project-filter-toolbar"/);
  assert.match(explorerSource, /workspace-explorer-project-search/);
  assert.match(explorerSource, /setCreating\(true\)/);
  assert.match(explorerSource, /visibleProjectItemCount/);
});

test("project render keeps toolbar before search results and table header", () => {
  assert.match(explorerSource, /\{projectToolbar\}/);
  assert.match(explorerSource, /\{projectToolbar\}[\s\S]*<ExplorerSearchResults/);
  assert.match(explorerSource, /\{projectToolbar\}[\s\S]*<thead className="sticky top-0 z-10">/);
});
