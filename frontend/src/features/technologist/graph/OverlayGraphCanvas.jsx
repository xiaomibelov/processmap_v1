// OL1 — единый overlay-канвас: AS IS (приглушённая read-only подложка) +
// TO BE (активный слой поверх) в ОДНОМ SVG-вьюпорте.
// z-order: группа TO BE рендерится ПОСЛЕ AS IS → нативный hit-priority SVG:
// клик по пересечению слоёв выделяет TO BE (OL1.5). AS IS — без drag
// (инвариант read-only), клик — только выделение для просмотра.
import React, { useEffect, useMemo, useRef } from "react";

import {
  asArray,
  nodeCenter,
  flowPoints,
  computeViewBox,
  NodeShape,
} from "./GraphCanvas";
import { traceHighlights, traceLinkPairs } from "./overlay";
import useViewBoxZoom from "./useViewBoxZoom";
import { MINIMAP_NODE_THRESHOLD, parseViewBox } from "./viewBoxZoom";
import GraphZoomControls from "./GraphZoomControls";
import GraphMinimap from "./GraphMinimap";
import "./GraphCanvas.css";

function isGatewayType(t) {
  const s = String(t || "");
  return s === "exclusiveGateway" || s === "parallelGateway" || s.endsWith("Gateway");
}
function isEventType(t) {
  return String(t || "").endsWith("Event");
}

