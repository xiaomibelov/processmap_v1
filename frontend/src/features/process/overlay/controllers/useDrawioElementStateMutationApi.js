import { useCallback } from "react";

import { resolveCanonicalDrawioElementId } from "../../drawio/domain/drawioSelectors.js";
import { normalizeDrawioAnchor } from "../../drawio/drawioAnchors.js";
import { pushDeleteTrace } from "../../stage/utils/deleteTrace.js";
import {
  asArray,
  asObject,
  escapeRegExp,
  patchElementById,
  toText,
} from "./drawioMutationShared.js";

export default function useDrawioElementStateMutationApi({
  drawioMetaRef,
  normalizeDrawioMeta,
  applyDrawioMutation,
  publishNormalization,
  setInfoMsg,
  setGenErr,
}) {
  const moveDrawioElement = useCallback((payloadRaw = {}, source = "drawio_element_move") => {
    const payload = asObject(payloadRaw);
    const elementId = resolveCanonicalDrawioElementId(drawioMetaRef.current, payload.id);
    if (!elementId) return false;
    const nextOffsetX = Number(payload.offsetX);
    const nextOffsetY = Number(payload.offsetY);
    if (!Number.isFinite(nextOffsetX) || !Number.isFinite(nextOffsetY)) return false;
    const result = applyDrawioMutation((prevRaw) => {
      const prev = normalizeDrawioMeta(prevRaw);
      const patch = patchElementById(prev.drawio_elements_v1, elementId, (row) => {
        const prevX = Number(row.offset_x ?? row.offsetX ?? 0);
        const prevY = Number(row.offset_y ?? row.offsetY ?? 0);
        if (Math.abs(prevX - nextOffsetX) < 0.01 && Math.abs(prevY - nextOffsetY) < 0.01) return row;
        return { ...row, offset_x: nextOffsetX, offset_y: nextOffsetY };
      });
      if (!patch.changed) return prev;
      return { ...prev, drawio_elements_v1: patch.elements };
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
      const patch = patchElementById(prev.drawio_elements_v1, elementId, (row) => {
        matchedByElements = true;
        if (row.deleted === true) return row;
        return { ...row, deleted: true };
      });
      if (patch.changed) {
        return { ...prev, drawio_elements_v1: patch.elements };
      }
      const svgCache = toText(prev.svg_cache);
      const hasIdInSvg = !!svgCache && new RegExp(`\\sid\\s*=\\s*["']${escapeRegExp(elementId)}["']`).test(svgCache);
      if (!hasIdInSvg) return prev;
      matchedBySvg = true;
      const elements = asArray(prev.drawio_elements_v1);
      return {
        ...prev,
        drawio_elements_v1: [
          ...elements,
          {
            id: elementId,
            layer_id: toText(prev.active_layer_id || asObject(asArray(prev.drawio_layers_v1)[0]).id || "DL1") || "DL1",
            visible: true,
            locked: false,
            deleted: true,
            opacity: 1,
            offset_x: 0,
            offset_y: 0,
            z_index: elements.length,
          },
        ],
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

  const setDrawioElementVisible = useCallback((elementIdRaw, visibleRaw, source = "drawio_element_visibility") => {
    const elementId = resolveCanonicalDrawioElementId(drawioMetaRef.current, elementIdRaw);
    if (!elementId) return false;
    const visible = visibleRaw !== false;
    const result = applyDrawioMutation((prevRaw) => {
      const prev = normalizeDrawioMeta(prevRaw);
      const patch = patchElementById(prev.drawio_elements_v1, elementId, (row) => {
        if (row.visible === visible) return row;
        return { ...row, visible };
      });
      if (!patch.changed) return prev;
      return { ...prev, drawio_elements_v1: patch.elements };
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
    const result = applyDrawioMutation((prevRaw) => {
      const prev = normalizeDrawioMeta(prevRaw);
      const patch = patchElementById(prev.drawio_elements_v1, elementId, (row) => {
        if (row.locked === locked) return row;
        return { ...row, locked };
      });
      if (!patch.changed) return prev;
      return { ...prev, drawio_elements_v1: patch.elements };
    }, {
      source,
      playbackStage: source,
      persist: true,
    });
    if (result.changed) publishNormalization(source);
    return !!result.changed;
  }, [applyDrawioMutation, drawioMetaRef, normalizeDrawioMeta, publishNormalization]);

  const setDrawioElementAnchor = useCallback((elementIdRaw, anchorRaw, source = "drawio_element_anchor") => {
    const elementId = resolveCanonicalDrawioElementId(drawioMetaRef.current, elementIdRaw);
    if (!elementId) return false;
    let invalid = false;
    const result = applyDrawioMutation((prevRaw) => {
      const prev = normalizeDrawioMeta(prevRaw);
      const patch = patchElementById(prev.drawio_elements_v1, elementId, (row) => {
        const nextAnchor = normalizeDrawioAnchor(anchorRaw, row);
        invalid = !!nextAnchor && nextAnchor.status === "invalid";
        const prevComparable = JSON.stringify(asObject(row.anchor_v1));
        const nextComparable = nextAnchor ? JSON.stringify(nextAnchor) : "";
        if (!nextAnchor && !row.anchor_v1) return row;
        if (prevComparable === nextComparable) return row;
        if (!nextAnchor) {
          const nextRow = { ...row };
          delete nextRow.anchor_v1;
          return nextRow;
        }
        return { ...row, anchor_v1: nextAnchor };
      });
      if (!patch.changed) return prev;
      return { ...prev, drawio_elements_v1: patch.elements };
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

  return {
    deleteDrawioElement,
    moveDrawioElement,
    setDrawioElementAnchor,
    setDrawioElementLocked,
    setDrawioElementVisible,
  };
}
