import test from "node:test";
import assert from "node:assert/strict";

import {
  buildExplorerSearchIndex,
  buildProjectSessionSearchIndex,
  filterExplorerSearchResults,
  normalizeExplorerSearchQuery,
} from "./explorerSearchModel.js";

const section = {
  id: "section_a",
  type: "folder",
  name: "Продажи",
  parent_id: "",
  responsible_user_id: "u_section",
  responsible_user: { display_name: "Ирина Раздел" },
};
const nestedFolder = {
  id: "folder_a",
  type: "folder",
  name: "Регламенты 2026",
  parent_id: "section_a",
  responsible_user_id: "u_folder",
  responsible_user: { display_name: "Федор Папка" },
};
const project = {
  id: "project_a",
  type: "project",
  name: "Проект внедрения",
  status: "active",
  owner: { id: "owner_uuid_1", name: "Технический Owner" },
  executor_user_id: "u_executor",
  executor_user: { display_name: "Павел Исполнитель" },
};

test("normalizeExplorerSearchQuery is case-insensitive and whitespace tolerant", () => {
  assert.equal(normalizeExplorerSearchQuery("  ПРОЕКТ   внедрения  "), "проект внедрения");
});

test("query matches section, nested folder, and project fields", () => {
  const index = buildExplorerSearchIndex({
    rootItems: [section],
    childItemsByFolder: {
      section_a: [nestedFolder, project],
    },
    breadcrumbs: [{ type: "workspace", id: "ws_1", name: "Workspace" }],
  });

  assert.equal(filterExplorerSearchResults(index, "продажи").results[0].type, "section");
  assert.equal(filterExplorerSearchResults(index, "регламенты 2026").results[0].type, "folder");
  assert.equal(filterExplorerSearchResults(index, "проект внедрения").results[0].type, "project");
  assert.equal(filterExplorerSearchResults(index, "ирина раздел").results[0].type, "section");
  assert.equal(filterExplorerSearchResults(index, "федор папка").results[0].type, "folder");
  assert.equal(filterExplorerSearchResults(index, "павел исполнитель").results[0].type, "project");
  assert.equal(filterExplorerSearchResults(index, "технический owner").total, 0);
});

test("results are grouped by type and include navigation targets", () => {
  const index = buildExplorerSearchIndex({
    rootItems: [section],
    childItemsByFolder: {
      section_a: [nestedFolder, project],
    },
    breadcrumbs: [{ type: "workspace", id: "ws_1", name: "Workspace" }],
  });
  const model = filterExplorerSearchResults(index, "а");
  const groupTypes = model.groups.map((group) => group.type);

  assert.deepEqual(groupTypes, ["section", "folder", "project"]);
  assert.equal(model.total, 3);
  assert.equal(model.groups[0].results[0].target.folderId, "section_a");
  assert.equal(model.groups[2].results[0].target.projectId, "project_a");
  assert.deepEqual(model.groups[2].results[0].target.breadcrumbBase.map((crumb) => crumb.id), ["ws_1", "section_a"]);
});

test("empty search result model is explicit", () => {
  const index = buildExplorerSearchIndex({ rootItems: [section] });
  const model = filterExplorerSearchResults(index, "нет такого");

  assert.equal(model.active, true);
  assert.equal(model.total, 0);
  assert.deepEqual(model.groups, []);
});

test("project view search matches session title, status, stage, owner, and project path", () => {
  const index = buildProjectSessionSearchIndex({
    project: {
      id: "project_a",
      type: "project",
      name: "Проект внедрения",
      owner: { name: "Project Owner" },
      executor_user_id: "u_executor",
      executor_user: { display_name: "Павел Исполнитель" },
    },
    sessions: [
      {
        id: "session_a",
        name: "Интервью с бухгалтерией",
        status: "review",
        stage: "Discovery",
        owner: { name: "Мария Analyst" },
      },
    ],
    breadcrumbBase: [
      { type: "workspace", id: "ws_1", name: "Workspace" },
      { type: "folder", id: "section_a", name: "Продажи" },
    ],
  });

  assert.equal(filterExplorerSearchResults(index, "интервью").results[0].type, "session");
  assert.equal(filterExplorerSearchResults(index, "review").results[0].type, "session");
  assert.equal(filterExplorerSearchResults(index, "discovery").results[0].type, "session");
  assert.equal(filterExplorerSearchResults(index, "мария analyst").results[0].type, "session");
  assert.equal(filterExplorerSearchResults(index, "проект внедрения").results[0].type, "project");
  assert.equal(filterExplorerSearchResults(index, "павел исполнитель").results[0].type, "project");
  assert.equal(filterExplorerSearchResults(index, "project owner").total, 0);
});
