import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { parseDrawioSvgCache } from "./drawioSvg";

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toNumber(valueRaw, fallback = 0) {
  const value = Number(valueRaw);
  return Number.isFinite(value) ? value : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

function buildDrawioLayerRenderMaps(metaRaw) {
  const meta = asObject(metaRaw);
  const layers = asArray(meta.drawio_layers_v1);
  const elements = asArray(meta.drawio_elements_v1);
  const layerMap = new Map();
  layers.forEach((layerRaw) => {
    const layer = asObject(layerRaw);
    const id = String(layer.id || "").trim();
    if (!id) return;
    layerMap.set(id, {
      visible: layer.visible !== false,
      locked: layer.locked === true,
      opacity: Math.max(0.05, Math.min(1, Number(layer.opacity || 1))),
    });
  });
  const elementMap = new Map();
  elements.forEach((rowRaw) => {
    const row = asObject(rowRaw);
    const id = String(row.id || "").trim();
    if (!id) return;
    elementMap.set(id, {
      layer_id: String(row.layer_id || "").trim(),
      visible: row.visible !== false,
      locked: row.locked === true,
      deleted: row.deleted === true,
      opacity: Math.max(0.05, Math.min(1, Number(row.opacity || 1))),
      offset_x: toNumber(row.offset_x ?? row.offsetX, 0),
      offset_y: toNumber(row.offset_y ?? row.offsetY, 0),
    });
  });
  return { layerMap, elementMap };
}

function mergeStyle(attrsRaw, patchStyleRaw) {
  const attrs = String(attrsRaw || "");
  const patchStyle = String(patchStyleRaw || "").trim();
  if (!patchStyle) return attrs;
  if (/\sstyle\s*=\s*"/i.test(attrs)) {
    return attrs.replace(/\sstyle\s*=\s*"([^"]*)"/i, (_match, existing) => {
      const joined = `${String(existing || "").trim()} ${patchStyle}`.trim();
      return ` style="${joined}"`;
    });
  }
  return `${attrs} style="${patchStyle}"`;
}

function resolveDrawioElementFlags(metaRaw, layerMap, elementMap, elementIdRaw) {
  const meta = asObject(metaRaw);
  const elementId = String(elementIdRaw || "").trim();
  const elementState = asObject(elementMap.get(elementId));
  const layerState = asObject(layerMap.get(String(elementState.layer_id || "").trim()));
  const visible = !!elementId
    && layerState.visible !== false
    && elementState.visible !== false
    && elementState.deleted !== true;
  const editable = visible
    && meta.locked !== true
    && layerState.locked !== true
    && elementState.locked !== true;
  return {
    visible,
    editable,
    layerLocked: layerState.locked === true,
    elementLocked: elementState.locked === true,
    globalLocked: meta.locked === true,
  };
}

