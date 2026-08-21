import React from "react";

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

export default function HybridGhostRenderer({ ghost, arrowPreview }) {
  const safeGhost = asObject(ghost);
  const safeArrow = asObject(arrowPreview);
  const isGroupGhost = String(safeGhost.kind || "") === "group" && Array.isArray(safeGhost.items);
  return (
    <>
      {ghost ? (
        <>
          {isGroupGhost ? (
            <>
              {safeGhost.items.map((itemRaw) => {
                const item = asObject(itemRaw);
                return (
                  <rect
                    key={String(item.id || `${item.left}_${item.top}`)}
                    x={Number(item.left || 0)}
                    y={Number(item.top || 0)}
                    width={Number(item.width || 0)}
                    height={Number(item.height || 0)}
                    rx="6"
                    ry="6"
                    fill="rgba(37,99,235,0.1)"
                    stroke="#2563eb"
                    strokeDasharray="5 4"
                    pointerEvents="none"
                    data-testid="hybrid-stencil-ghost-item"
                  />
                );
              })}
            </>
          ) : null}
          <rect
            x={Number(safeGhost.left || 0)}
            y={Number(safeGhost.top || 0)}
            width={Number(safeGhost.width || 0)}
            height={Number(safeGhost.height || 0)}
            rx="8"
            ry="8"
            fill="transparent"
            stroke="none"
            pointerEvents="none"
            data-testid="hybrid-ghost"
          />
          <rect
            x={Number(safeGhost.left || 0)}
            y={Number(safeGhost.top || 0)}
            width={Number(safeGhost.width || 0)}
            height={Number(safeGhost.height || 0)}
            rx="8"
            ry="8"
            fill="rgba(37,99,235,0.08)"
            stroke="#2563eb"
            strokeDasharray="6 4"
            pointerEvents="none"
            data-testid="hybrid-v2-ghost"
          />
        </>
      ) : null}
      {arrowPreview ? (
        <line
          x1={Number(safeArrow.x1 || 0)}
          y1={Number(safeArrow.y1 || 0)}
          x2={Number(safeArrow.x2 || 0)}
          y2={Number(safeArrow.y2 || 0)}
          stroke="#2563eb"
          strokeWidth="2"
          strokeDasharray="6 4"
          pointerEvents="none"
          data-testid="hybrid-v2-arrow-preview"
        />
      ) : null}
    </>
  );
}
