import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { parseDrawioSvgCache } from "./drawioSvg";
import {
  applyDrawioLayerRenderStateToDom,
  applyDrawioSelectionToNode,
  asArray,
  asObject,
  buildDrawioLayerRenderMaps,
  toNumber,
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
import useDrawioCanvasInteractionExtras from "./runtime/useDrawioCanvasInteractionExtras.js";
import DrawioInteractionLayer from "./runtime/DrawioInteractionLayer.jsx";
import useDrawioElementNodeRegistry from "./runtime/useDrawioElementNodeRegistry.js";
import {
  buildDrawioRenderStateSignature,
  composeOverlayMatrix,
} from "./runtime/drawioOverlayRendererState.js";
import { areDrawioOverlayRendererPropsEqual } from "./runtime/drawioOverlayRendererMemo.js";
import {
  buildDrawioNoteFallbackText,
  buildDrawioNoteTextLines,
  isDrawioNoteRow,
  normalizeDrawioNoteRow,
} from "./runtime/drawioRuntimeNote.js";

const DrawioManagedBody = memo(function DrawioManagedBody({ renderedBody }) {
  return <g dangerouslySetInnerHTML={{ __html: renderedBody }} />;
});

function DrawioPlacementPreview({ placementPreviewSpec }) {
  if (!placementPreviewSpec) return null;
  if (placementPreviewSpec.shape === "note") {
    return (
      <g
        data-testid={`drawio-placement-preview-${placementPreviewSpec.toolId}`}
        style={{ pointerEvents: "none" }}
      >
        <rect
          x={placementPreviewSpec.x}
          y={placementPreviewSpec.y}
          width={placementPreviewSpec.width}
          height={placementPreviewSpec.height}
          rx={placementPreviewSpec.rx}
          fill={placementPreviewSpec.fill}
          stroke={placementPreviewSpec.stroke}
          strokeWidth="2"
          strokeDasharray="6 4"
        />
        <text
          x={placementPreviewSpec.x + 12}
          y={placementPreviewSpec.y + 24}
          fill={placementPreviewSpec.textColor || "#1f2937"}
          fontSize="14"
          fontFamily="Arial, sans-serif"
        >
          {placementPreviewSpec.text}
        </text>
      </g>
    );
  }
  return (
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
  );
}

const DrawioRuntimeNotesLayer = memo(function DrawioRuntimeNotesLayer({ noteRows }) {
  const rows = Array.isArray(noteRows) ? noteRows : [];
  if (!rows.length) return null;
  return (
    <g data-testid="drawio-runtime-notes-layer">
      {rows.map((rowRaw) => {
        const row = normalizeDrawioNoteRow(rowRaw);
        const lines = buildDrawioNoteTextLines(row.text, row.width, { padding: 12, fontSize: 14 });
        const fallbackText = buildDrawioNoteFallbackText(row.text, lines);
        const lineHeight = 18;
        return (
          <g
            key={row.id}
            id={row.id}
            data-drawio-el-id={row.id}
            data-drawio-note="1"
          >
            <rect
              x={0}
              y={0}
              width={row.width}
              height={row.height}
              rx={10}
              fill={row.style.bg_color}
              stroke={row.style.border_color}
              strokeWidth={2}
            />
            {/* Keep canonical text (including explicit line breaks) for DOM fallback readers.
                Placed after rect so geometry classification still sees rect as first child. */}
            <text
              data-drawio-note-source="canonical"
              display="none"
            >
              {fallbackText}
            </text>
            <text
              x={12}
              y={24}
              fill={row.style.text_color}
              fontSize={14}
              fontFamily="Arial, sans-serif"
            >
              {lines.map((line, index) => (
                <tspan
                  key={`${row.id}_line_${index}`}
                  x={12}
                  dy={index === 0 ? 0 : lineHeight}
                >
                  {line || "\u00a0"}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
    </g>
  );
});

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
    [asObject(drawioMeta).svg_cache],
  );
  const meta = asObject(drawioMeta);
  const effectiveMode = normalizeDrawioInteractionMode(drawioMode || meta.interaction_mode);
  const runtimeTool = normalizeRuntimeTool(drawioActiveTool || meta.active_tool);
  const createPlacementActive = isDrawioCreatePlacementActive({
    visible,
    effectiveMode,
    runtimeTool,
  });
  const runtimeNoteRows = useMemo(
    () => asArray(meta.drawio_elements_v1)
      .filter((rowRaw) => {
        const row = asObject(rowRaw);
        return isDrawioNoteRow(row) && row.deleted !== true;
      })
      .sort((leftRaw, rightRaw) => Number(asObject(leftRaw).z_index || 0) - Number(asObject(rightRaw).z_index || 0)),
    [meta.drawio_elements_v1],
  );
  const hasRenderable = !!visible && (!!parsed?.svg || runtimeNoteRows.length > 0);
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
  const { layerMap, elementMap } = useMemo(
    () => buildDrawioLayerRenderMaps(drawioMeta),
    [meta.drawio_elements_v1, meta.drawio_layers_v1],
  );
  const viewportGroupRef = useRef(null);
  const containerRef = useRef(null);
  const [placementPreviewPoint, setPlacementPreviewPoint] = useState(null);
  const renderStateAppliedRef = useRef("");

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
    matrixScaleRef,
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
  const renderStateSignature = useMemo(
    () => buildDrawioRenderStateSignature(parsedBody, effectiveMode, metaLocked, layerMap, elementMap),
    [parsedBody, effectiveMode, metaLocked, layerMap, elementMap],
  );
  const renderedBody = parsedBody;
  const registryRenderKey = useMemo(() => [
    renderedBody,
    ...runtimeNoteRows.map((rowRaw) => String(asObject(rowRaw).id || "")),
  ].join("|"), [renderedBody, runtimeNoteRows]);
  const interactionRenderKey = useMemo(() => [
    renderedBody,
    ...runtimeNoteRows.map((rowRaw) => {
      const row = normalizeDrawioNoteRow(rowRaw);
      return [
        row.id,
        row.width,
        row.height,
        row.offset_x,
        row.offset_y,
        row.text,
        row.style.bg_color,
        row.style.border_color,
        row.style.text_color,
      ].join(":");
    }),
  ].join("|"), [renderedBody, runtimeNoteRows]);
  const registryRenderedBodyRef = useRef("");

  const { registryRef, getNode: getRegistryNode, rebuildRegistry } = useDrawioElementNodeRegistry({
    rootRef: containerRef,
    renderedBody,
  });

  useEffect(() => {
    const viewportNode = viewportGroupRef.current;
    if (!(viewportNode instanceof Element)) return undefined;
    if (renderStateAppliedRef.current === renderStateSignature) {
      bumpDrawioPerfCounter("drawio.renderer.domPatch.skipped");
      return undefined;
    }
    let rafId = requestAnimationFrame(() => {
      bumpDrawioPerfCounter("drawio.renderer.domPatch.applied");
      applyDrawioLayerRenderStateToDom(
        viewportNode,
        {
          interaction_mode: effectiveMode,
          locked: metaLocked,
        },
        null,
        { layerMap, elementMap },
      );
      if (registryRenderedBodyRef.current !== registryRenderKey || registryRef.current.size <= 0) {
        rebuildRegistry();
        registryRenderedBodyRef.current = registryRenderKey;
      }
      renderStateAppliedRef.current = renderStateSignature;
      if (selectedId) {
        applyDrawioSelectionToNode(getRegistryNode(selectedId), true);
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [
    effectiveMode,
    elementMap,
    getRegistryNode,
    layerMap,
    metaLocked,
    rebuildRegistry,
    registryRef,
    renderedBody,
    registryRenderKey,
    renderStateSignature,
    selectedId,
  ]);

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

  // Selection after SVG re-render is handled by the renderState effect above:
  // whenever renderedBody changes, renderStateSignature (which hashes the body) also
  // changes → the renderState rAF runs → rebuilds registry → re-applies selection.
  // A separate rAF here was redundant and caused a double application per render.

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
    renderedBody: interactionRenderKey,
    svgCache: asObject(drawioMeta).svg_cache,
    screenToDiagram,
    subscribeOverlayMatrix,
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
      // Keep matrixScaleRef in sync without a React re-render.
      // This allows removal of a/b/c/d from areEqual — zoom no longer triggers
      // full re-renders; the interaction hook reads the correct scale at drag commit.
      if (matrixScaleRef) {
        const s = Math.max(0.0001, Number(asObject(nextMatrix).a || 1));
        matrixScaleRef.current = s;
      }
    });
  }, [
    getOverlayMatrix,
    matrixScaleRef,
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
            pointerEvents: resolveDrawioOverlaySvgPointerEvents({
              createPlacementActive,
              hasRenderable,
              effectiveMode,
            }),
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
            <DrawioManagedBody renderedBody={renderedBody} />
            <DrawioRuntimeNotesLayer noteRows={runtimeNoteRows} />
            <DrawioPlacementPreview placementPreviewSpec={placementPreviewSpec} />
          </g>
        </svg>
      </div>
      <DrawioInteractionLayer
        selectedBbox={selectedBbox}
        resizeDraft={resizeDraft}
        inlineEdit={inlineEdit}
        startResizeDrag={startResizeDrag}
        commitInlineText={commitInlineText}
        cancelInlineEdit={cancelInlineEdit}
      />
    </div>
  );
}

export default memo(DrawioOverlayRenderer, areDrawioOverlayRendererPropsEqual);