function applyDrawioLayerRenderState(bodyRaw, metaRaw, selectedIdRaw = "", draftOffsetRaw = null) {
  const body = String(bodyRaw || "");
  if (!body) return body;
  const { layerMap, elementMap } = buildDrawioLayerRenderMaps(metaRaw);
  const selectedId = String(selectedIdRaw || "").trim();
  const draftOffset = asObject(draftOffsetRaw);
  const draftId = String(draftOffset.id || "").trim();
  const draftX = toNumber(draftOffset.offset_x, 0);
  const draftY = toNumber(draftOffset.offset_y, 0);
  return body.replace(
    /<([a-zA-Z][a-zA-Z0-9:_-]*)([^>]*?)\sid\s*=\s*("([^"]+)"|'([^']+)')([^>]*)>/g,
    (fullMatch, tagName, beforeIdAttrs, _idQuoted, idDouble, idSingle, afterIdAttrs) => {
      const elementId = String(idDouble || idSingle || "").trim();
      if (!elementId) return fullMatch;
      const elementState = asObject(elementMap.get(elementId));
      const layerState = asObject(layerMap.get(String(elementState.layer_id || "").trim()));
      const flags = resolveDrawioElementFlags(metaRaw, layerMap, elementMap, elementId);
      const visible = flags.visible;
      const interactive = flags.visible;
      const opacity = Math.max(0.05, Math.min(1, Number(layerState.opacity || 1) * Number(elementState.opacity || 1)));
      const offsetX = draftId && draftId === elementId ? draftX : toNumber(elementState.offset_x, 0);
      const offsetY = draftId && draftId === elementId ? draftY : toNumber(elementState.offset_y, 0);
      const selected = selectedId && selectedId === elementId;
      const selectionStyle = selected ? "stroke:#2563eb; stroke-width:2.4; filter: drop-shadow(0 0 2px rgba(37,99,235,.45));" : "";
      const patchStyle = visible
        ? `opacity:${opacity}; transform: translate(${offsetX}px, ${offsetY}px); pointer-events:${interactive ? "auto" : "none"}; cursor:${flags.editable ? "move" : "default"}; ${selectionStyle}`
        : "display:none; opacity:0; pointer-events:none;";
      let patchedAttrs = mergeStyle(`${String(beforeIdAttrs || "")}${String(afterIdAttrs || "")}`, patchStyle);
      if (!/\sdata-drawio-el-id=/.test(patchedAttrs)) {
        patchedAttrs = `${patchedAttrs} data-drawio-el-id="${elementId}"`;
      }
      return `<${tagName}${patchedAttrs} id="${elementId}">`;
    },
  );
}

