function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

export function getDrawioElements(drawioMetaRaw, options = {}) {
  const drawioMeta = asObject(drawioMetaRaw);
  const includeDeleted = options?.includeDeleted === true;
  return asArray(drawioMeta.drawio_elements_v1)
    .map((rowRaw) => asObject(rowRaw))
    .filter((row) => {
      const id = toText(row.id);
      if (!id) return false;
      if (!includeDeleted && row.deleted === true) return false;
      return true;
    });
}

export function buildDrawioElementMap(drawioMetaRaw, options = {}) {
  const out = new Map();
  getDrawioElements(drawioMetaRaw, options).forEach((row) => {
    const id = toText(row.id);
    if (!id || out.has(id)) return;
    out.set(id, row);
  });
  return out;
}

export function resolveCanonicalDrawioElementId(drawioMetaRaw, idRaw) {
  const id = toText(idRaw);
  if (!id) return "";
  const map = buildDrawioElementMap(drawioMetaRaw, { includeDeleted: true });
  if (map.has(id)) return id;
  const lower = id.toLowerCase();
  for (const key of map.keys()) {
    if (key.toLowerCase() === lower) return key;
  }
  return "";
}

export function getDrawioElementById(drawioMetaRaw, idRaw, options = {}) {
  const canonicalId = resolveCanonicalDrawioElementId(drawioMetaRaw, idRaw);
  if (!canonicalId) return null;
  const map = buildDrawioElementMap(drawioMetaRaw, options);
  return asObject(map.get(canonicalId));
}

export function deriveSelectedDrawioElementId({
  drawioMeta,
  selectedDrawioElementId,
  legacyActiveElementId,
} = {}) {
  const primary = resolveCanonicalDrawioElementId(drawioMeta, selectedDrawioElementId);
  if (primary) return primary;
  const legacy = resolveCanonicalDrawioElementId(drawioMeta, legacyActiveElementId);
  if (legacy) return legacy;
  return "";
}

const DRAWIO_RUNTIME_TOOLS = Object.freeze([
  { id: "select", icon: "⌖", label: "Выбор", runtimeSupported: true, surface: "overlay" },
  { id: "rect", icon: "▭", label: "Прямоугольник", runtimeSupported: true, surface: "overlay" },
  { id: "text", icon: "T", label: "Текст", runtimeSupported: true, surface: "overlay" },
  { id: "container", icon: "▣", label: "Контейнер", runtimeSupported: true, surface: "overlay" },
]);

const DRAWIO_EDITOR_TOOLS = Object.freeze([
  { id: "connector", icon: "↔", label: "Коннектор", runtimeSupported: false, surface: "editor" },
  { id: "ellipse", icon: "◯", label: "Эллипс", runtimeSupported: false, surface: "editor" },
  { id: "diamond", icon: "◇", label: "Ромб", runtimeSupported: false, surface: "editor" },
  { id: "note", icon: "🗒", label: "Стикер", runtimeSupported: false, surface: "editor" },
  { id: "image", icon: "🖼", label: "Изображение", runtimeSupported: false, surface: "editor" },
  { id: "swimlane", icon: "≡", label: "Swimlane", runtimeSupported: false, surface: "editor" },
]);

export function buildDrawioToolsInventory({ includeEditorTools = true } = {}) {
  if (!includeEditorTools) return [...DRAWIO_RUNTIME_TOOLS];
  return [...DRAWIO_RUNTIME_TOOLS, ...DRAWIO_EDITOR_TOOLS];
}

export function getRuntimeDrawioTools(toolsRaw = []) {
  return asArray(toolsRaw).filter((toolRaw) => asObject(toolRaw).runtimeSupported === true);
}

export function getEditorDrawioTools(toolsRaw = []) {
  return asArray(toolsRaw).filter((toolRaw) => asObject(toolRaw).runtimeSupported !== true);
}

export function buildDrawioRuntimeToolLabels() {
  return [
    ...DRAWIO_RUNTIME_TOOLS.map((row) => row.label),
  ];
}
