import { normalizeDrawioInteractionMode } from "../drawioMeta.js";

const CANVAS_CREATE_TOOL_IDS = new Set([
  "rect",
  "text",
  "container",
]);

function toText(value) {
  return String(value || "").trim();
}

export function normalizeDrawioToolId(toolIdRaw) {
  return toText(toolIdRaw).toLowerCase();
}

export function isExplicitDrawioCreateTool(toolIdRaw) {
  return CANVAS_CREATE_TOOL_IDS.has(normalizeDrawioToolId(toolIdRaw));
}

export function canCreateDrawioEntityFromBpmnClick({
  enabled,
  locked,
  interactionMode,
  toolId,
} = {}) {
  if (enabled !== true) return false;
  if (locked === true) return false;
  const mode = normalizeDrawioInteractionMode(interactionMode);
  if (mode !== "edit") return false;
  return isExplicitDrawioCreateTool(toolId);
}

export function shouldBlockBpmnClickDrawioCreation(params = {}) {
  return !canCreateDrawioEntityFromBpmnClick(params);
}

export function resolveDrawioToolIntent({
  toolId,
  enabled,
  locked,
} = {}) {
  const normalizedTool = normalizeDrawioToolId(toolId);
  if (enabled !== true) {
    return {
      toolId: normalizedTool,
      intent: "blocked",
      reason: "drawio_disabled",
    };
  }
  if (locked === true) {
    return {
      toolId: normalizedTool,
      intent: "blocked",
      reason: "drawio_locked",
    };
  }
  if (normalizedTool === "select") {
    return {
      toolId: normalizedTool,
      intent: "mode_edit",
      reason: "select_existing",
    };
  }
  if (isExplicitDrawioCreateTool(normalizedTool)) {
    return {
      toolId: normalizedTool,
      intent: "mode_edit",
      reason: "runtime_overlay_tool",
    };
  }
  return {
    toolId: normalizedTool,
    intent: "open_editor",
    reason: "unsupported_runtime_tool",
  };
}
