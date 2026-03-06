import { buildOverlayEntityRows, buildOverlaySelectedEntity } from "../adapters/overlayEntityAdapter.js";
import {
  buildDrawioToolsInventory,
  getEditorDrawioTools,
  getRuntimeDrawioTools,
} from "../../drawio/domain/drawioSelectors.js";
import { getDrawioOverlayStatus } from "../../drawio/domain/drawioVisibility.js";

function toText(value) {
  return String(value || "").trim();
}

export default function buildOverlayPanelModel({
  drawioState,
  drawioEditorStatus,
  hybridModeEffective,
  hybridUiPrefs,
  hybridV2HiddenCount,
  hybridLayerRenderRows,
  hybridV2Renderable,
  hybridV2BindingByHybridId,
  drawioSelectedElementId,
  hybridV2ActiveId,
  hybridV2SelectedIds,
  legacyActiveElementId,
} = {}) {
  const overlayStatus = getDrawioOverlayStatus(drawioState);
  const editorState = drawioEditorStatus && typeof drawioEditorStatus === "object" ? drawioEditorStatus : {};
  const rows = buildOverlayEntityRows({
    drawioState,
    hybridLayerRenderRows,
    hybridV2Renderable,
    hybridV2BindingByHybridId,
  });
  const selected = buildOverlaySelectedEntity({
    drawioState,
    drawioSelectedElementId,
    hybridV2ActiveId,
    hybridV2SelectedIds,
    legacyActiveElementId,
    hybridV2Renderable,
  });
  const drawioOpacity = Math.round(Math.max(0.05, Math.min(1, Number(drawioState?.opacity || 1))) * 100);
  const toolsAll = buildDrawioToolsInventory({ includeEditorTools: true });
  const toolsRuntime = getRuntimeDrawioTools(toolsAll);
  const toolsEditorOnly = getEditorDrawioTools(toolsAll);
  const drawioRows = rows.filter((row) => toText(row.entityKind) === "drawio");
  const hybridRows = rows.filter((row) => toText(row.entityKind) === "hybrid");
  const legacyRows = rows.filter((row) => toText(row.entityKind) === "legacy");
  const statusLine = [
    `Overlay: ${overlayStatus.label}`,
    `Mode: ${hybridModeEffective === "edit" ? "edit" : "view"}`,
    `Lock: ${hybridUiPrefs?.lock || drawioState?.locked ? "on" : "off"}`,
    `Opacity: ${drawioOpacity}%`,
  ].join(" · ");
  return {
    status: {
      ...overlayStatus,
      summary: statusLine,
      drawioOpacity,
      mode: hybridModeEffective === "edit" ? "edit" : "view",
      locked: !!(hybridUiPrefs?.lock || drawioState?.locked),
      overlayEnabled: overlayStatus.enabled === true,
      previewStatus: overlayStatus.hasPreview ? "available" : "missing",
    },
    editor: {
      available: editorState.editorAvailable !== false,
      opened: editorState.editorOpened === true,
      status: toText(editorState.editorStatus) || "idle",
      saved: editorState.saved === true,
      lastSavedAt: toText(editorState.lastSavedAt),
      docAvailable: editorState.docAvailable === true,
      previewAvailable: editorState.previewAvailable === true,
      overlayEnabled: editorState.overlayEnabled === true,
    },
    selected: {
      ...selected,
      displayId: toText(selected.entityId),
      displayLabel: toText(selected.label) || "—",
    },
    rows,
    layerGroups: {
      drawio: drawioRows,
      hybrid: hybridRows,
      legacy: legacyRows,
      hasAny: rows.length > 0,
    },
    tools: {
      all: toolsAll,
      runtime: toolsRuntime,
      editorOnly: toolsEditorOnly,
    },
    hidden: {
      count: Number(hybridV2HiddenCount || 0),
    },
  };
}
