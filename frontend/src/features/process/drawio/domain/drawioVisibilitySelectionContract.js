import { normalizeDrawioInteractionMode } from "../drawioMeta.js";
import { getDrawioOverlayStatus } from "./drawioVisibility.js";

function toText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

export function buildDrawioVisibilitySelectionContract(drawioMetaRaw = {}, options = {}) {
  const drawioMeta = asObject(drawioMetaRaw);
  const mode = normalizeDrawioInteractionMode(
    options.mode || drawioMeta.interaction_mode,
  );
  const overlayStatus = getDrawioOverlayStatus({
    ...drawioMeta,
    interaction_mode: mode,
  });
  const enabled = overlayStatus.enabled === true;
  const hasPreview = overlayStatus.hasPreview === true;
  const hasDoc = overlayStatus.hasDoc === true;
  const locked = overlayStatus.locked === true;
  const visibleOnCanvas = overlayStatus.visibleOnCanvas === true;
  const selectableOnCanvas = enabled && hasPreview && mode === "edit" && !locked;
  const statusKey = toText(overlayStatus.key);
  const statusLabel = toText(overlayStatus.label);
  const statusTone = toText(overlayStatus.tone);
  const opacityControlEnabled = visibleOnCanvas;
  const selectionPolicy = mode === "edit" ? "edit_only" : "view_clears_selection";

  return {
    enabled,
    hasPreview,
    hasDoc,
    locked,
    mode,
    activeTool: toText(overlayStatus.activeTool),
    placementToolActive: overlayStatus.placementToolActive === true,
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
