import { useCallback } from "react";
import { OVERLAY_ENTITY_KINDS, normalizeOverlayEntityKind } from "../../drawio/domain/drawioEntityKinds.js";
import { resolveCanonicalDrawioElementId } from "../../drawio/domain/drawioSelectors.js";
import { clampDrawioOpacity, getDrawioOverlayStatus } from "../../drawio/domain/drawioVisibility.js";
import { normalizeDrawioInteractionMode } from "../../drawio/drawioMeta.js";
import { normalizeDrawioAnchor } from "../../drawio/drawioAnchors.js";
import { publishDrawioNormalizationSnapshot } from "../../drawio/runtime/drawioNormalizationDiagnostics.js";
import { buildRuntimePlacementPatch, normalizeRuntimeTool } from "../../drawio/runtime/drawioRuntimePlacement.js";
import {
  readDrawioDocXmlCellGeometry,
  updateDrawioDocXmlCellGeometry,
  updateDrawioDocXmlCellStyle,
  updateDrawioDocXmlCellValue,
} from "../../drawio/drawioDocXml.js";
import {
  readDrawioElementSnapshot,
  readDrawioTextElementContent,
  updateDrawioElementAttributes,
  updateDrawioTextElementContent,
} from "../../drawio/drawioSvg.js";
import {
  normalizeRuntimeTextWidth,
  readRuntimeTextState,
  updateRuntimeTextLayout,
} from "../../drawio/drawioRuntimeText.js";
import {
  normalizeRuntimeResizeDimension,
  readRuntimeResizableSize,
  resolveRuntimeResizeSurface,
} from "../../drawio/drawioRuntimeGeometry.js";
import {
  getRuntimeStylePresets,
  resolveRuntimeStyleSurface,
} from "../../drawio/drawioRuntimeStylePresets.js";
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

  const setDrawioElementText = useCallback((elementIdRaw, textRaw, source = "drawio_element_text") => {
    const elementId = resolveCanonicalDrawioElementId(drawioMetaRef.current, elementIdRaw);
    if (!elementId) return false;
    const nextText = String(textRaw ?? "");
    let supported = false;
    let changed = false;
    const result = applyDrawioMutation((prevRaw) => {
      const prev = normalizeDrawioMeta(prevRaw);
      const docGeometry = readDrawioDocXmlCellGeometry(prev.doc_xml, elementId);
      const currentText = readDrawioTextElementContent(prev.svg_cache, elementId);
      if (currentText == null) return prev;
      supported = true;
      if (currentText === nextText) return prev;
      const nextLayout = updateRuntimeTextLayout(prev.svg_cache, elementId, {
        textRaw: nextText,
        docGeometryRaw: docGeometry,
      });
      const nextSvgCache = nextLayout.svg || updateDrawioTextElementContent(prev.svg_cache, elementId, nextText);
      if (nextSvgCache === toText(prev.svg_cache)) return prev;
      changed = true;
      const nextElements = asArray(prev.drawio_elements_v1).map((rowRaw) => {
        const row = asObject(rowRaw);
        if (toText(row.id) !== elementId) return row;
        return {
          ...row,
          text: nextText,
          label: nextText,
        };
      });
      return {
        ...prev,
        svg_cache: nextSvgCache,
        doc_xml: updateDrawioDocXmlCellGeometry(
          updateDrawioDocXmlCellValue(prev.doc_xml, elementId, nextText),
          elementId,
          {
            width: nextLayout.state?.width ?? docGeometry?.width,
            height: nextLayout.state?.height ?? docGeometry?.height,
          },
        ),
        drawio_elements_v1: nextElements,
      };
    }, {
      source,
      playbackStage: source,
      persist: true,
    });
    if (!supported) {
      setInfoMsg?.("Быстрое редактирование доступно только для текстовых draw.io объектов.");
      setGenErr?.("");
      return false;
    }
    if (result.changed) publishNormalization(source);
    return !!changed;
  }, [applyDrawioMutation, drawioMetaRef, normalizeDrawioMeta, publishNormalization, setGenErr, setInfoMsg]);

  const setDrawioElementTextWidth = useCallback((elementIdRaw, widthRaw, source = "drawio_element_text_width") => {
    const elementId = resolveCanonicalDrawioElementId(drawioMetaRef.current, elementIdRaw);
    if (!elementId) return false;
    let supported = false;
    let changed = false;
    const result = applyDrawioMutation((prevRaw) => {
      const prev = normalizeDrawioMeta(prevRaw);
      const docGeometry = readDrawioDocXmlCellGeometry(prev.doc_xml, elementId);
      const currentState = readRuntimeTextState(prev.svg_cache, elementId, { docGeometryRaw: docGeometry });
      if (!currentState) return prev;
      supported = true;
      const nextWidth = normalizeRuntimeTextWidth(widthRaw, currentState.width);
      if (nextWidth === currentState.width) return prev;
      const nextLayout = updateRuntimeTextLayout(prev.svg_cache, elementId, {
        widthRaw: nextWidth,
        docGeometryRaw: docGeometry,
      });
      if (nextLayout.svg === toText(prev.svg_cache)) return prev;
      changed = true;
      return {
        ...prev,
        svg_cache: nextLayout.svg,
        doc_xml: updateDrawioDocXmlCellGeometry(prev.doc_xml, elementId, {
          width: nextLayout.state?.width ?? nextWidth,
          height: nextLayout.state?.height ?? currentState.height,
        }),
      };
    }, {
      source,
      playbackStage: source,
      persist: true,
    });
    if (!supported) {
      setInfoMsg?.("Быстрая настройка ширины доступна только для базовых runtime draw.io text объектов.");
      setGenErr?.("");
      return false;
    }
    if (result.changed) publishNormalization(source);
    return !!changed;
  }, [applyDrawioMutation, drawioMetaRef, normalizeDrawioMeta, publishNormalization, setGenErr, setInfoMsg]);

  const setDrawioElementStylePreset = useCallback((elementIdRaw, presetIdRaw, source = "drawio_element_style") => {
    const elementId = resolveCanonicalDrawioElementId(drawioMetaRef.current, elementIdRaw);
    if (!elementId) return false;
    const presetId = toText(presetIdRaw).toLowerCase();
    let supported = false;
    let changed = false;
    const result = applyDrawioMutation((prevRaw) => {
      const prev = normalizeDrawioMeta(prevRaw);
      const snapshot = readDrawioElementSnapshot(prev.svg_cache, elementId);
      const surface = resolveRuntimeStyleSurface(snapshot);
      const preset = getRuntimeStylePresets(surface).find((row) => toText(row.id).toLowerCase() === presetId) || null;
      if (!snapshot || !surface || !preset) return prev;
      supported = true;
      const nextSvgCache = updateDrawioElementAttributes(prev.svg_cache, elementId, preset.svg);
      const nextDocXml = updateDrawioDocXmlCellStyle(prev.doc_xml, elementId, preset.doc);
      if (nextSvgCache === toText(prev.svg_cache) && nextDocXml === toText(prev.doc_xml)) return prev;
      changed = true;
      return {
        ...prev,
        svg_cache: nextSvgCache,
        doc_xml: nextDocXml,
      };
    }, {
      source,
      playbackStage: source,
      persist: true,
    });
    if (!supported) {
      setInfoMsg?.("Быстрые style presets доступны только для базовых runtime draw.io объектов.");
      setGenErr?.("");
      return false;
    }
    if (result.changed) publishNormalization(source);
    return !!changed;
  }, [applyDrawioMutation, drawioMetaRef, normalizeDrawioMeta, publishNormalization, setGenErr, setInfoMsg]);

  const setDrawioElementSize = useCallback((elementIdRaw, sizeRaw = {}, source = "drawio_element_resize") => {
    const elementId = resolveCanonicalDrawioElementId(drawioMetaRef.current, elementIdRaw);
    if (!elementId) return false;
    const size = asObject(sizeRaw);
    let supported = false;
    let changed = false;
    const result = applyDrawioMutation((prevRaw) => {
      const prev = normalizeDrawioMeta(prevRaw);
      const snapshot = readDrawioElementSnapshot(prev.svg_cache, elementId);
      const surface = resolveRuntimeResizeSurface(snapshot);
      const currentSize = readRuntimeResizableSize(snapshot);
      if (!snapshot || !surface || !currentSize) return prev;
      supported = true;
      const nextWidth = normalizeRuntimeResizeDimension(size.width, currentSize.width);
      const nextHeight = normalizeRuntimeResizeDimension(size.height, currentSize.height);
      if (nextWidth === currentSize.width && nextHeight === currentSize.height) return prev;
      const nextSvgCache = updateDrawioElementAttributes(prev.svg_cache, elementId, {
        width: String(nextWidth),
        height: String(nextHeight),
      });
      const nextDocXml = updateDrawioDocXmlCellGeometry(prev.doc_xml, elementId, {
        width: nextWidth,
        height: nextHeight,
      });
      if (nextSvgCache === toText(prev.svg_cache) && nextDocXml === toText(prev.doc_xml)) return prev;
      changed = true;
      return {
        ...prev,
        svg_cache: nextSvgCache,
        doc_xml: nextDocXml,
      };
    }, {
      source,
      playbackStage: source,
      persist: true,
    });
    if (!supported) {
      setInfoMsg?.("Быстрый resize доступен только для базовых runtime draw.io shape/container объектов.");
      setGenErr?.("");
      return false;
    }
    if (result.changed) publishNormalization(source);
    return !!changed;
  }, [applyDrawioMutation, drawioMetaRef, normalizeDrawioMeta, publishNormalization, setGenErr, setInfoMsg]);

  const setDrawioElementAnchor = useCallback((elementIdRaw, anchorRaw, source = "drawio_element_anchor") => {
    const elementId = resolveCanonicalDrawioElementId(drawioMetaRef.current, elementIdRaw);
    if (!elementId) return false;
    let changed = false;
    let invalid = false;
    const result = applyDrawioMutation((prevRaw) => {
      const prev = normalizeDrawioMeta(prevRaw);
      const nextElements = asArray(prev.drawio_elements_v1).map((rowRaw) => {
        const row = asObject(rowRaw);
        if (toText(row.id) !== elementId) return row;
        const nextAnchor = normalizeDrawioAnchor(anchorRaw, row);
        invalid = !!nextAnchor && nextAnchor.status === "invalid";
        const prevComparable = JSON.stringify(asObject(row.anchor_v1));
        const nextComparable = nextAnchor ? JSON.stringify(nextAnchor) : "";
        if (!nextAnchor && !row.anchor_v1) return row;
        if (prevComparable === nextComparable) return row;
        changed = true;
        if (!nextAnchor) {
          const nextRow = { ...row };
          delete nextRow.anchor_v1;
          return nextRow;
        }
        return {
          ...row,
          anchor_v1: nextAnchor,
        };
      });
      return changed ? { ...prev, drawio_elements_v1: nextElements } : prev;
    }, {
      source,
      playbackStage: source,
      persist: true,
    });
    if (invalid) {
      setInfoMsg?.("Anchor metadata сохранена как invalid: объект или target не входят в первый pilot contract.");
      setGenErr?.("");
    }
    if (result.changed) publishNormalization(source);
    return !!result.changed;
  }, [applyDrawioMutation, drawioMetaRef, normalizeDrawioMeta, publishNormalization, setGenErr, setInfoMsg]);

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
    setDrawioElementText,
    setDrawioElementTextWidth,
    setDrawioElementStylePreset,
    setDrawioElementSize,
    setDrawioElementAnchor,
    getDrawioStatus,
  };
}
