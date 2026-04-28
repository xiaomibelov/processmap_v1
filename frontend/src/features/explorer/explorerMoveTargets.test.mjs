import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFolderMoveTargets,
  collectLoadedFolders,
  isKnownDescendantFolder,
} from "./explorerMoveTargets.js";

const section = { id: "section_a", type: "folder", name: "Продажи", parent_id: "" };
const siblingSection = { id: "section_b", type: "folder", name: "Маркетинг", parent_id: "" };
const folder = { id: "folder_a", type: "folder", name: "Регламенты", parent_id: "section_a" };
const childFolder = { id: "folder_child", type: "folder", name: "Архив", parent_id: "folder_a" };

test("collectLoadedFolders keeps root and loaded child folders only", () => {
  const folders = collectLoadedFolders({
    rootItems: [section, { id: "project_a", type: "project", name: "Проект" }],
    childItemsByFolder: {
      section_a: [folder],
    },
  });

  assert.deepEqual(folders.map((item) => item.id), ["section_a", "folder_a"]);
});

test("known descendant detection follows loaded parent chain", () => {
  const folders = collectLoadedFolders({
    rootItems: [section],
    childItemsByFolder: {
      section_a: [folder],
      folder_a: [childFolder],
    },
  });
  const foldersById = new Map(folders.map((item) => [item.id, item]));

  assert.equal(isKnownDescendantFolder({
    movingFolderId: "section_a",
    targetFolderId: "folder_child",
    foldersById,
  }), true);
  assert.equal(isKnownDescendantFolder({
    movingFolderId: "folder_a",
    targetFolderId: "section_b",
    foldersById,
  }), false);
});

test("root section move targets disable root, self, and known descendants", () => {
  const targets = buildFolderMoveTargets({
    rootItems: [section, siblingSection],
    childItemsByFolder: {
      section_a: [folder],
      folder_a: [childFolder],
    },
    movingFolder: section,
    currentParentId: "",
  });
  const byId = new Map(targets.map((item) => [item.id, item]));

  assert.equal(byId.get("").label, "В корень workspace");
  assert.equal(byId.get("").disabledReason, "Текущее расположение");
  assert.equal(byId.get("section_a").disabledReason, "Нельзя выбрать сам элемент");
  assert.equal(byId.get("folder_a").disabledReason, "Нельзя переместить внутрь дочерней папки");
  assert.equal(byId.get("folder_child").disabledReason, "Нельзя переместить внутрь дочерней папки");
  assert.equal(byId.get("section_b").disabled, false);
  assert.equal(byId.get("section_b").label, "Раздел: Маркетинг");
});

test("nested folder move targets allow root and disable current parent no-op", () => {
  const targets = buildFolderMoveTargets({
    rootItems: [section, siblingSection],
    childItemsByFolder: {
      section_a: [folder],
      folder_a: [childFolder],
    },
    movingFolder: folder,
    currentParentId: "section_a",
  });
  const byId = new Map(targets.map((item) => [item.id, item]));

  assert.equal(byId.get("").disabled, false);
  assert.equal(byId.get("section_a").disabledReason, "Текущее расположение");
  assert.equal(byId.get("folder_a").disabledReason, "Нельзя выбрать сам элемент");
  assert.equal(byId.get("folder_child").disabledReason, "Нельзя переместить внутрь дочерней папки");
  assert.equal(byId.get("section_b").disabled, false);
  assert.equal(byId.get("folder_a").label, "Папка: Регламенты");
});

test("folder page root items inherit current folder parent for display labels", () => {
  const targets = buildFolderMoveTargets({
    rootItems: [{ id: "folder_without_parent", type: "folder", name: "Без parent_id" }],
    rootParentId: "section_a",
    movingFolder: folder,
    currentParentId: "section_a",
  });
  const byId = new Map(targets.map((item) => [item.id, item]));

  assert.equal(byId.get("folder_without_parent").label, "Папка: Без parent_id");
});
