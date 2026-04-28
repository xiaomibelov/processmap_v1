import test from "node:test";
import assert from "node:assert/strict";

import {
  folderCreateCopy,
  folderDisplayLabel,
  isWorkspaceRootFolder,
} from "./workspaceDisplayLabels.js";

test("top-level workspace folders display as sections", () => {
  const folder = { id: "folder_section", type: "folder", parent_id: "", name: "Продажи" };

  assert.equal(isWorkspaceRootFolder({ folder, depth: 0, currentFolderId: "" }), true);
  assert.equal(folderDisplayLabel({ folder, depth: 0, currentFolderId: "" }), "Раздел");
});

test("nested folders keep folder label even when loaded inline from workspace root", () => {
  const folder = { id: "folder_nested", type: "folder", parent_id: "folder_section", name: "Регламент" };

  assert.equal(isWorkspaceRootFolder({ folder, depth: 1, currentFolderId: "" }), false);
  assert.equal(folderDisplayLabel({ folder, depth: 1, currentFolderId: "" }), "Папка");
});

test("folder view child folders keep folder label", () => {
  const folder = { id: "folder_child", type: "folder", parent_id: "folder_section", name: "Регламент" };

  assert.equal(isWorkspaceRootFolder({ folder, depth: 0, currentFolderId: "folder_section" }), false);
  assert.equal(folderDisplayLabel({ folder, depth: 0, currentFolderId: "folder_section" }), "Папка");
});

test("root create copy says section while nested create copy says folder", () => {
  assert.deepEqual(folderCreateCopy(""), {
    shortLabel: "Раздел",
    createLabel: "Создать раздел",
    modalTitle: "Новый раздел",
    placeholder: "Название раздела",
    emptyTitle: "Workspace пустой",
    emptyHint: "Создайте раздел — проекты хранятся внутри разделов и папок",
  });

  assert.deepEqual(folderCreateCopy("folder_section"), {
    shortLabel: "Папка",
    createLabel: "Создать папку",
    modalTitle: "Новая папка",
    placeholder: "Название папки",
    emptyTitle: "Папка пустая",
    emptyHint: "Создайте вложенную папку или добавьте проект сюда",
  });
});
