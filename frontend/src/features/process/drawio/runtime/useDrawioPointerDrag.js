import { useCallback, useEffect, useRef, useState } from "react";
import {
  asObject,
  collectDrawioElementIdsFromTarget,
  resolveDrawioPointerElementId,
  toNumber,
} from "./drawioOverlayState.js";
import {
  bumpDrawioPerfCounter,
  markDrawioPerf,
  recordDrawioPerfSample,
  traceDrawioRuntime,
} from "./drawioRuntimeProbes.js";
import { shouldBlockBpmnClickDrawioCreation } from "./drawioCreateGuard.js";

function normalizeElementId(valueRaw) {
  return String(valueRaw || "").trim();
}

function applyPreviewNodeTransform({
  node,
  baseTransformRaw,
  deltaXRaw,
  deltaYRaw,
}) {
  if (!(node instanceof Element)) return;
  const baseTransform = String(baseTransformRaw || "").trim();
  const deltaX = toNumber(deltaXRaw, 0);
  const deltaY = toNumber(deltaYRaw, 0);
  const hasDelta = Math.abs(deltaX) > 0.0001 || Math.abs(deltaY) > 0.0001;
  if (!hasDelta) {
    if (baseTransform) node.setAttribute("transform", baseTransform);
    else node.removeAttribute("transform");
    return;
  }
  const roundedX = Math.round(deltaX * 1000) / 1000;
  const roundedY = Math.round(deltaY * 1000) / 1000;
  const previewTransform = `translate(${String(roundedX)} ${String(roundedY)})`;
  node.setAttribute("transform", baseTransform ? `${baseTransform} ${previewTransform}` : previewTransform);
}

function resolvePreviewNode(targetRaw, rootRaw, elementIdRaw, nodeRegistryRaw) {
  const target = targetRaw instanceof Element ? targetRaw : null;
  const root = rootRaw instanceof Element ? rootRaw : null;
  const elementId = normalizeElementId(elementIdRaw);
  if (!root || !elementId) return null;
  // Fast path: O(1) registry lookup
  if (nodeRegistryRaw && typeof nodeRegistryRaw.get === "function") {
    const cached = nodeRegistryRaw.get(elementId);
    if (cached instanceof Element && root.contains(cached)) return cached;
  }
  // Walk up from event target (already in DOM, no scan needed)
  if (target) {
    let node = target;
    while (node instanceof Element) {
      if (!root.contains(node)) break;
      if (normalizeElementId(node.getAttribute("data-drawio-el-id") || node.getAttribute("id")) === elementId) {
        return node;
      }
      if (node === root) break;
      node = node.parentElement;
    }
  }
  // Last resort: single targeted querySelector (O(1) by id attribute)
  return root.querySelector?.(`[data-drawio-el-id="${CSS.escape(elementId)}"]`) ?? null;
}

function isPointerLikeEvent(eventTypeRaw, eventPointerIdRaw) {
  const eventType = String(eventTypeRaw || "");
  const eventPointerId = Number(eventPointerIdRaw);
  return eventType.startsWith("pointer") || Number.isFinite(eventPointerId);
}

function shouldIgnoreDragMoveEvent({
  activePointerIdRaw,
  eventPointerIdRaw,
  eventTypeRaw,
  sawPointerMove,
}) {
  const activePointerId = Number(activePointerIdRaw);
  const eventPointerId = Number(eventPointerIdRaw);
  const isPointerEvent = isPointerLikeEvent(eventTypeRaw, eventPointerId);
  if (isPointerEvent) {
    if (Number.isFinite(activePointerId) && Number.isFinite(eventPointerId) && activePointerId !== eventPointerId) {
      return "pointer_id_mismatch";
    }
    return "";
  }
  if (Number.isFinite(activePointerId) && sawPointerMove) {
    return "compat_mouse_while_pointer_active";
  }
  return "";
}

function shouldIgnoreDragUpEvent({
  activePointerIdRaw,
  eventPointerIdRaw,
  eventTypeRaw,
  sawPointerMove,
}) {
  const activePointerId = Number(activePointerIdRaw);
  const eventPointerId = Number(eventPointerIdRaw);
  const isPointerEvent = isPointerLikeEvent(eventTypeRaw, eventPointerId);
  if (isPointerEvent && Number.isFinite(activePointerId) && Number.isFinite(eventPointerId) && activePointerId !== eventPointerId) {
    return "pointer_id_mismatch";
  }
  if (!isPointerEvent && Number.isFinite(activePointerId) && sawPointerMove) {
    return "compat_mouseup_while_pointer_active";
  }
  return "";
}

