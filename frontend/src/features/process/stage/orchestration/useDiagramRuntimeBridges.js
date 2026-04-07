import { useCallback, useEffect, useMemo, useState } from "react";
import useProcessStageRuntimeGlue from "../controllers/useProcessStageRuntimeGlue";
import useOverlayPersistBoundary from "../../overlay/controllers/useOverlayPersistBoundary";
import useOverlayMutationGateway from "../../overlay/controllers/useOverlayMutationGateway";
import {
  buildOverlayPanelModelStructure,
  buildOverlayPanelModelSelected,
} from "../../overlay/models/buildOverlayPanelModel";
import useDrawioEditorBridge from "../../drawio/controllers/useDrawioEditorBridge";
import { applyDrawioAnchorValidation, readDrawioAnchorValidationState } from "../../drawio/drawioAnchors.js";
import {
  buildDrawioVisibilitySelectionContract,
  shouldClearDrawioSelectionByContract,
} from "../../drawio/domain/drawioVisibilitySelectionContract.js";
import { normalizeRuntimeTool } from "../../drawio/runtime/drawioRuntimePlacement.js";
import { normalizeDrawioInteractionMode } from "../../drawio/drawioMeta.js";
import useDrawioRuntimeBridgeActions from "./useDrawioRuntimeBridgeActions.js";

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

  // Session change: reset both mode and tool in one effect (batched → 1 render).
  useEffect(() => {
    setDrawioModeState(normalizeDrawioInteractionMode(overlay.drawioUiState?.interaction_mode));
    setDrawioRuntimeToolState(normalizeRuntimeTool(overlay.drawioUiState?.active_tool) || "select");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay.sid]);

  // Live updates: mode and tool in one effect (batched → 1 render instead of 2).
  useEffect(() => {
    const nextMode = normalizeDrawioInteractionMode(overlay.drawioUiState?.interaction_mode);
    setDrawioModeState((prevMode) => {
      if (prevMode === "edit" && nextMode === "view" && overlay.drawioUiState?.enabled === true) {
        return prevMode;
      }
      return nextMode;
    });
    const incoming = normalizeRuntimeTool(overlay.drawioUiState?.active_tool);
    if (incoming) setDrawioRuntimeToolState(incoming);
  }, [overlay.drawioUiState?.enabled, overlay.drawioUiState?.interaction_mode, overlay.drawioUiState?.active_tool]);

  const drawioAnchorValidationState = runtimeGlueConfig.drawioAnchorValidationState
    && typeof runtimeGlueConfig.drawioAnchorValidationState === "object"
    ? runtimeGlueConfig.drawioAnchorValidationState
    : readDrawioAnchorValidationState(runtimeGlueConfig.draft);

  const drawioStateForRuntime = useMemo(() => {
    const baseMeta = overlay.drawioUiState && typeof overlay.drawioUiState === "object"
      ? overlay.drawioUiState
      : {};
    const base = String(baseMeta.active_tool || "") === String(drawioRuntimeToolState || "")
      ? baseMeta
      : {
        ...baseMeta,
        active_tool: drawioRuntimeToolState,
      };
    const validated = applyDrawioAnchorValidation(
      base,
      drawioAnchorValidationState.ids,
      drawioAnchorValidationState.ready,
    );
    if (drawioAnchorValidationState.ready !== true) {
      if (validated._anchor_validation_deferred === true) return validated;
      return {
        ...validated,
        _anchor_validation_deferred: true,
      };
    }
    return validated;
  }, [drawioAnchorValidationState, drawioRuntimeToolState, overlay.drawioUiState]);

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

  const overlayPanelOpen = overlay.overlayPanelOpen === true;

  const overlayPanelClosedStructureInput = useMemo(() => ({
    panelVisible: false,
    drawioState: drawioStateForRuntime,
    drawioModeEffective: drawioModeState,
    drawioEditorStatus: drawioEditorBridge.status,
    hybridVisible: overlay.hybridVisible,
    hybridTotalCount: overlay.hybridTotalCount,
    hybridModeEffective: overlay.hybridModeEffective,
    hybridUiPrefs: overlay.hybridUiPrefs,
    hybridV2HiddenCount: overlay.hybridV2HiddenCount,
  }), [
    drawioEditorBridge.status,
    drawioModeState,
    drawioStateForRuntime,
    overlay.hybridVisible,
    overlay.hybridModeEffective,
    overlay.hybridTotalCount,
    overlay.hybridUiPrefs,
    overlay.hybridV2HiddenCount,
  ]);

  const overlayPanelOpenStructureInput = useMemo(() => ({
    panelVisible: true,
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
  }), [
    drawioEditorBridge.status,
    drawioModeState,
    drawioStateForRuntime,
    overlay.hybridVisible,
    overlay.hybridLayerRenderRows,
    overlay.hybridModeEffective,
    overlay.hybridTotalCount,
    overlay.hybridUiPrefs,
    overlay.hybridV2BindingByHybridId,
    overlay.hybridV2HiddenCount,
    overlay.hybridV2Renderable,
  ]);

  const overlayPanelActiveStructureInput = overlayPanelOpen
    ? overlayPanelOpenStructureInput
    : overlayPanelClosedStructureInput;

  // Structural model: rows, sections, tools — does NOT depend on selection.
  // Keep only the lightweight summary surface hot while the panel is closed.
  const overlayPanelModelStructure = useMemo(() => buildOverlayPanelModelStructure(
    overlayPanelActiveStructureInput,
  ), [overlayPanelActiveStructureInput]);

  // Selected entity: changes on every click — cheap to compute, isolated from structure.
  const overlayPanelModelSelected = useMemo(() => buildOverlayPanelModelSelected({
    drawioState: drawioStateForRuntime,
    drawioSelectedElementId: overlay.drawioSelectedElementId,
    hybridV2ActiveId: overlay.hybridV2ActiveId,
    hybridV2SelectedIds: overlay.hybridV2SelectedIds,
    legacyActiveElementId: overlay.hybridLayerActiveElementId,
    hybridV2Renderable: overlay.hybridV2Renderable,
  }), [
    drawioStateForRuntime,
    overlay.drawioSelectedElementId,
    overlay.hybridLayerActiveElementId,
    overlay.hybridV2ActiveId,
    overlay.hybridV2Renderable,
    overlay.hybridV2SelectedIds,
  ]);

  // Compose: consumers see the same shape as before.
  const overlayPanelModel = useMemo(() => ({
    ...overlayPanelModelStructure,
    selected: overlayPanelModelSelected,
  }), [overlayPanelModelStructure, overlayPanelModelSelected]);

  const drawioModeEffective = drawioModeState;
  const drawioVisibilityContract = useMemo(() => (
    buildDrawioVisibilitySelectionContract(drawioStateForRuntime, { mode: drawioModeState })
  ), [drawioModeState, drawioStateForRuntime]);

  const deleteOverlayEntity = useCallback((entityRaw, source = "layers_delete_entity") => {
    return overlayMutationGateway.deleteOverlayEntity(entityRaw, source);
  }, [overlayMutationGateway]);

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

  const drawioRuntimeActions = useDrawioRuntimeBridgeActions({
    overlay,
    overlayMutationGateway,
    drawioRuntimeToolState,
    setDrawioModeState,
    setDrawioRuntimeToolState,
  });

  const runtimeActions = useProcessStageRuntimeGlue(runtimeGlueConfig);

  return {
    overlayPersistBoundary,
    overlayMutationGateway,
    drawioEditorBridge,
    overlayPanelModel,
    runtimeActions,
    ...drawioRuntimeActions,
    deleteOverlayEntity,
    drawioModeEffective,
    drawioRuntimeToolState,
    setDrawioElementAnchor: overlayMutationGateway.setDrawioElementAnchor,
  };
}
