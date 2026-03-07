function toText(value) {
  return String(value || "").trim();
}

function toNumber(valueRaw, fallback = 0) {
  const value = Number(valueRaw);
  return Number.isFinite(value) ? value : fallback;
}

function escapeAttr(valueRaw) {
  return String(valueRaw || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeRuntimeTool(toolRaw) {
  const tool = toText(toolRaw).toLowerCase();
  if (tool === "rect" || tool === "text" || tool === "container") return tool;
  return "";
}

function formatNumber(valueRaw) {
  const value = toNumber(valueRaw, 0);
  const rounded = Math.round(value * 1000) / 1000;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded);
}

function buildRuntimeMarkupByTool({ toolId, elementId, x, y }) {
  const id = escapeAttr(elementId);
  if (toolId === "rect") {
    const left = formatNumber(x - 60);
    const top = formatNumber(y - 30);
    return `<rect id="${id}" x="${left}" y="${top}" width="120" height="60" rx="8" fill="rgba(59,130,246,0.24)" stroke="#2563eb" stroke-width="2"/>`;
  }
  if (toolId === "container") {
    const left = formatNumber(x - 100);
    const top = formatNumber(y - 60);
    return `<rect id="${id}" x="${left}" y="${top}" width="200" height="120" rx="10" fill="rgba(15,23,42,0.04)" stroke="#334155" stroke-width="2" stroke-dasharray="8 4"/>`;
  }
  if (toolId === "text") {
    const textX = formatNumber(x);
    const textY = formatNumber(y);
    return `<text id="${id}" x="${textX}" y="${textY}" fill="#0f172a" font-size="16" font-family="Arial, sans-serif">Text</text>`;
  }
  return "";
}

function appendMarkupToSvgCache(svgCacheRaw, markupRaw, pointRaw = {}) {
  const svgCache = toText(svgCacheRaw);
  const markup = toText(markupRaw);
  if (!markup) return svgCache;
  const match = svgCache.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/i);
  if (match) {
    const attrs = String(match[1] || "");
    const body = String(match[2] || "");
    return `<svg${attrs}>${body}${markup}</svg>`;
  }
  const pointX = toNumber(pointRaw.x, 0);
  const pointY = toNumber(pointRaw.y, 0);
  const width = Math.max(1200, Math.round(pointX + 400));
  const height = Math.max(800, Math.round(pointY + 300));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${markup}</svg>`;
}

function resolveRuntimeElementId(toolIdRaw, existingRowsRaw = []) {
  const toolId = normalizeRuntimeTool(toolIdRaw);
  if (!toolId) return "";
  const existingIds = new Set(
    (Array.isArray(existingRowsRaw) ? existingRowsRaw : [])
      .map((row) => toText(row?.id))
      .filter(Boolean),
  );
  const base = `${toolId}_${Date.now().toString(36)}`;
  let candidate = base;
  let index = 1;
  while (existingIds.has(candidate)) {
    candidate = `${base}_${index}`;
    index += 1;
  }
  return candidate;
}

function buildRuntimeElementRow({
  elementId,
  layerIdRaw,
  zIndexRaw,
}) {
  return {
    id: toText(elementId),
    layer_id: toText(layerIdRaw) || "DL1",
    visible: true,
    locked: false,
    deleted: false,
    opacity: 1,
    offset_x: 0,
    offset_y: 0,
    z_index: Math.max(0, Math.round(toNumber(zIndexRaw, 0))),
  };
}

function buildRuntimePlacementPatch({
  metaRaw = {},
  toolIdRaw,
  pointRaw = {},
}) {
  const meta = metaRaw && typeof metaRaw === "object" ? metaRaw : {};
  const toolId = normalizeRuntimeTool(toolIdRaw);
  if (!toolId) return { changed: false, meta, createdId: "" };
  const x = toNumber(pointRaw.x, 0);
  const y = toNumber(pointRaw.y, 0);
  const rows = Array.isArray(meta.drawio_elements_v1) ? meta.drawio_elements_v1 : [];
  const createdId = resolveRuntimeElementId(toolId, rows);
  if (!createdId) return { changed: false, meta, createdId: "" };
  const markup = buildRuntimeMarkupByTool({
    toolId,
    elementId: createdId,
    x,
    y,
  });
  if (!markup) return { changed: false, meta, createdId: "" };
  const svgCache = appendMarkupToSvgCache(meta.svg_cache, markup, { x, y });
  const layers = Array.isArray(meta.drawio_layers_v1) && meta.drawio_layers_v1.length
    ? meta.drawio_layers_v1
    : [{ id: "DL1", name: "Default", visible: true, locked: false, opacity: 1 }];
  const activeLayerId = toText(meta.active_layer_id) || toText(layers[0]?.id) || "DL1";
  const nextRows = rows.concat(buildRuntimeElementRow({
    elementId: createdId,
    layerIdRaw: activeLayerId,
    zIndexRaw: rows.length,
  }));
  return {
    changed: true,
    createdId,
    meta: {
      ...meta,
      enabled: true,
      interaction_mode: "edit",
      active_tool: toolId,
      svg_cache: svgCache,
      drawio_layers_v1: layers,
      active_layer_id: activeLayerId,
      drawio_elements_v1: nextRows,
    },
  };
}

export {
  normalizeRuntimeTool,
  buildRuntimePlacementPatch,
};

