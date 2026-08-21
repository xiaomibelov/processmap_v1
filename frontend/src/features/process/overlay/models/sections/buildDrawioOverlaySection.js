import {
  buildDrawioToolsInventory,
  getEditorDrawioTools,
  getRuntimeDrawioTools,
} from "../../../drawio/domain/drawioSelectors.js";
import { summarizeDrawioAnchorStatuses } from "../../../drawio/drawioAnchors.js";
import { normalizeDrawioInteractionMode } from "../../../drawio/drawioMeta.js";

function toText(value) {
  return String(value || "").trim();
}

export default function buildDrawioOverlaySection({
  overlayStatus,
  visibilityContract = {},
  drawioState,
  drawioModeEffective,
  rows,
} = {}) {
  const drawioOpacity = Math.round(Math.max(0.05, Math.min(1, Number(drawioState?.opacity || 1))) * 100);
  const toolsAll = buildDrawioToolsInventory({ includeEditorTools: true });
  const toolsRuntime = getRuntimeDrawioTools(toolsAll);
  const toolsEditorOnly = getEditorDrawioTools(toolsAll);
  const drawioRows = rows.filter((row) => toText(row.entityKind) === "drawio");
  const interactionMode = normalizeDrawioInteractionMode(drawioModeEffective || drawioState?.interaction_mode);
  const drawioMode = overlayStatus.enabled === true ? interactionMode : "off";
  const activeTool = toText(drawioState?.active_tool || "select").toLowerCase() || "select";
  const visibleOnCanvas = visibilityContract.visibleOnCanvas === true;
  const opacityControlEnabled = visibilityContract.opacityControlEnabled !== false;
  const anchorSummary = summarizeDrawioAnchorStatuses(drawioRows);
  return {
    drawioSection: {
      enabled: overlayStatus.enabled === true,
      statusKey: overlayStatus.key,
      statusLabel: overlayStatus.label,
      hasPreview: overlayStatus.hasPreview === true,
      previewStatus: overlayStatus.placementToolActive === true && overlayStatus.hasPreview !== true
        ? "placement_ready"
        : (overlayStatus.hasPreview ? "available" : "missing"),
      mode: drawioMode,
      interactionMode,
      activeTool,
      locked: !!drawioState?.locked,
      opacityPct: drawioOpacity,
      opacityControlEnabled,
      visibleOnCanvas,
      anchorSummary,
      anchorValidationDeferred: drawioState?._anchor_validation_deferred === true,
      rows: drawioRows,
      elementCount: drawioRows.length,
      tools: {
        runtime: toolsRuntime,
        editorOnly: toolsEditorOnly,
      },
    },
    toolsAll,
    toolsRuntime,
    toolsEditorOnly,
    drawioRows,
    drawioMode,
    drawioOpacity,
  };
}
