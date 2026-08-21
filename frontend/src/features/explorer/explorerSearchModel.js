import {
  getExplorerBusinessAssigneeKind,
  getExplorerBusinessAssigneeLabel,
} from "./explorerAssigneeModel.js";

function text(value) {
  return String(value || "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function itemId(item) {
  return text(item?.id ?? item?.folder_id ?? item?.project_id ?? item?.session_id);
}

function itemType(item) {
  return text(item?.type).toLowerCase();
}

function itemParentId(item, fallbackParentId = "") {
  return text(item?.parent_id ?? item?.parentId ?? fallbackParentId);
}

function ownerLabel(owner) {
  if (!owner || typeof owner !== "object") return "";
  return text(owner.name || owner.email || owner.id);
}

function businessAssigneeLabel(item) {
  const label = getExplorerBusinessAssigneeLabel(item);
  return label === "—" ? "" : text(label);
}

function businessAssigneeMeta(item) {
  const label = businessAssigneeLabel(item);
  if (!label) return "";
  const kind = getExplorerBusinessAssigneeKind(item);
  if (kind === "responsible") return `Ответственный: ${label}`;
  if (kind === "executor") return `Исполнитель: ${label}`;
  return label;
}

function statusLabel(value) {
  return text(value);
}

function pathLabel(crumbs) {
  return asArray(crumbs).map((crumb) => text(crumb?.name || crumb?.title)).filter(Boolean).join(" / ");
}

function normalizeCrumbs(crumbs) {
  return asArray(crumbs)
    .map((crumb) => ({
      type: text(crumb?.type),
      id: text(crumb?.id),
      name: text(crumb?.name || crumb?.title),
    }))
    .filter((crumb) => crumb.id && crumb.name);
}

function resultSearchText(parts) {
  return normalizeExplorerSearchQuery(parts.filter(Boolean).join(" "));
}

function makeResult({
  id,
  type,
  typeLabel,
  title,
  subtitle = "",
  path = "",
  status = "",
  owner = "",
  assignee = "",
  assigneeMeta = "",
  stage = "",
  target = {},
  searchParts = [],
}) {
  const resultTitle = text(title) || "Без названия";
  const resultTypeLabel = text(typeLabel);
  const resultPath = text(path);
  const resultStatus = statusLabel(status);
  const resultOwner = text(owner);
  const resultAssignee = text(assignee);
  const resultAssigneeMeta = text(assigneeMeta);
  const resultStage = text(stage);
  return {
    id: text(id),
    type,
    typeLabel: resultTypeLabel,
    title: resultTitle,
    subtitle: text(subtitle),
    pathLabel: resultPath,
    statusLabel: resultStatus,
    ownerLabel: resultOwner,
    assigneeLabel: resultAssignee,
    assigneeMetaLabel: resultAssigneeMeta,
    stageLabel: resultStage,
    target,
    searchText: resultSearchText([
      resultTitle,
      resultTypeLabel,
      resultPath,
      resultStatus,
      resultOwner,
      resultAssignee,
      resultAssigneeMeta,
      resultStage,
      ...searchParts,
    ]),
  };
}

export function normalizeExplorerSearchQuery(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function buildExplorerSearchIndex({
  rootItems,
  childItemsByFolder,
  rootParentId = "",
  breadcrumbs,
} = {}) {
  const rootParent = text(rootParentId);
  const baseCrumbs = normalizeCrumbs(breadcrumbs);
  const childMap = childItemsByFolder && typeof childItemsByFolder === "object" ? childItemsByFolder : {};
  const results = [];
  const seen = new Set();

  const appendResult = (result) => {
    const key = `${result.type}:${result.id}`;
    if (!result.id || seen.has(key)) return;
    seen.add(key);
    results.push(result);
  };

  const appendItems = (items, depth, parentCrumbs, fallbackParentId) => {
    const folders = [];
    const projects = [];
    for (const item of asArray(items)) {
      const type = itemType(item);
      if (type === "folder") folders.push(item);
      else if (type === "project") projects.push(item);
    }

    for (const folder of folders) {
      const id = itemId(folder);
      if (!id) continue;
      const parentId = itemParentId(folder, fallbackParentId);
      const title = text(folder?.name);
      const isSection = !rootParent && Number(depth || 0) === 0 && !parentId;
      const type = isSection ? "section" : "folder";
      const typeLabel = isSection ? "Раздел" : "Папка";
      const ownCrumb = { type: "folder", id, name: title };
      const assignee = businessAssigneeLabel(folder);
      const assigneeMeta = businessAssigneeMeta(folder);
      appendResult(makeResult({
        id,
        type,
        typeLabel,
        title,
        path: pathLabel(parentCrumbs),
        subtitle: assigneeMeta || typeLabel,
        assignee,
        assigneeMeta,
        target: { kind: "folder", folderId: id },
        searchParts: [isSection ? "section" : "folder"],
      }));
      if (Array.isArray(childMap[id])) {
        appendItems(childMap[id], Number(depth || 0) + 1, [...parentCrumbs, ownCrumb], id);
      }
    }

    for (const project of projects) {
      const id = itemId(project);
      if (!id) continue;
      const title = text(project?.name || project?.title);
      const status = statusLabel(project?.status);
      const assignee = businessAssigneeLabel(project);
      const assigneeMeta = businessAssigneeMeta(project);
      appendResult(makeResult({
        id,
        type: "project",
        typeLabel: "Проект",
        title,
        path: pathLabel(parentCrumbs),
        subtitle: assigneeMeta || "Проект",
        status,
        assignee,
        assigneeMeta,
        target: {
          kind: "project",
          projectId: id,
          breadcrumbBase: parentCrumbs,
        },
        searchParts: ["project"],
      }));
    }
  };

  appendItems(rootItems, 0, baseCrumbs, rootParent);
  return results;
}

export function buildProjectSessionSearchIndex({
  project,
  sessions,
  breadcrumbBase,
} = {}) {
  const baseCrumbs = normalizeCrumbs(breadcrumbBase);
  const projectId = itemId(project);
  const projectTitle = text(project?.name || project?.title);
  const projectCrumbs = projectTitle ? [...baseCrumbs, { type: "project", id: projectId, name: projectTitle }] : baseCrumbs;
  const results = [];

  if (projectId || projectTitle) {
    const status = statusLabel(project?.status);
    const assignee = businessAssigneeLabel(project);
    const assigneeMeta = businessAssigneeMeta(project);
    results.push(makeResult({
      id: projectId || "__current_project__",
      type: "project",
      typeLabel: "Проект",
      title: projectTitle || "Проект",
      path: pathLabel(baseCrumbs),
      subtitle: assigneeMeta || "Текущий проект",
      assignee,
      assigneeMeta,
      status,
      target: { kind: "project", projectId, breadcrumbBase: baseCrumbs },
      searchParts: ["project"],
    }));
  }

  for (const session of asArray(sessions)) {
    const id = itemId(session);
    if (!id) continue;
    const title = text(session?.name || session?.title);
    const owner = ownerLabel(session?.owner);
    const status = statusLabel(session?.status);
    const stage = text(session?.stage);
    results.push(makeResult({
      id,
      type: "session",
      typeLabel: "Сессия",
      title,
      path: pathLabel(projectCrumbs),
      subtitle: stage ? `Стадия: ${stage}` : "Сессия",
      status,
      owner,
      stage,
      target: { kind: "session", session },
      searchParts: ["session", projectTitle],
    }));
  }

  return results;
}

const GROUPS = [
  { type: "section", label: "Разделы" },
  { type: "folder", label: "Папки" },
  { type: "project", label: "Проекты" },
  { type: "session", label: "Сессии" },
];

function normalizeGlobalPath(path) {
  return asArray(path)
    .map((entry) => ({
      type: text(entry?.type),
      id: text(entry?.id),
      name: text(entry?.name || entry?.title),
    }))
    .filter((entry) => entry.id && entry.name);
}

function breadcrumbBaseForProject(path) {
  return normalizeGlobalPath(path)
    .filter((entry) => entry.type !== "project" && entry.type !== "session")
    .map((entry) => ({
      type: entry.type === "section" ? "folder" : entry.type,
      id: entry.id,
      name: entry.name,
    }));
}

function itemForAssignee(item) {
  const type = text(item?.type).toLowerCase();
  return type === "section" ? { ...item, type: "folder" } : item;
}

function globalResultFromItem(item) {
  const type = text(item?.type).toLowerCase();
  const id = itemId(item);
  if (!id || !["section", "folder", "project", "session"].includes(type)) return null;
  const typeLabel = type === "section"
    ? "Раздел"
    : type === "folder"
      ? "Папка"
      : type === "project"
        ? "Проект"
        : "Сессия";
  const title = text(item?.title || item?.name);
  const path = normalizeGlobalPath(item?.path);
  const assignee = businessAssigneeLabel(itemForAssignee(item));
  const assigneeMeta = businessAssigneeMeta(itemForAssignee(item));
  const status = text(item?.context_status || item?.status);
  const stage = text(item?.stage);
  const folderId = text(item?.folder_id || (type === "section" || type === "folder" ? id : ""));
  const projectId = text(item?.project_id || (type === "project" ? id : ""));
  const sessionId = text(item?.session_id || (type === "session" ? id : ""));
  let target = {};
  if (type === "section" || type === "folder") {
    target = { kind: "folder", folderId };
  } else if (type === "project") {
    target = { kind: "project", projectId, breadcrumbBase: breadcrumbBaseForProject(path) };
  } else if (type === "session") {
    target = {
      kind: "session",
      projectId,
      breadcrumbBase: breadcrumbBaseForProject(path),
      session: {
        id: sessionId,
        name: title,
        title,
        project_id: projectId,
        workspace_id: text(item?.workspace_id),
        status: text(item?.status),
        stage,
      },
    };
  }
  return makeResult({
    id,
    type,
    typeLabel,
    title,
    path: pathLabel(path),
    subtitle: text(item?.subtitle) || typeLabel,
    status,
    assignee,
    assigneeMeta,
    stage,
    target,
    searchParts: [typeLabel, type, text(item?.subtitle)],
  });
}

export function buildExplorerGlobalSearchModel(response, queryRaw) {
  const query = normalizeExplorerSearchQuery(queryRaw);
  const payload = response?.data && typeof response.data === "object" ? response.data : response || {};
  const sourceGroups = payload?.groups && typeof payload.groups === "object" ? payload.groups : {};
  const sourceItems = [
    ...asArray(sourceGroups.sections),
    ...asArray(sourceGroups.folders),
    ...asArray(sourceGroups.projects),
    ...asArray(sourceGroups.sessions),
  ];
  const normalized = sourceItems.map(globalResultFromItem).filter(Boolean);
  const groups = GROUPS
    .map((group) => ({
      ...group,
      results: normalized.filter((item) => item.type === group.type),
    }))
    .filter((group) => group.results.length > 0);
  return {
    active: Boolean(query),
    query,
    total: normalized.length,
    results: normalized,
    groups,
    source: "global",
  };
}

export function filterExplorerSearchResults(index, queryRaw) {
  const query = normalizeExplorerSearchQuery(queryRaw);
  if (!query) {
    return { active: false, query: "", total: 0, results: [], groups: [] };
  }
  const results = asArray(index).filter((item) => text(item?.searchText).includes(query));
  const groups = GROUPS
    .map((group) => ({
      ...group,
      results: results.filter((item) => item.type === group.type),
    }))
    .filter((group) => group.results.length > 0);
  return {
    active: true,
    query,
    total: results.length,
    results,
    groups,
  };
}