function DrawioOverlayRenderer({
  visible,
  drawioMeta,
  overlayMatrix,
  screenToDiagram,
  onCommitTransform,
  onDeleteElement,
  onSelectionChange,
}) {
  const [selectedId, setSelectedId] = useState("");
  const [draftTransform, setDraftTransform] = useState(null);
  const draftTransformRef = useRef(null);
  const rootRef = useRef(null);
  const dragRef = useRef(null);
  const activePointerIdRef = useRef(null);
  const captureTargetRef = useRef(null);
  const moveRafRef = useRef(0);
  const pendingPointRef = useRef(null);
  const selectedIdRef = useRef("");
  const editableTarget = useCallback((target) => {
    if (!(target instanceof Element)) return false;
    return !!target.closest("input, textarea, select, [contenteditable='true']");
  }, []);

  const parsed = useMemo(
    () => parseDrawioSvgCache(asObject(drawioMeta).svg_cache),
    [drawioMeta],
  );
  const hasRenderable = !!visible && !!parsed?.svg;
  const parsedBody = String(parsed?.body || "");
  const meta = asObject(drawioMeta);
  const matrix = asObject(overlayMatrix);
  const tx = toNumber(asObject(meta.transform).x, 0);
  const ty = toNumber(asObject(meta.transform).y, 0);
  const a = toNumber(matrix.a, 1);
  const b = toNumber(matrix.b, 0);
  const c = toNumber(matrix.c, 0);
  const d = toNumber(matrix.d, 1);
  const e = toNumber(matrix.e, 0);
  const f = toNumber(matrix.f, 0);
  const opacity = Math.max(0.05, Math.min(1, Number(meta.opacity || 1)));
  const { layerMap, elementMap } = useMemo(() => buildDrawioLayerRenderMaps(meta), [meta]);
  const renderedBody = useMemo(
    () => applyDrawioLayerRenderState(parsedBody, meta, selectedId, null),
    [parsedBody, meta, selectedId],
  );

  useEffect(() => {
    selectedIdRef.current = String(selectedId || "").trim();
  }, [selectedId]);

  useEffect(() => {
    if (!selectedIdRef.current) return;
    if (!elementMap.has(selectedIdRef.current)) {
      selectedIdRef.current = "";
      setSelectedId("");
      onSelectionChange?.("");
    }
  }, [elementMap, onSelectionChange]);

  const finishDrag = useCallback((shouldCommit = true) => {
    const state = asObject(dragRef.current);
    const activePointerId = Number(activePointerIdRef.current);
    const captureTarget = captureTargetRef.current;
    if (captureTarget && typeof captureTarget.releasePointerCapture === "function" && Number.isFinite(activePointerId)) {
      try {
        captureTarget.releasePointerCapture(activePointerId);
      } catch {
      }
    }
    activePointerIdRef.current = null;
    captureTargetRef.current = null;
    dragRef.current = null;
    const activeDraftTransform = asObject(draftTransformRef.current || draftTransform);
    setDraftTransform(null);
    draftTransformRef.current = null;
    if (!shouldCommit) return;
    if (!state.id) return;
    const nextX = toNumber(activeDraftTransform.x, state.baseTx || 0);
    const nextY = toNumber(activeDraftTransform.y, state.baseTy || 0);
    if (Math.abs(nextX - Number(state.baseTx || 0)) < 0.01 && Math.abs(nextY - Number(state.baseTy || 0)) < 0.01) return;
    onCommitTransform?.({ x: nextX, y: nextY });
  }, [draftTransform, onCommitTransform]);

  useEffect(() => {
    const root = rootRef.current;
    const doc = typeof document !== "undefined" ? document : null;
    const onMove = (event) => {
      const state = asObject(dragRef.current);
      if (!state.id) return;
      const activePointerId = Number(activePointerIdRef.current);
      const eventPointerId = Number(event?.pointerId);
      if (Number.isFinite(activePointerId) && Number.isFinite(eventPointerId) && activePointerId !== eventPointerId) return;
      pendingPointRef.current = {
        clientX: Number(event?.clientX || 0),
        clientY: Number(event?.clientY || 0),
      };
      if (moveRafRef.current) return;
      const scheduleFrame = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (fn) => setTimeout(fn, 16);
      moveRafRef.current = scheduleFrame(() => {
        moveRafRef.current = 0;
        const point = asObject(pendingPointRef.current);
        pendingPointRef.current = null;
        const current = typeof screenToDiagram === "function"
          ? screenToDiagram(Number(point.clientX || 0), Number(point.clientY || 0))
          : null;
        if (!current) return;
        const dx = Number(current.x || 0) - Number(state.startX || 0);
        const dy = Number(current.y || 0) - Number(state.startY || 0);
        const nextDraft = {
          x: Number(state.baseTx || 0) + dx,
          y: Number(state.baseTy || 0) + dy,
        };
        draftTransformRef.current = nextDraft;
        setDraftTransform(nextDraft);
      });
    };
    const onUp = (event) => {
      const state = asObject(dragRef.current);
      if (!state.id) return;
      const activePointerId = Number(activePointerIdRef.current);
      const eventPointerId = Number(event?.pointerId);
      if (Number.isFinite(activePointerId) && Number.isFinite(eventPointerId) && activePointerId !== eventPointerId) return;
      finishDrag(true);
    };
    const onMouseMove = (event) => {
      const activePointerId = Number(activePointerIdRef.current);
      if (Number.isFinite(activePointerId)) return;
      onMove(event);
    };
    const onMouseUp = (event) => {
      const activePointerId = Number(activePointerIdRef.current);
      if (Number.isFinite(activePointerId)) return;
      onUp(event);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    if (doc) {
      doc.addEventListener("pointermove", onMove, true);
      doc.addEventListener("pointerup", onUp, true);
      doc.addEventListener("pointercancel", onUp, true);
      doc.addEventListener("mousemove", onMouseMove, true);
      doc.addEventListener("mouseup", onMouseUp, true);
    }
    if (root instanceof Element) {
      root.addEventListener("pointermove", onMove, true);
      root.addEventListener("pointerup", onUp, true);
      root.addEventListener("pointercancel", onUp, true);
      root.addEventListener("mousemove", onMouseMove, true);
      root.addEventListener("mouseup", onMouseUp, true);
    }
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (doc) {
        doc.removeEventListener("pointermove", onMove, true);
        doc.removeEventListener("pointerup", onUp, true);
        doc.removeEventListener("pointercancel", onUp, true);
        doc.removeEventListener("mousemove", onMouseMove, true);
        doc.removeEventListener("mouseup", onMouseUp, true);
      }
      if (root instanceof Element) {
        root.removeEventListener("pointermove", onMove, true);
        root.removeEventListener("pointerup", onUp, true);
        root.removeEventListener("pointercancel", onUp, true);
        root.removeEventListener("mousemove", onMouseMove, true);
        root.removeEventListener("mouseup", onMouseUp, true);
      }
      if (moveRafRef.current && typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(moveRafRef.current);
        moveRafRef.current = 0;
      }
      pendingPointRef.current = null;
      activePointerIdRef.current = null;
      captureTargetRef.current = null;
      dragRef.current = null;
      draftTransformRef.current = null;
    };
  }, [finishDrag, screenToDiagram]);

  const canEditSelectedId = useCallback((elementIdRaw) => {
    const flags = resolveDrawioElementFlags(meta, layerMap, elementMap, elementIdRaw);
    return flags.editable;
  }, [elementMap, layerMap, meta]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!hasRenderable) return;
      if (editableTarget(event.target)) return;
      const key = String(event?.key || "");
      const activeId = String(selectedIdRef.current || "").trim();
      if (!activeId) return;
      const selectedEditable = canEditSelectedId(activeId);
      if (key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown") {
        if (!selectedEditable) return;
        const step = event.shiftKey ? 24 : 12;
        const baseX = toNumber(asObject(meta.transform).x, 0);
        const baseY = toNumber(asObject(meta.transform).y, 0);
        const dx = key === "ArrowRight" ? step : key === "ArrowLeft" ? -step : 0;
        const dy = key === "ArrowDown" ? step : key === "ArrowUp" ? -step : 0;
        onCommitTransform?.({ x: baseX + dx, y: baseY + dy });
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (key !== "Delete" && key !== "Backspace") return;
      if (!selectedEditable) return;
      const handled = onDeleteElement?.(activeId);
      if (!handled) return;
      event.preventDefault();
      event.stopPropagation();
      selectedIdRef.current = "";
      setSelectedId("");
      onSelectionChange?.("");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canEditSelectedId, editableTarget, hasRenderable, meta.transform, onCommitTransform, onDeleteElement, onSelectionChange]);

  const startDragByElementId = useCallback((event, elementIdRaw) => {
    const elementId = String(elementIdRaw || "").trim();
    if (!elementId) return;
    const flags = resolveDrawioElementFlags(meta, layerMap, elementMap, elementId);
    if (!visible || !hasRenderable || !flags.visible) return;
    selectedIdRef.current = elementId;
    setSelectedId(elementId);
    onSelectionChange?.(elementId);
    event.preventDefault();
    event.stopPropagation();
    if (!flags.editable) return;
    const point = typeof screenToDiagram === "function"
      ? screenToDiagram(Number(event?.clientX || 0), Number(event?.clientY || 0))
      : null;
    if (!point) return;
    dragRef.current = {
      id: elementId,
      pointerId: Number(event?.pointerId || 0),
      startX: Number(point.x || 0),
      startY: Number(point.y || 0),
      baseTx: toNumber(asObject(meta.transform).x, 0),
      baseTy: toNumber(asObject(meta.transform).y, 0),
    };
    const pointerId = Number(event?.pointerId);
    activePointerIdRef.current = Number.isFinite(pointerId) ? pointerId : null;
    const captureTarget = event?.target && typeof event.target.setPointerCapture === "function"
      ? event.target
      : (rootRef.current && typeof rootRef.current.setPointerCapture === "function" ? rootRef.current : null);
    if (captureTarget && Number.isFinite(pointerId)) {
      try {
        captureTarget.setPointerCapture(pointerId);
        captureTargetRef.current = captureTarget;
      } catch {
        captureTargetRef.current = null;
      }
    } else {
      captureTargetRef.current = null;
    }
    setDraftTransform({
      x: toNumber(asObject(meta.transform).x, 0),
      y: toNumber(asObject(meta.transform).y, 0),
    });
    draftTransformRef.current = {
      x: toNumber(asObject(meta.transform).x, 0),
      y: toNumber(asObject(meta.transform).y, 0),
    };
  }, [elementMap, hasRenderable, layerMap, meta, onSelectionChange, screenToDiagram, visible]);

  useEffect(() => {
    const root = rootRef.current;
    if (!(root instanceof Element) || !hasRenderable) return undefined;
    const onPointerDown = (event) => {
      const target = event?.target instanceof Element ? event.target : null;
      if (!target) return;
      const hitNode = target.closest?.("[data-drawio-el-id]");
      const hitId = toText(hitNode?.getAttribute?.("data-drawio-el-id"));
      if (hitId && root.contains(hitNode)) {
        startDragByElementId(event, hitId);
        return;
      }
      if (!selectedIdRef.current) return;
      selectedIdRef.current = "";
      setSelectedId("");
      onSelectionChange?.("");
    };
    root.addEventListener("pointerdown", onPointerDown, true);
    root.addEventListener("mousedown", onPointerDown, true);
    return () => {
      root.removeEventListener("pointerdown", onPointerDown, true);
      root.removeEventListener("mousedown", onPointerDown, true);
    };
  }, [hasRenderable, onSelectionChange, startDragByElementId]);

  const txEffective = toNumber(asObject(draftTransform).x, tx);
  const tyEffective = toNumber(asObject(draftTransform).y, ty);

  if (!hasRenderable) return null;

  return (
    <div
      className="drawioLayerOverlay absolute inset-0 overflow-hidden"
      style={{ pointerEvents: "none", zIndex: 5 }}
      data-testid="drawio-overlay-root"
      ref={rootRef}
    >
      <div
        className="drawioLayerOverlay absolute inset-0 overflow-hidden"
        style={{ pointerEvents: "none" }}
      data-testid="drawio-overlay"
      >
        <svg
          className="drawioLayerOverlaySvg"
          data-testid="drawio-overlay-svg"
          style={{ position: "absolute", left: 0, top: 0, opacity, pointerEvents: "visiblePainted" }}
          width="100%"
          height="100%"
        >
          <g transform={`matrix(${a},${b},${c},${d},${e},${f}) translate(${txEffective},${tyEffective})`}>
            <g dangerouslySetInnerHTML={{ __html: renderedBody }} />
          </g>
        </svg>
      </div>
    </div>
  );
}

