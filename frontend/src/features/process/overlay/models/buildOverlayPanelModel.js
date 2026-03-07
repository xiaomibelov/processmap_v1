import { buildOverlayEntityRows, buildOverlaySelectedEntity } from "../adapters/overlayEntityAdapter.js";
import { getDrawioOverlayStatus } from "../../drawio/domain/drawioVisibility.js";
import { buildDrawioVisibilitySelectionContract } from "../../drawio/domain/drawioVisibilitySelectionContract.js";
import buildDrawioOverlaySection from "./sections/buildDrawioOverlaySection.js";
import buildHybridLegacySection from "./sections/buildHybridLegacySection.js";

function toText(value) {
  return String(value || "").trim();
}

function bumpPanelPerfCounter() {
  if (typeof window === "undefined" || !window || typeof window !== "object") return;
  if (window.__FPC_DRAWIO_PERF_ENABLE__ !== true) return;
  const store = window.__FPC_DRAWIO_PERF__ && typeof window.__FPC_DRAWIO_PERF__ === "object"
    ? window.__FPC_DRAWIO_PERF__
    : (window.__FPC_DRAWIO_PERF__ = { counters: {}, samples: {}, marks: {}, startedAt: Date.now(), resetAt: Date.now() });
  const counters = store.counters && typeof store.counters === "object" ? store.counters : {};
  counters["drawio.panel.model.builds"] = Number(counters["drawio.panel.model.builds"] || 0) + 1;
  store.counters = counters;
}

export default function buildOverlayPanelModel({
  drawioState,
  drawioModeEffective,
  drawioEditorStatus,
  hybridVisible,
  hybridTotalCount,
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
  bumpPanelPerfCounter();
  const overlayStatus = getDrawioOverlayStatus(drawioState);
  const drawioVisibilityContract = buildDrawioVisibilitySelectionContract(drawioState, {
    mode: drawioModeEffective,
  });
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
  const {
    drawioSection,
    toolsAll,
    toolsRuntime,
    toolsEditorOnly,
    drawioRows,
    drawioMode,
    drawioOpacity,
  } = buildDrawioOverlaySection({
    overlayStatus,
    visibilityContract: drawioVisibilityContract,
    drawioState,
    drawioModeEffective,
    rows,
  });
  const {
    hybridLegacySection,
    hybridRows,
    legacyRows,
  } = buildHybridLegacySection({
    rows,
    hybridVisible,
    hybridUiPrefs,
    hybridTotalCount,
    hybridModeEffective,
  });
  const statusLine = [
    `Overlay: ${overlayStatus.label}`,
    `Mode: ${drawioMode}`,
    `Lock: ${drawioState?.locked ? "on" : "off"}`,
    `Opacity: ${drawioOpacity}%`,
  ].join(" · ");
  return {
    status: {
      ...overlayStatus,
      visibilityContract: drawioVisibilityContract,
      summary: statusLine,
      drawioOpacity,
      mode: drawioMode,
      locked: !!drawioState?.locked,
      overlayEnabled: overlayStatus.enabled === true,
      previewStatus: overlayStatus.hasPreview ? "available" : "missing",
      visibleOnCanvas: drawioVisibilityContract.visibleOnCanvas === true,
      selectableOnCanvas: drawioVisibilityContract.selectableOnCanvas === true,
      opacityControlEnabled: drawioVisibilityContract.opacityControlEnabled === true,
      selectionPolicy: toText(drawioVisibilityContract.selectionPolicy || ""),
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
    drawio: drawioSection,
    hybridLegacy: hybridLegacySection,
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