export default function OverlayGraphCanvas({
  asIsModel = null,           // null → слой подложки не рисуется («с чистого листа»)
  tobeModel,
  traceIndex = null,          // { tobeToAsis, asisToTobe } из buildTraceIndex
  traceLinksMode = "selection", // selection | always (OL1.4)
  selectedTobeId = "",
  selectedAsisId = "",
  selectedFlowId = "",
  onSelectTobeNode,
  onSelectAsisNode,
  onSelectFlow,
  onNodeMove,
  connectSourceId = "",
  unreachableNodeIds = [],
  nodeBadges = {},
  nodeRefs = null,
  ariaLabel = "TO BE поверх AS IS",
  resetKey = "",       // смена сессии/шаблона → сброс zoom на fit (Z1)
  focusNodeId = "",    // центрирование вида на узле (навигация из замечаний, Z1)
  focusSeq = 0,        // nonce — повторный клик по тому же узлу тоже центрирует
}) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);

  const tobeNodes = asArray(tobeModel?.nodes);
  const tobeFlows = asArray(tobeModel?.flows);
  const asisNodes = asArray(asIsModel?.nodes);
  const asisFlows = asArray(asIsModel?.flows);
  const asisLanes = asArray(asIsModel?.lanes);

  // общий fit-viewBox по обеим моделям (OL1: единый вьюпорт)
  const fitViewBox = useMemo(() => computeViewBox({
    nodes: [...asisNodes, ...tobeNodes],
    lanes: asisLanes,
    flows: [],
  }), [asisNodes, tobeNodes, asisLanes]);
  const fitView = useMemo(() => parseViewBox(fitViewBox), [fitViewBox]);

  // Z1: zoom/pan поверх viewBox (±/fit/1:1, wheel, drag по фону)
  const zoom = useViewBoxZoom({ fitView, resetKey, svgRef });

  const tobeById = useMemo(() => {
    const m = new Map();
    tobeNodes.forEach((n) => m.set(String(n?.id || ""), n));
    return m;
  }, [tobeNodes]);
  const asisById = useMemo(() => {
    const m = new Map();
    asisNodes.forEach((n) => m.set(String(n?.id || ""), n));
    return m;
  }, [asisNodes]);
  const unreachableSet = useMemo(
    () => new Set(asArray(unreachableNodeIds).map(String)),
    [unreachableNodeIds],
  );

  // OL1.3: подсветка «откуда → куда» в обе стороны
  const highlights = useMemo(
    () => traceHighlights(traceIndex, { selectedTobeId, selectedAsisId }),
    [traceIndex, selectedTobeId, selectedAsisId],
  );
  // OL1.4: пунктирные связи происхождения
  const linkPairs = useMemo(
    () => traceLinkPairs(traceIndex, { mode: traceLinksMode, selectedTobeId, selectedAsisId }),
    [traceIndex, traceLinksMode, selectedTobeId, selectedAsisId],
  );

  function svgPoint(event) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    if (typeof svg.createSVGPoint === "function" && typeof svg.getScreenCTM === "function") {
      const ctm = svg.getScreenCTM();
      if (ctm) {
        const pt = svg.createSVGPoint();
        pt.x = event.clientX;
        pt.y = event.clientY;
        const p = pt.matrixTransform(ctm.inverse());
        return { x: p.x, y: p.y };
      }
    }
    const rect = svg.getBoundingClientRect();
    const [vx, vy, vw, vh] = zoom.viewBox.split(" ").map(Number);
    const sx = rect.width ? vw / rect.width : 1;
    const sy = rect.height ? vh / rect.height : 1;
    return { x: vx + (event.clientX - rect.left) * sx, y: vy + (event.clientY - rect.top) * sy };
  }

  // drag — ТОЛЬКО для TO BE (AS IS read-only: хендлер не навешивается)
  function handleNodePointerDown(event, node) {
    if (typeof onNodeMove !== "function") return;
    const id = String(node?.id || "");
    if (!id) return;
    const start = svgPoint(event);
    dragRef.current = { id, startX: start.x, startY: start.y, origX: Number(node?.x) || 0, origY: Number(node?.y) || 0, moved: false };
  }
  function handlePointerMove(event) {
    const drag = dragRef.current;
    if (!drag) {
      zoom.panMove(event); // Z1: pan по фону
      return;
    }
    const p = svgPoint(event);
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;
    if (!drag.moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
    drag.moved = true;
    if (typeof onNodeMove === "function") onNodeMove(drag.id, Math.round(drag.origX + dx), Math.round(drag.origY + dy));
  }
  function handlePointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    const panned = zoom.panEnd();
    if (drag?.moved || panned) {
      suppressClickRef.current = true;
      setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
  }

  // Z1: центрирование вида на узле (навигация из замечаний; замена scrollIntoView)
  useEffect(() => {
    const id = String(focusNodeId || "");
    if (!id) return;
    const node = tobeById.get(id) || asisById.get(id);
    if (!node) return;
    const c = nodeCenter(node);
    zoom.focusOn(c.cx, c.cy, Math.max(c.w * 8, 300));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNodeId, focusSeq]);

  function renderFlow(flow, nodesById, layer) {
    const source = nodesById.get(String(flow?.source_ref || ""));
    const target = nodesById.get(String(flow?.target_ref || ""));
    if (!source || !target) return null;
    const flowId = String(flow?.id || `${flow?.source_ref}->${flow?.target_ref}`);
    const flowSelected = layer === "tobe" && flowId === String(selectedFlowId || "");
    const condition = String(flow?.condition || "").trim();
    const s = nodeCenter(source);
    const t = nodeCenter(target);
    return (
      <g key={`${layer}_flow_${flowId}`} data-flow-id={layer === "tobe" ? flowId : undefined}>
        <polyline
          className={`graph-canvas__flow${flowSelected ? " graph-canvas__flow--selected" : ""}`}
          points={flowPoints(source, target)}
          fill="none"
          stroke="#555"
          strokeWidth={flowSelected ? 3 : 1.5}
          markerEnd="url(#import-bpmn-arrow)"
          onClick={
            layer === "tobe" && typeof onSelectFlow === "function"
              ? () => { if (!suppressClickRef.current) onSelectFlow(flowId); }
              : undefined
          }
        />
        {condition ? (
          <text className="graph-canvas__flow-label" x={(s.x + s.w + t.x) / 2} y={(s.cy + t.cy) / 2 - 6} textAnchor="middle">
            {condition}
          </text>
        ) : null}
      </g>
    );
  }

  function renderNode(node, layer) {
    const id = String(node?.id || "");
    const { x, y, w, h, cx, cy } = nodeCenter(node);
    const label = String(node?.display_name || node?.name || id || "").trim();
    const type = String(node?.bpmn_type || "task");
    const labelBelow = isGatewayType(type) || isEventType(type);
    const isTobe = layer === "tobe";
    const selected = isTobe ? id === String(selectedTobeId || "") : id === String(selectedAsisId || "");
    const traceHl = isTobe ? highlights.tobe.has(id) : highlights.asis.has(id);
    const connectSource = isTobe && id === String(connectSourceId || "");
    const unreachable = isTobe && unreachableSet.has(id);
    return (
      <g
        key={`${layer}_${id || `${x}_${y}`}`}
        ref={(el) => { if (isTobe && id && nodeRefs && typeof nodeRefs === "object") nodeRefs.current[id] = el; }}
        data-element-id={id}
        data-bpmn-type={type}
        data-layer={layer}
        data-selected={selected ? "true" : "false"}
        className={`import-bpmn__node graph-canvas__node${selected && isTobe ? " import-bpmn__node--selected" : ""}${connectSource ? " graph-canvas__node--connect-source" : ""}${traceHl ? " graph-canvas__node--trace-highlight" : ""}`}
        onClick={() => {
          if (suppressClickRef.current || !id) return;
          if (isTobe) { if (typeof onSelectTobeNode === "function") onSelectTobeNode(id); }
          else if (typeof onSelectAsisNode === "function") onSelectAsisNode(id);
        }}
        onPointerDown={isTobe ? (e) => handleNodePointerDown(e, node) : undefined}
      >
        <NodeShape node={node} />
        <text x={cx} y={labelBelow ? y + h + 12 : cy} textAnchor="middle" dominantBaseline="middle">
          {label}
        </text>
        {isTobe && nodeBadges[id] ? (
          <text
            className={`graph-canvas__badge ${nodeBadges[id].className || ""}`}
            x={x + w - 4}
            y={y - 4}
            textAnchor="end"
            data-badge-for={id}
          >
            {nodeBadges[id].text}
          </text>
        ) : null}
        {unreachable ? (
          <text className="graph-canvas__warning" x={x + w - 4} y={y + 12} textAnchor="end">⚠</text>
        ) : null}
      </g>
    );
  }

  // Z1: миникарта при >MINIMAP_NODE_THRESHOLD узлах (оба слоя)
  const minimapNodes = useMemo(
    () => [...asisNodes.map((n) => ({ ...n, layer: "asis" })), ...tobeNodes],
    [asisNodes, tobeNodes],
  );
  const showMinimap = minimapNodes.length > MINIMAP_NODE_THRESHOLD;

  return (
    <div className="graph-canvas-viewport">
      <svg
        ref={svgRef}
        className="import-bpmn__svg graph-canvas graph-canvas--overlay"
        viewBox={zoom.viewBox}
        role="img"
        aria-label={ariaLabel}
        data-testid="graph-canvas-svg"
        data-zoom={zoom.percent}
        onPointerDown={zoom.panStart}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
      <defs>
        <marker id="import-bpmn-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#555" />
        </marker>
      </defs>

      {/* слой AS IS: read-only подложка (приглушение — через CSS-переменную темы) */}
      {asIsModel ? (
        <g className="graph-canvas__layer graph-canvas__layer--asis" data-layer="asis" data-testid="canvas-asis" data-readonly="true">
          {asisLanes.map((lane) => {
            const lx = Number(lane?.x) || 0;
            const ly = Number(lane?.y) || 0;
            const lw = Number(lane?.width) || 0;
            const lh = Number(lane?.height) || 0;
            if (lw <= 0 || lh <= 0) return null;
            return (
              <g key={`lane_${String(lane?.id || "")}`} className="graph-canvas__lane" data-element-id={String(lane?.id || "")}>
                <rect x={lx} y={ly} width={lw} height={lh} />
                <text x={lx + 8} y={ly + 16}>{String(lane?.name || "")}</text>
              </g>
            );
          })}
          {asisFlows.map((f) => renderFlow(f, asisById, "asis"))}
          {asisNodes.map((n) => renderNode(n, "asis"))}
        </g>
      ) : null}

      {/* пунктирные связи происхождения — МЕЖДУ слоями (OL1.4) */}
      {linkPairs.map(({ tobeId, asisId }) => {
        const tn = tobeById.get(tobeId);
        const an = asisById.get(asisId);
        if (!tn || !an) return null;
        const tc = nodeCenter(tn);
        const ac = nodeCenter(an);
        return (
          <line
            key={`trace_${tobeId}_${asisId}`}
            className="graph-canvas__trace-link"
            data-testid="trace-link"
            data-tobe={tobeId}
            data-asis={asisId}
            x1={tc.cx}
            y1={tc.y}
            x2={ac.cx}
            y2={ac.y + ac.h}
          />
        );
      })}

      {/* слой TO BE: активный, ПОВЕРХ (z-order → hit-priority, OL1.5) */}
      <g className="graph-canvas__layer graph-canvas__layer--tobe" data-layer="tobe" data-testid="canvas-tobe">
        {tobeFlows.map((f) => renderFlow(f, tobeById, "tobe"))}
        {tobeNodes.map((n) => renderNode(n, "tobe"))}
      </g>
      </svg>
      <GraphZoomControls
        percent={zoom.percent}
        onZoomIn={zoom.zoomIn}
        onZoomOut={zoom.zoomOut}
        onFit={zoom.fit}
        onActualSize={zoom.actualSize}
      />
      {showMinimap ? (
        <GraphMinimap
          nodes={minimapNodes}
          fitView={fitView}
          view={zoom.view}
          onNavigate={(x, y) => zoom.focusOn(x, y, zoom.view.w)}
        />
      ) : null}
    </div>
  );
}
