import React from "react";
import {
  asArray,
  asObject,
  isHybridIdSelected,
  renderTextLines,
  toText,
} from "./hybridRendererUtils.jsx";

export default function HybridElementsRenderer({
  elements,
  activeId,
  selectedIds,
  highlightedIds,
  bindingByHybridId,
  onElementPointerDown,
  onElementContextMenu,
  onElementDoubleClick,
}) {
  return (
    <>
      {asArray(elements).map((elementRaw) => {
        const element = asObject(elementRaw);
        const elementId = toText(element.id);
        const active = isHybridIdSelected(elementId, activeId, selectedIds);
        const highlighted = highlightedIds?.has?.(elementId);
        const binding = asObject(bindingByHybridId?.[elementId]);
        const style = asObject(element.style);
        const x = Number(element.left || 0);
        const y = Number(element.top || 0);
        const w = Number(element.width || 0);
        const h = Number(element.height || 0);
        const radius = Math.max(2, Number(style.radius || 8) * Number(element.scaleX || 1));
        const fontSize = Math.max(
          10,
          Number(style.fontSize || 12) * Math.min(Number(element.scaleX || 1), Number(element.scaleY || 1)),
        );
        const layerOpacity = Math.max(0.1, Math.min(1, Number(element.layerOpacity || 1)));
        const isContainer = element.is_container === true || toText(element.type) === "container";
        const isLocked = asObject(element.layer).locked === true;

        return (
          <g
            key={`hybrid_v2_element_${elementId}`}
            className={`hybridV2Shape ${active ? "isActive" : ""} ${highlighted ? "isPlayback" : ""} ${isLocked ? "isLocked" : ""}`}
            style={{ opacity: layerOpacity }}
            data-hybrid-element-id={elementId}
            data-selected={active ? "true" : "false"}
            data-locked={isLocked ? "true" : "false"}
            data-testid="hybrid-v2-shape"
            onMouseDown={(event) => onElementPointerDown?.(event, elementId)}
            onContextMenu={(event) => onElementContextMenu?.(event, elementId)}
            onDoubleClick={(event) => onElementDoubleClick?.(event, elementId)}
          >
            <rect
              x={x}
              y={y}
              width={Math.max(1, w)}
              height={Math.max(1, h)}
              fill="transparent"
              stroke="none"
              pointerEvents="none"
              data-testid={`hybrid-el-${elementId}`}
            />
            <title>{isLocked ? "Locked" : (toText(element.text) || elementId)}</title>
            {toText(element.type) === "text" ? (
              <text
                x={x + 6}
                y={y + Math.max(16, h / 2)}
                fill={toText(style.stroke) || "#334155"}
                fontSize={fontSize}
              >
                {renderTextLines(toText(element.text) || "Text", x + 6, y + Math.max(16, h / 2), Math.max(14, fontSize + 2))}
              </text>
            ) : (
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                rx={radius}
                ry={radius}
                fill={toText(style.fill) || (toText(element.type) === "note" ? "#fff7d6" : "#f8fafc")}
                stroke={toText(style.stroke) || "#334155"}
                strokeWidth={isContainer ? 1.8 : 1.4}
              />
            )}
            {isContainer ? (
              <line
                x1={x}
                y1={y + Math.max(18, 24 * Number(element.scaleY || 1))}
                x2={x + w}
                y2={y + Math.max(18, 24 * Number(element.scaleY || 1))}
                stroke={toText(style.stroke) || "#334155"}
                strokeWidth={1.2}
              />
            ) : null}
            {toText(element.type) !== "text" ? (
              <text
                x={x + 8}
                y={y + 20}
                fill="#0f172a"
                fontSize={fontSize}
              >
                {renderTextLines(toText(element.text) || "", x + 8, y + 20, Math.max(14, fontSize + 2))}
              </text>
            ) : null}
            {toText(binding.bpmn_id || "") ? (
              <text
                x={x + w - 10}
                y={y + 14}
                textAnchor="end"
                className="hybridV2BindingBadge"
              >
                🔗
              </text>
            ) : null}
          </g>
        );
      })}
    </>
  );
}
