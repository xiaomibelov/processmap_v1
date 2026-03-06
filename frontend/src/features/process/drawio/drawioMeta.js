function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

function clampNumber(valueRaw, fallback = 0, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

export function isDrawioXml(valueRaw) {
  return /^<mxfile[\s>]/i.test(toText(valueRaw));
}

const DRAWIO_DEFAULT_LAYER_ID = "DL1";
const DRAWIO_DEFAULT_LAYER_NAME = "Default";

function extractSvgElementIds(svgRaw) {
  const svg = toText(svgRaw);
  if (!svg) return [];
  const ids = [];
  const seen = new Set();
  const regexp = /<([a-zA-Z][a-zA-Z0-9:_-]*)([^>]*?)\sid\s*=\s*("([^"]+)"|'([^']+)')([^>]*)>/g;
  let match = regexp.exec(svg);
  while (match) {
    const idValue = toText(match[4] || match[5]);
    if (idValue && !seen.has(idValue)) {
      seen.add(idValue);
      ids.push(idValue);
    }
    match = regexp.exec(svg);
  }
  return ids;
}

function normalizeDrawioLayersAndElements(valueRaw, svgCacheRaw) {
  const value = asObject(valueRaw);
  const rawLayers = asArray(value.drawio_layers_v1 || value.layers_v1 || value.layers);
  const layers = [];
  const layerIds = new Set();
  rawLayers.forEach((layerRaw, idx) => {
    const layer = asObject(layerRaw);
    const layerIdBase = toText(layer.id) || `DL${idx + 1}`;
    if (!layerIdBase || layerIds.has(layerIdBase)) return;
    layerIds.add(layerIdBase);
    layers.push({
      id: layerIdBase,
      name: toText(layer.name) || (idx === 0 ? DRAWIO_DEFAULT_LAYER_NAME : `Layer ${idx + 1}`),
      visible: layer.visible !== false,
      locked: layer.locked === true,
      opacity: clampNumber(layer.opacity, 1, 0.05, 1),
    });
  });
  if (!layers.length) {
    layers.push({
      id: DRAWIO_DEFAULT_LAYER_ID,
      name: DRAWIO_DEFAULT_LAYER_NAME,
      visible: true,
      locked: false,
      opacity: 1,
    });
    layerIds.add(DRAWIO_DEFAULT_LAYER_ID);
  }
  const defaultLayerId = toText(asObject(layers[0]).id) || DRAWIO_DEFAULT_LAYER_ID;
  const activeLayerCandidate = toText(value.active_layer_id || value.activeLayerId);
  const activeLayerId = layerIds.has(activeLayerCandidate) ? activeLayerCandidate : defaultLayerId;
  const rawElements = asArray(value.drawio_elements_v1 || value.elements_v1 || value.elements);
  const elementsMap = new Map();
  rawElements.forEach((rowRaw, idx) => {
    const row = asObject(rowRaw);
    const id = toText(row.id);
    if (!id || elementsMap.has(id)) return;
    const layerIdRaw = toText(row.layer_id || row.layerId);
    elementsMap.set(id, {
      id,
      layer_id: layerIds.has(layerIdRaw) ? layerIdRaw : activeLayerId,
      visible: row.visible !== false,
      locked: row.locked === true,
      deleted: row.deleted === true,
      opacity: clampNumber(row.opacity, 1, 0.05, 1),
      offset_x: clampNumber(row.offset_x ?? row.offsetX, 0),
      offset_y: clampNumber(row.offset_y ?? row.offsetY, 0),
      z_index: Math.max(0, Math.round(clampNumber(row.z_index, idx, 0))),
    });
  });
  const svgElementIds = extractSvgElementIds(svgCacheRaw);
  svgElementIds.forEach((id, idx) => {
    if (elementsMap.has(id)) return;
    elementsMap.set(id, {
      id,
      layer_id: activeLayerId,
      visible: true,
      locked: false,
      deleted: false,
      opacity: 1,
      offset_x: 0,
      offset_y: 0,
      z_index: idx,
    });
  });
  return {
    drawio_layers_v1: layers,
    drawio_elements_v1: Array.from(elementsMap.values()),
    active_layer_id: activeLayerId,
  };
}

export function normalizeDrawioMeta(valueRaw) {
  const value = asObject(valueRaw);
  const svgCache = toText(value.svg_cache || value.svgCache);
  const normalizedLayers = normalizeDrawioLayersAndElements(value, svgCache);
  return {
    enabled: value.enabled === true,
    locked: value.locked === true,
    opacity: clampNumber(value.opacity, 1, 0.05, 1),
    last_saved_at: toText(value.last_saved_at || value.lastSavedAt),
    doc_xml: isDrawioXml(value.doc_xml) ? toText(value.doc_xml) : "",
    svg_cache: svgCache,
    page: {
      index: Math.max(0, Math.round(clampNumber(asObject(value.page).index, 0, 0))),
    },
    transform: {
      x: clampNumber(asObject(value.transform).x, 0),
      y: clampNumber(asObject(value.transform).y, 0),
    },
    drawio_layers_v1: normalizedLayers.drawio_layers_v1,
    drawio_elements_v1: normalizedLayers.drawio_elements_v1,
    active_layer_id: normalizedLayers.active_layer_id,
  };
}

function hasDrawioPayload(valueRaw) {
  const meta = normalizeDrawioMeta(valueRaw);
  return !!(meta.doc_xml || meta.svg_cache || meta.enabled || asArray(meta.drawio_elements_v1).length);
}

export function mergeDrawioMeta(primaryRaw, fallbackRaw = {}) {
  const primary = normalizeDrawioMeta(primaryRaw);
  const fallback = normalizeDrawioMeta(fallbackRaw);
  if (!hasDrawioPayload(primary) && hasDrawioPayload(fallback)) {
    return {
      ...fallback,
      enabled: primary.enabled || fallback.enabled,
      locked: primary.locked || fallback.locked,
      opacity: primary.opacity || fallback.opacity,
    };
  }
  return primary;
}

export function serializeDrawioMeta(valueRaw) {
  return JSON.stringify(normalizeDrawioMeta(valueRaw));
}
