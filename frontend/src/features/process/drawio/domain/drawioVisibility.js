import { normalizeDrawioInteractionMode } from "../drawioMeta.js";
import { isExplicitDrawioCreateTool, normalizeDrawioToolId } from "../runtime/drawioCreateGuard.js";

function toText(value) {
  return String(value || "").trim();
}

export function clampDrawioOpacity(valueRaw, fallback = 1) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) return Math.max(0.05, Math.min(1, Number(fallback || 1)));
  return Math.max(0.05, Math.min(1, value));
}

export function getDrawioPlacementReadiness(drawioMetaRaw = {}) {
  const drawioMeta = drawioMetaRaw && typeof drawioMetaRaw === "object" ? drawioMetaRaw : {};
  const enabled = drawioMeta.enabled === true;
  const locked = drawioMeta.locked === true;
  const mode = normalizeDrawioInteractionMode(drawioMeta.interaction_mode);
  const activeTool = normalizeDrawioToolId(drawioMeta.active_tool);
  const placementToolActive = enabled
    && !locked
    && mode === "edit"
    && isExplicitDrawioCreateTool(activeTool);
  return {
    mode,
    activeTool,
    placementToolActive,
  };
}

export function getDrawioOverlayStatus(drawioMetaRaw = {}) {
  const drawioMeta = drawioMetaRaw && typeof drawioMetaRaw === "object" ? drawioMetaRaw : {};
  const enabled = drawioMeta.enabled === true;
  const locked = drawioMeta.locked === true;
  const hasDoc = toText(drawioMeta.doc_xml).length > 0;
  const hasPreview = toText(drawioMeta.svg_cache).length > 0;
  const { mode, activeTool, placementToolActive } = getDrawioPlacementReadiness(drawioMeta);
  const visibleOnCanvas = enabled && (hasPreview || placementToolActive);
  if (!enabled) {
    return {
      key: "off",
      label: "OFF",
      tone: "muted",
      enabled,
      locked,
      hasDoc,
      hasPreview,
      mode,
      activeTool,
      placementToolActive,
      visibleOnCanvas,
    };
  }
  if (!hasPreview && placementToolActive) {
    return {
      key: "on_placement_ready",
      label: "ON · placement ready",
      tone: "ok",
      enabled,
      locked,
      hasDoc,
      hasPreview,
      mode,
      activeTool,
      placementToolActive,
      visibleOnCanvas,
    };
  }
  if (!hasPreview) {
    return {
      key: "on_preview_missing",
      label: "ON · preview missing · hidden",
      tone: "warning",
      enabled,
      locked,
      hasDoc,
      hasPreview,
      mode,
      activeTool,
      placementToolActive,
      visibleOnCanvas,
    };
  }
  return {
    key: "on",
    label: "ON",
    tone: "ok",
    enabled,
    locked,
    hasDoc,
    hasPreview,
    mode,
    activeTool,
    placementToolActive,
    visibleOnCanvas,
  };
}