function num(valueRaw, fallback = 0) {
  const value = Number(valueRaw);
  return Number.isFinite(value) ? value : fallback;
}

function areEqual(prevProps, nextProps) {
  if (!!prevProps.visible !== !!nextProps.visible) return false;
  const prevMeta = asObject(prevProps.drawioMeta);
  const nextMeta = asObject(nextProps.drawioMeta);
  const prevMatrix = asObject(prevProps.overlayMatrix);
  const nextMatrix = asObject(nextProps.overlayMatrix);
  if (toNumber(prevMeta.opacity, 1) !== toNumber(nextMeta.opacity, 1)) return false;
  if (toNumber(asObject(prevMeta.transform).x, 0) !== toNumber(asObject(nextMeta.transform).x, 0)) return false;
  if (toNumber(asObject(prevMeta.transform).y, 0) !== toNumber(asObject(nextMeta.transform).y, 0)) return false;
  if (String(prevMeta.svg_cache || "") !== String(nextMeta.svg_cache || "")) return false;
  if (String(JSON.stringify(asArray(prevMeta.drawio_layers_v1) || [])) !== String(JSON.stringify(asArray(nextMeta.drawio_layers_v1) || []))) return false;
  if (String(JSON.stringify(asArray(prevMeta.drawio_elements_v1) || [])) !== String(JSON.stringify(asArray(nextMeta.drawio_elements_v1) || []))) return false;
  if (num(prevMatrix.a, 1) !== num(nextMatrix.a, 1)) return false;
  if (num(prevMatrix.b, 0) !== num(nextMatrix.b, 0)) return false;
  if (num(prevMatrix.c, 0) !== num(nextMatrix.c, 0)) return false;
  if (num(prevMatrix.d, 1) !== num(nextMatrix.d, 1)) return false;
  if (num(prevMatrix.e, 0) !== num(nextMatrix.e, 0)) return false;
  if (num(prevMatrix.f, 0) !== num(nextMatrix.f, 0)) return false;
  return true;
}

export default memo(DrawioOverlayRenderer, areEqual);
