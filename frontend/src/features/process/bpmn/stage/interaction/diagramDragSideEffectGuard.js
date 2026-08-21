/**
 * DiagramDragSideEffectGuard
 *
 * Central drag-in-progress ref management and gating helpers.
 * Used by wireBpmnStageRuntimeEvents to skip heavy React-side work
 * during active canvas or element drag.
 */

export function createDragSideEffectGuardRef() {
  return { current: { dragInProgress: false } };
}

export function isDragInProgress(contextMenuInteractionRef) {
  return !!contextMenuInteractionRef?.current?.dragInProgress;
}

export function shouldSuppressSideEffectsDuringDrag(contextMenuInteractionRef) {
  return isDragInProgress(contextMenuInteractionRef);
}

/**
 * Check if the diagram-js MoveCanvas pan tool is actively panning.
 * MoveCanvas does NOT fire drag.start/drag.cleanup events, so it bypasses
 * the regular isDragInProgress guard.  This helper reads the internal
 * moveCanvas context directly (isActive is a public API on the service).
 */
export function isCanvasPanningActive(inst) {
  if (!inst) return false;
  try {
    const moveCanvas = inst.get("moveCanvas");
    return typeof moveCanvas?.isActive === "function" && moveCanvas.isActive() === true;
  } catch {
    return false;
  }
}
