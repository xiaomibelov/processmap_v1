// Z1 TOBE-UX — миникарта канваса (показывается при >MINIMAP_NODE_THRESHOLD узлах).
// Упрощённые прямоугольники узлов + рамка текущего вьюпорта; клик/drag —
// центрирование вида. Без новых зависимостей, pure SVG.
import React, { useRef } from "react";

import { formatViewBox } from "./viewBoxZoom";
import { t } from "../i18n";

export default function GraphMinimap({ nodes = [], fitView, view, onNavigate }) {
  const ref = useRef(null);

  function pointFromEvent(event) {
    const el = ref.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: fitView.x + ((event.clientX - rect.left) / rect.width) * fitView.w,
      y: fitView.y + ((event.clientY - rect.top) / rect.height) * fitView.h,
    };
  }

  function handlePointer(event) {
    const p = pointFromEvent(event);
    if (p && typeof onNavigate === "function") onNavigate(p.x, p.y);
  }

  return (
    <svg
      ref={ref}
      className="graph-canvas__minimap"
      data-testid="graph-minimap"
      viewBox={formatViewBox(fitView)}
      role="img"
      aria-label={t("graph.minimap")}
      onPointerDown={handlePointer}
      onPointerMove={(e) => { if (e.buttons) handlePointer(e); }}
    >
      <rect
        className="graph-canvas__minimap-bg"
        x={fitView.x} y={fitView.y} width={fitView.w} height={fitView.h}
      />
      {nodes.map((n, i) => (
        <rect
          key={`mm_${String(n?.id || i)}`}
          className={`graph-canvas__minimap-node${n?.layer === "asis" ? " graph-canvas__minimap-node--asis" : ""}`}
          x={Number(n?.x) || 0}
          y={Number(n?.y) || 0}
          width={Math.max(Number(n?.width) || 100, fitView.w * 0.004)}
          height={Math.max(Number(n?.height) || 60, fitView.h * 0.004)}
        />
      ))}
      {view ? (
        <rect
          className="graph-canvas__minimap-viewport"
          data-testid="graph-minimap-viewport"
          x={view.x} y={view.y} width={view.w} height={view.h}
        />
      ) : null}
    </svg>
  );
}
