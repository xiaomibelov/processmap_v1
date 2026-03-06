import { useCallback, useMemo } from "react";
import useProcessStageRuntimeGlue from "../controllers/useProcessStageRuntimeGlue";
import useOverlayPersistBoundary from "../../overlay/controllers/useOverlayPersistBoundary";
import useOverlayMutationGateway from "../../overlay/controllers/useOverlayMutationGateway";
import buildOverlayPanelModel from "../../overlay/models/buildOverlayPanelModel";
import useDrawioEditorBridge from "../../drawio/controllers/useDrawioEditorBridge";

function toText(value) {
  return String(value || "").trim();
}

export default function useDiagramRuntimeBridges({
  overlay = {},
  runtimeGlueConfig = {},
}) {
  const overlayPersistBoundary = useOverlayPersistBoundary({
    drawioMetaRef: overlay.drawioMetaRef,
    setDrawioMeta: overlay.setDrawioMeta,
    normalizeDrawioMeta: overlay.normalizeDrawioMeta,
    serializeDrawioMeta: overlay.serializeDrawioMeta,
    persistDrawioMeta: overlay.persistDrawioMeta,
    markPlaybackOverlayInteraction: overlay.markPlaybackOverlayInteraction,
  });

  const overlayMutationGateway = useOverlayMutationGateway({
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
    drawioState: overlay.drawioUiState,
    drawioEditorStatus: drawioEditorBridge.status,
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
    overlay.drawioSelectedElementId,
    overlay.drawioUiState,
    overlay.hybridLayerActiveElementId,
    overlay.hybridLayerRenderRows,
    overlay.hybridModeEffective,
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
    const prev = overlay.normalizeDrawioMeta(overlay.drawioMetaRef.current);
    overlayMutationGateway.toggleDrawioVisibility("drawio_visibility_toggle");
    const next = overlay.normalizeDrawioMeta(overlay.drawioMetaRef.current);
    if (!prev.enabled && next.enabled && !toText(next.doc_xml)) {
      overlay.setDrawioEditorOpen(true);
    }
  }, [
    overlay.drawioMetaRef,
    overlay.normalizeDrawioMeta,
    overlay.setDrawioEditorOpen,
    overlayMutationGateway,
  ]);

  const setDrawioOpacity = useCallback((opacityRaw) => {
    overlayMutationGateway.setDrawioOpacity(opacityRaw, "drawio_opacity_change");
  }, [overlayMutationGateway]);

  const toggleDrawioLock = useCallback(() => {
    overlayMutationGateway.toggleDrawioLock("drawio_lock_toggle");
  }, [overlayMutationGateway]);

  const setDrawioElementVisible = useCallback((elementIdRaw, visibleRaw, source = "drawio_element_visibility") => {
    return overlayMutationGateway.setDrawioElementVisible(elementIdRaw, visibleRaw, source);
  }, [overlayMutationGateway]);

  const setDrawioElementLocked = useCallback((elementIdRaw, lockedRaw, source = "drawio_element_lock") => {
    return overlayMutationGateway.setDrawioElementLocked(elementIdRaw, lockedRaw, source);
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
    toggleDrawioLock,
    setDrawioElementVisible,
    setDrawioElementLocked,
  };
}
