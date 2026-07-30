import React, { useMemo, useRef } from "react";

import "./GraphCanvas.css";

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function nodeCenter(node) {
  const x = Number(node?.x) || 0;
  const y = Number(node?.y) || 0;
  const w = Number(node?.width) || 100;
  const h = Number(node?.height) || 60;
  return { cx: x + w / 2, cy: y + h / 2, x, y, w, h };
}

export function flowPoints(source, target) {
  const s = nodeCenter(source);
  const t = nodeCenter(target);
  const sx = s.x + s.w;
  const sy = s.cy;
  const tx = t.x;
  const ty = t.cy;
  const midX = sx + Math.max((tx - sx) / 2, 24);
  return `${sx},${sy} ${midX},${sy} ${midX},${ty} ${tx},${ty}`;
}

export function computeViewBox(uiModel) {
  const pad = 40;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (bx, by, bw, bh) => {
    minX = Math.min(minX, bx);
    minY = Math.min(minY, by);
    maxX = Math.max(maxX, bx + bw);
    maxY = Math.max(maxY, by + bh);
  };
  asArray(uiModel?.nodes).forEach((n) => {
    visit(Number(n?.x) || 0, Number(n?.y) || 0, Number(n?.width) || 100, Number(n?.height) || 60);
  });
  asArray(uiModel?.lanes).forEach((l) => {
    if (Number(l?.width) > 0 && Number(l?.height) > 0) {
      visit(Number(l?.x) || 0, Number(l?.y) || 0, Number(l?.width) || 0, Number(l?.height) || 0);
    }
  });
  if (!Number.isFinite(minX)) {
    minX = 0; minY = 0; maxX = 400; maxY = 200;
  }
  return `${minX - pad} ${minY - pad} ${Math.max(maxX - minX + pad * 2, 100)} ${Math.max(maxY - minY + pad * 2, 100)}`;
}

function isGatewayType(bpmnType) {
  const t = String(bpmnType || "");
  return t === "exclusiveGateway" || t === "parallelGateway" || t.endsWith("Gateway");
}

function isEventType(bpmnType) {
  const t = String(bpmnType || "");
  return t.endsWith("Event");
}

function NodeShape({ node }) {
  const { x, y, w, h, cx, cy } = nodeCenter(node);
  const type = String(node?.bpmn_type || "task");
  if (isGatewayType(type)) {
    const points = `${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`;
    const marker = type === "parallelGateway" ? "+" : "✕";
    return (
      <>
        <polygon className="graph-canvas__shape graph-canvas__shape--gateway" points={points} />
        <text className="graph-canvas__marker" x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
          {marker}
        </text>
      </>
    );
  }
  if (isEventType(type)) {
    const r = Math.min(w, h) / 2;
    const thick = type === "endEvent";
    return (
      <circle
        className={`graph-canvas__shape graph-canvas__shape--event${thick ? " graph-canvas__shape--end" : ""}`}
        cx={cx}
        cy={cy}
        r={r}
      />
    );
  }
  return <rect className="graph-canvas__shape graph-canvas__shape--task" x={x} y={y} width={w} height={h} rx={6} />;
}

