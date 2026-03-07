import React, { memo, useEffect, useMemo, useRef } from "react";

import { parseDrawioSvgCache } from "./drawioSvg";
import {
  applyDrawioLayerRenderState,
  asArray,
  asObject,
  buildDrawioLayerRenderMaps,
  toNumber,
  toText,
} from "./runtime/drawioOverlayState";
import { bumpDrawioPerfCounter } from "./runtime/drawioRuntimeProbes.js";
import useDrawioOverlayInteraction from "./runtime/useDrawioOverlayInteraction";
import { normalizeDrawioInteractionMode } from "./drawioMeta.js";
import { normalizeRuntimeTool } from "./runtime/drawioRuntimePlacement.js";

function composeOverlayMatrix(matrixRaw, txRaw, tyRaw) {
  const matrix = asObject(matrixRaw);
  const a = toNumber(matrix.a, 1);
  const b = toNumber(matrix.b, 0);
  const c = toNumber(matrix.c, 0);
  const d = toNumber(matrix.d, 1);
  const e = toNumber(matrix.e, 0);
  const f = toNumber(matrix.f, 0);
  const tx = toNumber(txRaw, 0);
  const ty = toNumber(tyRaw, 0);
  return {
    a,
    b,
    c,
    d,
    e: e + (a * tx) + (c * ty),
    f: f + (b * tx) + (d * ty),
  };
}

