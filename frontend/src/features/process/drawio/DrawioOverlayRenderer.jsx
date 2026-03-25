import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { parseDrawioSvgCache } from "./drawioSvg";
import {
  applyDrawioLayerRenderState,
  applyDrawioSelectionToNode,
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
import { buildDrawioPlacementPreviewSpec } from "./runtime/drawioPlacementPreview.js";
import {
  isDrawioCreatePlacementActive,
  resolveDrawioOverlaySvgPointerEvents,
} from "./runtime/drawioOverlayPointerOwnership.js";
import resolveDrawioOverlayRenderMatrix from "./runtime/drawioOverlayMatrix.js";
import useDrawioCanvasInteractionExtras, {
  buildResizeHandleSpecs,
  getResizeHandleCursor,
} from "./runtime/useDrawioCanvasInteractionExtras.js";
import DrawioRichTextEditor from "./runtime/DrawioRichTextEditor.jsx";
import useDrawioElementNodeRegistry from "./runtime/useDrawioElementNodeRegistry.js";

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
  onCommitResize,
  onCommitTextResize,
  onCommitText,
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
  const createPlacementActive = isDrawioCreatePlacementActive({
    visible,
    effectiveMode,
    runtimeTool,
  });
  const hasRenderable = !!visible && !!parsed?.svg;
  const hasInteractionSurface = hasRenderable || createPlacementActive;
  const placementPreviewEnabled = createPlacementActive && runtimeTool !== "select";
  const parsedBody = String(parsed?.body || "");
  const runtimeMeta = useMemo(() => ({
    ...meta,
    interaction_mode: effectiveMode,
    active_tool: runtimeTool || "select",
  }), [effectiveMode, meta, runtimeTool]);
  const matrix = resolveDrawioOverlayRenderMatrix({
    overlayMatrix,
    overlayMatrixRef,
    getOverlayMatrix,
  });
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
  // Maps depend only on layers/elements — NOT on mode/tool/selectedId.
  // Use drawioMeta (prop ref) directly so maps don't rebuild on tool/mode changes.
  const { layerMap, elementMap } = useMemo(() => buildDrawioLayerRenderMaps(drawioMeta), [drawioMeta]);
  const viewportGroupRef = useRef(null);
  const containerRef = useRef(null);
  const [placementPreviewPoint, setPlacementPreviewPoint] = useState(null);

  // metaForGate contains only the fields used by interaction gate + selection
  // (interaction_mode, locked). Tool switches don't invalidate gate/selection callbacks.
  const metaLocked = meta.locked;
  const metaForGate = useMemo(() => ({
    interaction_mode: effectiveMode,
    locked: metaLocked,
  }), [effectiveMode, metaLocked]);

  const {
    rootRef,
    selectedId,
  } = useDrawioOverlayInteraction({
    visible,
    hasRenderable,
    createPlacementActive,
    meta: runtimeMeta,
    metaForGate,
    layerMap,
    elementMap,
    matrixScale: a,
    screenToDiagram,
    onCommitMove,
    onCreateElement,
    onDeleteElement,
    onSelectionChange,
  });

  // renderedBody deps: selectedId is intentionally excluded — selection highlight
  // is applied via applyDrawioSelectionToNode (direct DOM, O(1)) in the effect below.
  // A click no longer triggers a full SVG regex re-render.
  const renderedBody = useMemo(
    () => {
      bumpDrawioPerfCounter("drawio.renderer.renderedBody.recompute");
      return applyDrawioLayerRenderState(parsedBody, runtimeMeta, null, null, { layerMap, elementMap });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parsedBody, layerMap, elementMap, effectiveMode, metaLocked],
  );

  const { registryRef, getNode: getRegistryNode } = useDrawioElementNodeRegistry({
    rootRef: containerRef,
    renderedBody,
  });

  // Apply selection highlight directly on the DOM node — no SVG re-render on click.
  const prevSelectedIdRef = useRef("");
  useEffect(() => {
    const prevId = prevSelectedIdRef.current;
    const nextId = selectedId || "";
    if (prevId === nextId) return;
    if (prevId) applyDrawioSelectionToNode(getRegistryNode(prevId), false);
    if (nextId) applyDrawioSelectionToNode(getRegistryNode(nextId), true);
    prevSelectedIdRef.current = nextId;
  }, [selectedId, getRegistryNode]);

  // Re-apply selection after SVG re-render (dangerouslySetInnerHTML resets DOM styles).
  // rAF ensures registry rebuild (also rAF) has run first.
  useEffect(() => {
    if (!selectedId) return;
    const rafId = requestAnimationFrame(() => {
      applyDrawioSelectionToNode(getRegistryNode(selectedId), true);
      prevSelectedIdRef.current = selectedId;
    });
    return () => cancelAnimationFrame(rafId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderedBody]);

  const {
    selectedBbox,
    resizeDraft,
    startResizeDrag,
    inlineEdit,
    commitInlineText,
    cancelInlineEdit,
  } = useDrawioCanvasInteractionExtras({
    rootRef,
    viewportGroupRef,
    containerRef,
    selectedId,
    elementMap,
    meta: runtimeMeta,
    renderedBody,
    svgCache: asObject(drawioMeta).svg_cache,
    screenToDiagram,
    nodeRegistry: registryRef,
    onCommitResize,
    onCommitTextResize,
    onCommitText,
    visible,
  });

  const placementPreviewSpec = useMemo(() => (
    placementPreviewEnabled ? buildDrawioPlacementPreviewSpec(runtimeTool, placementPreviewPoint) : null
  ), [placementPreviewEnabled, placementPreviewPoint, runtimeTool]);

  const updatePlacementPreviewPoint = useCallback((event) => {
    if (!placementPreviewEnabled || typeof screenToDiagram !== "function") {
      setPlacementPreviewPoint(null);
      return;
    }
    const point = screenToDiagram(Number(event?.clientX || 0), Number(event?.clientY || 0));
    if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) {
      setPlacementPreviewPoint(null);
      return;
    }
    setPlacementPreviewPoint({
      x: Number(point.x || 0),
      y: Number(point.y || 0),
    });
  }, [placementPreviewEnabled, screenToDiagram]);

  useEffect(() => {
    if (placementPreviewEnabled) return;
    setPlacementPreviewPoint(null);
  }, [placementPreviewEnabled]);

  // data-drawio-el-id is now written directly into the SVG string by
  // applyDrawioLayerRenderState for all managed elements, so the DOM scan
  // that used to patch it after render is no longer needed.

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
    const initial = resolveDrawioOverlayRenderMatrix({
      overlayMatrix,
      overlayMatrixRef,
      getOverlayMatrix,
    });
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
      ref={(el) => { rootRef.current = el; containerRef.current = el; }}
    >
      <div
        className="drawioLayerOverlay absolute inset-0 overflow-hidden"
        style={{ pointerEvents: "none" }}
        data-testid="drawio-overlay"
      >
        <svg
          className="drawioLayerOverlaySvg"
          data-testid="drawio-overlay-svg"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            opacity,
            pointerEvents: resolveDrawioOverlaySvgPointerEvents(createPlacementActive),
          }}
          width="100%"
          height="100%"
          onPointerMove={updatePlacementPreviewPoint}
          onPointerLeave={() => setPlacementPreviewPoint(null)}
        >
          <g
            ref={viewportGroupRef}
            data-testid="drawio-overlay-viewport-g"
            transform={`matrix(${a},${b},${c},${d},${e},${f})`}
          >
            <g dangerouslySetInnerHTML={{ __html: renderedBody }} />
            {placementPreviewSpec ? (
              <g
                data-testid={`drawio-placement-preview-${placementPreviewSpec.toolId}`}
                style={{ pointerEvents: "none" }}
              >
                {placementPreviewSpec.shape === "rect" ? (
                  <rect
                    x={placementPreviewSpec.x}
                    y={placementPreviewSpec.y}
                    width={placementPreviewSpec.width}
                    height={placementPreviewSpec.height}
                    rx={placementPreviewSpec.rx}
                    fill={placementPreviewSpec.fill}
                    stroke={placementPreviewSpec.stroke}
                    strokeWidth="2"
                    strokeDasharray={placementPreviewSpec.strokeDasharray || "6 4"}
                  />
                ) : (
                  <g>
                    <rect
                      x={placementPreviewSpec.x - 10}
                      y={placementPreviewSpec.y - 18}
                      width={placementPreviewSpec.width}
                      height={placementPreviewSpec.height}
                      fill="rgba(248,250,252,0.75)"
                      stroke={placementPreviewSpec.guideStroke}
                      strokeWidth="1.5"
                      strokeDasharray="6 4"
                      rx="6"
                    />
                    <text
                      x={placementPreviewSpec.x}
                      y={placementPreviewSpec.y}
                      fill={placementPreviewSpec.fill}
                      fontSize="16"
                      fontFamily="Arial, sans-serif"
                    >
                      {placementPreviewSpec.text}
                    </text>
                  </g>
                )}
              </g>
            ) : null}
            {/* ── Resize handles ── */}
            {selectedBbox?.hasResize && !inlineEdit ? (() => {
              const hSize = 8 / Math.max(0.1, a);
              const hR = 1.5 / Math.max(0.1, a);
              const strokeW = 1.5 / Math.max(0.1, a);
              const handles = buildResizeHandleSpecs(resizeDraft
                ? { ...selectedBbox, width: resizeDraft.width, height: resizeDraft.height }
                : selectedBbox);
              return (
                <g data-testid="drawio-resize-handles" style={{ pointerEvents: "none" }}>
                  {resizeDraft ? (
                    <rect
                      x={selectedBbox.x}
                      y={selectedBbox.y}
                      width={resizeDraft.width}
                      height={resizeDraft.height}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth={strokeW}
                      strokeDasharray={`${5 / Math.max(0.1, a)} ${3 / Math.max(0.1, a)}`}
                      style={{ pointerEvents: "none" }}
                    />
                  ) : null}
                  {handles.map(({ id, cx, cy }) => (
                    <rect
                      key={id}
                      x={cx - hSize / 2}
                      y={cy - hSize / 2}
                      width={hSize}
                      height={hSize}
                      rx={hR}
                      fill="white"
                      stroke="#3b82f6"
                      strokeWidth={strokeW}
                      data-drawio-resize-handle={id}
                      style={{
                        pointerEvents: "all",
                        cursor: getResizeHandleCursor(id),
                      }}
                      onPointerDown={(ev) => startResizeDrag(ev, id)}
                    />
                  ))}
                </g>
              );
            })() : null}
          </g>
        </svg>
      </div>
      {/* ── Inline rich text editor ── */}
      {inlineEdit ? (
        <DrawioRichTextEditor
          inlineEdit={inlineEdit}
          onCommit={commitInlineText}
          onCancel={cancelInlineEdit}
        />
      ) : null}
    </div>
  );
}