// Shared SVG graph renderer for ui_model (E3 preview + E4 constructor).
// Editable extras are optional: onNodeMove (drag), onSelectFlow, connectSourceId,
// unreachableNodeIds (warning badges), nodeRefs (external element registry),
// nodeBadges ({id: {text, className}} — статусные бейджи блоков, WS1).
export default function GraphCanvas({
  uiModel,
  selectedElementId = "",
  onSelectNode,
  onSelectFlow,
  onNodeMove,
  connectSourceId = "",
  unreachableNodeIds = [],
  nodeBadges = {},
  selectedFlowId = "",
  nodeRefs = null,
  ariaLabel = "Граф процесса",
}) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);

  const nodes = asArray(uiModel?.nodes);
  const flows = asArray(uiModel?.flows);
  const lanes = asArray(uiModel?.lanes);
  const viewBox = useMemo(() => computeViewBox(uiModel), [uiModel]);
  const nodesById = useMemo(() => {
    const map = new Map();
    nodes.forEach((n) => map.set(String(n?.id || ""), n));
    return map;
  }, [nodes]);
  const unreachableSet = useMemo(
    () => new Set(asArray(unreachableNodeIds).map(String)),
    [unreachableNodeIds],
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
    // fallback: scale via bounding rect vs viewBox
    const rect = svg.getBoundingClientRect();
    const [vx, vy, vw, vh] = viewBox.split(" ").map(Number);
    const sx = rect.width ? vw / rect.width : 1;
    const sy = rect.height ? vh / rect.height : 1;
    return {
      x: vx + (event.clientX - rect.left) * sx,
      y: vy + (event.clientY - rect.top) * sy,
    };
  }

  function handleNodePointerDown(event, node) {
    if (typeof onNodeMove !== "function") return;
    const id = String(node?.id || "");
    if (!id) return;
    const start = svgPoint(event);
    dragRef.current = {
      id,
      startX: start.x,
      startY: start.y,
      origX: Number(node?.x) || 0,
      origY: Number(node?.y) || 0,
      moved: false,
    };
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    if (!drag) return;
    const p = svgPoint(event);
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;
    if (!drag.moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
    drag.moved = true;
    if (typeof onNodeMove === "function") {
      onNodeMove(drag.id, Math.round(drag.origX + dx), Math.round(drag.origY + dy));
    }
  }

  function handlePointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.moved) {
      suppressClickRef.current = true;
      setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
  }

  function handleNodeClick(id) {
    if (suppressClickRef.current) return;
    if (id && typeof onSelectNode === "function") onSelectNode(id);
  }

  return (
    <svg
      ref={svgRef}
      className="import-bpmn__svg graph-canvas"
      viewBox={viewBox}
      role="img"
      aria-label={ariaLabel}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <defs>
        <marker
          id="import-bpmn-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#555" />
        </marker>
      </defs>
      {lanes.map((lane) => {
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
      {flows.map((flow) => {
        const source = nodesById.get(String(flow?.source_ref || ""));
        const target = nodesById.get(String(flow?.target_ref || ""));
        if (!source || !target) return null;
        const flowId = String(flow?.id || `${flow?.source_ref}->${flow?.target_ref}`);
        const flowSelected = flowId && flowId === String(selectedFlowId || "");
        const condition = String(flow?.condition || "").trim();
        const s = nodeCenter(source);
        const t = nodeCenter(target);
        const labelX = (s.x + s.w + t.x) / 2;
        const labelY = (s.cy + t.cy) / 2 - 6;
        return (
          <g key={flowId} data-flow-id={flowId}>
            <polyline
              className={`graph-canvas__flow${flowSelected ? " graph-canvas__flow--selected" : ""}`}
              points={flowPoints(source, target)}
              fill="none"
              stroke="#555"
              strokeWidth={flowSelected ? 3 : 1.5}
              markerEnd="url(#import-bpmn-arrow)"
              onClick={
                typeof onSelectFlow === "function"
                  ? () => { if (!suppressClickRef.current) onSelectFlow(flowId); }
                  : undefined
              }
            />
            {condition ? (
              <text className="graph-canvas__flow-label" x={labelX} y={labelY} textAnchor="middle">
                {condition}
              </text>
            ) : null}
          </g>
        );
      })}
      {nodes.map((node) => {
        const id = String(node?.id || "");
        const { x, y, w, h, cx, cy } = nodeCenter(node);
        const label = String(node?.display_name || node?.name || id || "").trim();
        const selected = id && id === String(selectedElementId || "");
        const connectSource = id && id === String(connectSourceId || "");
        const unreachable = id && unreachableSet.has(id);
        const type = String(node?.bpmn_type || "task");
        const labelBelow = isGatewayType(type) || isEventType(type);
        return (
          <g
            key={id || `${x}_${y}`}
            ref={(el) => { if (id && nodeRefs && typeof nodeRefs === "object") nodeRefs.current[id] = el; }}
            data-element-id={id}
            data-bpmn-type={type}
            data-selected={selected ? "true" : "false"}
            className={`import-bpmn__node graph-canvas__node${selected ? " import-bpmn__node--selected" : ""}${connectSource ? " graph-canvas__node--connect-source" : ""}`}
            onClick={() => handleNodeClick(id)}
            onPointerDown={(e) => handleNodePointerDown(e, node)}
          >
            <NodeShape node={node} />
            <text
              x={cx}
              y={labelBelow ? y + h + 12 : cy}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {label}
            </text>
            {nodeBadges[id] ? (
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
              <text className="graph-canvas__warning" x={x + w - 4} y={y + 12} textAnchor="end">
                ⚠
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
