function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function splitExplorerItems(itemsRaw) {
  const items = asArray(itemsRaw);
  const folders = [];
  const projects = [];
  for (const item of items) {
    const type = String(item?.type || "").trim();
    if (type === "folder") {
      folders.push(item);
      continue;
    }
    if (type === "project") {
      projects.push(item);
    }
  }
  return { folders, projects };
}

export function hasFolderChildren(folder) {
  const directFolders = Number(folder?.child_folder_count ?? 0) || 0;
  const directProjects = Number(folder?.child_project_count ?? 0) || 0;
  return directFolders + directProjects > 0;
}

export function buildVisibleRows({
  rootItems,
  expandedByFolder,
  childItemsByFolder,
  loadingByFolder,
  loadErrorByFolder,
}) {
  const rows = [];

  const appendRows = (items, depth) => {
    const { folders, projects } = splitExplorerItems(items);
    for (const folder of folders) {
      const folderId = String(folder?.id || "").trim();
      const expanded = Boolean(expandedByFolder?.[folderId]);
      const childItems = Array.isArray(childItemsByFolder?.[folderId])
        ? childItemsByFolder[folderId]
        : null;
      const childrenLoaded = Array.isArray(childItems);
      const loading = Boolean(loadingByFolder?.[folderId]);
      const loadError = String(loadErrorByFolder?.[folderId] || "").trim();
      const expandable = hasFolderChildren(folder);
      rows.push({
        rowType: "folder",
        node: folder,
        depth,
        expanded,
        expandable,
        childrenLoaded,
        loading,
      });
      if (!expandable || !expanded) continue;
      if (loading) {
        rows.push({
          rowType: "loading",
          parentId: folderId,
          depth: depth + 1,
        });
        continue;
      }
      if (childrenLoaded) {
        if (childItems.length > 0) {
          appendRows(childItems, depth + 1);
          continue;
        }
        rows.push({
          rowType: "empty",
          parentId: folderId,
          depth: depth + 1,
        });
        continue;
      }
      if (loadError) {
        rows.push({
          rowType: "error",
          parentId: folderId,
          depth: depth + 1,
          message: loadError,
        });
      }
    }
    for (const project of projects) {
      rows.push({
        rowType: "project",
        node: project,
        depth,
      });
    }
  };

  appendRows(rootItems, 0);
  return rows;
}
