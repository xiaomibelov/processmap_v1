import React from "react";

/**
 * Visible runtime version badge for the Diagram tab.
 *
 * Shows: appVersion · shaShort · date · contourId
 * Must be visible even during loading.
 */
export default function DiagramRuntimeVersionBadge({ buildInfo, contourId }) {
  if (!buildInfo) return null;

  const {
    appVersion = "",
    shaShort = "",
    timestamp = "",
    contourId: buildContourId = "",
  } = buildInfo;

  const displayContour = contourId || buildContourId || "unknown";

  let dateStr = "";
  try {
    const d = new Date(timestamp);
    if (!Number.isNaN(d.getTime())) {
      dateStr = d.toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    }
  } catch {
    // ignore parse errors
  }

  const parts = [appVersion, shaShort, dateStr, displayContour].filter(Boolean);
  if (parts.length === 0) return null;

  return (
    <div
      data-testid="diagram-runtime-version-badge"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 8px",
        borderRadius: 4,
        background: "rgba(0,0,0,0.5)",
        color: "#fff",
        fontSize: 11,
        fontFamily: "monospace",
        whiteSpace: "nowrap",
        pointerEvents: "none",
        userSelect: "text",
      }}
      title={`Build: ${appVersion} · ${shaShort} · ${timestamp} · ${displayContour}`}
    >
      {parts.join(" · ")}
    </div>
  );
}
