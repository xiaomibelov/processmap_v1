function resolveHybridTargetElementIdFromPoint({
  documentLike,
  host,
  clientXRaw,
  clientYRaw,
  toNodeId,
}) {
  if (!documentLike || !(host instanceof Element)) return "";
  const clientX = Number(clientXRaw || 0);
  const clientY = Number(clientYRaw || 0);
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return "";
  const points = typeof documentLike.elementsFromPoint === "function"
    ? documentLike.elementsFromPoint(clientX, clientY)
    : [];
  const selector = "g.djs-element.djs-shape[data-element-id], g.djs-shape[data-element-id]";
  for (let i = 0; i < points.length; i += 1) {
    const row = points[i];
    if (!(row instanceof Element)) continue;
    if (!host.contains(row)) continue;
    if (row.closest?.(".hybridLayerCard, .hybridLayerHotspot")) continue;
    const candidate = row.closest?.(selector) || (row.matches?.(selector) ? row : null);
    const elementId = toNodeId(candidate?.getAttribute?.("data-element-id") || row.getAttribute?.("data-element-id"));
    if (!elementId) continue;
    return elementId;
  }
  const shapes = host.querySelectorAll("g.djs-element.djs-shape[data-element-id], g.djs-shape[data-element-id]");
  let bestId = "";
  let bestArea = Number.POSITIVE_INFINITY;
  for (let i = 0; i < shapes.length; i += 1) {
    const shape = shapes[i];
    if (!(shape instanceof Element)) continue;
    const rect = shape.getBoundingClientRect?.();
    const left = Number(rect?.left || 0);
    const top = Number(rect?.top || 0);
    const width = Number(rect?.width || 0);
    const height = Number(rect?.height || 0);
    if (!(width > 0) || !(height > 0)) continue;
    const right = left + width;
    const bottom = top + height;
    if (clientX < left || clientX > right || clientY < top || clientY > bottom) continue;
    const area = width * height;
    if (area < bestArea) {
      bestArea = area;
      bestId = toNodeId(shape.getAttribute("data-element-id"));
    }
  }
  return bestId || "";
}

function resolveFirstHybridSeedElementId({
  host,
  toNodeId,
}) {
  if (!(host instanceof Element)) return "";
  const shapes = host.querySelectorAll("g.djs-element.djs-shape[data-element-id], g.djs-shape[data-element-id]");
  for (let i = 0; i < shapes.length; i += 1) {
    const row = shapes[i];
    if (!(row instanceof Element)) continue;
    const elementId = toNodeId(row.getAttribute("data-element-id"));
    if (!elementId) continue;
    const lowered = elementId.toLowerCase();
    if (
      lowered.includes("startevent")
      || lowered.includes("endevent")
      || lowered.includes("lane")
      || lowered.includes("participant")
    ) {
      continue;
    }
    const rect = row.getBoundingClientRect?.();
    if (Number(rect?.width || 0) < 2 || Number(rect?.height || 0) < 2) continue;
    return elementId;
  }
  return "";
}

export {
  resolveFirstHybridSeedElementId,
  resolveHybridTargetElementIdFromPoint,
};
