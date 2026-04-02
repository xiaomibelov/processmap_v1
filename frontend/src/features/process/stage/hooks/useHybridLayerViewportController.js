import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildHybridLayerCounts,
  buildHybridLayerMissingBindingIds,
  buildHybridLayerRenderRows,
  buildHybridLayerVisibilityStats,
} from "./hybridLayerViewportProjection.js";

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

export default function useHybridLayerViewportController({
  resetKey,
  tab,
  hybridVisible,
  hybridModeEffective,
  hybridLayerItems,
  hybridLayerPositions,
  hybridLayerByElementId,
  hybridViewportSize,
  hybridViewportMatrix,
  hybridLayerActiveElementId,
  matrixToDiagram,
  matrixToScreen,
  toText,
}) {
  const hybridLayerCardRefCallbacksRef = useRef({});
  const hybridLayerCardNodeRefsRef = useRef({});
  const hybridLayerCardSizesRef = useRef({});
  const [hybridLayerCardSizes, setHybridLayerCardSizes] = useState({});

  useEffect(() => {
    hybridLayerCardRefCallbacksRef.current = {};
    hybridLayerCardNodeRefsRef.current = {};
    hybridLayerCardSizesRef.current = {};
    setHybridLayerCardSizes({});
  }, [resetKey]);

  const setHybridLayerCardNode = useCallback((elementIdRaw, node) => {
    const elementId = toText(elementIdRaw);
    if (!elementId) return;
    if (node instanceof HTMLElement) {
      hybridLayerCardNodeRefsRef.current[elementId] = node;
      return;
    }
    if (hybridLayerCardNodeRefsRef.current[elementId]) delete hybridLayerCardNodeRefsRef.current[elementId];
  }, [toText]);

  const getHybridLayerCardRefCallback = useCallback((elementIdRaw) => {
    const elementId = toText(elementIdRaw);
    if (!elementId) return () => {};
    const existing = hybridLayerCardRefCallbacksRef.current[elementId];
    if (existing) return existing;
    const next = (node) => {
      setHybridLayerCardNode(elementId, node);
    };
    hybridLayerCardRefCallbacksRef.current[elementId] = next;
    return next;
  }, [setHybridLayerCardNode, toText]);

  const refreshHybridLayerCardSizes = useCallback(() => {
    const refs = asObject(hybridLayerCardNodeRefsRef.current);
    const next = { ...asObject(hybridLayerCardSizesRef.current) };
    let changed = false;
    Object.keys(next).forEach((elementIdRaw) => {
      const elementId = toText(elementIdRaw);
      if (!elementId || refs[elementId] instanceof HTMLElement) return;
      delete next[elementId];
      changed = true;
    });
    Object.keys(refs).forEach((elementIdRaw) => {
      const elementId = toText(elementIdRaw);
      const node = refs[elementId];
      if (!(node instanceof HTMLElement)) return;
      const rect = node.getBoundingClientRect?.();
      const width = Math.max(0, Math.round(Number(rect?.width || node.offsetWidth || 0)));
      const height = Math.max(0, Math.round(Number(rect?.height || node.offsetHeight || 0)));
      const prev = asObject(next[elementId]);
      if (Math.abs(Number(prev.width || 0) - width) > 0.5 || Math.abs(Number(prev.height || 0) - height) > 0.5) {
        next[elementId] = { width, height };
        changed = true;
      }
    });
    if (!changed) return;
    hybridLayerCardSizesRef.current = next;
    setHybridLayerCardSizes(next);
  }, [toText]);

  const hybridLayerRenderRows = useMemo(() => buildHybridLayerRenderRows({
    hybridLayerItems,
    hybridLayerPositions,
    hybridLayerByElementId,
    hybridViewportSize,
    hybridViewportMatrix,
    hybridModeEffective,
    hybridLayerActiveElementId,
    hybridLayerCardSizes,
    matrixToDiagram,
    matrixToScreen,
    toText,
  }), [
    hybridLayerActiveElementId,
    hybridLayerByElementId,
    hybridLayerCardSizes,
    hybridLayerItems,
    hybridLayerPositions,
    hybridModeEffective,
    hybridViewportMatrix,
    hybridViewportSize,
    matrixToDiagram,
    matrixToScreen,
    toText,
  ]);

  const hybridLayerMissingBindingIds = useMemo(
    () => buildHybridLayerMissingBindingIds(hybridLayerRenderRows, toText),
    [hybridLayerRenderRows, toText],
  );

  const hybridLayerVisibilityStats = useMemo(() => {
    return buildHybridLayerVisibilityStats(hybridLayerRenderRows, toText);
  }, [hybridLayerRenderRows, toText]);

  const hybridLayerCounts = useMemo(
    () => buildHybridLayerCounts(hybridLayerVisibilityStats),
    [hybridLayerVisibilityStats],
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (tab !== "diagram" || !hybridVisible) return undefined;
    const raf = window.requestAnimationFrame(() => {
      refreshHybridLayerCardSizes();
    });
    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [
    hybridLayerActiveElementId,
    hybridLayerRenderRows.length,
    hybridModeEffective,
    hybridViewportSize.height,
    hybridViewportSize.width,
    hybridVisible,
    refreshHybridLayerCardSizes,
    tab,
  ]);

  return {
    getHybridLayerCardRefCallback,
    hybridLayerRenderRows,
    hybridLayerMissingBindingIds,
    hybridLayerVisibilityStats,
    hybridLayerCounts,
  };
}
