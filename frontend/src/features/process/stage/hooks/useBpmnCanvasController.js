import { useCallback, useEffect, useRef, useState } from "react";

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

export default function useBpmnCanvasController({
  tab,
  hybridVisible,
  hybridLayerItems,
  bpmnStageHostRef,
  toText,
  toNodeId,
  cssEscapeAttr,
  parseSvgMatrix,
  matrixToDiagram,
}) {
  const hybridLayerPositionsRef = useRef({});
  const hybridViewportMatrixRef = useRef({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  const [hybridLayerPositions, setHybridLayerPositions] = useState({});
  const [hybridViewportSize, setHybridViewportSize] = useState({ width: 0, height: 0 });
  const [hybridViewportMatrix, setHybridViewportMatrix] = useState({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

  const readHybridElementAnchor = useCallback((elementIdRaw) => {
    const host = bpmnStageHostRef.current;
    const elementId = toText(elementIdRaw);
    if (!host || !elementId) return null;
    const escaped = cssEscapeAttr(elementId);
    if (!escaped) return null;
    const candidateSelectors = [
      `g.djs-element.djs-shape[data-element-id="${escaped}"]`,
      `g[data-element-id="${escaped}"]`,
      `[data-element-id="${escaped}"]`,
    ];
    let target = null;
    for (let i = 0; i < candidateSelectors.length; i += 1) {
      const selector = candidateSelectors[i];
      const found = host.querySelector(selector);
      if (!found) continue;
      const rect = found.getBoundingClientRect?.();
      if (Number(rect?.width || 0) > 1 && Number(rect?.height || 0) > 1) {
        target = found;
        break;
      }
      if (!target) target = found;
    }
    if (!target) return null;
    const targetRect = target.getBoundingClientRect?.();
    const hostRect = host.getBoundingClientRect?.();
    const width = Number(targetRect?.width || 0);
    const height = Number(targetRect?.height || 0);
    if (!(width > 0) || !(height > 0)) return null;
    const x = Number(targetRect?.left || 0) - Number(hostRect?.left || 0) + (width / 2);
    const y = Number(targetRect?.top || 0) - Number(hostRect?.top || 0) + (height / 2);
    const diagramPoint = matrixToDiagram(hybridViewportMatrixRef.current, x, y);
    return {
      x: Number(diagramPoint.x || 0),
      y: Number(diagramPoint.y || 0),
      screenX: x,
      screenY: y,
      width,
      height,
    };
  }, [bpmnStageHostRef, cssEscapeAttr, matrixToDiagram, toText]);

  const resolveHybridTargetElementIdFromPoint = useCallback((clientXRaw, clientYRaw) => {
    if (typeof document === "undefined") return "";
    const host = bpmnStageHostRef.current;
    const clientX = Number(clientXRaw || 0);
    const clientY = Number(clientYRaw || 0);
    if (!host || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return "";
    const points = typeof document.elementsFromPoint === "function"
      ? document.elementsFromPoint(clientX, clientY)
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
    if (bestId) return bestId;
    return "";
  }, [bpmnStageHostRef, toNodeId]);

  const resolveFirstHybridSeedElementId = useCallback(() => {
    const host = bpmnStageHostRef.current;
    if (!host) return "";
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
  }, [bpmnStageHostRef, toNodeId]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (tab !== "diagram" || !hybridVisible) {
      setHybridLayerPositions({});
      hybridLayerPositionsRef.current = {};
      setHybridViewportSize((prevRaw) => {
        const prev = asObject(prevRaw);
        if (Number(prev.width || 0) === 0 && Number(prev.height || 0) === 0) return prev;
        return { width: 0, height: 0 };
      });
      setHybridViewportMatrix({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      hybridViewportMatrixRef.current = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      return undefined;
    }
    let canceled = false;
    let timerId = 0;
    const compute = () => {
      if (canceled) return;
      const host = bpmnStageHostRef.current;
      const hostRect = host?.getBoundingClientRect?.();
      const nextWidth = Math.max(0, Math.round(Number(hostRect?.width || host?.clientWidth || 0)));
      const nextHeight = Math.max(0, Math.round(Number(hostRect?.height || host?.clientHeight || 0)));
      setHybridViewportSize((prevRaw) => {
        const prev = asObject(prevRaw);
        if (Number(prev.width || 0) === nextWidth && Number(prev.height || 0) === nextHeight) return prev;
        return { width: nextWidth, height: nextHeight };
      });
      const viewportEl = host?.querySelector?.(".djs-viewport");
      const nextMatrix = parseSvgMatrix(viewportEl?.getAttribute?.("transform"));
      hybridViewportMatrixRef.current = nextMatrix;
      setHybridViewportMatrix((prevRaw) => {
        const prev = asObject(prevRaw);
        if (
          Math.abs(Number(prev.a || 0) - Number(nextMatrix.a || 0)) < 0.0001
          && Math.abs(Number(prev.b || 0) - Number(nextMatrix.b || 0)) < 0.0001
          && Math.abs(Number(prev.c || 0) - Number(nextMatrix.c || 0)) < 0.0001
          && Math.abs(Number(prev.d || 0) - Number(nextMatrix.d || 0)) < 0.0001
          && Math.abs(Number(prev.e || 0) - Number(nextMatrix.e || 0)) < 0.1
          && Math.abs(Number(prev.f || 0) - Number(nextMatrix.f || 0)) < 0.1
        ) {
          return prev;
        }
        return nextMatrix;
      });
      const next = {};
      hybridLayerItems.forEach((itemRaw) => {
        const item = asObject(itemRaw);
        const elementId = toText(item?.elementId);
        if (!elementId) return;
        const anchor = readHybridElementAnchor(elementId);
        if (!anchor) return;
        next[elementId] = anchor;
      });
      const prev = asObject(hybridLayerPositionsRef.current);
      const changed = Object.keys(next).length !== Object.keys(prev).length || Object.keys(next).some((key) => {
        const a = asObject(prev[key]);
        const b = asObject(next[key]);
        return Math.abs(Number(a.x || 0) - Number(b.x || 0)) > 0.5
          || Math.abs(Number(a.y || 0) - Number(b.y || 0)) > 0.5
          || Math.abs(Number(a.width || 0) - Number(b.width || 0)) > 0.5
          || Math.abs(Number(a.height || 0) - Number(b.height || 0)) > 0.5;
      });
      if (changed) {
        hybridLayerPositionsRef.current = next;
        setHybridLayerPositions(next);
      }
    };
    compute();
    timerId = window.setInterval(compute, 180);
    return () => {
      canceled = true;
      if (timerId) window.clearInterval(timerId);
    };
  }, [
    bpmnStageHostRef,
    hybridLayerItems,
    hybridVisible,
    parseSvgMatrix,
    readHybridElementAnchor,
    tab,
    toText,
  ]);

  return {
    hybridLayerPositions,
    hybridLayerPositionsRef,
    hybridViewportSize,
    hybridViewportMatrix,
    hybridViewportMatrixRef,
    readHybridElementAnchor,
    resolveHybridTargetElementIdFromPoint,
    resolveFirstHybridSeedElementId,
    setHybridLayerPositions,
    setHybridViewportMatrix,
    setHybridViewportSize,
  };
}
