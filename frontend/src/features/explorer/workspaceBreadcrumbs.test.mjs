import test from "node:test";
import assert from "node:assert/strict";

import {
  buildProjectBreadcrumbTrail,
  normalizeProjectBreadcrumbBase,
  resolveProjectBreadcrumbTarget,
} from "./workspaceBreadcrumbs.js";

test("normalizeProjectBreadcrumbBase keeps workspace and folder crumbs for project navigation", () => {
  const out = normalizeProjectBreadcrumbBase([
    { type: "workspace", id: "ws_1", name: "Main" },
    { type: "folder", id: "folder_section", name: "Раздел" },
    { type: "folder", id: "folder_nested", name: "Папка" },
  ]);

  assert.deepEqual(out, [
    { type: "workspace", id: "ws_1", name: "Main" },
    { type: "folder", id: "folder_section", name: "Раздел" },
    { type: "folder", id: "folder_nested", name: "Папка" },
  ]);
});

test("normalizeProjectBreadcrumbBase drops broken crumbs and unsupported types", () => {
  const out = normalizeProjectBreadcrumbBase([
    { type: "workspace", id: "ws_1", name: "Main" },
    { type: "folder", id: "", name: "Broken folder" },
    { type: "project", id: "proj_1", name: "Already current project" },
    { type: "folder", id: "folder_ok", name: "" },
    null,
  ]);

  assert.deepEqual(out, [
    { type: "workspace", id: "ws_1", name: "Main" },
  ]);
});

test("buildProjectBreadcrumbTrail appends current project as active crumb", () => {
  const out = buildProjectBreadcrumbTrail([
    { type: "workspace", id: "ws_1", name: "Main" },
    { type: "folder", id: "folder_1", name: "Раздел" },
  ], "Карта процесса");

  assert.deepEqual(out, [
    { type: "workspace", id: "ws_1", name: "Main" },
    { type: "folder", id: "folder_1", name: "Раздел" },
    { type: "project", id: "", name: "Карта процесса", active: true },
  ]);
});

test("buildProjectBreadcrumbTrail is safe for direct project open without breadcrumbBase", () => {
  const out = buildProjectBreadcrumbTrail([], "Проект без пути");

  assert.deepEqual(out, [
    { type: "project", id: "", name: "Проект без пути", active: true },
  ]);
});

test("resolveProjectBreadcrumbTarget maps workspace and folder crumbs to explorer locations", () => {
  assert.deepEqual(resolveProjectBreadcrumbTarget({ type: "workspace", id: "ws_1", name: "Main" }), { folderId: "" });
  assert.deepEqual(resolveProjectBreadcrumbTarget({ type: "folder", id: "folder_1", name: "Раздел" }), { folderId: "folder_1" });
  assert.equal(resolveProjectBreadcrumbTarget({ type: "project", id: "proj_1", name: "Проект" }), null);
});
