import {
  asObject,
  toNumber,
} from "./drawioOverlayState.js";

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
  if (nodeRegistryRaw && typeof nodeRegistryRaw.get === "function") {
    const cached = nodeRegistryRaw.get(elementId);
    if (cached instanceof Element && root.contains(cached)) return cached;
  }
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
  return root.querySelector?.(`[data-drawio-el-id="${CSS.escape(elementId)}"]`) ?? null;
}

function isPointerLikeEvent(eventTypeRaw, eventPointerIdRaw) {
  const eventType = String(eventTypeRaw || "").toLowerCase();
  if (eventType.startsWith("pointer")) return true;
  // Some browsers/environments expose pointerId=0 on MouseEvent.
  // Event type is the reliable discriminator for pointer lifecycle logic.
  return false;
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
}) {
  const activePointerId = Number(activePointerIdRaw);
  const eventPointerId = Number(eventPointerIdRaw);
  const isPointerEvent = isPointerLikeEvent(eventTypeRaw, eventPointerId);
  if (isPointerEvent && Number.isFinite(activePointerId) && Number.isFinite(eventPointerId) && activePointerId !== eventPointerId) {
    return "pointer_id_mismatch";
  }
  // mouseup can be the only terminal event in some browsers/edge cases when
  // pointerup is lost; treat it as a valid fallback finish signal.
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

export {
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
};
