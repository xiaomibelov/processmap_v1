import { normalizeDrawioInteractionMode } from "../drawioMeta.js";

function toText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

export function buildDrawioVisibilitySelectionContract(drawioMetaRaw = {}, options = {}) {
  const drawioMeta = asObject(drawioMetaRaw);
  const enabled = drawioMeta.enabled === true;
  const hasPreview = toText(drawioMeta.svg_cache).length > 0;
  const hasDoc = toText(drawioMeta.doc_xml).length > 0;
  const locked = drawioMeta.locked === true;
  const mode = normalizeDrawioInteractionMode(
    options.mode || drawioMeta.interaction_mode,
  );
  const visibleOnCanvas = enabled && hasPreview;
  const selectableOnCanvas = visibleOnCanvas && mode === "edit" && !locked;
  const statusKey = !enabled ? "off" : (hasPreview ? "on" : "on_preview_missing");
  const statusLabel = !enabled
    ? "OFF"
    : (hasPreview ? "ON" : "ON · preview missing · hidden");
  const statusTone = !enabled ? "muted" : (hasPreview ? "ok" : "warning");
  const opacityControlEnabled = visibleOnCanvas;
  const selectionPolicy = mode === "edit" ? "edit_only" : "view_clears_selection";

  return {
    enabled,
    hasPreview,
    hasDoc,
    locked,
    mode,
    visibleOnCanvas,
    renderable: visibleOnCanvas,
    selectable: selectableOnCanvas,
    selectableOnCanvas,
    shouldClearSelection: !selectableOnCanvas,
    statusKey,
    statusLabel,
    statusTone,
    opacityControlEnabled,
    selectionPolicy,
  };
}

export function shouldClearDrawioSelectionByContract({
  contract,
  selectedId,
}) {
  const activeId = toText(selectedId);
  if (!activeId) return false;
  const normalizedContract = asObject(contract);
  return normalizedContract.shouldClearSelection === true;
}
