const MAIN_PROCESS_GROUP_KEY = "main";
export const MAIN_PROCESS_GROUP_LABEL = "Основной процесс";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function typeLower(value) {
  return toText(value).toLowerCase();
}

function isSubprocessBusinessObject(value) {
  return typeLower(asObject(value).$type).includes("subprocess");
}

function normalizePathItem(itemRaw) {
  const item = asObject(itemRaw);
  const id = toText(item.id || item.subprocessId || item.elementId);
  if (!id) return null;
  const name = toText(item.name || item.title || item.label) || id;
  return { id, name };
}

export function buildDiagramSearchProcessContext(pathRaw = []) {
  const path = asArray(pathRaw).map(normalizePathItem).filter(Boolean);
  if (!path.length) {
    return {
      parentSubprocessId: "",
      parentSubprocessName: "",
      subprocessPath: [],
      subprocessPathLabel: "",
      subprocessDepth: 0,
      searchGroupKey: MAIN_PROCESS_GROUP_KEY,
      searchGroupLabel: MAIN_PROCESS_GROUP_LABEL,
      isInsideSubprocess: false,
    };
  }

  const nearest = path[path.length - 1] || {};
  const pathIds = path.map((item) => item.id).filter(Boolean);
  const pathNames = path.map((item) => item.name || item.id).filter(Boolean);
  const subprocessPathLabel = pathNames.join(" → ");
  const groupPathLabel = pathNames.join(" / ");
  return {
    parentSubprocessId: toText(nearest.id),
    parentSubprocessName: toText(nearest.name || nearest.id),
    subprocessPath: path,
    subprocessPathLabel,
    subprocessDepth: path.length,
    searchGroupKey: `subprocess:${pathIds.join("/")}`,
    searchGroupLabel: `Subprocess: ${groupPathLabel || toText(nearest.id)}`,
    isInsideSubprocess: true,
  };
}

export function deriveElementProcessContext(elementRaw = {}) {
  const element = asObject(elementRaw);
  let bo = asObject(element.businessObject || element);
  const innerToOuterPath = [];
  const visited = new WeakSet();

  while (bo && typeof bo === "object" && !visited.has(bo)) {
    visited.add(bo);
    const parent = asObject(bo.$parent);
    if (!Object.keys(parent).length) break;
    if (isSubprocessBusinessObject(parent)) {
      const id = toText(parent.id);
      if (id) {
        innerToOuterPath.push({
          id,
          name: toText(parent.name) || id,
        });
      }
    }
    bo = parent;
  }

  return buildDiagramSearchProcessContext(innerToOuterPath.reverse());
}

export function normalizeDiagramSearchProcessContext(itemRaw = {}) {
  const item = asObject(itemRaw);
  if (Array.isArray(item.subprocessPath)) {
    return buildDiagramSearchProcessContext(item.subprocessPath);
  }
  const searchGroupKey = toText(item.searchGroupKey);
  if (searchGroupKey && searchGroupKey !== MAIN_PROCESS_GROUP_KEY) {
    const parentId = toText(item.parentSubprocessId);
    const parentName = toText(item.parentSubprocessName) || parentId;
    return buildDiagramSearchProcessContext(parentId ? [{ id: parentId, name: parentName }] : []);
  }
  return buildDiagramSearchProcessContext([]);
}
