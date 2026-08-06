// Z1 TOBE-UX — контролы zoom для SVG-канваса: ±/fit/1:1 + индикатор масштаба.
// Иконки — inline SVG (не эмодзи), подписи — i18n через t().
import React from "react";

import { t } from "../i18n";

const ICON_PROPS = { width: 14, height: 14, viewBox: "0 0 14 14", "aria-hidden": true, focusable: false };

export function IconZoomIn() {
  return (
    <svg {...ICON_PROPS}><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" /></svg>
  );
}

export function IconZoomOut() {
  return (
    <svg {...ICON_PROPS}><path d="M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" /></svg>
  );
}

export function IconZoomFit() {
  return (
    <svg {...ICON_PROPS}>
      <path
        d="M2 5V2h3M9 2h3v3M12 9v3H9M5 12H2V9"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"
      />
    </svg>
  );
}

export default function GraphZoomControls({ percent, onZoomIn, onZoomOut, onFit, onActualSize }) {
  return (
    <div className="graph-canvas__zoom" data-testid="graph-zoom-controls" role="group" aria-label={t("graph.zoomGroup")}>
      <button type="button" data-testid="graph-zoom-in" title={t("graph.zoomIn")} aria-label={t("graph.zoomIn")} onClick={onZoomIn}>
        <IconZoomIn />
      </button>
      <button type="button" data-testid="graph-zoom-out" title={t("graph.zoomOut")} aria-label={t("graph.zoomOut")} onClick={onZoomOut}>
        <IconZoomOut />
      </button>
      <button type="button" data-testid="graph-zoom-fit" title={t("graph.zoomFit")} aria-label={t("graph.zoomFit")} onClick={onFit}>
        <IconZoomFit />
      </button>
      <button type="button" data-testid="graph-zoom-100" title={t("graph.zoom100")} aria-label={t("graph.zoom100")} onClick={onActualSize}>
        1:1
      </button>
      <span className="graph-canvas__zoom-percent" data-testid="graph-zoom-percent">{percent}%</span>
    </div>
  );
}
