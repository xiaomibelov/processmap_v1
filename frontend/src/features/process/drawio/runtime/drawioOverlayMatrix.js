function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

export function resolveDrawioOverlayRenderMatrix({
  overlayMatrix,
  overlayMatrixRef,
  getOverlayMatrix,
} = {}) {
  if (typeof getOverlayMatrix === "function") {
    const fromGetter = getOverlayMatrix();
    if (fromGetter && typeof fromGetter === "object") return asObject(fromGetter);
  }
  const fromRef = overlayMatrixRef?.current;
  if (fromRef && typeof fromRef === "object") return asObject(fromRef);
  return asObject(overlayMatrix);
}

export default resolveDrawioOverlayRenderMatrix;
