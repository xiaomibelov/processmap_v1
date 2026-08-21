import React from "react";

export default function HybridContextAnchor({ contextMenu }) {
  if (!contextMenu) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute"
      style={{
        left: `${Math.round(Number(contextMenu.clientX || 0))}px`,
        top: `${Math.round(Number(contextMenu.clientY || 0))}px`,
        width: "1px",
        height: "1px",
      }}
      data-testid="hybrid-context-anchor"
    />
  );
}
