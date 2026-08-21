import {
  asObject,
  toNumber,
} from "./drawioOverlayState.js";
import {
  applyPreviewNodeTransform,
  normalizeElementId,
  resolvePreviewNode,
} from "./drawioPointerDragCore.js";

function buildDragStartState({
  eventRaw,
  elementIdRaw,
  elementStateRaw,
  screenToDiagram,
}) {
  const elementId = normalizeElementId(elementIdRaw);
  if (!elementId || typeof screenToDiagram !== "function") return null;
  const point = screenToDiagram(
    Number(eventRaw?.clientX || 0),
    Number(eventRaw?.clientY || 0),
  );
  if (!point) return null;
  const elementState = asObject(elementStateRaw);
  return {
    dragState: {
      id: elementId,
      pointerId: Number(eventRaw?.pointerId || 0),
      startX: Number(point.x || 0),
      startY: Number(point.y || 0),
      startClientX: Number(eventRaw?.clientX || 0),
      startClientY: Number(eventRaw?.clientY || 0),
      baseOffsetX: toNumber(elementState.offset_x, 0),
      baseOffsetY: toNumber(elementState.offset_y, 0),
    },
    draftOffset: {
      id: elementId,
      offset_x: toNumber(elementState.offset_x, 0),
      offset_y: toNumber(elementState.offset_y, 0),
    },
  };
}

function resolveDragPreviewState({
  eventTargetRaw,
  rootRaw,
  elementIdRaw,
}) {
  const previewNode = resolvePreviewNode(eventTargetRaw, rootRaw, elementIdRaw, null);
  return {
    previewNode,
    previewBaseTransform: previewNode instanceof Element
      ? String(previewNode.getAttribute("transform") || "").trim()
      : "",
    previewOffset: { x: 0, y: 0 },
  };
}

function acquireDragPointerCapture({
  eventTargetRaw,
  rootRaw,
  pointerIdRaw,
}) {
  const pointerId = Number(pointerIdRaw);
  if (!Number.isFinite(pointerId)) return null;
  const captureTarget = eventTargetRaw && typeof eventTargetRaw.setPointerCapture === "function"
    ? eventTargetRaw
    : (rootRaw && typeof rootRaw.setPointerCapture === "function" ? rootRaw : null);
  if (!captureTarget) return null;
  try {
    captureTarget.setPointerCapture(pointerId);
    return captureTarget;
  } catch {
    return null;
  }
}

function releaseDragPointerCapture({
  captureTargetRaw,
  activePointerIdRaw,
}) {
  const captureTarget = captureTargetRaw || null;
  const activePointerId = Number(activePointerIdRaw);
  if (!captureTarget || typeof captureTarget.releasePointerCapture !== "function" || !Number.isFinite(activePointerId)) {
    return;
  }
  try {
    captureTarget.releasePointerCapture(activePointerId);
  } catch {
  }
}

function resetDragPreviewState({
  previewNodeRaw,
  previewBaseTransformRaw,
}) {
  applyPreviewNodeTransform({
    node: previewNodeRaw,
    baseTransformRaw: previewBaseTransformRaw,
    deltaXRaw: 0,
    deltaYRaw: 0,
  });
  return {
    previewNode: null,
    previewBaseTransform: "",
    previewOffset: { x: Number.NaN, y: Number.NaN },
  };
}

export {
  acquireDragPointerCapture,
  buildDragStartState,
  releaseDragPointerCapture,
  resetDragPreviewState,
  resolveDragPreviewState,
};
