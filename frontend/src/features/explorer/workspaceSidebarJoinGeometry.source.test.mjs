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

test("workspace shell has one continuous sidebar border axis", () => {
  const renderSource = between("<ExplorerSidebarProvider>", "</ExplorerSidebarProvider>");

  assert.match(renderSource, /"--explorer-header-h":\s*"3\.5rem"/);
  assert.match(renderSource, /border-r border-border/);
  assert.doesNotMatch(renderSource, /border-r-0/);
});

test("sidebar row highlights are inset and do not touch divider", () => {
  const sidebarSource = between("function WorkspaceSidebar({", "// ─── Context Menu");

  assert.match(sidebarSource, /px-2/);
  assert.match(sidebarSource, /rounded-md/);
  assert.match(sidebarSource, /min-w-0/);
  assert.match(sidebarSource, /truncate/);
});

test("left and right headers share the same fixed height token", () => {
  const sidebarHeaderSource = between("function ExplorerSidebarHeaderBlock()", "// ─── Workspace Sidebar");
  const explorerHeaderSource = between("const explorerHeader = (", "return (");
  const projectHeaderSource = between("const projectHeader = (", "return (");

  assert.match(sidebarHeaderSource, /h-\[var\(--explorer-header-h\)\]/);
  assert.match(explorerHeaderSource, /h-\[var\(--explorer-header-h\)\]/);
  assert.match(projectHeaderSource, /h-\[var\(--explorer-header-h\)\]/);
});

test("header tabs are centered within the taller app header row", () => {
  const tabsSource = between("function HeaderTabs(", "function WorkspaceSidebarContextCounters()");

  assert.match(tabsSource, /className="flex h-full items-center/);
  assert.match(tabsSource, /className=\{`relative inline-flex h-9 items-center/);
});
