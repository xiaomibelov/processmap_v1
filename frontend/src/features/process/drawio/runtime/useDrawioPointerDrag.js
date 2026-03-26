import { useCallback, useRef } from "react";
import {
  asObject,
} from "./drawioOverlayState.js";
import {
  bumpDrawioPerfCounter,
  markDrawioPerf,
  traceDrawioRuntime,
} from "./drawioRuntimeProbes.js";
import useDrawioPointerStartBinding from "./useDrawioPointerStartBinding.js";
import useDrawioDragWindowLifecycle from "./useDrawioDragWindowLifecycle.js";
import {
  normalizeElementId,
  applyPreviewNodeTransform,
  resolvePreviewNode,
  isPointerLikeEvent,
  shouldIgnoreDragMoveEvent,
  shouldIgnoreDragUpEvent,
  computeDraftOffsetFromPoint,
  computeDragCommitPayload,
  canStartDrawioDrag,
  bindPointerDragListeners,
} from "./drawioPointerDragCore.js";
import {
  acquireDragPointerCapture,
  buildDragStartState,
  releaseDragPointerCapture,
  resetDragPreviewState,
  resolveDragPreviewState,
} from "./drawioPointerDragSession.js";

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
  // metaRef lets handleStart read current meta without re-binding listeners on tool switch.
  const metaRef = useRef(meta);
  metaRef.current = meta;
  // screenToDiagramRef lets finishDrag + lifecycle read current screenToDiagram
  // without adding it to effect/callback deps — drag window listeners stay bound
  // across parent re-renders that produce a new screenToDiagram function identity.
  const screenToDiagramRef = useRef(screenToDiagram);
  screenToDiagramRef.current = screenToDiagram;
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
    releaseDragPointerCapture({
      captureTargetRaw: captureTargetRef.current,
      activePointerIdRaw: activePointerId,
    });
    activePointerIdRef.current = null;
    sawPointerMoveRef.current = false;
    captureTargetRef.current = null;
    dragRef.current = null;
    const previewReset = resetDragPreviewState({
      previewNodeRaw: previewNodeRef.current,
      previewBaseTransformRaw: previewBaseTransformRef.current,
    });
    previewNodeRef.current = previewReset.previewNode;
    previewBaseTransformRef.current = previewReset.previewBaseTransform;
    previewOffsetRef.current = previewReset.previewOffset;
    if (moveRafRef.current && typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(moveRafRef.current);
      moveRafRef.current = 0;
    }
    const activeDraftOffset = asObject(draftOffsetRef.current);
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
      screenToDiagram: screenToDiagramRef.current,
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
  }, [matrixScaleRef, onCommitMove, screenToDiagramRef]);

  useDrawioDragWindowLifecycle({
    rootRef,
    screenToDiagramRef,
    finishDrag,
    draftOffsetRef,
    dragRef,
    activePointerIdRef,
    sawPointerMoveRef,
    captureTargetRef,
    moveRafRef,
    pendingPointRef,
    previewNodeRef,
    previewBaseTransformRef,
    previewOffsetRef,
    lastRafAtRef,
  });

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
    const startState = buildDragStartState({
      eventRaw: event,
      elementIdRaw: elementId,
      elementStateRaw: elementMap.get(elementId),
      screenToDiagram: screenToDiagramRef.current,
    });
    if (!startState) {
      traceDrawioRuntime("drawio_drag_start_skip", {
        reason: "point_unavailable",
        elementId,
      });
      return;
    }
    dragRef.current = startState.dragState;
    bumpDrawioPerfCounter("drawio.drag.starts");
    markDrawioPerf("drawio.drag.active", true);
    markDrawioPerf("drawio.drag.lastStartAt", Date.now());
    const previewState = resolveDragPreviewState({
      eventTargetRaw: event?.target,
      rootRaw: rootRef.current,
      elementIdRaw: elementId,
    });
    previewNodeRef.current = previewState.previewNode;
    previewBaseTransformRef.current = previewState.previewBaseTransform;
    previewOffsetRef.current = previewState.previewOffset;
    const pointerId = Number(event?.pointerId);
    activePointerIdRef.current = Number.isFinite(pointerId) ? pointerId : null;
    sawPointerMoveRef.current = false;
    captureTargetRef.current = acquireDragPointerCapture({
      eventTargetRaw: event?.target,
      rootRaw: rootRef.current,
      pointerIdRaw: pointerId,
    });
    applyPreviewNodeTransform({
      node: previewNodeRef.current,
      baseTransformRaw: previewBaseTransformRef.current,
      deltaXRaw: 0,
      deltaYRaw: 0,
    });
    draftOffsetRef.current = startState.draftOffset;
  }, [
    canEditElement,
    canInteractWithElement,
    elementMap,
    hasRenderable,
    rootRef,
    screenToDiagramRef,
    selectElement,
    visible,
  ]);

  useDrawioPointerStartBinding({
    rootRef,
    hasRenderable,
    metaRef,
    layerMap,
    elementMap,
    dragRef,
    screenToDiagramRef,
    onCreateElement,
    selectedIdRef,
    selectElement,
    clearSelection,
    startDragByElementId,
  });

  return {
    draftOffset: draftOffsetRef.current,
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
