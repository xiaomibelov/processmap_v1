import { asArray, asObject, toNumber } from "./drawioOverlayState.js";

function toText(valueRaw) {
  return String(valueRaw || "").trim();
}

function layerRowRenderEqual(aRaw, bRaw) {
  const a = asObject(aRaw);
  const b = asObject(bRaw);
  return toText(a.id) === toText(b.id)
    && (a.visible !== false) === (b.visible !== false)
    && (a.locked === true) === (b.locked === true)
    && toNumber(a.opacity, 1) === toNumber(b.opacity, 1);
}

function noteStyleEqual(aRaw, bRaw) {
  const a = asObject(aRaw);
  const b = asObject(bRaw);
  return toText(a.bg_color) === toText(b.bg_color)
    && toText(a.border_color) === toText(b.border_color)
    && toText(a.text_color) === toText(b.text_color);
}

function elementRowRenderEqual(aRaw, bRaw) {
  const a = asObject(aRaw);
  const b = asObject(bRaw);
  const sameBase = toText(a.id) === toText(b.id)
    && toText(a.layer_id) === toText(b.layer_id)
    && (a.visible !== false) === (b.visible !== false)
    && (a.locked === true) === (b.locked === true)
    && (a.deleted === true) === (b.deleted === true)
    && toNumber(a.opacity, 1) === toNumber(b.opacity, 1)
    && toNumber(a.offset_x ?? a.offsetX, 0) === toNumber(b.offset_x ?? b.offsetX, 0)
    && toNumber(a.offset_y ?? a.offsetY, 0) === toNumber(b.offset_y ?? b.offsetY, 0);
  if (!sameBase) return false;
  const aType = toText(a.type).toLowerCase();
  const bType = toText(b.type).toLowerCase();
  if (aType !== bType) return false;
  if (aType === "note") {
    return toNumber(a.width, 160) === toNumber(b.width, 160)
      && toNumber(a.height, 120) === toNumber(b.height, 120)
      && toText(a.text) === toText(b.text)
      && noteStyleEqual(a.style, b.style);
  }
  return true;
}

/**
 * Element-wise structural comparison for drawio_layers_v1 / drawio_elements_v1.
 * O(1) on same reference, O(n) only when something actually changed.
 * Custom row comparator avoids heavy JSON.stringify in hot render paths.
 */
export function arraysStructuralEqual(a, b, compareRow = null) {
  if (a === b) return true;
  const aArr = Array.isArray(a) ? a : [];
  const bArr = Array.isArray(b) ? b : [];
  if (aArr.length !== bArr.length) return false;
  const rowComparer = typeof compareRow === "function"
    ? compareRow
    : (left, right) => JSON.stringify(left) === JSON.stringify(right);
  for (let i = 0; i < aArr.length; i += 1) {
    if (aArr[i] === bArr[i]) continue;
    if (!rowComparer(aArr[i], bArr[i])) return false;
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
  if (
    !arraysStructuralEqual(
      asArray(prevMeta.drawio_layers_v1),
      asArray(nextMeta.drawio_layers_v1),
      layerRowRenderEqual,
    )
  ) {
    return false;
  }
  if (
    !arraysStructuralEqual(
      asArray(prevMeta.drawio_elements_v1),
      asArray(nextMeta.drawio_elements_v1),
      elementRowRenderEqual,
    )
  ) {
    return false;
  }
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
