import React from "react";
import { canResizeHybridElement } from "../actions/hybridTransform.js";
import {
  asArray,
  asObject,
  isHybridIdSelected,
  toText,
} from "./hybridRendererUtils.jsx";

const CORNER_HANDLES = ["nw", "ne", "sw", "se"];

export default function HybridSelectionRenderer({
  mode,
  elements,
  activeId,
  selectedIds,
  onHandlePointerDown,
}) {
  return (
    <>
      {asArray(elements).map((elementRaw) => {
        const element = asObject(elementRaw);
        const elementId = toText(element.id);
        if (!isHybridIdSelected(elementId, activeId, selectedIds)) return null;

        const style = asObject(element.style);
        const x = Number(element.left || 0);
        const y = Number(element.top || 0);
        const w = Number(element.width || 0);
        const h = Number(element.height || 0);
        const radius = Math.max(2, Number(style.radius || 8) * Number(element.scaleX || 1));
        const isLocked = asObject(element.layer).locked === true;
        const canResize = canResizeHybridElement(element.type) && !isLocked;

        return (
          <g key={`hybrid_v2_selection_${elementId}`}>
            <rect
              x={x - 4}
              y={y - 4}
              width={w + 8}
              height={h + 8}
              rx={Math.max(4, radius + 2)}
              ry={Math.max(4, radius + 2)}
              className={`hybridV2SelectionOutline ${isLocked ? "isLocked" : ""}`}
              pointerEvents="none"
              data-testid="hybrid-v2-selection-outline"
            />
            {mode === "edit" && canResize
              ? CORNER_HANDLES.map((handle) => {
                const hx = handle.includes("e") ? x + w : x;
                const hy = handle.includes("s") ? y + h : y;
                return (
                  <g key={`hybrid_v2_handle_group_${elementId}_${handle}`}>
                    <rect
                      x={hx - 4}
                      y={hy - 4}
                      width={8}
                      height={8}
                      fill="transparent"
                      stroke="none"
                      pointerEvents="none"
                      data-testid={`hybrid-handle-${elementId}-${handle}`}
                    />
                    <rect
                      x={hx - 4}
                      y={hy - 4}
                      width={8}
                      height={8}
                      className="hybridV2ResizeHandle"
                      data-hybrid-element-id={elementId}
                      data-handle={handle}
                      data-testid="hybrid-v2-resize-handle"
                      onMouseDown={(event) => onHandlePointerDown?.(event, elementId, handle)}
                    />
                  </g>
                );
              })
              : null}
          </g>
        );
      })}
    </>
  );
}
