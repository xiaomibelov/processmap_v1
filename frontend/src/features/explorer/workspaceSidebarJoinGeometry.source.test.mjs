import test from "node:test";
import assert from "node:assert/strict";
import { readExplorerSources, around } from "../../test-utils/explorerSourceText.mjs";

// retarget(s0): WorkspaceExplorer.jsx read moved to the multifile explorer source set;
// component slices are re-anchored at stable identifiers instead of in-file positional
// markers. The shared header-height token is asserted by occurrence count because the
// three headers may land in different files after the decomposition.
const { text: explorerSource } = readExplorerSources();

test("workspace shell has one continuous sidebar border axis", () => {
  assert.match(explorerSource, /"--explorer-header-h":\s*"3\.5rem"/);
  assert.match(explorerSource, /border-r border-border/);
  assert.doesNotMatch(explorerSource, /border-r-0/);
});

test("sidebar row highlights are inset and do not touch divider", () => {
  // retarget(s0): was between("function WorkspaceSidebar({", "// ─── Context Menu")
  const sidebarSource = around(explorerSource, ">Workspaces<", 6000);

  assert.match(sidebarSource, /px-2/);
  assert.match(sidebarSource, /rounded-md/);
  assert.match(sidebarSource, /min-w-0/);
  assert.match(sidebarSource, /truncate/);
});

test("left and right headers share the same fixed height token", () => {
  // retarget(s0): was three slices (sidebar header block, explorer header, project header)
  // each matched for the token; after decomposition the headers may live in different
  // files, so the guarantee is "token used at least in all three header surfaces".
  const tokenOccurrences = explorerSource.match(/h-\[var\(--explorer-header-h\)\]/g) || [];
  assert.ok(tokenOccurrences.length >= 3, `expected >=3 uses of --explorer-header-h token, got ${tokenOccurrences.length}`);
});

test("header tabs are centered within the taller app header row", () => {
  // retarget(s0): was between("function HeaderTabs(", "function WorkspaceSidebarContextCounters()")
  const tabsSource = around(explorerSource, 'role="tablist"', 3000);

  assert.match(tabsSource, /className="flex h-full items-center/);
  assert.match(tabsSource, /className=\{`relative inline-flex h-9 items-center/);
});
