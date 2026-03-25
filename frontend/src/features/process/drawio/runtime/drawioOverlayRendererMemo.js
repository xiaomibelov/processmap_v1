import { asArray, asObject, toNumber } from "./drawioOverlayState.js";

/**
 * Element-wise structural comparison for drawio_layers_v1 / drawio_elements_v1.
 * O(1) on same reference, O(n) only when something actually changed.
 * Per-element JSON.stringify only for items that differ by reference.
 */
export function arraysStructuralEqual(a, b) {
  if (a === b) return true;
  const aArr = Array.isArray(a) ? a : [];
  const bArr = Array.isArray(b) ? b : [];
  if (aArr.length !== bArr.length) return false;
  for (let i = 0; i < aArr.length; i += 1) {
    if (aArr[i] === bArr[i]) continue;
    if (JSON.stringify(aArr[i]) !== JSON.stringify(bArr[i])) return false;
  }
  return true;
}

export function areDrawioOverlayRendererPropsEqual(prevProps, nextProps) {
  if (!!prevProps.visible !== !!nextProps.visible) return false;
  if (String(prevProps.drawioMode || "") !== String(nextProps.drawioMode || "")) return false;
  if (String(prevProps.drawioActiveTool || "") !== String(nextProps.drawioActiveTool || "")) return false;
  const prevMeta = asObject(prevProps.drawioMeta);
  const nextMeta = asObject(nextProps.drawioMeta);
  if (toNumber(prevMeta.opacity, 1) !== toNumber(nextMeta.opacity, 1)) return false;
  if (toNumber(asObject(prevMeta.transform).x, 0) !== toNumber(asObject(nextMeta.transform).x, 0)) return false;
  if (toNumber(asObject(prevMeta.transform).y, 0) !== toNumber(asObject(nextMeta.transform).y, 0)) return false;
  if (String(prevMeta.active_tool || "") !== String(nextMeta.active_tool || "")) return false;
  if (String(prevMeta.svg_cache || "") !== String(nextMeta.svg_cache || "")) return false;
  if (!arraysStructuralEqual(asArray(prevMeta.drawio_layers_v1), asArray(nextMeta.drawio_layers_v1))) return false;
  if (!arraysStructuralEqual(asArray(prevMeta.drawio_elements_v1), asArray(nextMeta.drawio_elements_v1))) return false;
  // Functions and refs: use reference equality (useCallback guarantees stability)
  if (prevProps.screenToDiagram !== nextProps.screenToDiagram) return false;
  if (prevProps.overlayMatrixRef !== nextProps.overlayMatrixRef) return false;
  if (prevProps.subscribeOverlayMatrix !== nextProps.subscribeOverlayMatrix) return false;
  if (prevProps.getOverlayMatrix !== nextProps.getOverlayMatrix) return false;
  if (prevProps.onCommitMove !== nextProps.onCommitMove) return false;
  if (prevProps.onCommitResize !== nextProps.onCommitResize) return false;
  if (prevProps.onCommitTextResize !== nextProps.onCommitTextResize) return false;
  if (prevProps.onCommitText !== nextProps.onCommitText) return false;
  if (prevProps.onCreateElement !== nextProps.onCreateElement) return false;
  if (prevProps.onDeleteElement !== nextProps.onDeleteElement) return false;
  if (prevProps.onSelectionChange !== nextProps.onSelectionChange) return false;
  // overlayMatrix a/b/c/d/e/f now updates viewport DOM + live scale refs via
  // subscribeOverlayMatrix. Zoom/pan no longer invalidates the heavy SVG body render.
  return true;
}
