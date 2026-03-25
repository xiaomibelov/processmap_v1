import { useCallback } from "react";

import { normalizeDrawioInteractionMode } from "../../drawio/drawioMeta.js";
import { normalizeRuntimeTool } from "../../drawio/runtime/drawioRuntimePlacement.js";

export default function useDrawioRuntimeBridgeActions({
  overlay,
  overlayMutationGateway,
  drawioRuntimeToolState,
  setDrawioModeState,
  setDrawioRuntimeToolState,
}) {
  const commitDrawioOverlayMove = useCallback((payloadRaw) => {
    return overlayMutationGateway.moveDrawioElement(payloadRaw, "drawio_overlay_drag_end");
  }, [overlayMutationGateway]);

  const deleteDrawioOverlayElement = useCallback((elementIdRaw) => {
    return overlayMutationGateway.deleteOverlayEntity({
      entityKind: "drawio",
      entityId: elementIdRaw,
    }, "drawio_overlay_delete");
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
  }, [drawioRuntimeToolState, overlay.setDrawioSelectedElementId, overlayMutationGateway, setDrawioModeState, setDrawioRuntimeToolState]);

  const createDrawioRuntimeElement = useCallback((payloadRaw) => {
    const payload = payloadRaw && typeof payloadRaw === "object" ? payloadRaw : {};
    const toolId = normalizeRuntimeTool(payload.toolId) || drawioRuntimeToolState;
    return overlayMutationGateway.createDrawioRuntimeElement({
      ...payload,
      toolId,
    }, "drawio_runtime_place");
  }, [drawioRuntimeToolState, overlayMutationGateway]);

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

  return {
    commitDrawioOverlayMove,
    createDrawioRuntimeElement,
    deleteDrawioOverlayElement,
    setDrawioElementLocked,
    setDrawioElementSize,
    setDrawioElementStylePreset,
    setDrawioElementText,
    setDrawioElementTextWidth,
    setDrawioElementVisible,
    setDrawioMode,
    setDrawioOpacity,
    toggleDrawioEnabled,
    toggleDrawioLock,
  };
}
