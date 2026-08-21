import { useMemo } from "react";

const IDENTITY_MATRIX = Object.freeze({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
const EMPTY_RECT = Object.freeze({ left: 0, top: 0, width: 0, height: 0 });
const EMPTY_VIEWBOX = Object.freeze({ x: 0, y: 0, width: 0, height: 0, scale: 1 });
const EMPTY_SIZE = Object.freeze({ width: 0, height: 0 });

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

export default function useOverlayViewportSync({
  enabled = true,
  viewportSource = {},
}) {
  const source = asObject(viewportSource);
  const viewbox = enabled ? asObject(source.viewbox) : EMPTY_VIEWBOX;
  const containerRect = enabled ? asObject(source.containerRect) : EMPTY_RECT;
  const viewportSize = enabled ? asObject(source.viewportSize) : EMPTY_SIZE;
  const viewportMatrix = enabled ? asObject(source.viewportMatrix) : IDENTITY_MATRIX;
  const subscribeViewportMatrix = enabled && typeof source.subscribeViewportMatrix === "function"
    ? source.subscribeViewportMatrix
    : (() => () => {});
  const getViewportMatrix = enabled && typeof source.getViewportMatrix === "function"
    ? source.getViewportMatrix
    : (() => IDENTITY_MATRIX);
  const subscribeViewboxChanging = typeof source.subscribeViewboxChanging === "function"
    ? source.subscribeViewboxChanging
    : (() => () => {});

  return useMemo(() => ({
    viewbox,
    overlayViewbox: viewbox,
    containerRect,
    overlayContainerRect: containerRect,
    hybridViewportSize: viewportSize,
    hybridViewportMatrix: viewportMatrix,
    hybridViewportMatrixRef: source.matrixRef,
    subscribeOverlayViewportMatrix: subscribeViewportMatrix,
    getOverlayViewportMatrix: getViewportMatrix,
    subscribeViewboxChanging,
    localToDiagram: source.localToDiagram,
    clientToDiagram: source.clientToDiagram,
    screenToDiagram: source.screenToDiagram,
    diagramToScreen: source.diagramToScreen,
    getElementBBox: source.getElementBBox,
  }), [
    containerRect,
    source.clientToDiagram,
    source.diagramToScreen,
    source.getElementBBox,
    source.getViewportMatrix,
    source.localToDiagram,
    source.matrixRef,
    source.subscribeViewportMatrix,
    source.screenToDiagram,
    getViewportMatrix,
    subscribeViewportMatrix,
    subscribeViewboxChanging,
    viewbox,
    viewportMatrix,
    viewportSize,
  ]);
}
