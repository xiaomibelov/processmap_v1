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
  container: Object.freeze([
    {
      id: "neutral",
      label: "Серый",
      svg: {
        fill: "rgba(15,23,42,0.08)",
        stroke: "#1e293b",
        "stroke-width": "2",
        "stroke-dasharray": "8 4",
      },
      doc: { fillColor: "#f1f5f9", strokeColor: "#1e293b", strokeWidth: "2", dashed: "1" },
    },
    {
      id: "accent",
      label: "Синий",
      svg: {
        fill: "rgba(59,130,246,0.08)",
        stroke: "#2563eb",
        "stroke-width": "2",
        "stroke-dasharray": "8 4",
      },
      doc: { fillColor: "#eff6ff", strokeColor: "#2563eb", strokeWidth: "2", dashed: "1" },
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
  note: Object.freeze([
    {
      id: "default",
      label: "Жёлтый",
      svg: { bg_color: "#fef08a", border_color: "#ca8a04", text_color: "#1f2937" },
      doc: { fillColor: "#fef08a", strokeColor: "#ca8a04", fontColor: "#1f2937" },
    },
    {
      id: "mint",
      label: "Мятный",
      svg: { bg_color: "#d1fae5", border_color: "#059669", text_color: "#064e3b" },
      doc: { fillColor: "#d1fae5", strokeColor: "#059669", fontColor: "#064e3b" },
    },
    {
      id: "pink",
      label: "Розовый",
      svg: { bg_color: "#fce7f3", border_color: "#db2777", text_color: "#831843" },
      doc: { fillColor: "#fce7f3", strokeColor: "#db2777", fontColor: "#831843" },
    },
  ]),
});

/**
 * Resolve a drawio surface from either a tool id string ("rect", "container",
 * "text", "note") or an element snapshot object with a tagName property.
 */
export function resolveRuntimeStyleSurface(valueRaw = "") {
  const value = valueRaw && typeof valueRaw === "object" ? "" : toText(valueRaw).toLowerCase();
  if (value === "rect" || value === "shape") return "shape";
  if (value === "container") return "container";
  if (value === "text") return "text";
  if (value === "note") return "note";
  const snapshot = valueRaw && typeof valueRaw === "object" ? valueRaw : {};
  const tagName = toText(snapshot.tagName).toLowerCase();
  if (tagName === "rect") return "shape";
  if (tagName === "text") return "text";
  return "";
}

export function getRuntimeStylePresets(surfaceRaw) {
  const surface = toText(surfaceRaw).toLowerCase();
  return Array.isArray(DRAWIO_RUNTIME_STYLE_PRESETS[surface])
    ? DRAWIO_RUNTIME_STYLE_PRESETS[surface]
    : [];
}

export function getDefaultRuntimeStylePreset(surfaceRaw) {
  const presets = getRuntimeStylePresets(surfaceRaw);
  return presets[0] || null;
}

export function getRuntimeStylePresetById(surfaceRaw, presetIdRaw) {
  const presetId = toText(presetIdRaw).toLowerCase();
  return getRuntimeStylePresets(surfaceRaw).find(
    (preset) => toText(preset.id).toLowerCase() === presetId,
  ) || null;
}

export function matchRuntimeStylePreset(surfaceRaw, attrsRaw = {}) {
  const surface = toText(surfaceRaw).toLowerCase();
  const attrs = attrsRaw && typeof attrsRaw === "object" ? attrsRaw : {};
  const presets = getRuntimeStylePresets(surface);
  return presets.find((preset) => Object.entries(preset.svg || {}).every(([key, value]) => (
    toText(attrs[key]) === toText(value)
  ))) || null;
}
