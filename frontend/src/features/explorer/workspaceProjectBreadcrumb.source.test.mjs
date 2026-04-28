import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const explorerSource = readFileSync(new URL("./WorkspaceExplorer.jsx", import.meta.url), "utf8");
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

test("ProjectPane renders a safe project breadcrumb trail", () => {
  assert.match(explorerSource, /buildProjectBreadcrumbTrail\(backCrumbs,\s*proj\?\.name\s*\|\|\s*""\)/);
  assert.match(explorerSource, /<BreadcrumbChip active>\{c\.name\}<\/BreadcrumbChip>/);
});

test("direct project restore clears breadcrumbBase instead of showing stale path", () => {
  assert.match(
    controllerSource,
    /if \(pid !== currentProjectId\) \{\s*setBreadcrumbBase\(\[\]\);\s*setCurrentProjectId\(pid\);/s,
  );
});