function num(valueRaw, fallback = 0) {
  const value = Number(valueRaw);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Element-wise structural comparison for drawio_layers_v1 / drawio_elements_v1.
 * O(1) on same reference, O(n) only when something actually changed.
 * Per-element JSON.stringify only for items that differ by reference.
 */
function arraysStructuralEqual(a, b) {
  if (a === b) return true;
  const aArr = Array.isArray(a) ? a : [];
  const bArr = Array.isArray(b) ? b : [];
  if (aArr.length !== bArr.length) return false;
  for (let i = 0; i < aArr.length; i++) {
    if (aArr[i] === bArr[i]) continue;
    if (JSON.stringify(aArr[i]) !== JSON.stringify(bArr[i])) return false;
  }
  return true;
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
  // Scale/rotation (a,b,c,d) affect matrixScale, interaction, and resize handle sizes → re-render.
  // Translation (e,f) is applied via subscribeOverlayMatrix directly to DOM — no React re-render needed.
  if (num(prevMatrix.a, 1) !== num(nextMatrix.a, 1)) return false;
  if (num(prevMatrix.b, 0) !== num(nextMatrix.b, 0)) return false;
  if (num(prevMatrix.c, 0) !== num(nextMatrix.c, 0)) return false;
  if (num(prevMatrix.d, 1) !== num(nextMatrix.d, 1)) return false;
  return true;
}

export default memo(DrawioOverlayRenderer, areEqual);