function computeDraftOffsetFromPoint({
  dragStateRaw,
  pointRaw,
  screenToDiagram,
}) {
  const dragState = asObject(dragStateRaw);
  const point = asObject(pointRaw);
  if (!dragState.id || typeof screenToDiagram !== "function") return null;
  const current = screenToDiagram(Number(point.clientX || 0), Number(point.clientY || 0));
  if (!current) return null;
  const dx = Number(current.x || 0) - Number(dragState.startX || 0);
  const dy = Number(current.y || 0) - Number(dragState.startY || 0);
  return {
    id: dragState.id,
    offset_x: Number(dragState.baseOffsetX || 0) + dx,
    offset_y: Number(dragState.baseOffsetY || 0) + dy,
  };
}

function computeDragCommitPayload({
  dragStateRaw,
  draftOffsetRaw,
  finalEventRaw,
  pendingPointRaw,
  screenToDiagram,
  matrixScaleRaw,
}) {
  const dragState = asObject(dragStateRaw);
  if (!dragState.id) return null;
  const draftOffset = asObject(draftOffsetRaw);
  let nextOffsetX = toNumber(draftOffset.offset_x, Number(dragState.baseOffsetX || 0));
  let nextOffsetY = toNumber(draftOffset.offset_y, Number(dragState.baseOffsetY || 0));
  if (
    Math.abs(nextOffsetX - Number(dragState.baseOffsetX || 0)) < 0.01
    && Math.abs(nextOffsetY - Number(dragState.baseOffsetY || 0)) < 0.01
  ) {
    const finalEvent = asObject(finalEventRaw);
    const pendingPoint = asObject(pendingPointRaw);
    const finalClientX = Number.isFinite(Number(finalEvent.clientX))
      ? Number(finalEvent.clientX)
      : Number(pendingPoint.clientX || 0);
    const finalClientY = Number.isFinite(Number(finalEvent.clientY))
      ? Number(finalEvent.clientY)
      : Number(pendingPoint.clientY || 0);
    if (typeof screenToDiagram === "function") {
      const current = screenToDiagram(finalClientX, finalClientY);
      if (current && Number.isFinite(Number(current.x)) && Number.isFinite(Number(current.y))) {
        const dx = Number(current.x || 0) - Number(dragState.startX || 0);
        const dy = Number(current.y || 0) - Number(dragState.startY || 0);
        nextOffsetX = Number(dragState.baseOffsetX || 0) + dx;
        nextOffsetY = Number(dragState.baseOffsetY || 0) + dy;
      }
    }
    if (
      Math.abs(nextOffsetX - Number(dragState.baseOffsetX || 0)) < 0.01
      && Math.abs(nextOffsetY - Number(dragState.baseOffsetY || 0)) < 0.01
    ) {
      const scale = Math.max(0.0001, Number(matrixScaleRaw || 1));
      const dxScreen = finalClientX - Number(dragState.startClientX || 0);
      const dyScreen = finalClientY - Number(dragState.startClientY || 0);
      nextOffsetX = Number(dragState.baseOffsetX || 0) + (dxScreen / scale);
      nextOffsetY = Number(dragState.baseOffsetY || 0) + (dyScreen / scale);
    }
  }
  if (
    Math.abs(nextOffsetX - Number(dragState.baseOffsetX || 0)) < 0.01
    && Math.abs(nextOffsetY - Number(dragState.baseOffsetY || 0)) < 0.01
  ) return null;
  return {
    id: dragState.id,
    offsetX: nextOffsetX,
    offsetY: nextOffsetY,
  };
}

function canStartDrawioDrag({
  visible,
  hasRenderable,
  elementIdRaw,
  canInteractWithElement,
}) {
  const elementId = normalizeElementId(elementIdRaw);
  if (!visible || !hasRenderable || !elementId) return false;
  return !!canInteractWithElement?.(elementId);
}

