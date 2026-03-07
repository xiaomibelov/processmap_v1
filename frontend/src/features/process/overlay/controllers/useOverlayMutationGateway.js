import { useCallback } from "react";
import { OVERLAY_ENTITY_KINDS, normalizeOverlayEntityKind } from "../../drawio/domain/drawioEntityKinds.js";
import { resolveCanonicalDrawioElementId } from "../../drawio/domain/drawioSelectors.js";
import { clampDrawioOpacity, getDrawioOverlayStatus } from "../../drawio/domain/drawioVisibility.js";
import { normalizeDrawioInteractionMode } from "../../drawio/drawioMeta.js";
import { publishDrawioNormalizationSnapshot } from "../../drawio/runtime/drawioNormalizationDiagnostics.js";
import { buildRuntimePlacementPatch, normalizeRuntimeTool } from "../../drawio/runtime/drawioRuntimePlacement.js";
import { pushDeleteTrace } from "../../stage/utils/deleteTrace.js";

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

function escapeRegExp(valueRaw) {
  return String(valueRaw || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeIdList(idsRaw) {
  return Array.from(new Set(asArray(idsRaw).map((row) => toText(row)).filter(Boolean)));
}

export default function useOverlayMutationGateway({
  sessionId,
  drawioMetaRef,
  normalizeDrawioMeta,
  applyDrawioMutation,
  deleteSelectedHybridIds,
  deleteLegacyHybridMarkers,
  setInfoMsg,
  setGenErr,
}) {
  const publishNormalization = useCallback((source = "overlay_mutation") => {
    publishDrawioNormalizationSnapshot({
      sessionId,
      drawioMeta: normalizeDrawioMeta(drawioMetaRef.current),
      source,
    });
  }, [drawioMetaRef, normalizeDrawioMeta, sessionId]);

  const moveDrawioElement = useCallback((payloadRaw = {}, source = "drawio_element_move") => {
    const payload = asObject(payloadRaw);
    const elementId = resolveCanonicalDrawioElementId(drawioMetaRef.current, payload.id);
    if (!elementId) return false;
    const nextOffsetX = Number(payload.offsetX);
    const nextOffsetY = Number(payload.offsetY);
    if (!Number.isFinite(nextOffsetX) || !Number.isFinite(nextOffsetY)) return false;
    let changed = false;
    const result = applyDrawioMutation((prevRaw) => {
      const prev = normalizeDrawioMeta(prevRaw);
      const nextElements = asArray(prev.drawio_elements_v1).map((rowRaw) => {
        const row = asObject(rowRaw);
        if (toText(row.id) !== elementId) return row;
        const prevX = Number(row.offset_x ?? row.offsetX ?? 0);
        const prevY = Number(row.offset_y ?? row.offsetY ?? 0);
        if (Math.abs(prevX - nextOffsetX) < 0.01 && Math.abs(prevY - nextOffsetY) < 0.01) return row;
        changed = true;
        return {
          ...row,
          offset_x: nextOffsetX,
          offset_y: nextOffsetY,
        };
      });
      if (!changed) return prev;
      return {
        ...prev,
        drawio_elements_v1: nextElements,
      };
    }, {
      source,
      playbackStage: source,
      persist: true,
    });
    if (result.changed) publishNormalization(source);
    return !!result.changed;
  }, [applyDrawioMutation, drawioMetaRef, normalizeDrawioMeta, publishNormalization]);

  const deleteDrawioElement = useCallback((elementIdRaw, source = "drawio_overlay_delete") => {
    const elementId = resolveCanonicalDrawioElementId(drawioMetaRef.current, elementIdRaw) || toText(elementIdRaw);
    if (!elementId) return false;
    let matchedByElements = false;
    let matchedBySvg = false;
    const result = applyDrawioMutation((prevRaw) => {
      const prev = normalizeDrawioMeta(prevRaw);
      let changed = false;
      const nextElements = asArray(prev.drawio_elements_v1).map((rowRaw) => {
        const row = asObject(rowRaw);
        if (toText(row.id) !== elementId) return row;
        matchedByElements = true;
        if (row.deleted === true) return row;
        changed = true;
        return {
          ...row,
          deleted: true,
        };
      });
      if (!changed) {
        const svgCache = toText(prev.svg_cache);
        const hasIdInSvg = !!svgCache && new RegExp(`\\sid\\s*=\\s*["']${escapeRegExp(elementId)}["']`).test(svgCache);
        if (hasIdInSvg) {
          matchedBySvg = true;
          changed = true;
          nextElements.push({
            id: elementId,
            layer_id: toText(prev.active_layer_id || asObject(asArray(prev.drawio_layers_v1)[0]).id || "DL1") || "DL1",
            visible: true,
            locked: false,
            deleted: true,
            opacity: 1,
            offset_x: 0,
            offset_y: 0,
            z_index: Number(nextElements.length || 0),
          });
        }
      }
      if (!changed) return prev;
      return {
        ...prev,
        drawio_elements_v1: nextElements,
      };
    }, {
      source,
      playbackStage: source,
      persist: true,
    });
    pushDeleteTrace("overlay_gateway_delete_drawio", {
      source,
      elementId,
      matchedByElements,
      matchedBySvg,
      changed: !!result.changed,
    });
    if (!result.changed) {
      setInfoMsg?.("Нечего удалять: draw.io элемент не найден.");
      setGenErr?.("");
    }
    if (result.changed) publishNormalization(source);
    return !!result.changed;
  }, [applyDrawioMutation, drawioMetaRef, normalizeDrawioMeta, publishNormalization, setGenErr, setInfoMsg]);

  const deleteOverlayEntity = useCallback((entityRaw, source = "overlay_delete_entity") => {
    const entity = asObject(entityRaw);
    const entityKind = normalizeOverlayEntityKind(entity.entityKind || entity.kind);
    const entityIds = normalizeIdList(entity.entityIds);
    const entityId = toText(entity.entityId) || entityIds[0];
    if (!entityKind || (!entityId && !entityIds.length)) return false;
    if (entityKind === OVERLAY_ENTITY_KINDS.DRAWIO) {
      return deleteDrawioElement(entityId, source);
    }
    if (entityKind === OVERLAY_ENTITY_KINDS.HYBRID) {
      const ids = entityIds.length ? entityIds : [entityId];
      const deleted = !!deleteSelectedHybridIds?.(ids);
      pushDeleteTrace("overlay_gateway_delete_hybrid", {
        source,
        ids,
        deleted,
      });
      return deleted;
    }
    if (entityKind === OVERLAY_ENTITY_KINDS.LEGACY) {
      const ids = entityIds.length ? entityIds : [entityId];
      const deleted = !!deleteLegacyHybridMarkers?.(ids, source);
      pushDeleteTrace("overlay_gateway_delete_legacy", {
        source,
        ids,
        deleted,
      });
      return deleted;
    }
    return false;
  }, [deleteDrawioElement, deleteLegacyHybridMarkers, deleteSelectedHybridIds]);

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

  const setDrawioElementVisible = useCallback((elementIdRaw, visibleRaw, source = "drawio_element_visibility") => {
    const elementId = resolveCanonicalDrawioElementId(drawioMetaRef.current, elementIdRaw);
    if (!elementId) return false;
    const visible = visibleRaw !== false;
    let changed = false;
    const result = applyDrawioMutation((prevRaw) => {
      const prev = normalizeDrawioMeta(prevRaw);
      const nextElements = asArray(prev.drawio_elements_v1).map((rowRaw) => {
        const row = asObject(rowRaw);
        if (toText(row.id) !== elementId) return row;
        if (row.visible === visible) return row;
        changed = true;
        return {
          ...row,
          visible,
        };
      });
      return changed ? { ...prev, drawio_elements_v1: nextElements } : prev;
    }, {
      source,
      playbackStage: source,
      persist: true,
    });
    if (result.changed) publishNormalization(source);
    return !!result.changed;
  }, [applyDrawioMutation, drawioMetaRef, normalizeDrawioMeta, publishNormalization]);

  const setDrawioElementLocked = useCallback((elementIdRaw, lockedRaw, source = "drawio_element_lock") => {
    const elementId = resolveCanonicalDrawioElementId(drawioMetaRef.current, elementIdRaw);
    if (!elementId) return false;
    const locked = lockedRaw === true;
    let changed = false;
    const result = applyDrawioMutation((prevRaw) => {
      const prev = normalizeDrawioMeta(prevRaw);
      const nextElements = asArray(prev.drawio_elements_v1).map((rowRaw) => {
        const row = asObject(rowRaw);
        if (toText(row.id) !== elementId) return row;
        if (row.locked === locked) return row;
        changed = true;
        return {
          ...row,
          locked,
        };
      });
      return changed ? { ...prev, drawio_elements_v1: nextElements } : prev;
    }, {
      source,
      playbackStage: source,
      persist: true,
    });
    if (result.changed) publishNormalization(source);
    return !!result.changed;
  }, [applyDrawioMutation, drawioMetaRef, normalizeDrawioMeta, publishNormalization]);

  const getDrawioStatus = useCallback(() => getDrawioOverlayStatus(drawioMetaRef.current), [drawioMetaRef]);

  return {
    deleteOverlayEntity,
    deleteDrawioElement,
    moveDrawioElement,
    toggleDrawioVisibility,
    setDrawioInteractionMode,
    createDrawioRuntimeElement,
    setDrawioOpacity,
    toggleDrawioLock,
    setDrawioElementVisible,
    setDrawioElementLocked,
    getDrawioStatus,
  };
}
