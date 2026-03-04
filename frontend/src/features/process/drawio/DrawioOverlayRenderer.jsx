import React, { useMemo } from "react";

import { parseDrawioSvgCache } from "./drawioSvg";
import { matrixToScreen } from "../stage/utils/hybridCoords.js";

function asObject(value) {
  return value && typeof value === "object" ? value : {};
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
  const origin = matrixToScreen(matrix, Number(asObject(meta.transform).x || 0), Number(asObject(meta.transform).y || 0));
  return (
    <div
      className="drawioLayerOverlay absolute inset-0 overflow-hidden"
      style={{ pointerEvents: "none", zIndex: 5 }}
      data-testid="drawio-overlay"
    >
      <div
        className="drawioLayerOverlaySvg"
        data-testid="drawio-overlay-svg"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          opacity: Math.max(0.05, Math.min(1, Number(meta.opacity || 1))),
          transformOrigin: "0 0",
          transform: `matrix(${Number(matrix.a || 1)}, ${Number(matrix.b || 0)}, ${Number(matrix.c || 0)}, ${Number(matrix.d || 1)}, ${Number(origin.x || 0)}, ${Number(origin.y || 0)})`,
        }}
        dangerouslySetInnerHTML={{ __html: parsed.svg }}
      />
    </div>
  );
}
