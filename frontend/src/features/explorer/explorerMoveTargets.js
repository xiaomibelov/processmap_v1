function text(value) {
  return String(value || "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function itemType(item) {
  return text(item?.type).toLowerCase();
}

function itemId(item) {
  return text(item?.id ?? item?.folder_id);
}

function itemParentId(item, fallbackParentId = "") {
  return text(item?.parent_id ?? item?.parentId ?? fallbackParentId);
}

export function collectLoadedFolders({ rootItems, childItemsByFolder, rootParentId = "" } = {}) {
  const folders = [];
  const seen = new Set();

  const appendFolder = (item, fallbackParentId = "") => {
    if (itemType(item) !== "folder") return;
    const id = itemId(item);
    if (!id || seen.has(id)) return;
    seen.add(id);
    folders.push({
      ...item,
      id,
      parent_id: itemParentId(item, fallbackParentId),
    });
  };

  for (const item of asArray(rootItems)) {
    appendFolder(item, rootParentId);
  }

  for (const [parentIdRaw, items] of Object.entries(childItemsByFolder || {})) {
    const parentId = text(parentIdRaw);
    for (const item of asArray(items)) {
      appendFolder(item, parentId);
    }
  }

  return folders;
}

export function isKnownDescendantFolder({ movingFolderId, targetFolderId, foldersById } = {}) {
  const movingId = text(movingFolderId);
  let cursor = text(targetFolderId);
  if (!movingId || !cursor) return false;

  const visited = new Set();
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const row = foldersById?.get(cursor);
    if (!row) return false;
    const parentId = itemParentId(row);
    if (parentId === movingId) return true;
    cursor = parentId;
  }
  return false;
}

export function buildFolderMoveTargets({
  rootItems,
  childItemsByFolder,
  rootParentId = "",
  movingFolder,
  currentParentId,
} = {}) {
  const movingFolderId = itemId(movingFolder);
  const sourceParentId = text(currentParentId ?? movingFolder?.parent_id ?? movingFolder?.parentId);
  const loadedFolders = collectLoadedFolders({ rootItems, childItemsByFolder, rootParentId });
  const foldersById = new Map(loadedFolders.map((folder) => [itemId(folder), folder]));

  const targets = [
    {
      id: "",
      label: "В корень workspace",
      typeLabel: "Workspace",
      disabled: sourceParentId === "",
      disabledReason: sourceParentId === "" ? "Текущее расположение" : "",
    },
  ];

  for (const folder of loadedFolders) {
    const id = itemId(folder);
    const parentId = itemParentId(folder);
    const isSelf = Boolean(movingFolderId && id === movingFolderId);
    const isDescendant = isKnownDescendantFolder({
      movingFolderId,
      targetFolderId: id,
      foldersById,
    });
    const isCurrentParent = Boolean(sourceParentId && id === sourceParentId);
    const typeLabel = parentId ? "Папка" : "Раздел";
    let disabledReason = "";
    if (isSelf) disabledReason = "Нельзя выбрать сам элемент";
    else if (isDescendant) disabledReason = "Нельзя переместить внутрь дочерней папки";
    else if (isCurrentParent) disabledReason = "Текущее расположение";

    targets.push({
      id,
      label: `${typeLabel}: ${text(folder?.name) || "Без названия"}`,
      typeLabel,
      folder,
      disabled: Boolean(disabledReason),
      disabledReason,
    });
  }

  return targets;
}

export function buildProjectMoveTargets({
  rootItems,
  childItemsByFolder,
  rootParentId = "",
  project,
  currentFolderId,
  currentFolder,
} = {}) {
  const sourceFolderId = text(currentFolderId ?? project?.folder_id ?? project?.folderId);
  const loadedFolders = collectLoadedFolders({ rootItems, childItemsByFolder, rootParentId });
  const currentFolderItem = itemType(currentFolder) === "folder" ? currentFolder : null;
  if (currentFolderItem) {
    const currentId = itemId(currentFolderItem);
    if (currentId && !loadedFolders.some((folder) => itemId(folder) === currentId)) {
      loadedFolders.push({
        ...currentFolderItem,
        id: currentId,
        parent_id: itemParentId(currentFolderItem),
      });
    }
  }

  return loadedFolders.map((folder) => {
    const id = itemId(folder);
    const parentId = itemParentId(folder);
    const typeLabel = parentId ? "Папка" : "Раздел";
    const disabledReason = id && id === sourceFolderId ? "Текущее расположение" : "";
    return {
      id,
      label: `${typeLabel}: ${text(folder?.name) || "Без названия"}`,
      typeLabel,
      folder,
      disabled: Boolean(disabledReason),
      disabledReason,
    };
  });
}
