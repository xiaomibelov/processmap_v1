import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readExplorerSources } from "../../test-utils/explorerSourceText.mjs";

// retarget(s0): WorkspaceExplorer.jsx read moved to the multifile explorer source set;
// useWorkspaceExplorerController.js does not move and is still read directly.
const { text: explorerSource } = readExplorerSources();
const controllerSource = readFileSync(new URL("./useWorkspaceExplorerController.js", import.meta.url), "utf8");

test("ExplorerPane passes current folder breadcrumbs when opening a project", () => {
  assert.match(
    explorerSource,
    /onNavigateToProject\(project\.id,\s*\{\s*breadcrumbBase:\s*page\?\.breadcrumbs\s*\|\|\s*\[\]\s*\}\)/,
  );
});

test("controller stores project breadcrumbBase from in-app navigation", () => {
  assert.match(controllerSource, /setBreadcrumbBase\(normalizeProjectBreadcrumbBase\(options\?\.breadcrumbBase\)\)/);
});

test("controller restores project breadcrumbBase from route context", () => {
  assert.match(controllerSource, /const restoredBreadcrumbBase = normalizedRequestProjectContext\?\.breadcrumbBase \|\| \[\]/);
  assert.match(controllerSource, /setBreadcrumbBase\(restoredBreadcrumbBase\)/);
});

test("ProjectPane renders a safe project breadcrumb trail", () => {
  assert.match(explorerSource, /const projectBreadcrumbBase = normalizeProjectBreadcrumbBase\(page\?\.breadcrumbs \|\| breadcrumbBase\)/);
  assert.match(explorerSource, /buildProjectBreadcrumbTrail\(projectBreadcrumbBase,\s*proj\?\.title\s*\|\|\s*proj\?\.name\s*\|\|\s*""\)/);
  assert.match(explorerSource, /<TextBreadcrumbs\s+crumbs=\{projectCrumbItems\}\s+dataTestId="project-breadcrumbs"/);
  assert.match(explorerSource, /maxVisible=\{6\}/);
});

test("direct project restore clears breadcrumbBase instead of showing stale path", () => {
  assert.match(
    controllerSource,
    /const restoredBreadcrumbBase = normalizedRequestProjectContext\?\.breadcrumbBase \|\| \[\];\s*setBreadcrumbBase\(restoredBreadcrumbBase\);/s,
  );
});

test("ProjectPane passes parent project context when opening a session", () => {
  assert.match(explorerSource, /const projectContext = \{\s*projectId,\s*workspaceId,\s*folderId:/s);
  assert.match(explorerSource, /await onOpenSession\?\.\(\{\s*\.\.\.row,\s*project_id:/s);
});
