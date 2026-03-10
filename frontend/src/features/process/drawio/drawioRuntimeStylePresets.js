function toText(value) {
  return String(value || "").trim();
}

export const DRAWIO_RUNTIME_STYLE_PRESETS = Object.freeze({
  shape: Object.freeze([
    {
      id: "accent",
      label: "Синий",
      svg: { fill: "rgba(59,130,246,0.24)", stroke: "#2563eb", "stroke-width": "2" },
      doc: { fillColor: "#dbeafe", strokeColor: "#2563eb", strokeWidth: "2" },
    },
    {
      id: "success",
      label: "Зелёный",
      svg: { fill: "rgba(16,185,129,0.20)", stroke: "#059669", "stroke-width": "2" },
      doc: { fillColor: "#d1fae5", strokeColor: "#059669", strokeWidth: "2" },
    },
    {
      id: "warning",
      label: "Янтарь",
      svg: { fill: "rgba(245,158,11,0.18)", stroke: "#d97706", "stroke-width": "2" },
      doc: { fillColor: "#fef3c7", strokeColor: "#d97706", strokeWidth: "2" },
    },
    {
      id: "neutral",
      label: "Серый",
      svg: { fill: "rgba(148,163,184,0.16)", stroke: "#475569", "stroke-width": "2" },
      doc: { fillColor: "#e2e8f0", strokeColor: "#475569", strokeWidth: "2" },
    },
  ]),
  text: Object.freeze([
    {
      id: "default",
      label: "Тёмный",
      svg: { fill: "#0f172a" },
      doc: { fontColor: "#0f172a" },
    },
    {
      id: "accent",
      label: "Синий",
      svg: { fill: "#2563eb" },
      doc: { fontColor: "#2563eb" },
    },
    {
      id: "danger",
      label: "Красный",
      svg: { fill: "#dc2626" },
      doc: { fontColor: "#dc2626" },
    },
  ]),
});

export function resolveRuntimeStyleSurface(elementSnapshotRaw = {}) {
  const snapshot = elementSnapshotRaw && typeof elementSnapshotRaw === "object" ? elementSnapshotRaw : {};
  const tagName = toText(snapshot.tagName).toLowerCase();
  if (tagName === "rect") return "shape";
  if (tagName === "text") return "text";
  return "";
}

export function getRuntimeStylePresets(surfaceRaw) {
  const surface = toText(surfaceRaw).toLowerCase();
  return Array.isArray(DRAWIO_RUNTIME_STYLE_PRESETS[surface]) ? DRAWIO_RUNTIME_STYLE_PRESETS[surface] : [];
}

export function matchRuntimeStylePreset(surfaceRaw, attrsRaw = {}) {
  const surface = toText(surfaceRaw).toLowerCase();
  const attrs = attrsRaw && typeof attrsRaw === "object" ? attrsRaw : {};
  const presets = getRuntimeStylePresets(surface);
  return presets.find((preset) => Object.entries(preset.svg || {}).every(([key, value]) => (
    toText(attrs[key]) === toText(value)
  ))) || null;
}
