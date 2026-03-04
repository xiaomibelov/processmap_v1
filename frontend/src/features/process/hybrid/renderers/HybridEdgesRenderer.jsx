import React from "react";
import {
  asArray,
  asObject,
  isHybridIdSelected,
  toText,
} from "./hybridRendererUtils.jsx";

export default function HybridEdgesRenderer({
  edges,
  activeId,
  selectedIds,
  highlightedIds,
  onElementPointerDown,
  onElementContextMenu,
}) {
  return (
    <>
      {asArray(edges).map((edgeRaw) => {
        const edge = asObject(edgeRaw);
        const edgeId = toText(edge.id);
        const active = isHybridIdSelected(edgeId, activeId, selectedIds);
        const highlighted = highlightedIds?.has?.(edgeId);
        const style = asObject(edge.style);
        const stroke = toText(style.stroke) || "#2563eb";
        const width = Number(style.width || 2);
        const layerOpacity = Math.max(0.1, Math.min(1, Number(edge.layerOpacity || 1)));
        return (
          <g key={`hybrid_v2_edge_group_${edgeId}`}>
            <path
              d={toText(edge.d)}
              stroke="transparent"
              strokeWidth="1"
              fill="none"
              pointerEvents="none"
              data-testid={`hybrid-edge-${edgeId}`}
            />
            <path
              className={`hybridV2Edge ${active ? "isActive" : ""} ${highlighted ? "isPlayback" : ""}`}
              d={toText(edge.d)}
              stroke={stroke}
              strokeWidth={width}
              fill="none"
              markerEnd="url(#hybridV2ArrowHead)"
              style={{ opacity: layerOpacity }}
              data-hybrid-element-id={edgeId}
              data-selected={active ? "true" : "false"}
              data-testid="hybrid-v2-edge"
              onMouseDown={(event) => onElementPointerDown?.(event, edgeId)}
              onContextMenu={(event) => onElementContextMenu?.(event, edgeId)}
            />
          </g>
        );
      })}
    </>
  );
}
