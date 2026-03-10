import { useCallback, useEffect, useRef, useState } from "react";

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

export default function useBpmnCanvasController({
  canvasApi,
  tab,
  hybridVisible,
  hybridLayerItems,
  bpmnStageHostRef,
  toText,
  toNodeId,
  cssEscapeAttr,
  localToDiagram,
  getElementBBox,
}) {
  const hybridLayerPositionsRef = useRef({});
  const [hybridLayerPositions, setHybridLayerPositions] = useState({});

  const getCanvasHost = useCallback(() => {
    const fromApi = canvasApi?.getCanvasContainerEl?.();
    if (fromApi instanceof Element) return fromApi;
    return bpmnStageHostRef.current;
  }, [bpmnStageHostRef, canvasApi]);

  const readHybridElementAnchor = useCallback((elementIdRaw) => {
    const elementId = toText(elementIdRaw);
    if (!elementId) return null;
    const bounds = canvasApi?.getElementBBox?.(elementId) || getElementBBox?.(elementId);
    if (
      Number.isFinite(bounds?.x)
      && Number.isFinite(bounds?.y)
      && Number.isFinite(bounds?.width)
      && Number.isFinite(bounds?.height)
      && Number(bounds?.width) > 0
      && Number(bounds?.height) > 0
    ) {
      return {
        x: Number(bounds.x) + (Number(bounds.width) / 2),
        y: Number(bounds.y) + (Number(bounds.height) / 2),
        screenX: 0,
        screenY: 0,
        width: Number(bounds.width),
        height: Number(bounds.height),
      };
    }
    const host = getCanvasHost();
    if (!host) return null;
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
    const diagramPoint = localToDiagram(x, y);
    return {
      x: Number(diagramPoint.x || 0),
      y: Number(diagramPoint.y || 0),
      screenX: x,
      screenY: y,
      width,
      height,
    };
  }, [canvasApi, cssEscapeAttr, getCanvasHost, getElementBBox, localToDiagram, toText]);

  const resolveHybridTargetElementIdFromPoint = useCallback((clientXRaw, clientYRaw) => {
    if (typeof document === "undefined") return "";
    const host = getCanvasHost();
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
  }, [getCanvasHost, toNodeId]);

  const resolveFirstHybridSeedElementId = useCallback(() => {
    const host = getCanvasHost();
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
  }, [getCanvasHost, toNodeId]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (tab !== "diagram" || !hybridVisible) {
      setHybridLayerPositions({});
      hybridLayerPositionsRef.current = {};
      return undefined;
    }
    let canceled = false;
    let timerId = 0;
    const compute = () => {
      if (canceled) return;
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
    timerId = window.setInterval(compute, 320);
    return () => {
      canceled = true;
      if (timerId) window.clearInterval(timerId);
    };
  }, [
    hybridLayerItems,
    hybridVisible,
    readHybridElementAnchor,
    tab,
    toText,
  ]);

  return {
    hybridLayerPositions,
    hybridLayerPositionsRef,
    readHybridElementAnchor,
    resolveHybridTargetElementIdFromPoint,
    resolveFirstHybridSeedElementId,
  };
}
