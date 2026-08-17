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

// P2 [Б]: шеврон раскрытия у проекта — по агрегату сессий из explorer-страницы
// (fallback на sessions_count для старых ответов без trackable-полей).
export function projectHasSessions(project) {
  const count = Number(
    project?.trackable_sessions_count ?? project?.sessions_count ?? 0,
  ) || 0;
  return count > 0;
}

export function buildVisibleRows({
  rootItems,
  expandedByFolder,
  childItemsByFolder,
  loadingByFolder,
  loadErrorByFolder,
  preserveItemOrder = false,
}) {
  const rows = [];

  const appendFolder = (folder, depth, appendRows) => {
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
    if (!expandable || !expanded) return;
    if (loading) {
      rows.push({
        rowType: "loading",
        parentId: folderId,
        depth: depth + 1,
      });
      return;
    }
    if (childrenLoaded) {
      if (childItems.length > 0) {
        appendRows(childItems, depth + 1);
        return;
      }
      rows.push({
        rowType: "empty",
        parentId: folderId,
        depth: depth + 1,
      });
      return;
    }
    if (loadError) {
      rows.push({
        rowType: "error",
        parentId: folderId,
        depth: depth + 1,
        message: loadError,
      });
    }
  };

  const appendProject = (project, depth) => {
    // P2 [Б]: проекты раскрываются в таблице (сессии 3-м уровнем). Expanded-map
    // общая с папками — id проектов лежат в том же preferences-списке (P1).
    const projectId = String(project?.id || "").trim();
    const expanded = Boolean(expandedByFolder?.[projectId]);
    const expandable = projectHasSessions(project);
    rows.push({
      rowType: "project",
      node: project,
      depth,
      expanded,
      expandable,
    });
    if (!expandable || !expanded) return;
    // Сами сессии подгружает ProjectSessionsRows (lazy react-query) — здесь
    // только placeholder-строка, монтирующая запрос.
    rows.push({
      rowType: "project-sessions",
      parentId: projectId,
      node: project,
      depth: depth + 1,
    });
  };

  const appendRows = (items, depth) => {
    if (preserveItemOrder) {
      for (const item of asArray(items)) {
        const type = String(item?.type || "").trim();
        if (type === "folder") appendFolder(item, depth, appendRows);
        if (type === "project") appendProject(item, depth);
      }
      return;
    }
    const { folders, projects } = splitExplorerItems(items);
    for (const folder of folders) {
      appendFolder(folder, depth, appendRows);
    }
    for (const project of projects) {
      appendProject(project, depth);
    }
  };

  appendRows(rootItems, 0);
  return rows;
}
