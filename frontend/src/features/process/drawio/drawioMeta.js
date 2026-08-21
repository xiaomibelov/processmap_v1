import { extractDrawioElementIdsFromSvg } from "./drawioSvg.js";
import { normalizeDrawioAnchor } from "./drawioAnchors.js";
import {
  isDrawioNoteRow,
  normalizeDrawioNoteDimensions,
  normalizeDrawioNoteStyle,
} from "./runtime/drawioRuntimeNote.js";

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

export const DRAWIO_INTERACTION_MODES = Object.freeze({
  VIEW: "view",
  EDIT: "edit",
});

export function normalizeDrawioInteractionMode(modeRaw, fallback = DRAWIO_INTERACTION_MODES.VIEW) {
  const mode = toText(modeRaw).toLowerCase();
  if (mode === DRAWIO_INTERACTION_MODES.EDIT) return DRAWIO_INTERACTION_MODES.EDIT;
  if (mode === DRAWIO_INTERACTION_MODES.VIEW) return DRAWIO_INTERACTION_MODES.VIEW;
  return normalizeDrawioInteractionMode(fallback, DRAWIO_INTERACTION_MODES.VIEW);
}

function normalizeDrawioActiveTool(toolRaw) {
  const tool = toText(toolRaw).toLowerCase();
  if (!tool) return "select";
  if (tool === "select" || tool === "rect" || tool === "text" || tool === "container" || tool === "note") return tool;
  return "select";
}

const DRAWIO_DEFAULT_LAYER_ID = "DL1";
const DRAWIO_DEFAULT_LAYER_NAME = "Default";

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
    const isNote = isDrawioNoteRow(row);
    const noteDimensions = isNote
      ? normalizeDrawioNoteDimensions(row.width, row.height)
      : null;
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
      ...(toText(row.text || row.label) ? { text: toText(row.text || row.label) } : {}),
      ...(isNote ? {
        type: "note",
        width: noteDimensions.width,
        height: noteDimensions.height,
        style: normalizeDrawioNoteStyle(row.style),
      } : {}),
      ...(normalizeDrawioAnchor(row.anchor_v1 || row.anchorV1, row) ? {
        anchor_v1: normalizeDrawioAnchor(row.anchor_v1 || row.anchorV1, row),
      } : {}),
    });
  });
  // Always bootstrap SVG elements that are not yet tracked in elementsMap.
  // If elementsMap is non-empty (e.g. after creating a new element at runtime),
  // old editor-created elements that exist only in svg_cache would be skipped,
  // making them invisible/non-interactive. The guard `if (elementsMap.has(id)) return`
  // preserves explicit state (deletions, visibility overrides) for already-tracked elements.
  const svgElementIds = extractDrawioElementIdsFromSvg(svgCacheRaw);
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
  const interactionMode = normalizeDrawioInteractionMode(value.interaction_mode || value.mode);
  const normalizedLayers = normalizeDrawioLayersAndElements(value, svgCache);
  const out = {
    enabled: value.enabled === true,
    interaction_mode: interactionMode,
    active_tool: normalizeDrawioActiveTool(value.active_tool || value.activeTool),
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
  const lifecycleCode = toText(value._lifecycle_code || value.lifecycle_code);
  const lifecycleError = toText(value._lifecycle_error || value.lifecycle_error);
  if (lifecycleCode) out._lifecycle_code = lifecycleCode;
  if (lifecycleError) out._lifecycle_error = lifecycleError;
  return out;
}

export function hasDrawioPayload(valueRaw) {
  const meta = normalizeDrawioMeta(valueRaw);
  return !!(meta.doc_xml || meta.svg_cache || meta.enabled || asArray(meta.drawio_elements_v1).length);
}

export function readDrawioLifecycleIssue(valueRaw) {
  const meta = normalizeDrawioMeta(valueRaw);
  const code = toText(meta._lifecycle_code);
  const error = toText(meta._lifecycle_error);
  if (!code && !error) return null;
  return {
    code: code || "lifecycle_issue",
    error,
  };
}

export function buildDrawioJazzSnapshot(valueRaw) {
  const meta = normalizeDrawioMeta(valueRaw);
  const out = {
    enabled: meta.enabled === true,
    locked: meta.locked === true,
    opacity: clampNumber(meta.opacity, 1, 0.05, 1),
    last_saved_at: toText(meta.last_saved_at),
    doc_xml: isDrawioXml(meta.doc_xml) ? toText(meta.doc_xml) : "",
    svg_cache: toText(meta.svg_cache),
    page: {
      index: Math.max(0, Math.round(clampNumber(asObject(meta.page).index, 0, 0))),
    },
    transform: {
      x: clampNumber(asObject(meta.transform).x, 0),
      y: clampNumber(asObject(meta.transform).y, 0),
    },
    drawio_layers_v1: asArray(meta.drawio_layers_v1),
    drawio_elements_v1: asArray(meta.drawio_elements_v1),
    active_layer_id: toText(meta.active_layer_id),
  };
  const lifecycle = readDrawioLifecycleIssue(meta);
  if (lifecycle?.code) out._lifecycle_code = lifecycle.code;
  if (lifecycle?.error) out._lifecycle_error = lifecycle.error;
  return normalizeDrawioMeta(out);
}

function toMillis(isoRaw) {
  const value = Date.parse(toText(isoRaw));
  return Number.isFinite(value) ? value : 0;
}

export function resolvePreferredDrawioSnapshot(primaryRaw, fallbackRaw = {}) {
  const primary = buildDrawioJazzSnapshot(primaryRaw);
  const fallback = normalizeDrawioMeta(fallbackRaw);
  const primaryLifecycle = readDrawioLifecycleIssue(primary);
  if (primaryLifecycle && hasDrawioPayload(fallback)) {
    return fallback;
  }
  const primaryHasPayload = hasDrawioPayload(primary);
  const fallbackHasPayload = hasDrawioPayload(fallback);
  if (!primaryHasPayload && fallbackHasPayload) {
    return {
      ...fallback,
      enabled: primary.enabled || fallback.enabled,
      locked: primary.locked || fallback.locked,
      opacity: primary.opacity || fallback.opacity,
    };
  }
  if (primaryHasPayload && fallbackHasPayload) {
    const primaryTs = toMillis(primary.last_saved_at);
    const fallbackTs = toMillis(fallback.last_saved_at);
    if (fallbackTs > primaryTs) return fallback;
  }
  return primary;
}

export function mergeDrawioMeta(primaryRaw, fallbackRaw = {}) {
  return resolvePreferredDrawioSnapshot(primaryRaw, fallbackRaw);
}

export function serializeDrawioMeta(valueRaw) {
  return JSON.stringify(normalizeDrawioMeta(valueRaw));
}
