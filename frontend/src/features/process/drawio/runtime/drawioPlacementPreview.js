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
  if (toolId === "rect") {
    return {
      toolId,
      shape: "rect",
      x: x - 60,
      y: y - 30,
      width: 120,
      height: 60,
      rx: 8,
      fill: "rgba(59,130,246,0.10)",
      stroke: "#2563eb",
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
      fill: "rgba(15,23,42,0.03)",
      stroke: "#334155",
      strokeDasharray: "8 4",
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
      fill: "#0f172a",
      guideStroke: "#94a3b8",
    };
  }
  return null;
}
