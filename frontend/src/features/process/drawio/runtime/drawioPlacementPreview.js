import {
  getDefaultRuntimeStylePreset,
  resolveRuntimeStyleSurface,
} from "../drawioRuntimeStylePresets.js";

function toText(value) {
  return String(value || "").trim().toLowerCase();
}

function toNumber(valueRaw, fallback = 0) {
  const value = Number(valueRaw);
  return Number.isFinite(value) ? value : fallback;
}

export function buildDrawioPlacementPreviewSpec(toolIdRaw, pointRaw = {}) {
  const toolId = toText(toolIdRaw);
  const point = pointRaw && typeof pointRaw === "object" ? pointRaw : {};
  const x = toNumber(point.x, 0);
  const y = toNumber(point.y, 0);
  const surface = resolveRuntimeStyleSurface(toolId);
  const presetSvg = getDefaultRuntimeStylePreset(surface)?.svg || {};
  if (toolId === "rect") {
    return {
      toolId,
      shape: "rect",
      x: x - 60,
      y: y - 30,
      width: 120,
      height: 60,
      rx: 8,
      fill: presetSvg.fill || "rgba(59,130,246,0.10)",
      stroke: presetSvg.stroke || "#2563eb",
    };
  }
  if (toolId === "container") {
    return {
      toolId,
      shape: "rect",
      x: x - 100,
      y: y - 60,
      width: 200,
      height: 120,
      rx: 10,
      fill: presetSvg.fill || "rgba(15,23,42,0.03)",
      stroke: presetSvg.stroke || "#334155",
      strokeDasharray: presetSvg["stroke-dasharray"] || "8 4",
    };
  }
  if (toolId === "text") {
    return {
      toolId,
      shape: "text",
      x,
      y,
      width: 120,
      height: 30,
      text: "Text",
      fill: presetSvg.fill || "#0f172a",
      guideStroke: "#94a3b8",
    };
  }
  if (toolId === "note") {
    return {
      toolId,
      shape: "note",
      x: x - 80,
      y: y - 60,
      width: 160,
      height: 120,
      rx: 10,
      fill: presetSvg.bg_color || "rgba(254,240,138,0.45)",
      stroke: presetSvg.border_color || "#ca8a04",
      text: "Заметка",
      textColor: presetSvg.text_color || "#1f2937",
    };
  }
  return null;
}
