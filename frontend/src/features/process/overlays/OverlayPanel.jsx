import React from "react";
import "./overlayStyles.css";

export function OverlayPanel({ items = [], onItemClick }) {
  if (!items.length) return null;
  return (
    <div className="fpc-overlay-v2-panel">
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Overlays ({items.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((item, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onItemClick?.(item)}
            style={{
              textAlign: "left",
              background: "#f6f6f6",
              border: "1px solid #e0e0e0",
              borderRadius: 4,
              padding: "6px 8px",
              cursor: "pointer",
              fontSize: 12,
            }}
            title={item.title || item.text}
          >
            {item.text}
          </button>
        ))}
      </div>
    </div>
  );
}
