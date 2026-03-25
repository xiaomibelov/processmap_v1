import { useEffect } from "react";

import {
  asObject,
  toNumber,
} from "./drawioOverlayState.js";
import {
  bumpDrawioPerfCounter,
  markDrawioPerf,
  recordDrawioPerfSample,
  traceDrawioRuntime,
} from "./drawioRuntimeProbes.js";
import {
  applyPreviewNodeTransform,
  bindPointerDragListeners,
  computeDraftOffsetFromPoint,
  isPointerLikeEvent,
  resolvePreviewNode,
  shouldIgnoreDragMoveEvent,
  shouldIgnoreDragUpEvent,
} from "./drawioPointerDragCore.js";
import { resetDragPreviewState } from "./drawioPointerDragSession.js";

export default function useDrawioDragWindowLifecycle({
  rootRef,
  screenToDiagram,
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
}) {
  useEffect(() => {
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
        const prevRafAt = Number(lastRafAtRef.current || Number.NaN);
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
        const capturedAt = Number(asObject(pendingPointRef.current).capturedAt || Number.NaN);
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
      const previewReset = resetDragPreviewState({
        previewNodeRaw: previewNodeRef.current,
        previewBaseTransformRaw: previewBaseTransformRef.current,
      });
      previewNodeRef.current = previewReset.previewNode;
      previewBaseTransformRef.current = previewReset.previewBaseTransform;
      previewOffsetRef.current = previewReset.previewOffset;
      draftOffsetRef.current = null;
      lastRafAtRef.current = Number.NaN;
      markDrawioPerf("drawio.drag.active", false);
      markDrawioPerf("drawio.drag.cleanupAt", Date.now());
    };
  }, [
    activePointerIdRef,
    captureTargetRef,
    draftOffsetRef,
    dragRef,
    finishDrag,
    lastRafAtRef,
    moveRafRef,
    pendingPointRef,
    previewBaseTransformRef,
    previewNodeRef,
    previewOffsetRef,
    rootRef,
    sawPointerMoveRef,
    screenToDiagram,
  ]);
}
