import React, { useMemo } from "react";

import { parseDrawioSvgCache } from "./drawioSvg";

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toNumber(valueRaw, fallback = 0) {
  const value = Number(valueRaw);
  return Number.isFinite(value) ? value : fallback;
}

export default function DrawioOverlayRenderer({
  visible,
  drawioMeta,
  overlayMatrix,
}) {
  const parsed = useMemo(
    () => parseDrawioSvgCache(asObject(drawioMeta).svg_cache),
    [drawioMeta],
  );
  if (!visible || !parsed?.svg) return null;
  const meta = asObject(drawioMeta);
  const matrix = asObject(overlayMatrix);
  const tx = toNumber(asObject(meta.transform).x, 0);
  const ty = toNumber(asObject(meta.transform).y, 0);
  const a = toNumber(matrix.a, 1);
  const b = toNumber(matrix.b, 0);
  const c = toNumber(matrix.c, 0);
  const d = toNumber(matrix.d, 1);
  const e = toNumber(matrix.e, 0);
  const f = toNumber(matrix.f, 0);
  const opacity = Math.max(0.05, Math.min(1, Number(meta.opacity || 1)));
  return (
    <div
      className="drawioLayerOverlay absolute inset-0 overflow-hidden"
      style={{ pointerEvents: "none", zIndex: 5 }}
      data-testid="drawio-overlay-root"
    >
      <div
        className="drawioLayerOverlay absolute inset-0 overflow-hidden"
        style={{ pointerEvents: "none" }}
      data-testid="drawio-overlay"
      >
        <svg
          className="drawioLayerOverlaySvg"
          data-testid="drawio-overlay-svg"
          style={{ position: "absolute", left: 0, top: 0, opacity }}
          width="100%"
          height="100%"
        >
          <g transform={`matrix(${a},${b},${c},${d},${e},${f}) translate(${tx},${ty})`}>
            <g dangerouslySetInnerHTML={{ __html: parsed.body }} />
          </g>
        </svg>
      </div>
    </div>
  );
}
