import { treeScopeKey } from "./explorerTreePersistence.js";

export const EXPLORER_STATUS_FILTERS_HIDDEN_KEY = "explorer.status_filters.hidden";
export const STATUS_FILTER_KEYS = ["active", "done", "draft", "as_is"];
export const STATUS_FILTER_OPTIONS = [
  { key: "all", label: "Все" },
  { key: "active", label: "Активен", dotClass: "bg-accent", statuses: ["active", "in_progress"] },
  { key: "done", label: "Готово", dotClass: "bg-success", statuses: ["ready", "done", "completed"] },
  { key: "draft", label: "Черновик", dotClass: "bg-slate-400", statuses: ["draft"] },
  { key: "as_is", label: "AS IS", dotClass: "bg-slate-400", statuses: ["as_is"] },
];

const STATUS_FILTER_KEY_SET = new Set(STATUS_FILTER_KEYS);

export function normalizeHiddenStatusKeys(keys) {
  if (!Array.isArray(keys)) return [];
  return [...new Set(keys.map((key) => String(key || "").trim()).filter((key) => STATUS_FILTER_KEY_SET.has(key)))];
}

function statusHiddenValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function hiddenStatusKeysFromPreferences(preferences, workspaceId, orgId = "") {
  const ws = String(workspaceId || "").trim();
  if (!ws) return [];
  const scope = treeScopeKey(orgId, ws);
  const value = statusHiddenValue(preferences?.[EXPLORER_STATUS_FILTERS_HIDDEN_KEY]);
  return normalizeHiddenStatusKeys(value[scope] || value[ws] || []);
}

export function statusHiddenWithKeys(hiddenValue, workspaceId, hiddenKeys, orgId = "") {
  const scope = treeScopeKey(orgId, workspaceId);
  const legacyScope = String(workspaceId || "").trim();
  const next = { ...statusHiddenValue(hiddenValue) };
  if (!scope) return next;
  if (legacyScope && legacyScope !== scope) delete next[legacyScope];
  const normalized = normalizeHiddenStatusKeys(hiddenKeys);
  if (normalized.length) next[scope] = normalized;
  else delete next[scope];
  return next;
}

export function visibleStatusFilterOptions(hiddenStatusKeys = []) {
  const hidden = new Set(normalizeHiddenStatusKeys(hiddenStatusKeys));
  return STATUS_FILTER_OPTIONS.filter((option) => option.key === "all" || !hidden.has(option.key));
}

function filterOptionForKey(key) {
  return STATUS_FILTER_OPTIONS.find((option) => option.key === key) || null;
}

export function resolveExplorerStatusKey(item) {
  const type = String(item?.type || "").trim().toLowerCase();
  const status = String(type === "folder" ? item?.context_status : item?.status).trim().toLowerCase();
  if (!status) return "";
  return STATUS_FILTER_OPTIONS.find((option) => option.statuses?.includes(status))?.key || "";
}

export function itemMatchesStatusFilter(item, statusFilter, hiddenStatusKeys = []) {
  const key = String(statusFilter || "all").trim();
  if (key === "all") return true;
  if (normalizeHiddenStatusKeys(hiddenStatusKeys).includes(key)) return true;
  const option = filterOptionForKey(key);
  if (!option?.statuses) return false;
  return option.statuses.includes(String(
    String(item?.type || "").trim().toLowerCase() === "folder" ? item?.context_status : item?.status
  ).trim().toLowerCase());
}

export function filterExplorerTreeByStatus({
  rootItems = [],
  childItemsByFolder = {},
  statusFilter = "all",
  hiddenStatusKeys = [],
} = {}) {
  const filterKey = String(statusFilter || "all").trim();
  if (filterKey === "all" || normalizeHiddenStatusKeys(hiddenStatusKeys).includes(filterKey)) {
    return { rootItems, childItemsByFolder };
  }

  const keepRoot = new Set();
  const keepChild = new Map();
  const rootById = new Map(rootItems.map((item) => [String(item?.id || "").trim(), item]).filter(([id]) => id));
  const childById = new Map();
  Object.entries(childItemsByFolder || {}).forEach(([parentId, items]) => {
    (Array.isArray(items) ? items : []).forEach((item) => {
      const id = String(item?.id || "").trim();
      if (id) childById.set(id, { item, parentId });
    });
  });

  function includeRoot(item) {
    const id = String(item?.id || "").trim();
    if (id) keepRoot.add(id);
  }

  function includeChild(item, parentId) {
    const id = String(item?.id || "").trim();
    const pid = String(parentId || "").trim();
    if (!id || !pid) return;
    if (!keepChild.has(pid)) keepChild.set(pid, new Set());
    keepChild.get(pid).add(id);
    if (rootById.has(pid)) {
      includeRoot(rootById.get(pid));
      return;
    }
    const parent = childById.get(pid);
    if (parent) includeChild(parent.item, parent.parentId);
  }

  function includeDescendants(item) {
    if (String(item?.type || "").trim().toLowerCase() !== "folder") return;
    const id = String(item?.id || "").trim();
    const children = Array.isArray(childItemsByFolder?.[id]) ? childItemsByFolder[id] : [];
    children.forEach((child) => {
      includeChild(child, id);
      includeDescendants(child);
    });
  }

  rootItems.forEach((item) => {
    if (!itemMatchesStatusFilter(item, filterKey, hiddenStatusKeys)) return;
    includeRoot(item);
    includeDescendants(item);
  });

  Object.entries(childItemsByFolder || {}).forEach(([parentId, items]) => {
    (Array.isArray(items) ? items : []).forEach((item) => {
      if (!itemMatchesStatusFilter(item, filterKey, hiddenStatusKeys)) return;
      includeChild(item, parentId);
      includeDescendants(item);
    });
  });

  return {
    rootItems: rootItems.filter((item) => keepRoot.has(String(item?.id || "").trim())),
    childItemsByFolder: Object.fromEntries(
      Object.entries(childItemsByFolder || {}).map(([parentId, items]) => [
        parentId,
        (Array.isArray(items) ? items : []).filter((item) => keepChild.get(parentId)?.has(String(item?.id || "").trim())),
      ]),
    ),
  };
}