function DrawioOverlayRenderer({
  visible,
  drawioMeta,
  overlayMatrix,
  overlayMatrixRef,
  subscribeOverlayMatrix,
  getOverlayMatrix,
  drawioMode,
  drawioActiveTool,
  screenToDiagram,
  onCommitMove,
  onCreateElement,
  onDeleteElement,
  onSelectionChange,
}) {
  bumpDrawioPerfCounter("drawio.renderer.renders");
  const parsed = useMemo(
    () => parseDrawioSvgCache(asObject(drawioMeta).svg_cache),
    [drawioMeta],
  );
  const meta = asObject(drawioMeta);
  const effectiveMode = normalizeDrawioInteractionMode(drawioMode || meta.interaction_mode);
  const runtimeTool = normalizeRuntimeTool(drawioActiveTool || meta.active_tool);
  const createPlacementActive = !!visible && effectiveMode === "edit" && !!runtimeTool;
  const hasRenderable = !!visible && !!parsed?.svg;
  const hasInteractionSurface = hasRenderable || createPlacementActive;
  const parsedBody = String(parsed?.body || "");
  const runtimeMeta = useMemo(() => ({
    ...meta,
    interaction_mode: effectiveMode,
    active_tool: runtimeTool || "select",
  }), [effectiveMode, meta, runtimeTool]);
  const matrix = asObject(overlayMatrix);
  const tx = toNumber(asObject(meta.transform).x, 0);
  const ty = toNumber(asObject(meta.transform).y, 0);
  const composedMatrix = useMemo(
    () => composeOverlayMatrix(matrix, tx, ty),
    [matrix, tx, ty],
  );
  const a = composedMatrix.a;
  const b = composedMatrix.b;
  const c = composedMatrix.c;
  const d = composedMatrix.d;
  const e = composedMatrix.e;
  const f = composedMatrix.f;
  const opacity = Math.max(0.05, Math.min(1, Number(meta.opacity || 1)));
  const { layerMap, elementMap } = useMemo(() => buildDrawioLayerRenderMaps(runtimeMeta), [runtimeMeta]);
  const viewportGroupRef = useRef(null);

  const {
    rootRef,
    selectedId,
  } = useDrawioOverlayInteraction({
    visible,
    hasRenderable,
    createPlacementActive,
    meta: runtimeMeta,
    layerMap,
    elementMap,
    matrixScale: a,
    screenToDiagram,
    onCommitMove,
    onCreateElement,
    onDeleteElement,
    onSelectionChange,
  });

  const renderedBody = useMemo(
    () => {
      bumpDrawioPerfCounter("drawio.renderer.renderedBody.recompute");
      return applyDrawioLayerRenderState(parsedBody, runtimeMeta, selectedId, null);
    },
    [runtimeMeta, parsedBody, selectedId],
  );

  useEffect(() => {
    bumpDrawioPerfCounter("drawio.renderer.bindDataAttrs.effects");
    const root = rootRef.current;
    if (!(root instanceof Element)) return;
    const nodes = root.querySelectorAll("[data-testid^='drawio-el-']");
    nodes.forEach((node) => {
      if (!(node instanceof Element)) return;
      const elementId = toText(node.getAttribute("id"));
      const elementState = asObject(elementMap.get(elementId));
      const managed = !!elementId && elementMap.has(elementId) && elementState.deleted !== true;
      if (managed) {
        node.setAttribute("data-drawio-el-id", elementId);
        return;
      }
      if (node.hasAttribute("data-drawio-el-id")) {
        node.removeAttribute("data-drawio-el-id");
      }
    });
  }, [elementMap, renderedBody, rootRef]);

  useEffect(() => {
    const viewportNode = viewportGroupRef.current;
    if (!(viewportNode instanceof Element)) return undefined;
    const applyMatrix = (matrixRaw) => {
      const nextComposed = composeOverlayMatrix(matrixRaw, tx, ty);
      viewportNode.setAttribute(
        "transform",
        `matrix(${nextComposed.a},${nextComposed.b},${nextComposed.c},${nextComposed.d},${nextComposed.e},${nextComposed.f})`,
      );
    };
    const initial = typeof getOverlayMatrix === "function"
      ? getOverlayMatrix()
      : (overlayMatrixRef?.current || overlayMatrix);
    applyMatrix(initial);
    if (typeof subscribeOverlayMatrix !== "function") return undefined;
    return subscribeOverlayMatrix((nextMatrix) => {
      applyMatrix(nextMatrix);
    });
  }, [
    getOverlayMatrix,
    overlayMatrix,
    overlayMatrixRef,
    subscribeOverlayMatrix,
    tx,
    ty,
  ]);

  if (!hasInteractionSurface) return null;

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
          style={{ position: "absolute", left: 0, top: 0, opacity, pointerEvents: createPlacementActive ? "auto" : "visiblePainted" }}
          width="100%"
          height="100%"
        >
          <g
            ref={viewportGroupRef}
            data-testid="drawio-overlay-viewport-g"
            transform={`matrix(${a},${b},${c},${d},${e},${f})`}
          >
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
  if (String(prevProps.drawioMode || "") !== String(nextProps.drawioMode || "")) return false;
  if (String(prevProps.drawioActiveTool || "") !== String(nextProps.drawioActiveTool || "")) return false;
  const prevMeta = asObject(prevProps.drawioMeta);
  const nextMeta = asObject(nextProps.drawioMeta);
  const prevMatrix = asObject(prevProps.overlayMatrix);
  const nextMatrix = asObject(nextProps.overlayMatrix);
  if (toNumber(prevMeta.opacity, 1) !== toNumber(nextMeta.opacity, 1)) return false;
  if (toNumber(asObject(prevMeta.transform).x, 0) !== toNumber(asObject(nextMeta.transform).x, 0)) return false;
  if (toNumber(asObject(prevMeta.transform).y, 0) !== toNumber(asObject(nextMeta.transform).y, 0)) return false;
  if (String(prevMeta.active_tool || "") !== String(nextMeta.active_tool || "")) return false;
  if (String(prevMeta.svg_cache || "") !== String(nextMeta.svg_cache || "")) return false;
  if (String(JSON.stringify(asArray(prevMeta.drawio_layers_v1) || [])) !== String(JSON.stringify(asArray(nextMeta.drawio_layers_v1) || []))) return false;
  if (String(JSON.stringify(asArray(prevMeta.drawio_elements_v1) || [])) !== String(JSON.stringify(asArray(nextMeta.drawio_elements_v1) || []))) return false;
  if (String(prevProps.screenToDiagram) !== String(nextProps.screenToDiagram)) return false;
  if (String(prevProps.overlayMatrixRef) !== String(nextProps.overlayMatrixRef)) return false;
  if (String(prevProps.subscribeOverlayMatrix) !== String(nextProps.subscribeOverlayMatrix)) return false;
  if (String(prevProps.getOverlayMatrix) !== String(nextProps.getOverlayMatrix)) return false;
  if (String(prevProps.onCommitMove) !== String(nextProps.onCommitMove)) return false;
  if (String(prevProps.onCreateElement) !== String(nextProps.onCreateElement)) return false;
  if (String(prevProps.onDeleteElement) !== String(nextProps.onDeleteElement)) return false;
  if (String(prevProps.onSelectionChange) !== String(nextProps.onSelectionChange)) return false;
  if (num(prevMatrix.a, 1) !== num(nextMatrix.a, 1)) return false;
  if (num(prevMatrix.b, 0) !== num(nextMatrix.b, 0)) return false;
  if (num(prevMatrix.c, 0) !== num(nextMatrix.c, 0)) return false;
  if (num(prevMatrix.d, 1) !== num(nextMatrix.d, 1)) return false;
  if (num(prevMatrix.e, 0) !== num(nextMatrix.e, 0)) return false;
  if (num(prevMatrix.f, 0) !== num(nextMatrix.f, 0)) return false;
  return true;
}

export default memo(DrawioOverlayRenderer, areEqual);
