import { useCallback, useEffect, useRef, useState } from "react";
import {
  resolveFirstHybridSeedElementId as resolveFirstHybridSeedElementIdImpl,
  resolveHybridTargetElementIdFromPoint as resolveHybridTargetElementIdFromPointImpl,
} from "./bpmnHybridHitTest.js";

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
    return resolveHybridTargetElementIdFromPointImpl({
      documentLike: typeof document !== "undefined" ? document : null,
      host: getCanvasHost(),
      clientXRaw,
      clientYRaw,
      toNodeId,
    });
  }, [getCanvasHost, toNodeId]);

  const resolveFirstHybridSeedElementId = useCallback(() => {
    return resolveFirstHybridSeedElementIdImpl({
      host: getCanvasHost(),
      toNodeId,
    });
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
