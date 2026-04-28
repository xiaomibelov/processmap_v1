function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizeText(value) {
  return text(value).toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
}

function ownerText(owner) {
  if (!owner || typeof owner !== "object") return "";
  return text(owner.name || owner.email || owner.id);
}

function itemType(item) {
  return text(item?.type).toLowerCase();
}

function timestampValue(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function comparePrimitive(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "ru-RU", { sensitivity: "base", numeric: true });
}

function valueForExplorerItem(item, key, { isRoot = false } = {}) {
  const type = itemType(item);
  if (key === "name") return normalizeText(item?.name || item?.title);
  if (key === "type") {
    if (type === "folder") {
      const parentId = text(item?.parent_id ?? item?.parentId);
      return isRoot && !parentId ? "раздел" : "папка";
    }
    if (type === "project") return "проект";
    return type;
  }
  if (key === "status") {
    const status = normalizeText(item?.status);
    return status === "active" ? "" : status;
  }
  if (key === "owner") return normalizeText(ownerText(item?.owner));
  if (key === "updatedAt") return timestampValue(item?.rollup_activity_at || item?.updated_at || item?.created_at);
  return "";
}

function valueForSession(session, key) {
  if (key === "name") return normalizeText(session?.name || session?.title);
  if (key === "status") return normalizeText(session?.status);
  if (key === "stage") return normalizeText(session?.stage);
  if (key === "owner") return normalizeText(ownerText(session?.owner));
  if (key === "updatedAt") return timestampValue(session?.updated_at || session?.created_at);
  return "";
}

function isMissing(value) {
  return value === null || value === undefined || value === "";
}

export function normalizeExplorerSort(sort) {
  const key = text(sort?.key);
  const direction = sort?.direction === "desc" ? "desc" : "asc";
  if (!key) return null;
  return { key, direction };
}

export function toggleExplorerSort(currentSort, key) {
  const nextKey = text(key);
  if (!nextKey) return normalizeExplorerSort(currentSort);
  const current = normalizeExplorerSort(currentSort);
  if (!current || current.key !== nextKey) {
    return { key: nextKey, direction: nextKey === "updatedAt" ? "desc" : "asc" };
  }
  return { key: nextKey, direction: current.direction === "asc" ? "desc" : "asc" };
}

export function compareExplorerSortValues(aValue, bValue, direction = "asc") {
  const aMissing = isMissing(aValue);
  const bMissing = isMissing(bValue);
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  const base = comparePrimitive(aValue, bValue);
  return direction === "desc" ? -base : base;
}

function compareRows(a, b, sort, valueGetter) {
  const normalized = normalizeExplorerSort(sort);
  if (!normalized) return 0;
  const primary = compareExplorerSortValues(
    valueGetter(a, normalized.key),
    valueGetter(b, normalized.key),
    normalized.direction,
  );
  if (primary !== 0) return primary;
  return compareExplorerSortValues(valueGetter(a, "name"), valueGetter(b, "name"), "asc");
}

export function sortExplorerItems(itemsRaw, sort, options = {}) {
  const items = asArray(itemsRaw).slice();
  const normalized = normalizeExplorerSort(sort);
  if (!normalized) return items;
  return items.sort((a, b) => compareRows(a, b, normalized, (item, key) => valueForExplorerItem(item, key, options)));
}

export function sortExplorerChildItemsByFolder(childItemsByFolder, sort) {
  if (!childItemsByFolder || typeof childItemsByFolder !== "object") return {};
  const sorted = {};
  for (const [folderId, items] of Object.entries(childItemsByFolder)) {
    sorted[folderId] = sortExplorerItems(items, sort, { isRoot: false });
  }
  return sorted;
}

export function sortProjectSessions(sessionsRaw, sort) {
  const sessions = asArray(sessionsRaw).slice();
  const normalized = normalizeExplorerSort(sort);
  if (!normalized) return sessions;
  return sessions.sort((a, b) => compareRows(a, b, normalized, valueForSession));
}
