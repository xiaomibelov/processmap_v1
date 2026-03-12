import { useCallback, useEffect, useMemo, useState } from "react";
import useProcessStageRuntimeGlue from "../controllers/useProcessStageRuntimeGlue";
import useOverlayPersistBoundary from "../../overlay/controllers/useOverlayPersistBoundary";
import useOverlayMutationGateway from "../../overlay/controllers/useOverlayMutationGateway";
import buildOverlayPanelModel from "../../overlay/models/buildOverlayPanelModel";
import useDrawioEditorBridge from "../../drawio/controllers/useDrawioEditorBridge";
import { normalizeDrawioInteractionMode } from "../../drawio/drawioMeta.js";
import {
  buildDrawioVisibilitySelectionContract,
  shouldClearDrawioSelectionByContract,
} from "../../drawio/domain/drawioVisibilitySelectionContract.js";
import { normalizeRuntimeTool } from "../../drawio/runtime/drawioRuntimePlacement.js";

export default function useDiagramRuntimeBridges({
  overlay = {},
  runtimeGlueConfig = {},
}) {
  const [drawioModeState, setDrawioModeState] = useState(() => (
    normalizeDrawioInteractionMode(overlay.drawioUiState?.interaction_mode)
  ));
  const [drawioRuntimeToolState, setDrawioRuntimeToolState] = useState(() => (
    normalizeRuntimeTool(overlay.drawioUiState?.active_tool) || "select"
  ));

  useEffect(() => {
    setDrawioModeState(normalizeDrawioInteractionMode(overlay.drawioUiState?.interaction_mode));
  }, [overlay.sid]);

  useEffect(() => {
    const nextMode = normalizeDrawioInteractionMode(overlay.drawioUiState?.interaction_mode);
    setDrawioModeState((prevMode) => {
      if (prevMode === "edit" && nextMode === "view" && overlay.drawioUiState?.enabled === true) {
        return prevMode;
      }
      return nextMode;
    });
  }, [overlay.drawioUiState?.enabled, overlay.drawioUiState?.interaction_mode]);

  useEffect(() => {
    setDrawioRuntimeToolState(normalizeRuntimeTool(overlay.drawioUiState?.active_tool) || "select");
  }, [overlay.sid]);

  useEffect(() => {
    const incoming = normalizeRuntimeTool(overlay.drawioUiState?.active_tool);
    if (!incoming) return;
    setDrawioRuntimeToolState(incoming);
  }, [overlay.drawioUiState?.active_tool]);

  const drawioStateForRuntime = useMemo(() => ({
    ...(overlay.drawioUiState && typeof overlay.drawioUiState === "object" ? overlay.drawioUiState : {}),
    active_tool: drawioRuntimeToolState,
  }), [drawioRuntimeToolState, overlay.drawioUiState]);

  const overlayPersistBoundary = useOverlayPersistBoundary({
    drawioMetaRef: overlay.drawioMetaRef,
    setDrawioMeta: overlay.setDrawioMeta,
    normalizeDrawioMeta: overlay.normalizeDrawioMeta,
    serializeDrawioMeta: overlay.serializeDrawioMeta,
    persistDrawioMeta: overlay.persistDrawioMeta,
    markPlaybackOverlayInteraction: overlay.markPlaybackOverlayInteraction,
  });

  const overlayMutationGateway = useOverlayMutationGateway({
    sessionId: overlay.sid,
    drawioMetaRef: overlay.drawioMetaRef,
    normalizeDrawioMeta: overlay.normalizeDrawioMeta,
    applyDrawioMutation: overlayPersistBoundary.applyDrawioMutation,
    deleteSelectedHybridIds: overlay.deleteSelectedHybridIds,
    deleteLegacyHybridMarkers: overlay.deleteLegacyHybridMarkers,
    setInfoMsg: overlay.setInfoMsg,
    setGenErr: overlay.setGenErr,
  });

  const drawioEditorBridge = useDrawioEditorBridge({
    sid: overlay.sid,
    drawioMetaRef: overlay.drawioMetaRef,
    drawioEditorOpen: overlay.drawioEditorOpen,
    normalizeDrawioMeta: overlay.normalizeDrawioMeta,
    isDrawioXml: overlay.isDrawioXml,
    readFileText: overlay.readFileText,
    setDrawioEditorOpen: overlay.setDrawioEditorOpen,
    setInfoMsg: overlay.setInfoMsg,
    setGenErr: overlay.setGenErr,
    downloadTextFile: overlay.downloadTextFile,
    applyDrawioMutation: overlayPersistBoundary.applyDrawioMutation,
  });

  const overlayPanelModel = useMemo(() => buildOverlayPanelModel({
    drawioState: drawioStateForRuntime,
    drawioModeEffective: drawioModeState,
    drawioEditorStatus: drawioEditorBridge.status,
    hybridVisible: overlay.hybridVisible,
    hybridTotalCount: overlay.hybridTotalCount,
    hybridModeEffective: overlay.hybridModeEffective,
    hybridUiPrefs: overlay.hybridUiPrefs,
    hybridV2HiddenCount: overlay.hybridV2HiddenCount,
    hybridLayerRenderRows: overlay.hybridLayerRenderRows,
    hybridV2Renderable: overlay.hybridV2Renderable,
    hybridV2BindingByHybridId: overlay.hybridV2BindingByHybridId,
    drawioSelectedElementId: overlay.drawioSelectedElementId,
    hybridV2ActiveId: overlay.hybridV2ActiveId,
    hybridV2SelectedIds: overlay.hybridV2SelectedIds,
    legacyActiveElementId: overlay.hybridLayerActiveElementId,
  }), [
    drawioEditorBridge.status,
    drawioModeState,
    overlay.drawioSelectedElementId,
    drawioStateForRuntime,
    overlay.hybridVisible,
    overlay.hybridLayerActiveElementId,
    overlay.hybridLayerRenderRows,
    overlay.hybridModeEffective,
    overlay.hybridTotalCount,
    overlay.hybridUiPrefs,
    overlay.hybridV2ActiveId,
    overlay.hybridV2BindingByHybridId,
    overlay.hybridV2HiddenCount,
    overlay.hybridV2Renderable,
    overlay.hybridV2SelectedIds,
  ]);

  const commitDrawioOverlayMove = useCallback((payloadRaw) => {
    return overlayMutationGateway.moveDrawioElement(payloadRaw, "drawio_overlay_drag_end");
  }, [overlayMutationGateway]);

  const drawioModeEffective = drawioModeState;
  const drawioVisibilityContract = useMemo(() => (
    buildDrawioVisibilitySelectionContract(drawioStateForRuntime, { mode: drawioModeState })
  ), [drawioModeState, drawioStateForRuntime]);

  const deleteDrawioOverlayElement = useCallback((elementIdRaw) => {
    return overlayMutationGateway.deleteOverlayEntity({
      entityKind: "drawio",
      entityId: elementIdRaw,
    }, "drawio_overlay_delete");
  }, [overlayMutationGateway]);

  const deleteOverlayEntity = useCallback((entityRaw, source = "layers_delete_entity") => {
    return overlayMutationGateway.deleteOverlayEntity(entityRaw, source);
  }, [overlayMutationGateway]);

  const toggleDrawioEnabled = useCallback(() => {
    overlayMutationGateway.toggleDrawioVisibility("drawio_visibility_toggle");
    const next = overlay.normalizeDrawioMeta(overlay.drawioMetaRef.current);
    if (!next.enabled) {
      overlay.setDrawioSelectedElementId?.("");
    }
  }, [
    overlay.drawioMetaRef,
    overlay.normalizeDrawioMeta,
    overlay.setDrawioSelectedElementId,
    overlayMutationGateway,
  ]);

  const setDrawioOpacity = useCallback((opacityRaw) => {
    overlayMutationGateway.setDrawioOpacity(opacityRaw, "drawio_opacity_change");
  }, [overlayMutationGateway]);

  const setDrawioMode = useCallback((modeRaw, options = {}) => {
    const nextMode = normalizeDrawioInteractionMode(modeRaw);
    const activeTool = normalizeRuntimeTool(options?.toolId);
    setDrawioModeState(nextMode);
    if (nextMode === "edit") {
      setDrawioRuntimeToolState(activeTool || "select");
    } else {
      setDrawioRuntimeToolState("select");
    }
    overlayMutationGateway.setDrawioInteractionMode(nextMode, {
      source: "drawio_mode_change",
      playbackStage: "drawio_mode_change",
      ensureVisible: nextMode === "edit",
      persist: true,
      activeTool: nextMode === "edit" ? (activeTool || drawioRuntimeToolState) : "",
    });
    if (nextMode !== "edit") {
      overlay.setDrawioSelectedElementId?.("");
    }
  }, [drawioRuntimeToolState, overlay.setDrawioSelectedElementId, overlayMutationGateway]);

  const createDrawioRuntimeElement = useCallback((payloadRaw) => {
    const payload = payloadRaw && typeof payloadRaw === "object" ? payloadRaw : {};
    const toolId = normalizeRuntimeTool(payload.toolId) || drawioRuntimeToolState;
    return overlayMutationGateway.createDrawioRuntimeElement({
      ...payload,
      toolId,
    }, "drawio_runtime_place");
  }, [drawioRuntimeToolState, overlayMutationGateway]);

  useEffect(() => {
    if (!shouldClearDrawioSelectionByContract({
      contract: drawioVisibilityContract,
      selectedId: overlay.drawioSelectedElementId,
    })) return;
    overlay.setDrawioSelectedElementId?.("");
  }, [
    drawioVisibilityContract,
    overlay.drawioSelectedElementId,
    overlay.setDrawioSelectedElementId,
  ]);

  const toggleDrawioLock = useCallback(() => {
    overlayMutationGateway.toggleDrawioLock("drawio_lock_toggle");
  }, [overlayMutationGateway]);

  const setDrawioElementVisible = useCallback((elementIdRaw, visibleRaw, source = "drawio_element_visibility") => {
    return overlayMutationGateway.setDrawioElementVisible(elementIdRaw, visibleRaw, source);
  }, [overlayMutationGateway]);

  const setDrawioElementLocked = useCallback((elementIdRaw, lockedRaw, source = "drawio_element_lock") => {
    return overlayMutationGateway.setDrawioElementLocked(elementIdRaw, lockedRaw, source);
  }, [overlayMutationGateway]);

  const setDrawioElementText = useCallback((elementIdRaw, textRaw, source = "drawio_element_text") => {
    return overlayMutationGateway.setDrawioElementText(elementIdRaw, textRaw, source);
  }, [overlayMutationGateway]);

  const setDrawioElementTextWidth = useCallback((elementIdRaw, widthRaw, source = "drawio_element_text_width") => {
    return overlayMutationGateway.setDrawioElementTextWidth(elementIdRaw, widthRaw, source);
  }, [overlayMutationGateway]);

  const setDrawioElementStylePreset = useCallback((elementIdRaw, presetIdRaw, source = "drawio_element_style") => {
    return overlayMutationGateway.setDrawioElementStylePreset(elementIdRaw, presetIdRaw, source);
  }, [overlayMutationGateway]);

  const setDrawioElementSize = useCallback((elementIdRaw, sizeRaw, source = "drawio_element_resize") => {
    return overlayMutationGateway.setDrawioElementSize(elementIdRaw, sizeRaw, source);
  }, [overlayMutationGateway]);

  const runtimeActions = useProcessStageRuntimeGlue(runtimeGlueConfig);

  return {
    overlayPersistBoundary,
    overlayMutationGateway,
    drawioEditorBridge,
    overlayPanelModel,
    runtimeActions,
    commitDrawioOverlayMove,
    deleteDrawioOverlayElement,
    deleteOverlayEntity,
    toggleDrawioEnabled,
    setDrawioOpacity,
    drawioModeEffective,
    drawioRuntimeToolState,
    setDrawioMode,
    createDrawioRuntimeElement,
    toggleDrawioLock,
    setDrawioElementVisible,
    setDrawioElementLocked,
    setDrawioElementText,
    setDrawioElementTextWidth,
    setDrawioElementStylePreset,
    setDrawioElementSize,
  };
}