function bindPointerDragListeners({
  windowTarget,
  onMove,
  onUp,
  onMouseMove,
  onMouseUp,
}) {
  const win = windowTarget || null;
  // window bubble listeners only — setPointerCapture makes doc/root capture redundant.
  win?.addEventListener?.("pointermove", onMove);
  win?.addEventListener?.("pointerup", onUp);
  win?.addEventListener?.("pointercancel", onUp);
  win?.addEventListener?.("mousemove", onMouseMove);
  win?.addEventListener?.("mouseup", onMouseUp);
  return () => {
    win?.removeEventListener?.("pointermove", onMove);
    win?.removeEventListener?.("pointerup", onUp);
    win?.removeEventListener?.("pointercancel", onUp);
    win?.removeEventListener?.("mousemove", onMouseMove);
    win?.removeEventListener?.("mouseup", onMouseUp);
  };
}

export default function useDrawioPointerDrag({
  rootRef,
  hasRenderable,
  visible,
  meta,
  layerMap,
  elementMap,
  matrixScaleRef,
  screenToDiagram,
  canInteractWithElement,
  canEditElement,
  selectElement,
  clearSelection,
  selectedIdRef,
  onCommitMove,
  onCreateElement,
}) {
  bumpDrawioPerfCounter("drawio.drag.hook.renders");
  const [draftOffset, setDraftOffset] = useState(null);
  const draftOffsetRef = useRef(null);
  const dragRef = useRef(null);
  const activePointerIdRef = useRef(null);
  const sawPointerMoveRef = useRef(false);
  const captureTargetRef = useRef(null);
  const moveRafRef = useRef(0);
  const pendingPointRef = useRef(null);
  const previewNodeRef = useRef(null);
  const previewBaseTransformRef = useRef("");
  const previewOffsetRef = useRef({ x: Number.NaN, y: Number.NaN });
  const lastRafAtRef = useRef(Number.NaN);

  const finishDrag = useCallback((shouldCommit = true, finalEventRaw = null) => {
    bumpDrawioPerfCounter("drawio.drag.finish.calls");
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
    sawPointerMoveRef.current = false;
    captureTargetRef.current = null;
    dragRef.current = null;
    applyPreviewNodeTransform({
      node: previewNodeRef.current,
      baseTransformRaw: previewBaseTransformRef.current,
      deltaXRaw: 0,
      deltaYRaw: 0,
    });
    previewNodeRef.current = null;
    previewBaseTransformRef.current = "";
    previewOffsetRef.current = { x: Number.NaN, y: Number.NaN };
    if (moveRafRef.current && typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(moveRafRef.current);
      moveRafRef.current = 0;
    }
    const activeDraftOffset = asObject(draftOffsetRef.current);
    bumpDrawioPerfCounter("drawio.drag.state.setDraftOffset");
    setDraftOffset(null);
    draftOffsetRef.current = null;
    markDrawioPerf("drawio.drag.active", false);
    markDrawioPerf("drawio.drag.lastFinishAt", Date.now());
    if (!shouldCommit) {
      traceDrawioRuntime("drawio_drag_finish_skip_commit", {
        reason: "commit_disabled",
      });
      return;
    }
    if (!state.id) {
      traceDrawioRuntime("drawio_drag_finish_skip_commit", {
        reason: "missing_drag_state",
      });
      return;
    }
    const commitPayload = computeDragCommitPayload({
      dragStateRaw: state,
      draftOffsetRaw: activeDraftOffset,
      finalEventRaw,
      pendingPointRaw: pendingPointRef.current,
      screenToDiagram,
      matrixScaleRaw: matrixScaleRef.current,
    });
    pendingPointRef.current = null;
    if (!commitPayload) {
      traceDrawioRuntime("drawio_drag_finish_skip_commit", {
        reason: "no_delta",
        id: state.id,
      });
      return;
    }
    traceDrawioRuntime("drawio_drag_commit", {
      id: commitPayload.id,
      nextOffsetX: Number(commitPayload.offsetX || 0),
      nextOffsetY: Number(commitPayload.offsetY || 0),
    });
    bumpDrawioPerfCounter("drawio.drag.commit.calls");
    markDrawioPerf("drawio.drag.lastCommitAt", Date.now());
    onCommitMove?.(commitPayload);
  }, [matrixScaleRef, onCommitMove, screenToDiagram]);

  useEffect(() => {
    const root = rootRef.current;
    const onMove = (event) => {
      bumpDrawioPerfCounter("drawio.drag.move.events");
      const state = asObject(dragRef.current);
      if (!state.id) return;
      const activePointerId = Number(activePointerIdRef.current);
      const eventPointerId = Number(event?.pointerId);
      const eventType = String(event?.type || "");
      const isPointerEvent = isPointerLikeEvent(eventType, eventPointerId);
      traceDrawioRuntime("drawio_drag_move_event", {
        id: state.id,
        eventType,
        activePointerId,
        eventPointerId,
        isPointerEvent,
      });
      const ignoreReason = shouldIgnoreDragMoveEvent({
        activePointerIdRaw: activePointerId,
        eventPointerIdRaw: eventPointerId,
        eventTypeRaw: eventType,
        sawPointerMove: sawPointerMoveRef.current,
      });
      if (ignoreReason) {
        traceDrawioRuntime("drawio_drag_move_skip", {
          reason: ignoreReason,
          id: state.id,
          activePointerId,
          eventPointerId,
        });
        return;
      }
      if (isPointerEvent) sawPointerMoveRef.current = true;
      pendingPointRef.current = {
        clientX: Number(event?.clientX || 0),
        clientY: Number(event?.clientY || 0),
        capturedAt: typeof performance !== "undefined" ? performance.now() : Date.now(),
      };
      if (moveRafRef.current) return;
      const scheduleFrame = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (fn) => setTimeout(fn, 16);
      moveRafRef.current = scheduleFrame(() => {
        const rafStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
        const prevRafAt = Number(lastRafAtRef.current || NaN);
        if (Number.isFinite(prevRafAt)) {
          const rafDeltaMs = rafStartedAt - prevRafAt;
          recordDrawioPerfSample("drawio.drag.rafDeltaMs", rafDeltaMs);
          if (Number(rafDeltaMs || 0) > 16.7) {
            bumpDrawioPerfCounter("drawio.drag.rafDelta.overBudget");
          }
        }
        lastRafAtRef.current = rafStartedAt;
        moveRafRef.current = 0;
        bumpDrawioPerfCounter("drawio.drag.move.rafTicks");
        const capturedAt = Number(asObject(pendingPointRef.current).capturedAt || NaN);
        if (Number.isFinite(capturedAt)) {
          recordDrawioPerfSample("drawio.drag.rafLatencyMs", rafStartedAt - capturedAt);
        }
        const nextDraft = computeDraftOffsetFromPoint({
          dragStateRaw: state,
          pointRaw: pendingPointRef.current,
          screenToDiagram,
        });
        pendingPointRef.current = null;
        if (!nextDraft) return;
        traceDrawioRuntime("drawio_drag_move", {
          id: state.id,
          nextOffsetX: Number(nextDraft.offset_x || 0),
          nextOffsetY: Number(nextDraft.offset_y || 0),
        });
        const stateForPreview = asObject(dragRef.current);
        const deltaX = toNumber(nextDraft.offset_x, 0) - toNumber(stateForPreview.baseOffsetX, 0);
        const deltaY = toNumber(nextDraft.offset_y, 0) - toNumber(stateForPreview.baseOffsetY, 0);
        const prevX = toNumber(previewOffsetRef.current.x, Number.NaN);
        const prevY = toNumber(previewOffsetRef.current.y, Number.NaN);
        const changed = !Number.isFinite(prevX) || !Number.isFinite(prevY)
          || Math.abs(deltaX - prevX) > 0.02
          || Math.abs(deltaY - prevY) > 0.02;
        if (changed) {
          const root = rootRef.current;
          if (!(previewNodeRef.current instanceof Element) || !(root instanceof Element) || !root.contains(previewNodeRef.current)) {
            const liveNode = resolvePreviewNode(root, root, String(stateForPreview.id || ""), null);
            previewNodeRef.current = liveNode;
            previewBaseTransformRef.current = liveNode instanceof Element
              ? String(liveNode.getAttribute("transform") || "").trim()
              : "";
          }
          applyPreviewNodeTransform({
            node: previewNodeRef.current,
            baseTransformRaw: previewBaseTransformRef.current,
            deltaXRaw: deltaX,
            deltaYRaw: deltaY,
          });
          bumpDrawioPerfCounter("drawio.drag.previewTransform.applies");
          previewOffsetRef.current = { x: deltaX, y: deltaY };
        }
        draftOffsetRef.current = nextDraft;
        bumpDrawioPerfCounter("drawio.drag.draftRef.updates");
        const rafFinishedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
        recordDrawioPerfSample("drawio.drag.rafWorkMs", rafFinishedAt - rafStartedAt);
      });
    };
    const onUp = (event) => {
      const state = asObject(dragRef.current);
      if (!state.id) return;
      const activePointerId = Number(activePointerIdRef.current);
      const eventPointerId = Number(event?.pointerId);
      const eventType = String(event?.type || "");
      const isPointerEvent = isPointerLikeEvent(eventType, eventPointerId);
      traceDrawioRuntime("drawio_drag_up_event", {
        id: state.id,
        eventType,
        activePointerId,
        eventPointerId,
        isPointerEvent,
      });
      const ignoreReason = shouldIgnoreDragUpEvent({
        activePointerIdRaw: activePointerId,
        eventPointerIdRaw: eventPointerId,
        eventTypeRaw: eventType,
        sawPointerMove: sawPointerMoveRef.current,
      });
      if (ignoreReason) {
        traceDrawioRuntime("drawio_drag_up_skip", {
          reason: ignoreReason,
          id: state.id,
          activePointerId,
          eventPointerId,
        });
        return;
      }
      finishDrag(true, event);
    };
    const onMouseMove = (event) => {
      const state = asObject(dragRef.current);
      if (!state.id) return;
      onMove(event);
    };
    const onMouseUp = (event) => {
      const state = asObject(dragRef.current);
      if (!state.id) return;
      onUp(event);
    };
    const unbind = bindPointerDragListeners({
      windowTarget: typeof window !== "undefined" ? window : null,
      onMove,
      onUp,
      onMouseMove,
      onMouseUp,
    });
    return () => {
      unbind();
      if (moveRafRef.current && typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(moveRafRef.current);
        moveRafRef.current = 0;
      }
      pendingPointRef.current = null;
      activePointerIdRef.current = null;
      sawPointerMoveRef.current = false;
      captureTargetRef.current = null;
      dragRef.current = null;
      applyPreviewNodeTransform({
        node: previewNodeRef.current,
        baseTransformRaw: previewBaseTransformRef.current,
        deltaXRaw: 0,
        deltaYRaw: 0,
      });
      previewNodeRef.current = null;
      previewBaseTransformRef.current = "";
      previewOffsetRef.current = { x: Number.NaN, y: Number.NaN };
      draftOffsetRef.current = null;
      lastRafAtRef.current = Number.NaN;
      markDrawioPerf("drawio.drag.active", false);
      markDrawioPerf("drawio.drag.cleanupAt", Date.now());
    };
  }, [finishDrag, rootRef, screenToDiagram]);

  const startDragByElementId = useCallback((event, elementIdRaw) => {
    const elementId = normalizeElementId(elementIdRaw);
    if (!canStartDrawioDrag({
      visible,
      hasRenderable,
      elementIdRaw: elementId,
      canInteractWithElement,
    })) return;
    const editableElement = canEditElement(elementId);
    traceDrawioRuntime("drawio_select_start", {
      elementId,
      editable: !!editableElement,
      visible: true,
    });
    if (!editableElement) return;
    selectElement(elementId);
    event.preventDefault();
    event.stopPropagation();
    const point = typeof screenToDiagram === "function"
      ? screenToDiagram(Number(event?.clientX || 0), Number(event?.clientY || 0))
      : null;
    if (!point) {
      traceDrawioRuntime("drawio_drag_start_skip", {
        reason: "point_unavailable",
        elementId,
      });
      return;
    }
    const elementState = asObject(elementMap.get(elementId));
    dragRef.current = {
      id: elementId,
      pointerId: Number(event?.pointerId || 0),
      startX: Number(point.x || 0),
      startY: Number(point.y || 0),
      startClientX: Number(event?.clientX || 0),
      startClientY: Number(event?.clientY || 0),
      baseOffsetX: toNumber(elementState.offset_x, 0),
      baseOffsetY: toNumber(elementState.offset_y, 0),
    };
    bumpDrawioPerfCounter("drawio.drag.starts");
    markDrawioPerf("drawio.drag.active", true);
    markDrawioPerf("drawio.drag.lastStartAt", Date.now());
    const previewNode = resolvePreviewNode(event?.target, rootRef.current, elementId, null);
    previewNodeRef.current = previewNode;
    previewBaseTransformRef.current = previewNode instanceof Element ? String(previewNode.getAttribute("transform") || "").trim() : "";
    previewOffsetRef.current = { x: 0, y: 0 };
    const pointerId = Number(event?.pointerId);
    activePointerIdRef.current = Number.isFinite(pointerId) ? pointerId : null;
    sawPointerMoveRef.current = false;
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
    const nextDraftOffset = {
      id: elementId,
      offset_x: toNumber(elementState.offset_x, 0),
      offset_y: toNumber(elementState.offset_y, 0),
    };
    applyPreviewNodeTransform({
      node: previewNodeRef.current,
      baseTransformRaw: previewBaseTransformRef.current,
      deltaXRaw: 0,
      deltaYRaw: 0,
    });
    bumpDrawioPerfCounter("drawio.drag.state.setDraftOffset");
    setDraftOffset(nextDraftOffset);
    draftOffsetRef.current = nextDraftOffset;
  }, [
    canEditElement,
    canInteractWithElement,
    elementMap,
    hasRenderable,
    rootRef,
    screenToDiagram,
    selectElement,
    visible,
  ]);

  useEffect(() => {
    const root = rootRef.current;
    if (!(root instanceof Element) || !hasRenderable) return undefined;
    const handleStart = (event) => {
      const target = event?.target instanceof Element ? event.target : null;
      if (!target) return;
      // Skip resize handles — they have their own drag logic
      if (target.dataset?.drawioResizeHandle) return;
      const idChain = collectDrawioElementIdsFromTarget(target, root);
      const hitId = resolveDrawioPointerElementId(target, root, meta, layerMap, elementMap);
      traceDrawioRuntime("drawio_pointerdown", {
        hitId,
        idChain,
        pointerId: Number(event?.pointerId ?? NaN),
      });
      if (hitId) {
        startDragByElementId(event, hitId);
        return;
      }
      const blockCreate = shouldBlockBpmnClickDrawioCreation({
        enabled: meta?.enabled === true,
        locked: meta?.locked === true,
        interactionMode: meta?.interaction_mode,
        toolId: meta?.active_tool,
      });
      if (!blockCreate) {
        const point = typeof screenToDiagram === "function"
          ? screenToDiagram(Number(event?.clientX || 0), Number(event?.clientY || 0))
          : null;
        if (point && typeof onCreateElement === "function") {
          event.preventDefault();
          event.stopPropagation();
          const createdId = normalizeElementId(onCreateElement({
            toolId: String(meta?.active_tool || ""),
            x: Number(point.x || 0),
            y: Number(point.y || 0),
          }) || "");
          traceDrawioRuntime("drawio_runtime_create_attempt", {
            mode: String(meta?.interaction_mode || ""),
            toolId: String(meta?.active_tool || ""),
            x: Number(point.x || 0),
            y: Number(point.y || 0),
            createdId,
          });
          if (createdId) {
            selectElement(createdId, "runtime_create");
            return;
          }
        }
        traceDrawioRuntime("drawio_create_path_allowed_but_create_failed", {
          mode: String(meta?.interaction_mode || ""),
          toolId: String(meta?.active_tool || ""),
        });
      }
      if (!selectedIdRef.current) return;
      clearSelection("pointer_clear");
    };
    const onPointerDown = (event) => {
      handleStart(event);
    };
    const onMouseDown = (event) => {
      const state = asObject(dragRef.current);
      if (state.id) return;
      handleStart(event);
    };
    root.addEventListener("pointerdown", onPointerDown, true);
    root.addEventListener("mousedown", onMouseDown, true);
    return () => {
      root.removeEventListener("pointerdown", onPointerDown, true);
      root.removeEventListener("mousedown", onMouseDown, true);
    };
  }, [
    clearSelection,
    elementMap,
    hasRenderable,
    layerMap,
    meta,
    onCreateElement,
    rootRef,
    screenToDiagram,
    selectedIdRef,
    selectElement,
    startDragByElementId,
  ]);

  return {
    draftOffset,
  };
}

export {
  normalizeElementId,
  resolvePreviewNode,
  applyPreviewNodeTransform,
  isPointerLikeEvent,
  shouldIgnoreDragMoveEvent,
  shouldIgnoreDragUpEvent,
  computeDraftOffsetFromPoint,
  computeDragCommitPayload,
  canStartDrawioDrag,
  bindPointerDragListeners,
};
