import { useCallback } from "react";

import { clampDrawioOpacity } from "../../drawio/domain/drawioVisibility.js";
import { normalizeDrawioInteractionMode } from "../../drawio/drawioMeta.js";
import { buildRuntimePlacementPatch, normalizeRuntimeTool } from "../../drawio/runtime/drawioRuntimePlacement.js";
import { asObject, toText } from "./drawioMutationShared.js";

export default function useDrawioMetaMutationApi({
  normalizeDrawioMeta,
  applyDrawioMutation,
  publishNormalization,
}) {
  const toggleDrawioVisibility = useCallback((source = "drawio_visibility_toggle") => {
    applyDrawioMutation((prev) => ({
      ...prev,
      enabled: prev.enabled !== true,
    }), {
      source,
      playbackStage: source,
      persist: true,
    });
    publishNormalization(source);
  }, [applyDrawioMutation, publishNormalization]);

  const setDrawioInteractionMode = useCallback((modeRaw, options = {}) => {
    const nextMode = normalizeDrawioInteractionMode(modeRaw);
    const ensureVisible = options?.ensureVisible === true;
    const requestedTool = normalizeRuntimeTool(options?.activeTool);
    applyDrawioMutation((prev) => {
      const next = {
        ...prev,
        interaction_mode: nextMode,
      };
      const prevTool = normalizeRuntimeTool(prev?.active_tool);
      if (nextMode === "edit") {
        next.active_tool = requestedTool || prevTool || "select";
      } else {
        next.active_tool = "select";
      }
      if (ensureVisible && nextMode === "edit") next.enabled = true;
      return next;
    }, {
      source: String(options?.source || "drawio_mode_change"),
      playbackStage: String(options?.playbackStage || options?.source || "drawio_mode_change"),
      persist: options?.persist !== false,
    });
    publishNormalization(String(options?.source || "drawio_mode_change"));
  }, [applyDrawioMutation, publishNormalization]);

  const createDrawioRuntimeElement = useCallback((payloadRaw = {}, source = "drawio_runtime_place") => {
    const payload = asObject(payloadRaw);
    const toolId = normalizeRuntimeTool(payload.toolId);
    if (!toolId) return "";
    const point = {
      x: Number(payload.x),
      y: Number(payload.y),
    };
    let createdId = "";
    const result = applyDrawioMutation((prevRaw) => {
      const prev = normalizeDrawioMeta(prevRaw);
      const patch = buildRuntimePlacementPatch({
        metaRaw: prev,
        toolIdRaw: toolId,
        pointRaw: point,
      });
      createdId = toText(patch.createdId);
      if (!patch.changed) return prev;
      return normalizeDrawioMeta(patch.meta);
    }, {
      source,
      playbackStage: source,
      persist: true,
    });
    if (result.changed) publishNormalization(source);
    return result.changed ? createdId : "";
  }, [applyDrawioMutation, normalizeDrawioMeta, publishNormalization]);

  const setDrawioOpacity = useCallback((opacityRaw, source = "drawio_opacity_change") => {
    const opacity = clampDrawioOpacity(opacityRaw, 1);
    applyDrawioMutation((prev) => ({
      ...prev,
      opacity,
    }), {
      source,
      playbackStage: source,
      persist: true,
    });
    publishNormalization(source);
  }, [applyDrawioMutation, publishNormalization]);

  const toggleDrawioLock = useCallback((source = "drawio_lock_toggle") => {
    applyDrawioMutation((prev) => ({
      ...prev,
      locked: prev.locked !== true,
    }), {
      source,
      playbackStage: source,
      persist: true,
    });
    publishNormalization(source);
  }, [applyDrawioMutation, publishNormalization]);

  return {
    createDrawioRuntimeElement,
    setDrawioInteractionMode,
    setDrawioOpacity,
    toggleDrawioLock,
    toggleDrawioVisibility,
  };
}
