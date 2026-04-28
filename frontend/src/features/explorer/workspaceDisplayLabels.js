function text(value) {
  return String(value || "").trim();
}

export function isWorkspaceRootFolder({ folder, depth = 0, currentFolderId = "" } = {}) {
  if (text(currentFolderId)) return false;
  if (Number(depth || 0) !== 0) return false;
  const parentId = text(folder?.parent_id ?? folder?.parentId);
  return !parentId;
}

export function folderDisplayLabel(options = {}) {
  return isWorkspaceRootFolder(options) ? "Раздел" : "Папка";
}

export function folderCreateCopy(currentFolderId = "") {
  const nested = Boolean(text(currentFolderId));
  return nested
    ? {
      shortLabel: "Папка",
      createLabel: "Создать папку",
      modalTitle: "Новая папка",
      placeholder: "Название папки",
      emptyTitle: "Папка пустая",
      emptyHint: "Создайте вложенную папку или добавьте проект сюда",
    }
    : {
      shortLabel: "Раздел",
      createLabel: "Создать раздел",
      modalTitle: "Новый раздел",
      placeholder: "Название раздела",
      emptyTitle: "Workspace пустой",
      emptyHint: "Создайте раздел — проекты хранятся внутри разделов и папок",
    };
}
